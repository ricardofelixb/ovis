import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { PiVoiceStatus } from "../../shared/pi-voice.ts";
import { endPiVoice, FOLLOW_SETTLE_MS, followPiVoice, piVoiceState, startPiVoice } from "./piVoiceSession.ts";

/** What the call touches of the browser: a microphone whose permission prompt the test settles, and sockets it can drive. */
class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(text: string): void { this.sent.push(text); }
  close(): void { this.closed = true; }
  open(): void { this.readyState = FakeSocket.OPEN; this.onopen?.(); }
  receive(frame: object): void { this.onmessage?.({ data: JSON.stringify({ v: 1, ...frame }) }); }
}

const originals = new Map<string, PropertyDescriptor | undefined>();
function stub(name: string, value: unknown): void {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

let tracks: { stopped: boolean; enabled: boolean; stop(): void }[] = [];
let grant: (() => void) | undefined;
let deny: (() => void) | undefined;

beforeEach(() => {
  FakeSocket.all = [];
  tracks = [];
  const stream = {
    getTracks: () => tracks,
    getAudioTracks: () => tracks,
  };
  stub("WebSocket", FakeSocket);
  stub("RTCPeerConnection", class {});
  stub("Audio", class { autoplay = false; play() { return Promise.resolve(); } pause() {} remove() {} });
  stub("window", { location: { protocol: "https:", host: "ovis.test" } });
  stub("document", { visibilityState: "hidden", addEventListener() {}, removeEventListener() {} });
  stub("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve, reject) => {
          grant = () => {
            tracks.push({ stopped: false, enabled: true, stop() { this.stopped = true; } });
            resolve(stream);
          };
          deny = () => reject(new DOMException("Permission denied", "NotAllowedError"));
        }),
    },
  });
});

