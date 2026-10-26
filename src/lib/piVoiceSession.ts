import { useEffect, useState, useSyncExternalStore } from "react";

import { encodePiVoiceFrame, parsePiFrame, PI_VOICE_PATH, type PhoneToPiFrame, type PiToPhoneFrame, type PiVoiceEndCode, type PiVoicePhase } from "../../shared/pi-voice.ts";
import { fetchPiVoiceStatus } from "./api.ts";
import { useMachineId } from "./machineContext.tsx";
import { BrowserLiveMedia } from "./piVoiceMedia.ts";

/**
 * The live voice call with the Pi in a pane, one per tab, kept outside React so the composer
 * remounting (a pane switch, a layout change) does not end it. The phone is the call's
 * microphone and speaker (piVoiceMedia.ts); this server relays Pi's frames (server/pi-voice.ts).
 * A call is started by a tap and only ever by a tap: the browser asks for the microphone and
 * lets the reply play on the strength of that gesture, so `startPiVoice` does its browser calls
 * before it waits for anything.
 */

/** why a call is over, when it did not end by a tap on End or by Pi's own account of a normal end */
export type PiVoiceEnd =
  | { kind: PiVoiceEndCode }
  | { kind: "denied" | "unsupported" | "failed" }
  /** Pi's own words: why it could not start or keep the call */
  | { kind: "error"; message: string };

export interface PiVoiceState {
  /** `idle`: no call; `starting`: reaching Pi; `live`: the call is on; `ended`: over, with `end` to read */
  status: "idle" | "starting" | "live" | "ended";
  paneId: string;
  label: string;
  phase: PiVoicePhase;
  muted: boolean;
  userText: string;
  assistantText: string;
  end: PiVoiceEnd | null;
}

const IDLE: PiVoiceState = { status: "idle", paneId: "", label: "", phase: "connecting", muted: false, userText: "", assistantText: "", end: null };

interface Call {
  socket: WebSocket;
  media: BrowserLiveMedia | null;
  stream: MediaStream | null;
  audio: HTMLAudioElement;
  audioContext: AudioContext | null;
  wakeLock: WakeLockSentinel | null;
  /** the tap on End: the socket closing after it is not a loss */
  userEnded: boolean;
}

/**
 * Pi reads the reply's level to tell speaking from listening, and speech has gaps between words:
 * left alone the label would flicker once a word. Going back to listening waits this long.
 */
const SPEAKING_HOLD_MS = 600;

