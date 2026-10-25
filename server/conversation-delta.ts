/**
 * Smaller reloads of a chat's newest turns. A chat polling with `delta=<ETag>` names the answer it
 * holds; while this server still has that answer's turns, the reply carries only the turns
 * after the run the two share, with where that run sits in the held turns, instead of every turn.
 * A chat on a slow link then reads a few KB when a turn changes, not its whole newest page.
 */
import type { ConversationTurn } from "../shared/protocol.ts";
import { remember } from "./claude-subagents.ts";

/** the newest pages sent, by their answer version: a few for each chat polling them */
const sent = new Map<string, readonly ConversationTurn[]>();
const SENT_LIMIT = 16;
/** a turn's JSON, kept while the turn is: the cached pages hand out the same turn objects */
const texts = new WeakMap<ConversationTurn, string>();

function text(turn: ConversationTurn): string {
  let json = texts.get(turn);
  if (json === undefined) {
    json = JSON.stringify(turn);
    texts.set(turn, json);
  }
  return json;
}

function same(a: ConversationTurn, b: ConversationTurn): boolean {
  return a === b || text(a) === text(b);
}

/** The run the turns continue the held ones with: they start `drop` turns into them, and the first `keep` of them are the same. */
export function turnsDelta(held: readonly ConversationTurn[], turns: readonly ConversationTurn[]): { drop: number; keep: number } | null {
  const first = turns[0];
  if (first === undefined) return null;
  const drop = held.findIndex((turn) => same(turn, first));
  if (drop === -1) return null;
  let keep = 1;
  while (keep < turns.length && drop + keep < held.length && same(held[drop + keep]!, turns[keep]!)) keep++;
  return { drop, keep };
}

/** Keeps a newest page as sent under its version, so a poll naming it can be answered with what changed. */
export function rememberSent(version: string, turns: readonly ConversationTurn[]): void {
  remember(sent, version, turns, SENT_LIMIT);
}

/** What changed since the page an ETag names, or null when it is not held here or shares no turn. */
export function sentDelta(etag: string | null, turns: readonly ConversationTurn[]): { drop: number; keep: number } | null {
  const version = etag?.replace(/^W\//, "").replaceAll("\"", "");
  const held = version === undefined ? undefined : sent.get(version);
  return held === undefined ? null : turnsDelta(held, turns);
}
