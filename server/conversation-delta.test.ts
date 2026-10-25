import { describe, expect, test } from "bun:test";
import type { ConversationTurn } from "../shared/protocol.ts";
import { rememberSent, sentDelta, turnsDelta } from "./conversation-delta.ts";

const turn = (text: string, role: "user" | "assistant" = "user"): ConversationTurn => ({ role, ts: "2026-10-25T00:00:00Z", parts: [{ kind: "text", text }] });

describe("smaller reloads", () => {
  const held = [turn("a"), turn("b"), turn("c", "assistant")];

  test("a page that slid and grew keeps the turns both share and sends the rest", () => {
    // the page moved on by one turn, its last turn grew and a new one came
    const turns = [turn("b"), turn("c, more", "assistant"), turn("d")];
    const delta = turnsDelta(held, turns)!;
    expect(delta).toEqual({ drop: 1, keep: 1 });
    expect([...held.slice(delta.drop, delta.drop + delta.keep), ...turns.slice(delta.keep)]).toEqual(turns);
  });

  test("a turn changed in the middle (an edit) sends everything after it", () => {
    const turns = [turn("a"), turn("B"), turn("c", "assistant")];
    expect(turnsDelta(held, turns)).toEqual({ drop: 0, keep: 1 });
  });

  test("pages that share no turn, or a page this server never sent, get the whole page", () => {
    expect(turnsDelta(held, [turn("x")])).toBeNull();
    expect(sentDelta("W/\"never-sent\"", held)).toBeNull();
    rememberSent("v1", held);
    expect(sentDelta("W/\"v1\"", [...held, turn("d")])).toEqual({ drop: 0, keep: 3 });
  });
});
