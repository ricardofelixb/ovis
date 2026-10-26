import net from "node:net";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import {
  encodePiVoiceFrame,
  MAX_PI_VOICE_FRAME_BYTES,
  parsePhoneFrame,
  parsePiFrame,
  PI_VOICE_STATUS_PATH,
  type PiReady,
  type PiVoiceEndCode,
  type PiVoiceStatus,
} from "../shared/pi-voice.ts";
import { badRequest, jsonResponse, setRequestRoute } from "./http.ts";
import { type PiVoiceCandidate, piVoiceSocketCandidates } from "./pi.ts";
import { sameOrigin } from "./machine-security.ts";

/**
 * Live voice with a Pi pane: this server relays frames between a phone's WebSocket and the unix
 * socket the pane's Pi listens on (pi-better-openai's live bridge). The phone is the Pi's
 * microphone and speaker; Pi keeps the login, the session and the coding agent, and the audio goes
 * from the phone to OpenAI, never through here. Only text frames cross, each checked against an
 * allowlist and re-serialized, and their contents are never logged: an SDP carries addresses.
 */

const READY_MS = 2_000;
const PING_MS = 5_000;
const LEASE_MS = 20_000;
/** the phone sends its hello at once, before Pi has answered; nothing else may wait */
const MAX_WAITING = 16;

export interface PiVoiceSocket {
  data: PiVoiceSocketData;
  send(text: string): unknown;
  close(): unknown;
  ping(): unknown;
}

export interface PiVoiceSocketData {
  piVoice: {
    paneId: string;
    deviceId: string | undefined;
    /** frames the phone sent while Pi was still being reached */
    waiting?: string[];
    relay?: PiVoiceRelay;
    unwatch?: () => void;
    closed?: boolean;
  };
}

export interface PiVoiceHubOptions {
  candidates?: (paneId: string) => Promise<PiVoiceCandidate[] | null>;
  /** ends the call when the phone's device is revoked; returns the way to stop watching */
  onRevoke?: (deviceId: string, close: () => void) => () => void;
  /** how long Pi has to say ready */
  readyMs?: number;
  every?: (run: () => void, ms: number) => () => void;
  now?: () => number;
}

interface PiEnd {
  write(text: string): unknown;
  end(): unknown;
  destroy(): unknown;
}

const everyInterval = (run: () => void, ms: number): (() => void) => {
  const timer = setInterval(run, ms);
  return () => clearInterval(timer);
};

/**
 * One call: the frames both ways, the heartbeat and the end. It is told what happened to either
 * side (`fromPhone`, `fromPi`, `phoneGone`, `piGone`) and ends both when anything is wrong.
 */
export class PiVoiceRelay {
  readonly #phone: PiVoiceSocket;
  readonly #pi: PiEnd;
  readonly #now: () => number;
  readonly #stopTimer: () => void;
  readonly #onEnd: () => void;
  #pending = "";
  #lastSeen: number;
  #done = false;

