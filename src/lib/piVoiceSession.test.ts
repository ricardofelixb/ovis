import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { dismissPiVoice, endPiVoice, piVoiceState, startPiVoice } from "./piVoiceSession.ts";

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
  dismissPiVoice();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
  originals.clear();
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("starting a call from the phone", () => {
  it("opens the connection only once the microphone is allowed, and listens to it from its first frame", async () => {
    startPiVoice({ paneId: "w1:p1", label: "cwd" });
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
    expect(piVoiceState()).toMatchObject({ status: "ended", end: { kind: "error", message: "Live voice is already on in this Pi." } });
    expect(tracks.every((track) => track.stopped)).toBe(true);
    expect(socket.closed).toBe(true);
  });

  it("opens nothing when the microphone is refused", async () => {
    startPiVoice({ paneId: "w1:p1", label: "cwd" });
    deny?.();
    await flush();
    expect(piVoiceState()).toMatchObject({ status: "ended", end: { kind: "denied" } });
    expect(FakeSocket.all).toHaveLength(0);
  });

  it("lets go of a microphone that is allowed after the call was ended", async () => {
    startPiVoice({ paneId: "w1:p1", label: "cwd" });
    endPiVoice();
    grant?.();
    await flush();
    expect(piVoiceState().status).toBe("idle");
    expect(tracks.every((track) => track.stopped)).toBe(true);
    expect(FakeSocket.all).toHaveLength(0);
  });
});
