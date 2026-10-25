import { describe, expect, test } from "bun:test";

import type { ConversationTurn } from "../../shared/protocol.ts";
import { typedLength, withLiveTurn } from "./liveTurn.ts";

const user: ConversationTurn = { role: "user", ts: "2026-10-25T10:00:00.000Z", parts: [{ kind: "text", text: "hi" }] };
const working: ConversationTurn = { role: "assistant", ts: "2026-10-25T10:00:01.000Z", end_ts: "2026-10-25T10:00:03.000Z", parts: [{ kind: "tool", name: "bash", summary: "ls", input: "{}", output: "a" }] };
const live: ConversationTurn = { role: "assistant", ts: "2026-10-25T10:00:04.000Z", end_ts: "2026-10-25T10:00:04.000Z", parts: [{ kind: "text", text: "Done" }] };

describe("pi's live message", () => {
  test("follows the turns read: its own turn after the user's, the same turn after the agent's work", () => {
    expect(withLiveTurn([user], live)).toEqual([user, live]);
    expect(withLiveTurn([user, working], live).at(-1)!.parts).toEqual([...working.parts, ...live.parts]);
  });

  test("goes once the transcript holds it: the finished line is stamped when pi wrote it, after the message began", () => {
    const landed: ConversationTurn = { ...working, end_ts: "2026-10-25T10:00:09.000Z", parts: [...working.parts, { kind: "text", text: "Done, all of it" }] };
    const read = [user, landed];
    expect(withLiveTurn(read, live)).toBe(read);
  });

  test("typing closes on a burst in a few steps and stops after a whole word", () => {
    const text = "one two three four five six seven eight nine ten";
    let shown = 0, steps = 0;
    while (shown < text.length) {
      const next = typedLength(text, shown);
      expect(next).toBeGreaterThan(shown);
      if (next < text.length) expect(text[next]).toBe(" ");
      shown = next; steps++;
    }
    expect(steps).toBeLessThanOrEqual(12);
  });
});
