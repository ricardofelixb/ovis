/**
 * Read aloud: one agent reply at a time is spoken by the server's Kokoro (shared/speech.ts). The reply loses what
 * a voice should not read (code, tables, links' addresses, markdown marks), is cut into stretches, and the next
 * stretch is asked for while the last one plays, so speech starts after the first short stretch is made.
 */
import { useSyncExternalStore } from "react";
import { SPEECH_MAX_CHARS, type SpeechVoice } from "../../shared/speech.ts";

/** The words a listener should hear: code blocks, tables, images and addresses go, link text and prose stay. */
export function speechText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?(?:```|$)/g, "\n")
    .replace(/^[ \t]*\|.*\|[ \t]*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(\*\*|__|~~|\*|_)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^[ \t]{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "")
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => /[\p{L}\p{N}]/u.test(block))
    .join("\n\n");
}

/**
 * Stretches of whole sentences: the first is one sentence, so speech starts soon; the rest gather sentences up to
 * `size` characters, as fewer requests sound smoother. A sentence longer than a request is cut at a space.
 */
export function speechChunks(text: string, size = 240): string[] {
  const sentences = text.split(/\n{2,}/).flatMap((block) => block.match(/.+?(?:[.!?]+["')\]]*(?=\s|$)|$)\s*/g) ?? [])
    .map((sentence) => sentence.trim()).filter(Boolean)
    .flatMap((sentence) => {
      const parts: string[] = [];
      let rest = sentence;
      while (rest.length > SPEECH_MAX_CHARS) {
        const cut = rest.lastIndexOf(" ", SPEECH_MAX_CHARS);
        const at = cut > 0 ? cut : SPEECH_MAX_CHARS;
        parts.push(rest.slice(0, at));
        rest = rest.slice(at).trim();
      }
      return [...parts, rest];
    });
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const last = chunks.length > 1 ? chunks[chunks.length - 1]! : null;
    if (last !== null && last.length + sentence.length + 1 <= size) chunks[chunks.length - 1] = `${last} ${sentence}`;
    else chunks.push(sentence);
  }
  return chunks;
}

export type SpeechStatus = "idle" | "loading" | "playing" | "failed";
interface Playback { id: string; status: SpeechStatus }

let playback: Playback = { id: "", status: "idle" };
let session = 0;
let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let abort: AbortController | null = null;
const listeners = new Set<() => void>();

function set(next: Playback): void {
  playback = next;
  for (const listener of listeners) listener();
}

/** Where `id` stands: only the reply being read is ever loading or playing. */
export function useSpeechStatus(id: string): SpeechStatus {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => (playback.id === id ? playback.status : "idle"),
  );
}

export function stopSpeech(): void {
  session += 1;
  abort?.abort();
  abort = null;
  try { source?.stop(); } catch { /* it had not started */ }
  source = null;
  if (playback.status !== "idle") set({ id: "", status: "idle" });
}

async function fetchChunk(text: string, voice: SpeechVoice, signal: AbortSignal): Promise<AudioBuffer> {
  const response = await fetch("/api/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice }), credentials: "same-origin", signal });
  if (!response.ok) throw new Error(`speech ${response.status}`);
  return context!.decodeAudioData(await response.arrayBuffer());
}

function play(buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const node = context!.createBufferSource();
    node.buffer = buffer;
    node.connect(context!.destination);
    node.onended = () => resolve();
    source = node;
    node.start();
  });
}

/**
 * Reads `markdown` aloud as reply `id`, stopping whatever was being read. Call it from the tap itself: iOS lets
 * only a user gesture start audio, so the AudioContext is made and resumed before anything is awaited.
 */
export function speak(id: string, markdown: string, voice: SpeechVoice): void {
  stopSpeech();
  const chunks = speechChunks(speechText(markdown));
  if (chunks.length === 0 || typeof AudioContext === "undefined") return;
  context ??= new AudioContext();
  void context.resume();
  const mine = ++session;
  const controller = abort = new AbortController();
  set({ id, status: "loading" });
  void (async () => {
    try {
      let next = fetchChunk(chunks[0]!, voice, controller.signal);
      for (let index = 0; index < chunks.length; index++) {
        const buffer = await next;
        if (mine !== session) return;
        if (index + 1 < chunks.length) next = fetchChunk(chunks[index + 1]!, voice, controller.signal);
        // the next one is asked for before this one plays; a failure surfaces when it is awaited
        next.catch(() => {});
        if (playback.status !== "playing") set({ id, status: "playing" });
        await play(buffer);
        if (mine !== session) return;
      }
      set({ id: "", status: "idle" });
    } catch {
      if (mine === session) set({ id, status: "failed" });
    }
  })();
}
