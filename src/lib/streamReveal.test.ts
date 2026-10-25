import { describe, expect, test } from "bun:test";
import { paceGrew, paceStep, REVEAL_TICK_MS, stablePrefix, startPace, wordCut, type Pace } from "./streamReveal.ts";

const held = (text: string) => text.slice(0, stablePrefix(text, text.length, false));

describe("half-written markdown", () => {
  test("waits for its closing marks", () => {
    expect(held("Some **bold")).toBe("Some ");
    expect(held("Some **bold** and")).toBe("Some **bold** and");
    expect(held("See [the doc")).toBe("See ");
    expect(held("See [the doc](http://x")).toBe("See ");
    expect(held("See [the doc](http://x) now")).toBe("See [the doc](http://x) now");
    expect(held("Use `bun")).toBe("Use ");
    expect(held("Done.\n\n-")).toBe("Done.\n\n");
    expect(held("Done.\n\n| a | b |")).toBe("Done.\n\n");
  });

  test("leaves text that only looks like it", () => {
    for (const text of ["2 * 3 = 6", "a snake_case_name", "Done.\n\n```ts\nconst a = `x", "See [1] and more", "**bold**"]) expect(held(text)).toBe(text);
    expect(stablePrefix("Some **bold", 11, true)).toBe(11);
  });

  test("a cut ends on a whole word until the text is done", () => {
    expect(wordCut("one two thr", 11, false)).toBe(7);
    expect(wordCut("one two thr", 11, true)).toBe(11);
    expect(wordCut("one two thr", 5, false)).toBe(3);
  });
});

/** Reveal a stream of [ms, length] updates; the largest step drawn and the longest lag behind the text. */
function run(updates: [number, number][], until: number): { step: number; lag: number; end: number } {
  let pace: Pace = startPace(0, 0, 0);
  let next = 0, drawn = 0, step = 0, lag = 0, end = 0;
  for (let now = 0; now <= until; now += REVEAL_TICK_MS) {
    while (next < updates.length && updates[next]![0] <= now) pace = paceGrew(pace, updates[next++]![1], updates[next - 1]![0]);
    pace = paceStep(pace, now);
    step = Math.max(step, pace.shown - drawn);
    drawn = pace.shown;
    // how long ago the text first held what is not drawn yet
    const behind = updates.find(([, length]) => length > Math.floor(pace.shown));
    if (behind !== undefined && behind[0] <= now) lag = Math.max(lag, now - behind[0]);
    if (pace.shown >= pace.length && next === updates.length && end === 0) end = now;
  }
  return { step, lag, end };
}

describe("an even reveal", () => {
  test("a steady stream is drawn a few words a step, an update behind", () => {
    const gpt = Array.from({ length: 50 }, (_, index): [number, number] => [index * 200, (index + 1) * 18]);
    const { step, lag } = run(gpt, 12000);
    expect(step).toBeLessThanOrEqual(16);
    expect(lag).toBeLessThanOrEqual(400);
  });

  test("a burst is drawn out over about a second, a few words a step, then caught up", () => {
    const opus: [number, number][] = [[0, 586], ...Array.from({ length: 30 }, (_, index): [number, number] => [100 * (index + 1), 586 + 30 * (index + 1)])];
    const { step, lag, end } = run(opus, 8000);
    expect(step).toBeLessThanOrEqual(40);
    expect(lag).toBeLessThanOrEqual(2500);
    expect(end).toBeLessThanOrEqual(5000);
  });
});