  constructor(phone: PiVoiceSocket, pi: PiEnd, options: { every: (run: () => void, ms: number) => () => void; now: () => number; onEnd: () => void }) {
    this.#phone = phone;
    this.#pi = pi;
    this.#now = options.now;
    this.#onEnd = options.onEnd;
    this.#lastSeen = options.now();
    // Pi pings the phone itself, but a phone that has not started yet answers nothing: the
    // WebSocket's own ping is what a browser answers without any script running.
    this.#stopTimer = options.every(() => {
      if (this.#now() - this.#lastSeen > LEASE_MS) this.#end("closed", true);
      else this.#phone.ping();
    }, PING_MS);
    this.#send(pi, encodePiVoiceFrame({ type: "start" }));
  }

  /** The phone's WebSocket answered a ping. */
  alive(): void {
    this.#lastSeen = this.#now();
  }

  fromPhone(message: string | Uint8Array): void {
    if (this.#done) return;
    this.alive();
    try {
      if (typeof message !== "string") throw new Error("binary frame");
      this.#send(this.#pi, encodePiVoiceFrame(parsePhoneFrame(message)));
    } catch {
      // the phone broke the protocol: Pi hears nothing of it but the end
      this.#end(undefined, false);
    }
  }

  fromPi(chunk: string): void {
    if (this.#done) return;
    this.#pending += chunk;
    for (let end = this.#pending.indexOf("\n"); end !== -1; end = this.#pending.indexOf("\n")) {
      const line = this.#pending.slice(0, end);
      this.#pending = this.#pending.slice(end + 1);
      if (!line.trim()) continue;
      let frame;
      try {
        frame = parsePiFrame(line);
        if (frame.type === "ready") throw new Error("second ready");
      } catch {
        this.#end("closed", true);
        return;
      }
      this.#phone.send(encodePiVoiceFrame(frame));
      if (frame.type === "ended") {
        this.#end(undefined, true);
        return;
      }
    }
    if (this.#pending.length > MAX_PI_VOICE_FRAME_BYTES) this.#end("closed", true);
  }

  phoneGone(): void {
    this.#end(undefined, false);
  }

  piGone(): void {
    this.#end("closed", true);
  }

  #send(pi: PiEnd, line: string): void {
    pi.write(`${line}\n`);
  }

  /** Ends both sides once; `code` is told to the phone first, when it is still there to hear it. */
  #end(code: PiVoiceEndCode | undefined, phoneStillThere: boolean): void {
    if (this.#done) return;
    this.#done = true;
    this.#stopTimer();
    if (phoneStillThere) {
      if (code) this.#phone.send(encodePiVoiceFrame({ type: "ended", code }));
      this.#phone.close();
    } else {
      this.#phone.close();
    }
    this.#pi.end();
    this.#pi.destroy();
    this.#onEnd();
  }
}

/** Calls to the Pi in a pane, one at a time per pane. */
export class PiVoiceHub {
  readonly #options: Required<Pick<PiVoiceHubOptions, "readyMs" | "every" | "now">> & PiVoiceHubOptions;
  readonly #calls = new Map<string, PiVoiceSocketData["piVoice"]>();

  constructor(options: PiVoiceHubOptions = {}) {
    this.#options = { ...options, readyMs: options.readyMs ?? READY_MS, every: options.every ?? everyInterval, now: options.now ?? Date.now };
  }

  /** Whether the pane's Pi can take a call, and whether one is on already. */
  async probe(paneId: string): Promise<PiVoiceStatus> {
    if (this.#calls.has(paneId)) return { available: true, busy: true };
    const opened = await this.#connect(paneId);
    if (!("link" in opened)) return { available: false, busy: false };
    opened.link.socket.destroy();
    return { available: true, busy: opened.link.ready.busy };
  }

  async open(ws: PiVoiceSocket): Promise<void> {
    const state = ws.data.piVoice;
    if (this.#calls.has(state.paneId)) {
      this.#refuse(ws, "busy", false);
      return;
    }
    this.#calls.set(state.paneId, state);
    state.waiting = [];
    if (state.deviceId) state.unwatch = this.#options.onRevoke?.(state.deviceId, () => ws.close());
    const opened = await this.#connect(state.paneId);
    if (state.closed) {
      if ("link" in opened) opened.link.socket.destroy();
      return;
    }
    if (!("link" in opened)) {
      this.#refuse(ws, opened.code, true);
      return;
    }
    const { socket, ready, rest } = opened.link;
    if (ready.busy) {
      socket.destroy();
      this.#refuse(ws, "busy", true);
      return;
    }
    const relay = new PiVoiceRelay(ws, { write: (text) => socket.write(text), end: () => socket.end(), destroy: () => socket.destroy() }, {
      every: this.#options.every,
      now: this.#options.now,
      onEnd: () => this.#release(state),
    });
    state.relay = relay;
    socket.on("data", (chunk: string) => relay.fromPi(chunk));
    socket.on("close", () => relay.piGone());
    socket.on("error", () => {});
    if (rest) relay.fromPi(rest);
    const waiting = state.waiting;
    state.waiting = undefined;
    for (const text of waiting) relay.fromPhone(text);
  }

  message(ws: PiVoiceSocket, message: string | Uint8Array): void {
    const state = ws.data.piVoice;
    if (state.relay) {
      state.relay.fromPhone(message);
    } else if (state.waiting && typeof message === "string" && state.waiting.length < MAX_WAITING) {
      state.waiting.push(message);
    } else {
      ws.close();
    }
  }

  pong(ws: PiVoiceSocket): void {
    ws.data.piVoice.relay?.alive();
  }

  close(ws: PiVoiceSocket): void {
    const state = ws.data.piVoice;
    state.closed = true;
    state.relay?.phoneGone();
    this.#release(state);
  }

  #release(state: PiVoiceSocketData["piVoice"]): void {
    state.unwatch?.();
    state.unwatch = undefined;
    if (this.#calls.get(state.paneId) === state) this.#calls.delete(state.paneId);
  }

  #refuse(ws: PiVoiceSocket, code: PiVoiceEndCode, reserved: boolean): void {
    ws.send(encodePiVoiceFrame({ type: "ended", code }));
    ws.close();
    if (reserved) this.#release(ws.data.piVoice);
  }

  /** A connection to the pane's Pi that has said who it is, or why there is none. */
  async #connect(paneId: string): Promise<{ link: { socket: net.Socket; ready: PiReady; rest: string } } | { code: PiVoiceEndCode }> {
    const candidates = await (this.#options.candidates ?? piVoiceSocketCandidates)(paneId).catch(() => []);
    if (candidates === null) return { code: "not_pi" };
    for (const candidate of candidates) {
      const socket = await dial(candidate.path);
      if (!socket) continue;
      const answered = await readReady(socket, this.#options.readyMs);
      // the pid is the file's name and the pane the one asked for: a socket that says otherwise is not this pane's Pi
      if (answered && answered.ready.pid === candidate.pid && (answered.ready.pane === undefined || answered.ready.pane === paneId)) {
        return { link: { socket, ...answered } };
      }
      socket.destroy();
    }
    return { code: "unavailable" };
  }
}

function dial(path: string): Promise<net.Socket | null> {
  return new Promise((resolve) => {
    const socket = net.createConnection(path);
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      socket.off("error", failed);
      resolve(socket);
    });
    const failed = () => {
      socket.destroy();
      resolve(null);
    };
    socket.once("error", failed);
  });
}

