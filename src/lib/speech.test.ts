import { describe, expect, test } from "bun:test";
import { speechChunks, speechText } from "./speech.ts";

describe("read aloud", () => {
  test("code, tables and markdown marks are not read", () => {
    expect(speechText("## Done\n\nRun **this**:\n\n```sh\nbun test\n```\n\n| a | b |\n|---|---|\n\nSee [the docs](https://x.y).")).toBe("Done\n\nRun this:\n\nSee the docs.");
  });

  test("stretches start with one sentence and at most double, so each is made before the last one ends", () => {
    const sentence = "This sentence is here to fill a reply with words.";
    const chunks = speechChunks(Array.from({ length: 30 }, () => sentence).join(" "));
    expect(chunks[0]).toBe(sentence);
    for (let index = 1; index < chunks.length; index++) {
      expect(chunks[index]!.length).toBeLessThanOrEqual(Math.max(60, 2 * chunks[index - 1]!.length));
      expect(chunks[index]!.length).toBeLessThanOrEqual(300);
    }
    expect(chunks.join(" ")).toBe(Array.from({ length: 30 }, () => sentence).join(" "));
  });
});
