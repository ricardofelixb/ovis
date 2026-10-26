import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "./index.ts";
import { DeviceStore } from "./devices.ts";
import type { PiVoiceStatus } from "../shared/pi-voice.ts";

/**
 * The live voice relay's door: who may open /ws/pi-voice, and what it says about a pane that has no
 * Pi to call. A call itself is covered against a fake Pi in server/pi-voice.test.ts.
 */
const root = mkdtempSync(join(tmpdir(), "ovis-pi-voice-contract-"));
let owner: ReturnType<typeof createServer>;
let watched: ReturnType<typeof createServer>;
let ownBase = "";
let watchBase = "";
let watchCookie = "";
const PANE = "w0:p999";

beforeAll(() => {
  owner = createServer({ port: 0, stateDir: join(root, "owner") });
  ownBase = `http://127.0.0.1:${owner.port}`;
  const watchState = join(root, "watch");
  const devices = new DeviceStore(watchState);
  const paired = devices.pair(devices.startPairing().code, "Watch", "watch")!;
  // a first pairing is dropped unless the device is seen once
  expect(devices.match(paired.token)).not.toBeNull();
  watchCookie = `ovis_device=${encodeURIComponent(paired.token)}`;
  watched = createServer({ port: 0, stateDir: watchState });
  watchBase = `http://127.0.0.1:${watched.port}`;
});

afterAll(() => {
  owner?.stop();
  watched?.stop();
  rmSync(root, { recursive: true, force: true });
});

const url = (base: string, path = "/ws/pi-voice", pane: string | null = PANE) =>
  `${base}${path}${pane === null ? "" : `?pane_id=${encodeURIComponent(pane)}`}`;

describe("GET /ws/pi-voice", () => {
  it("refuses a request that is not signed in, in plain text like /ws", async () => {
    // as if `tailscale serve` had forwarded a stranger to a server that has paired devices: the test client
    // is on loopback, like a proxy
    const response = await fetch(url(watchBase), { headers: { "x-forwarded-for": "100.64.0.9" } });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("unauthorized");
  });

  it("refuses a watching device", async () => {
    const response = await fetch(url(watchBase), { headers: { cookie: watchCookie } });
    expect(response.status).toBe(403);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("read_only");
  });

  it("refuses another site", async () => {
    const response = await fetch(url(ownBase), { headers: { origin: "http://other.example" } });
    expect(response.status).toBe(403);
  });

  it("refuses a pane that is not a plain id, and asks for an upgrade otherwise", async () => {
    expect((await fetch(url(ownBase, "/ws/pi-voice", null))).status).toBe(400);
    expect((await fetch(url(ownBase, "/ws/pi-voice", "../etc"))).status).toBe(400);
    expect((await fetch(url(ownBase))).status).toBe(426);
  });

  it("opens, says why a pane has no Pi to call, and closes", async () => {
    const socket = new WebSocket(url(ownBase).replace("http", "ws"));
    const frames: unknown[] = [];
    const closed = new Promise<void>((resolve) => { socket.onclose = () => resolve(); });
    socket.onmessage = (event) => { frames.push(JSON.parse(String(event.data))); };
    await closed;
    expect(frames).toHaveLength(1);
    expect((frames[0] as { type: string; code: string }).type).toBe("ended");
    expect(["not_pi", "unavailable"]).toContain((frames[0] as { code: string }).code);
  });
});

describe("GET /api/pane/pi-voice", () => {
  it("says a pane without a Pi cannot take a call", async () => {
    const response = await fetch(url(ownBase, "/api/pane/pi-voice"));
    expect(response.status).toBe(200);
    expect(await response.json() as PiVoiceStatus).toEqual({ available: false, busy: false });
  });

  it("asks for a pane, and takes only GET", async () => {
    expect((await fetch(url(ownBase, "/api/pane/pi-voice", null))).status).toBe(400);
    expect((await fetch(url(ownBase, "/api/pane/pi-voice"), { method: "POST", headers: { origin: ownBase, "x-herdr-machine": "1" } })).status).toBe(400);
  });

  it("needs sign-in", async () => {
    const response = await fetch(url(watchBase, "/api/pane/pi-voice"), { headers: { "x-forwarded-for": "100.64.0.9" } });
    expect(response.status).toBe(401);
  });
});