/** Pi's first frame, which must be `ready`, and whatever came after it in the same read. */
function readReady(socket: net.Socket, ms: number): Promise<{ ready: PiReady; rest: string } | null> {
  return new Promise((resolve) => {
    let buffered = "";
    const finish = (value: { ready: PiReady; rest: string } | null) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("close", onGone);
      socket.off("error", onGone);
      resolve(value);
    };
    const onGone = () => finish(null);
    const onData = (chunk: string) => {
      buffered += chunk;
      const end = buffered.indexOf("\n");
      if (end === -1) {
        if (buffered.length > MAX_PI_VOICE_FRAME_BYTES) finish(null);
        return;
      }
      try {
        const frame = parsePiFrame(buffered.slice(0, end));
        finish(frame.type === "ready" ? { ready: frame, rest: buffered.slice(end + 1) } : null);
      } catch {
        finish(null);
      }
    };
    const timer = setTimeout(() => finish(null), ms);
    socket.on("data", onData);
    socket.once("close", onGone);
    socket.once("error", onGone);
  });
}

const isVoice = (ws: ServerWebSocket<object>): ws is ServerWebSocket<PiVoiceSocketData> => "piVoice" in ws.data;

/** The app's socket handlers, with a live voice call's sockets passed on to its relay. */
export function withPiVoiceSockets<T extends object>(core: WebSocketHandler<T>, hub: PiVoiceHub): WebSocketHandler<T | PiVoiceSocketData> {
  return {
    ...(core as WebSocketHandler<T | PiVoiceSocketData>),
    open(ws) {
      if (isVoice(ws)) void hub.open(ws);
      else return core.open?.(ws as ServerWebSocket<T>);
    },
    message(ws, message) {
      if (isVoice(ws)) hub.message(ws, message);
      else return core.message(ws as ServerWebSocket<T>, message);
    },
    close(ws, code, reason) {
      if (isVoice(ws)) hub.close(ws);
      else return core.close?.(ws as ServerWebSocket<T>, code, reason);
    },
    drain(ws) {
      if (!isVoice(ws)) return core.drain?.(ws as ServerWebSocket<T>);
    },
    pong(ws, data) {
      if (isVoice(ws)) hub.pong(ws);
      else return core.pong?.(ws as ServerWebSocket<T>, data);
    },
  };
}

/** a pane id as herdr writes it (`w2W:p1`), nothing that could climb out of a path or fill a log */
const PANE_ID = /^[\w.:-]{1,64}$/;

/**
 * `GET /ws/pi-voice?pane_id=` (the call) and `GET /api/pane/pi-voice?pane_id=` (whether the pane
 * can take one). The caller has passed the sign-in gate; `undefined` is a socket that was upgraded.
 */
export async function handlePiVoiceRequest(
  request: Request,
  url: URL,
  server: Server<PiVoiceSocketData>,
  hub: PiVoiceHub,
  caller: { readOnly: boolean; deviceId: string | undefined; headers: Headers },
): Promise<Response | undefined> {
  setRequestRoute(url.pathname);
  const paneId = url.searchParams.get("pane_id");
  if (url.pathname === PI_VOICE_STATUS_PATH) {
    if (request.method !== "GET") return badRequest("method_not_allowed", "use GET");
    if (!paneId) return badRequest("missing_pane_id", "pane_id query parameter is required");
    if (!PANE_ID.test(paneId)) return badRequest("invalid_pane_id", "pane_id is not a pane id");
    return jsonResponse(await hub.probe(paneId) satisfies PiVoiceStatus);
  }
  // a call speaks as the person at the pane, so a device that only watches gets none of it
  if (caller.readOnly) return jsonResponse({ error: { code: "read_only", message: "This device only watches" } }, 403);
  if (!sameOrigin(request)) return jsonResponse({ error: { code: "invalid_origin", message: "Use controls from this app" } }, 403);
  if (!paneId) return badRequest("missing_pane_id", "pane_id query parameter is required");
  if (!PANE_ID.test(paneId)) return badRequest("invalid_pane_id", "pane_id is not a pane id");
  if (server.upgrade(request, { headers: caller.headers, data: { piVoice: { paneId, deviceId: caller.deviceId } } })) return undefined;
  return new Response("websocket upgrade required", { status: 426 });
}