afterEach(() => {
  endPiVoice();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  originals.clear();
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("starting a call from the phone", () => {
  it("opens the connection only once the microphone is allowed, and listens to it from its first frame", async () => {
    startPiVoice({ machineId: "local", paneId: "w1:p1", label: "cwd" });
    // the permission prompt can stay open for as long as the user likes: Pi may give up meanwhile
    expect(FakeSocket.all).toHaveLength(0);
    grant?.();
    await flush();
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0]!.url).toBe("wss://ovis.test/ws/pi-voice?pane_id=w1%3Ap1");
    const socket = FakeSocket.all[0]!;
    socket.open();
    expect(socket.sent.map((text) => JSON.parse(text).type)).toEqual(["hello"]);
    // Pi's answer to a start it cannot take arrives with nothing else in between
    socket.receive({ type: "ready", pid: 1, busy: false });
    socket.receive({ type: "ended", error: "Live voice is already on in this Pi." });
    expect(piVoiceState()).toMatchObject({ status: "away", end: { kind: "error", message: "Live voice is already on in this Pi." } });
    expect(socket.closed).toBe(true);
    // the microphone goes quiet at once, and is let go once the close chime has played
    expect(tracks.every((track) => !track.enabled && !track.stopped)).toBe(true);
    const deadline = Date.now() + 5_000;
    while (!tracks.every((track) => track.stopped)) {
      if (Date.now() > deadline) throw new Error("the microphone was never let go");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

  it("names the PC of a pane on another one, so this server calls through to it", async () => {
    startPiVoice({ machineId: "mac mini", paneId: "w1:p1", label: "cwd", voice: "vale" });
    grant?.();
    await flush();
    expect(FakeSocket.all[0]!.url).toBe("wss://ovis.test/ws/pi-voice?pane_id=w1%3Ap1&machine_id=mac%20mini&voice=vale");
    expect(piVoiceState()).toMatchObject({ machineId: "mac mini", paneId: "w1:p1" });
  });

  it("opens nothing when the microphone is refused", async () => {
    startPiVoice({ machineId: "local", paneId: "w1:p1", label: "cwd" });
    deny?.();
    await flush();
    expect(piVoiceState()).toMatchObject({ status: "away", end: { kind: "denied" } });
    expect(FakeSocket.all).toHaveLength(0);
    // End puts the orb away
    endPiVoice();
    expect(piVoiceState()).toMatchObject({ status: "idle", end: null });
  });

  it("lets go of a microphone that is allowed after the call was ended", async () => {
    startPiVoice({ machineId: "local", paneId: "w1:p1", label: "cwd" });
    endPiVoice();
    grant?.();
    await flush();
    expect(piVoiceState().status).toBe("idle");
    expect(tracks.every((track) => track.stopped)).toBe(true);
    expect(FakeSocket.all).toHaveLength(0);
  });
});

/** A timer the test fires by hand, and a status the test answers. */
function followDeps(answer: PiVoiceStatus = { available: true, busy: false }) {
  const pending: (() => void)[] = [];
  const asked: string[] = [];
  return {
    pending,
    asked,
    deps: {
      after: (run: () => void, ms: number) => {
        expect(ms).toBe(FOLLOW_SETTLE_MS);
        pending.push(run);
        return () => { pending.splice(pending.indexOf(run), 1); };
      },
      status: (paneId: string) => {
        asked.push(paneId);
        return Promise.resolve(answer);
      },
    },
  };
}

const pi = (paneId: string) => ({ machineId: "local", paneId, agent: "pi", label: "cwd" });

async function liveOn(paneId: string): Promise<FakeSocket> {
  startPiVoice({ machineId: "local", paneId, label: "cwd" });
  grant?.();
  await flush();
  const socket = FakeSocket.all.at(-1)!;
  socket.open();
  socket.receive({ type: "phase", phase: "listening" });
  return socket;
}

describe("following the selected agent", () => {
  it("does nothing while no call was started", () => {
    const { deps, pending } = followDeps();
    followPiVoice(pi("w1:p2"), deps);
    expect(pending).toHaveLength(0);
    expect(piVoiceState().status).toBe("idle");
  });

  it("ends the call on another agent at once, and calls the Pi there once the selection holds", async () => {
    const first = await liveOn("w1:p1");
    expect(piVoiceState().status).toBe("live");
    const { deps, pending, asked } = followDeps();
    followPiVoice(pi("w1:p2"), deps);
    expect(first.closed).toBe(true);
    expect(first.sent.map((text) => JSON.parse(text).type)).toContain("stop");
    expect(piVoiceState()).toMatchObject({ status: "away", paneId: "w1:p2", end: null });
    expect(FakeSocket.all).toHaveLength(1);
    pending[0]!();
    await flush();
    expect(asked).toEqual(["w1:p2"]);
    expect(piVoiceState().status).toBe("starting");
    grant?.();
    await flush();
    expect(FakeSocket.all.at(-1)!.url).toBe("wss://ovis.test/ws/pi-voice?pane_id=w1%3Ap2");
  });

  it("opens nothing for a selection that moved on before it held", async () => {
    await liveOn("w1:p1");
    const { deps, pending } = followDeps();
    const cancel = followPiVoice(pi("w1:p2"), deps);
    cancel();
    expect(pending).toHaveLength(0);
    expect(piVoiceState().status).toBe("away");
  });

  it("waits with no voice on an agent that is not Pi, or a Pi that cannot take a call", async () => {
    await liveOn("w1:p1");
    const shell = followDeps();
    followPiVoice({ machineId: "local", paneId: "w1:p2", agent: null, label: "cwd" }, shell.deps);
    expect(shell.pending).toHaveLength(0);
    expect(piVoiceState()).toMatchObject({ status: "away", end: null });
    const unready = followDeps({ available: false, busy: false });
    followPiVoice(pi("w1:p3"), unready.deps);
    unready.pending[0]!();
    await flush();
    expect(piVoiceState()).toMatchObject({ status: "away", end: null });
  });

  it("says so when the Pi there already has a call", async () => {
    await liveOn("w1:p1");
    const { deps, pending } = followDeps({ available: true, busy: true });
    followPiVoice(pi("w1:p2"), deps);
    pending[0]!();
    await flush();
    expect(piVoiceState()).toMatchObject({ status: "away", end: { kind: "busy" } });
  });

  it("keeps the call on the same agent", async () => {
    const socket = await liveOn("w1:p1");
    const { deps, pending } = followDeps();
    followPiVoice(pi("w1:p1"), deps);
    expect(socket.closed).toBe(false);
    expect(pending).toHaveLength(0);
    expect(piVoiceState().status).toBe("live");
  });

  it("stops following on End, and on Pi ending the call itself", async () => {
    await liveOn("w1:p1");
    endPiVoice();
    const ended = followDeps();
    followPiVoice(pi("w1:p2"), ended.deps);
    expect(ended.pending).toHaveLength(0);
    const socket = await liveOn("w1:p1");
    socket.receive({ type: "ended" });
    expect(piVoiceState().status).toBe("idle");
  });

  it("keeps following after a call is cut off, and the next agent clears why", async () => {
    const socket = await liveOn("w1:p1");
    socket.receive({ type: "ended", code: "closed" });
    expect(piVoiceState()).toMatchObject({ status: "away", end: { kind: "closed" } });
    const { deps, pending } = followDeps();
    followPiVoice(pi("w1:p2"), deps);
    expect(piVoiceState()).toMatchObject({ status: "away", end: null });
    expect(pending).toHaveLength(1);
  });

  it("does not ask for a refused microphone again on the next agent", async () => {
    startPiVoice({ machineId: "local", paneId: "w1:p1", label: "cwd" });
    deny?.();
    await flush();
    const { deps, pending } = followDeps();
    followPiVoice(pi("w1:p2"), deps);
    expect(pending).toHaveLength(0);
    expect(piVoiceState()).toMatchObject({ status: "away", end: { kind: "denied" } });
  });
});
