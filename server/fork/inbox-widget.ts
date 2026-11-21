import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentStatus, HerdrPane } from "../../shared/protocol.ts";
import type { InboxDigest, InboxWidgetRow } from "../../shared/fork/inbox-widget.ts";
import { pushPaneTitle } from "../../shared/notify-policy.ts";
import type { PushPayload } from "../../shared/push.ts";
import { jsonResponse } from "../http.ts";
import { writePrivateState } from "../private-state.ts";
import type { PushService } from "../push.ts";
import type { FriendLookup } from "./friends.ts";

/**
 * The phone app's home-screen widget (app/android/ovis-widget): the agents of the alerts' own view
 * of every PC (the push service's seed, resync and status calls, watched here), sent as a quiet push
 * to each phone that placed one. Coalesced to one push every MIN_GAP_MS, and sent again every
 * HEARTBEAT_MS so the widget can tell a quiet PC from one it lost; the push relay takes 60 a window.
 */
const MIN_GAP_MS = 30_000;
const SETTLE_MS = 2_000;
const HEARTBEAT_MS = 10 * 60_000;
/** what one push's JSON may take, under what the relay passes on (server/push.ts RELAY_MAX_BODY_BYTES) with the encryption's overhead */
const MAX_JSON_BYTES = 2_700;
const TOPIC = "ovis-inbox";
const STATE_FILE = "inbox-widget.json";
const ORDER: Readonly<Record<InboxWidgetRow["s"], number>> = { b: 0, d: 1, w: 2, i: 3 };

interface Agent { row: Omit<InboxWidgetRow, "t">; at: number }

const short = (status: AgentStatus | undefined): InboxWidgetRow["s"] =>
  status === "blocked" ? "b" : status === "done" ? "d" : status === "working" ? "w" : "i";

/** Waiting on you first, the longest wait on top; then the latest finished, working, and idle. */
export function inboxOrder(rows: readonly InboxWidgetRow[]): InboxWidgetRow[] {
  return [...rows].sort((a, b) => ORDER[a.s] - ORDER[b.s] || (a.s === "b" ? a.t - b.t : b.t - a.t) || a.n.localeCompare(b.n));
}

/** The digest for one endpoint, its rows cut from the end until it fits one push. */
export function inboxMessage(rows: readonly InboxWidgetRow[], endpoint: string, at: number, serverId?: string): PushPayload {
  const kept = [...rows];
  for (;;) {
    const inbox: InboxDigest = { at, endpoint, ...(serverId ? { server_id: serverId } : {}), rows: kept, more: rows.length - kept.length };
    const message: PushPayload = { pane_id: null, title: "", body: "", tag: TOPIC, inbox };
    if (kept.length === 0 || JSON.stringify(message).length <= MAX_JSON_BYTES) return message;
    kept.pop();
  }
}

export class InboxWidget {
  private readonly agents = new Map<string, Agent>();
  private readonly endpoints: Set<string>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastSent = 0;
  private lastRows = "";

  constructor(private readonly push: PushService, private readonly options: { stateDir: string; friendOf?: FriendLookup; serverId?: () => string | undefined; now?: () => number }) {
    let saved: unknown = null;
    try { saved = JSON.parse(readFileSync(join(options.stateDir, STATE_FILE), "utf8")); } catch { }
    const list = (saved as { endpoints?: unknown } | null)?.endpoints;
    this.endpoints = new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
    this.beat();
  }

  private now(): number { return (this.options.now ?? Date.now)(); }

  /** Every agent pane of one PC, as the alerts see it; a helper folds under its agent, as in the inbox. */
  panes(panes: readonly HerdrPane[], machineId = "local"): void {
    const seen = new Set<string>();
    for (const pane of panes) {
      if (!pane.agent || pane.parent_pane_id) continue;
      const key = `${machineId}\u0000${pane.pane_id}`;
      seen.add(key);
      const friend = this.options.friendOf?.(machineId, pane.pane_id);
      const row: Agent["row"] = { p: pane.pane_id, ...(machineId === "local" ? {} : { m: machineId }), ...(pane.workspace_id ? { w: pane.workspace_id } : {}), n: pushPaneTitle(pane), ...(friend ? { f: friend } : {}), s: short(pane.agent_status) };
      const held = this.agents.get(key);
      this.agents.set(key, { row, at: held && held.row.s === row.s ? held.at : this.now() });
    }
    for (const key of this.agents.keys()) if (key.startsWith(`${machineId}\u0000`) && !seen.has(key)) this.agents.delete(key);
    this.changed();
  }