let state: PiVoiceState = IDLE;
let call: Call | null = null;
let settling: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function update(patch: Partial<PiVoiceState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function send(frame: PhoneToPiFrame): void {
  if (call?.socket.readyState === WebSocket.OPEN) call.socket.send(encodePiVoiceFrame(frame));
}

function callUrl(paneId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${PI_VOICE_PATH}?pane_id=${encodeURIComponent(paneId)}`;
}

/** Releases the microphone, the speaker, the screen and the socket, and shows how the call ended (null: it simply did). */
function finish(end: PiVoiceEnd | null): void {
  const over = call;
  call = null;
  clearTimeout(settling);
  if (over) {
    over.media?.close();
    // a call that never got as far as its media still holds what the tap asked for
    for (const track of over.stream?.getTracks() ?? []) track.stop();
    over.audio.pause();
    void over.audioContext?.close().catch(() => undefined);
    void over.wakeLock?.release().catch(() => undefined);
    over.socket.close();
  }
  update(end ? { status: "ended", end } : { ...IDLE });
}

function showPhase(phase: PiVoicePhase): void {
  clearTimeout(settling);
  if (phase === "listening" && state.phase === "speaking") {
    settling = setTimeout(() => update({ phase }), SPEAKING_HOLD_MS);
    return;
  }
  update({ phase, ...(phase !== "connecting" && state.status === "starting" ? { status: "live" as const } : {}) });
}

function onFrame(frame: PiToPhoneFrame): void {
  call?.media?.receive(frame);
  switch (frame.type) {
    case "phase":
      showPhase(frame.phase);
      break;
    case "mute":
      update({ muted: frame.muted });
      break;
    case "transcript":
      update(frame.role === "user" ? { userText: frame.text } : { assistantText: frame.text });
      break;
    case "transcript-clear":
      update({ userText: "", assistantText: "" });
      break;
    case "ended":
      finish(frame.error ? { kind: "error", message: frame.error } : frame.code ? { kind: frame.code } : null);
      break;
    default:
      break;
  }
}

function connect(active: Call): void {
  const { socket, stream, audio, audioContext } = active;
  if (!stream) return;
  const media = new BrowserLiveMedia({
    stream,
    audio,
    audioContext,
    createPeer: () => new RTCPeerConnection(),
    send,
    onFailed: () => finish({ kind: "failed" }),
  });
  active.media = media;
  socket.onopen = () => media.hello();
  socket.onmessage = (event) => {
    if (call !== active || typeof event.data !== "string") return;
    let frame;
    try {
      frame = parsePiFrame(event.data);
    } catch {
      finish({ kind: "closed" });
      return;
    }
    if (frame.type !== "ready") onFrame(frame);
  };
  socket.onclose = () => {
    if (call === active && !active.userEnded) finish({ kind: "closed" });
  };
}

/**
 * Starts the call for a pane. It must run inside the tap's own handler: the microphone is asked
 * for, the speaker element and the audio context are made, and the screen kept awake, all
 * before anything is waited for.
 */
export function startPiVoice({ paneId, label }: { paneId: string; label: string }): void {
  if (state.status === "starting" || state.status === "live") return;
  update({ ...IDLE, status: "starting", paneId, label });
  const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (!getUserMedia || typeof RTCPeerConnection === "undefined") {
    finish({ kind: "unsupported" });
    return;
  }
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioContext = AudioContextClass ? new AudioContextClass() : null;
  void audioContext?.resume().catch(() => undefined);
  const audio = new Audio();
  audio.autoplay = true;
  void audio.play().catch(() => undefined);
  const started: Call = { socket: new WebSocket(callUrl(paneId)), media: null, stream: null, audio, audioContext, wakeLock: null, userEnded: false };
  call = started;
  void navigator.wakeLock?.request("screen").then((lock) => {
    if (call === started) started.wakeLock = lock;
    else void lock.release().catch(() => undefined);
  }, () => undefined);
  getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } }).then(
    (stream) => {
      if (call !== started) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      started.stream = stream;
      connect(started);
      // the socket may have opened while the browser was asking; its open event is then already past
      if (started.socket.readyState === WebSocket.OPEN) started.media?.hello();
    },
    () => {
      if (call === started) finish({ kind: "denied" });
    },
  );
}

/** The tap on End: stops at once, and tells Pi so it can end its side. */
export function endPiVoice(): void {
  if (!call) {
    update({ ...IDLE });
    return;
  }
  call.userEnded = true;
  send({ type: "stop" });
  finish(null);
}

/** Closes the account of a call that ended with something to read. */
export function dismissPiVoice(): void {
  if (state.status === "ended") update({ ...IDLE });
}

/** Asks Pi to mute or unmute; the answer comes back as a `mute` frame, which is what the view shows. */
export function setPiVoiceMuted(muted: boolean): void {
  send({ type: "set-muted", muted });
}

/** Linear 0..1 levels of the microphone and the reply, read each frame by the orb. */
export function piVoiceLevels(): { input: number; output: number } {
  return call?.media?.sample() ?? { input: 0, output: 0 };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePiVoice(): PiVoiceState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Pi can take a call in this pane: it is Pi's, on this PC, and its bridge answers (not before a reload of a Pi that started without it). */
export function usePiVoiceAvailable(paneId: string | null, agent: string | null | undefined): boolean {
  const machineId = useMachineId();
  const idle = usePiVoice().status === "idle";
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (paneId === null || agent !== "pi" || machineId !== "local" || !idle) {
      setAvailable(false);
      return;
    }
    let live = true;
    const ask = () => {
      void fetchPiVoiceStatus(paneId).then(
        (status) => { if (live) setAvailable(status.available); },
        () => { if (live) setAvailable(false); },
      );
    };
    ask();
    // a Pi reloaded after the pane was opened gains the bridge without the pane changing
    const timer = setInterval(ask, 30_000);
    document.addEventListener("visibilitychange", ask);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", ask);
    };
  }, [paneId, agent, machineId, idle]);
  return available;
}
