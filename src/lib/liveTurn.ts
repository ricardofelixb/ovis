/**
 * The message pi is writing (conversation-live, from pi's ovis-model extension), drawn as part of
 * the chat until the transcript holds it. Its turn's `ts` is when the message began and the line
 * pi writes for the finished message is stamped later, so a last turn ending at or after it holds
 * the message itself.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { ConversationTurn } from "../../shared/protocol.ts";

/** a live message whose file is gone stays this long at most while the transcript is read */
export const LIVE_HOLD_MS = 5000;
/** how long a streamed reply's newest words stay dim when no more follow them */
export const FRESH_MS = 200;

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

const FRESH = "live-fresh";
let fresh: Highlight | null = null;

/** The one highlight every chat's newest words join, drawn dim by `::highlight(live-fresh)`; null where there is no Highlight API. */
function freshHighlight(): Highlight | null {
  if (typeof CSS === "undefined" || !("highlights" in CSS) || typeof Highlight === "undefined") return null;
  if (fresh === null) {
    fresh = new Highlight();
    CSS.highlights.set(FRESH, fresh);
  }
  return fresh;
}

/** A range over an element's text from a character offset to its end. */
function rangeFrom(element: HTMLElement, offset: number): Range | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (seen + length > offset) {
      const range = document.createRange();
      range.setStart(node, offset - seen);
      range.setEnd(element, element.childNodes.length);
      return range;
    }
    seen += length;
  }
  return null;
}

/**
 * While a turn streams, the words an update adds to its last block of prose start dim and settle
 * at the next update, or after FRESH_MS when none follows. Each update is drawn as it comes, as
 * pi's own screen does: the dimming is a highlight over text already there, so it costs no frame
 * of its own. What the turn held when it was first seen is not new.
 */
export function useFreshWords(article: RefObject<HTMLElement | null>, streaming: boolean, turn: ConversationTurn): void {
  const last = useRef<{ element: HTMLElement; length: number } | null>(null);
  const shown = useRef<{ range: Range; timer: ReturnType<typeof setTimeout> } | null>(null);
  useLayoutEffect(() => {
    const blocks = article.current?.querySelectorAll<HTMLElement>(".markdown");
    const element = blocks?.[blocks.length - 1] ?? null;
    const length = element?.textContent?.length ?? 0;
    const before = last.current;
    last.current = streaming && element !== null ? { element, length } : null;
    const highlight = freshHighlight();
    if (highlight === null || last.current === null || before === null) return;
    const from = before.element === element ? before.length : 0;
    const range = from < length && element !== null ? rangeFrom(element, from) : null;
    if (range === null) return;
    if (shown.current !== null) {
      clearTimeout(shown.current.timer);
      highlight.delete(shown.current.range);
    }
    const timer = setTimeout(() => {
      highlight.delete(range);
      if (shown.current?.range === range) shown.current = null;
    }, FRESH_MS);
    shown.current = { range, timer };
    highlight.add(range);
  }, [article, streaming, turn]);
  useEffect(() => () => {
    if (shown.current === null) return;
    clearTimeout(shown.current.timer);
    fresh?.delete(shown.current.range);
  }, []);
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
