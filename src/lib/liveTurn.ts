/**
 * The message pi is writing (conversation-live, from pi's ovis-model extension), drawn as part of
 * the chat until the transcript holds it. Its turn's `ts` is when the message began and the line
 * pi writes for the finished message is stamped later, so a last turn ending at or after it holds
 * the message itself.
 */
import { useEffect, useState } from "react";

import type { ConversationPart, ConversationTurn } from "../../shared/protocol.ts";

/** how often the typing moves on: about 15 frames a second, not one a screen refresh */
export const LIVE_TYPE_MS = 66;
/** a live message whose file is gone stays this long at most while the transcript is read */
export const LIVE_HOLD_MS = 5000;

export function liveLanded(turns: readonly ConversationTurn[], live: ConversationTurn): boolean {
  const last = turns.at(-1);
  const began = Date.parse(live.ts ?? "");
  const ended = Date.parse(last?.end_ts ?? last?.ts ?? "");
  return Number.isFinite(began) && Number.isFinite(ended) && ended >= began;
}

/** The turns with the live message's parts after them: on the last turn when it is the agent's, else a turn of its own. */
export function withLiveTurn(turns: ConversationTurn[], live: ConversationTurn | null): ConversationTurn[] {
  if (live === null || live.parts.length === 0 || liveLanded(turns, live)) return turns;
  const last = turns.at(-1);
  if (last?.role !== "assistant") return [...turns, live];
  return [...turns.slice(0, -1), { ...last, end_ts: live.ts ?? last.end_ts, parts: [...last.parts, ...live.parts] }];
}

/**
 * How much of a growing text to draw after a step: what is left closes in about four steps, so a
 * burst pi wrote at once is typed out by the next read (every 250 ms), at least two characters a
 * step. Cut short of the end, it stops after a whole word, the next one's end when none ends sooner.
 */
export function typedLength(text: string, shown: number): number {
  if (shown >= text.length) return text.length;
  const next = Math.min(text.length, shown + Math.max(2, Math.ceil((text.length - shown) / 4)));
  if (next === text.length) return next;
  const space = text.lastIndexOf(" ", next);
  if (space > shown) return space;
  // no word ends within the step: it finishes the word it is in
  const after = text.indexOf(" ", next);
  return after === -1 ? text.length : after;
}

type Typed = Extract<ConversationPart, { kind: "text" | "thinking" }>;

/**
 * The live message as it is typed: every part but the last drawn whole, the last (its text or its
 * thinking) up to where the typing is. What a part already held when it was first seen is drawn at
 * once (a chat opened mid-reply does not type it out again): only what it grows by is typed. Steps
 * run only while the chat is visible and something is left to type.
 */
export function useTypedLive(live: ConversationTurn | null, visible: boolean): ConversationTurn | null {
  const last = live?.parts.at(-1);
  const typed = last !== undefined && (last.kind === "text" || last.kind === "thinking") ? last as Typed : null;
  const key = live === null ? "" : `${live.ts ?? ""}:${live.parts.length - 1}`;
  const total = typed?.text.length ?? 0;
  const [shown, setShown] = useState({ key, length: total });
  const length = shown.key === key ? shown.length : total;
  useEffect(() => {
    if (shown.key !== key) { setShown({ key, length: total }); return; }
    if (!visible || typed === null || length >= total) return;
    const timer = setTimeout(() => setShown({ key, length: typedLength(typed.text, length) }), LIVE_TYPE_MS);
    return () => clearTimeout(timer);
  }, [visible, typed, key, shown.key, length, total]);
  if (live === null || typed === null || length >= total) return live;
  return { ...live, parts: [...live.parts.slice(0, -1), { ...typed, text: typed.text.slice(0, length) }] };
}

/** The last live message, kept a while after its file goes: the transcript may not hold it yet. */
export function useHeldLive(live: ConversationTurn | null): ConversationTurn | null {
  const [held, setHeld] = useState(live);
  useEffect(() => {
    if (live !== null) { setHeld(live); return; }
    const timer = setTimeout(() => setHeld(null), LIVE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [live]);
  return live ?? held;
}