  status(paneId: string, status: AgentStatus, machineId = "local"): void {
    const agent = this.agents.get(`${machineId}\u0000${paneId}`);
    if (!agent || agent.row.s === short(status)) return;
    agent.row = { ...agent.row, s: short(status) };
    agent.at = this.now();
    this.changed();
  }

  ended(paneId: string, machineId = "local"): void {
    if (this.agents.delete(`${machineId}\u0000${paneId}`)) this.changed();
  }

  /** A phone placed (or removed) its widget; a placed one gets the agents at once. */
  place(endpoint: string, placed: boolean): void {
    if (placed === this.endpoints.has(endpoint)) { if (placed) void this.sendTo([endpoint]); return; }
    if (placed) this.endpoints.add(endpoint); else this.endpoints.delete(endpoint);
    this.save();
    this.beat();
    if (placed) void this.sendTo([endpoint]);
  }

  rows(): InboxWidgetRow[] {
    return inboxOrder([...this.agents.values()].map(({ row, at }) => ({ ...row, t: Math.floor(at / 1000) })));
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = this.heartbeat = null;
  }

  private changed(): void {
    if (this.endpoints.size === 0 || this.timer || JSON.stringify(this.rows()) === this.lastRows) return;
    this.timer = setTimeout(() => { this.timer = null; void this.sendTo([...this.endpoints]); }, Math.max(SETTLE_MS, this.lastSent + MIN_GAP_MS - this.now()));
    this.timer.unref?.();
  }

  private beat(): void {
    if (this.endpoints.size > 0 && !this.heartbeat) {
      this.heartbeat = setInterval(() => void this.sendTo([...this.endpoints]), HEARTBEAT_MS);
      this.heartbeat.unref?.();
    } else if (this.endpoints.size === 0 && this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private async sendTo(endpoints: readonly string[]): Promise<void> {
    const rows = this.rows();
    this.lastRows = JSON.stringify(rows);
    this.lastSent = this.now();
    const at = Math.floor(this.lastSent / 1000);
    await Promise.all(endpoints.map(async (endpoint) => {
      const delivery = await this.push.sendQuiet(endpoint, inboxMessage(rows, endpoint, at, this.options.serverId?.()), TOPIC).catch(() => undefined);
      // an endpoint this PC no longer pushes to has no widget to keep
      if (delivery === null || (delivery && !delivery.ok && delivery.gone)) this.place(endpoint, false);
    }));
  }

  private save(): void {
    try { writePrivateState(join(this.options.stateDir, STATE_FILE), { endpoints: [...this.endpoints] }); } catch { }
  }
}

const widgets = new WeakMap<PushService, InboxWidget>();

/** The push service, watched for the widget: the one hook in server/core/status.ts. */
export function watchInbox(push: PushService, options: ConstructorParameters<typeof InboxWidget>[1]): PushService {
  const widget = new InboxWidget(push, options);
  const watched: PushService = {
    ...push,
    seed(panes, machineId, machineName, serverId) { push.seed(panes, machineId, machineName, serverId); widget.panes(panes, machineId); },
    resync(panes, newer, machineId) { push.resync(panes, newer, machineId); widget.panes(panes, machineId); },
    onStatus(paneId, status, machineId) { widget.status(paneId, status, machineId); return push.onStatus(paneId, status, machineId); },
    onEnded(paneId, machineId) { widget.ended(paneId, machineId); return push.onEnded(paneId, machineId); },
  };
  widgets.set(watched, widget);
  return watched;
}

/** POST /api/fork/inbox-widget `{ subscription, placed }`: only the phone holding the subscription's keys places one. */
export async function handleInboxWidget(request: Request, push: PushService, owner: string | null): Promise<Response> {
  const widget = widgets.get(push);
  if (!widget) return jsonResponse({ error: { code: "not_found", message: "not found" } }, 404);
  if (request.method !== "POST") return jsonResponse({ error: { code: "method_not_allowed", message: `${request.method} is not supported` } }, 405);
  let body: { subscription?: unknown; placed?: unknown } = {};
  try { body = await request.json() as typeof body; } catch { }
  const subscription = push.parse(body.subscription);
  if (!subscription || typeof body.placed !== "boolean") return jsonResponse({ error: { code: "invalid_request", message: "subscription and placed are required" } }, 400);
  if (!push.status(subscription, owner)?.registered) return jsonResponse({ error: { code: "not_found", message: "this subscription is not this device's" } }, 404);
  widget.place(subscription.endpoint, body.placed);
  return jsonResponse({ ok: true });
}
