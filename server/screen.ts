import { randomUUID } from "node:crypto";
import type { Server, ServerWebSocket, WebSocketHandler } from "bun";
import type { Machine } from "../shared/machines.ts";
import { jsonResponse } from "./http.ts";

/**
 * The Computer view: a PC's desktop through screen-here's bridge, the script OVIS_SCREEN_BRIDGE
 * names (omarchy/screen-bridge.py in the orchestrator repository). The bridge reaches the PC's VNC
 * server over SSH (this PC's own directly), and serves its viewer page and the page's VNC, sound
 * and keep-alive sockets on a one-off 127.0.0.1 address. This server opens one per view and passes
 * it on under /screen/<id>/, behind its own sign-in, with the Host and Origin the bridge admits
 * only from its own window. Without the variable there is no Computer view.
 */

const SCREEN_PATH = /^\/screen\/([0-9a-f-]{36})\/(.*)$/;
const BRIDGE_URL = /^http:\/\/127\.0\.0\.1:\d+\/[\w-]+\/$/;
/** a bridge exits once its window has been gone a while: the oldest addresses are dead by then */
const KEPT = 16;

const bridges = new Map<string, URL>();

export function screenAvailable(): boolean {
  return Boolean(process.env["OVIS_SCREEN_BRIDGE"]);
}

export function isScreenPath(pathname: string): boolean {
  return pathname.startsWith("/screen/");
}

/** The bridge's SSH host for a PC: empty for this one, whose desktop it reaches directly. */
function sshHost(machine: Machine): string | null {
  if (machine.kind === "local") return "";
  const target = machine.target;
  if (!target) return null;
  return target.port ? `ssh://${target.destination}:${target.port}` : target.destination;
}

/** POST /api/screen {machine_id}: a new bridge to that PC's desktop, as the address its view opens. */
export async function handleScreenOpen(request: Request, machines: readonly Machine[]): Promise<Response> {
  const script = process.env["OVIS_SCREEN_BRIDGE"];
  if (!script) return jsonResponse({ error: { code: "unavailable", message: "This server has no screen bridge." } }, 404);
  if (request.method !== "POST") return jsonResponse({ error: { code: "method_not_allowed", message: "POST only" } }, 405);
  const body = await request.json().catch(() => null) as { machine_id?: unknown } | null;
  const machine = machines.find((candidate) => candidate.id === body?.machine_id);
  const host = machine ? sshHost(machine) : null;
  if (!machine || host === null) return jsonResponse({ error: { code: "not_found", message: "No such PC." } }, 404);
  const bridge = Bun.spawn(["python3", script, host, machine.name], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const timer = setTimeout(() => bridge.kill(), 45_000);
  // the bridge prints its address and forks to keep serving: its first process exits right away
  const [out, err] = await Promise.all([new Response(bridge.stdout).text(), new Response(bridge.stderr).text(), bridge.exited]);
  clearTimeout(timer);
  const address = out.trim();
  if (!BRIDGE_URL.test(address)) {
    const reason = err.trim().split("\n").at(-1) || "its desktop is unreachable.";
    return jsonResponse({ error: { code: "unreachable", message: `${machine.name}: ${reason}` } }, 502);
  }
  const id = randomUUID();
  bridges.set(id, new URL(address));
  if (bridges.size > KEPT) bridges.delete(bridges.keys().next().value!);
  return jsonResponse({ path: `/screen/${id}/` });
}

export interface ScreenSocketData {
  screen: { url: string; origin: string; protocols: string[] };
  upstream?: WebSocket;
  waiting?: (string | Uint8Array<ArrayBuffer>)[];
}

/**
 * A request under /screen/<id>/, passed on to its bridge: a socket upgrade (answered by Bun, so
 * undefined), or the bridge's answer. `allowed`: the caller checked sign-in, a driving role, and
 * for anything but a page load, that the request comes from this app's own origin.
 */
export async function handleScreenRequest(request: Request, url: URL, server: Server<ScreenSocketData>): Promise<Response | undefined> {
  const match = SCREEN_PATH.exec(url.pathname);
  const base = match ? bridges.get(match[1]!) : undefined;
  if (!match || !base) return new Response("not found", { status: 404 });
  const target = new URL(match[2]! + url.search, base);
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((name) => name.trim()).filter(Boolean);
    target.protocol = "ws:";
    const upgraded = server.upgrade(request, {
      data: { screen: { url: target.href, origin: base.origin, protocols } },
      // noVNC asks for "binary", which the bridge answers with
      ...(protocols.includes("binary") ? { headers: { "Sec-WebSocket-Protocol": "binary" } } : {}),
    });
    return upgraded ? undefined : new Response("upgrade failed", { status: 400 });
  }
  const headers = new Headers({ Origin: base.origin });
  const type = request.headers.get("content-type");
  if (type) headers.set("content-type", type);
  try {
    const answer = await fetch(target, { method: request.method, headers, ...(request.method === "POST" ? { body: await request.arrayBuffer() } : {}) });
    return new Response(answer.body, { status: answer.status, headers: { "content-type": answer.headers.get("content-type") ?? "text/plain", "cache-control": "no-store" } });
  } catch {
    return new Response("the screen has closed", { status: 502 });
  }
}

const isScreen = (ws: ServerWebSocket<object>): ws is ServerWebSocket<ScreenSocketData> => "screen" in ws.data;

function openScreen(ws: ServerWebSocket<ScreenSocketData>): void {
  const { url, origin, protocols } = ws.data.screen;
  // Bun's client takes headers (Bun.WebSocketOptions), which the DOM typing of WebSocket does not know
  const options: Bun.WebSocketOptions = { headers: { Origin: origin }, protocols };
  const upstream = new WebSocket(url, options as unknown as string[]);
  upstream.binaryType = "arraybuffer";
  ws.data.upstream = upstream;
  ws.data.waiting = [];
  upstream.addEventListener("open", () => {
    for (const message of ws.data.waiting ?? []) upstream.send(message);
    ws.data.waiting = undefined;
  });
  upstream.addEventListener("message", (event) => {
    ws.send(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
  });
  upstream.addEventListener("close", () => ws.close());
  upstream.addEventListener("error", () => ws.close());
}

/** The app's socket handlers, with a screen's sockets passed on to its bridge instead. */
export function withScreenSockets<T extends object>(core: WebSocketHandler<T>): WebSocketHandler<T | ScreenSocketData> {
  return {
    ...(core as WebSocketHandler<T | ScreenSocketData>),
    open(ws) {
      if (isScreen(ws)) openScreen(ws);
      else return core.open?.(ws as ServerWebSocket<T>);
    },
    message(ws, message) {
      if (!isScreen(ws)) return core.message(ws as ServerWebSocket<T>, message);
      const data = typeof message === "string" ? message : Uint8Array.from(message);
      if (ws.data.waiting) ws.data.waiting.push(data);
      else ws.data.upstream?.send(data);
    },
    close(ws, code, reason) {
      if (isScreen(ws)) ws.data.upstream?.close();
      else return core.close?.(ws as ServerWebSocket<T>, code, reason);
    },
    drain(ws) {
      if (!isScreen(ws)) return core.drain?.(ws as ServerWebSocket<T>);
    },
  };
}
