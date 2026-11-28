import { describe, expect, test } from "bun:test";

import { speechChunks, speechText } from "../src/lib/speech.ts";
import { handleSpeechRequest, SpeechService, type SpeechEngine } from "./speech.ts";

const post = (body: unknown) => new Request("http://ovis/api/speech", { method: "POST", body: JSON.stringify(body) });

describe("read aloud", () => {
  test("nothing loads until a reply is read, requests take turns, and a failed load is tried again", async () => {
    const order: string[] = [];
    let loads = 0;
    const started = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const engine: SpeechEngine = {
      wav: async (text) => {
        order.push(`start ${text}`);
        if (text === "One.") { started.resolve(); await finish.promise; }
        order.push(`end ${text}`);
        return new TextEncoder().encode(text).buffer;
      },
      dispose: async () => {},
    };
    const service = new SpeechService({ stateDir: "/nonexistent", load: async () => { loads += 1; if (loads === 1) throw new Error("offline"); return engine; } });
    expect(loads).toBe(0);
    expect((await handleSpeechRequest(post({ text: "Hi.", voice: "af_bella" }), service)).status).toBe(500);
    const first = handleSpeechRequest(post({ text: "One.", voice: "af_bella" }), service);
    await started.promise;
    const second = handleSpeechRequest(post({ text: "Two.", voice: "am_michael" }), service);
    finish.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect([a.status, b.status, a.headers.get("content-type")]).toEqual([200, 200, "audio/wav"]);
    expect(await a.text()).toBe("One.");
    expect(order).toEqual(["start One.", "end One.", "start Two.", "end Two."]);
    expect(loads).toBe(2);
    for (const body of [{ text: "", voice: "af_bella" }, { text: "Hi.", voice: "jarvis" }, { text: "x".repeat(1001), voice: "af_bella" }]) {
      expect((await handleSpeechRequest(post(body), service)).status).toBe(400);
    }
  });

  test("a reply is read without its code, tables and addresses, the first stretch one sentence", () => {
    const text = speechText("## Done\n\nI fixed **the bug** in `auth.ts`. See [the PR](https://x.y/1).\n\n```ts\nconst a = 1;\n```\n\n| a | b |\n|---|---|\n\n- Tests pass. Ship it?");
    expect(text).toBe("Done\n\nI fixed the bug in auth.ts. See the PR.\n\nTests pass. Ship it?");
    expect(speechChunks(text)).toEqual(["Done", "I fixed the bug in auth.ts. See the PR. Tests pass. Ship it?"]);
  });
});
