import { describe, expect, test } from "bun:test";

import type { Machine, MachineEvent } from "../shared/machines.ts";
import type { ServerMessage } from "../shared/protocol.ts";
import { type Client, connectionData, setMachineEvents } from "./core/connections.ts";
import { handleMachineRequest, readFinishes, subscribeOpen } from "./machine-api.ts";
import type { MachineManager } from "./machines.ts";

const machines = [
  { id: "local", name: "vps", kind: "local" },
  { id: "mini", name: "Mini", kind: "ssh", target: { destination: "ricardos-mac-mini" } },
] as Machine[];
const manager = { subscribe: () => () => undefined, list: () => machines } as unknown as MachineManager;
const base = "http://127.0.0.1:7317/api/machines";

async function stream(device: string, signal: AbortSignal) {
  const response = await handleMachineRequest(new Request(`${base}/events`, { signal, headers: { "x-forwarded-for": device } }), manager);
  return response.body!.getReader();
}

function open(device: string, ...hosts: string[]) {
  return handleMachineRequest(new Request(`${base}/open`, {
    method: "POST",
    headers: { "x-forwarded-for": device, "x-herdr-machine": "1", "content-type": "application/json" },
    body: JSON.stringify({ hosts, pane_id: "w3:p2" }),
  }), manager);
}

describe("POST /api/machines/open", () => {
  test("reaches only the browsers of the device that asks, naming the PC by its host", async () => {
    const abort = new AbortController();
    const laptop = await stream("100.96.150.40", abort.signal);
    const phone = await stream("100.68.231.10", abort.signal);
    try {
      const answer = await open("100.96.150.40", "Ricardos-Mac-Mini.tailnet.ts.net");
      expect(answer.status).toBe(200);
      expect(await answer.json()).toEqual({ windows: 1 });
      const { value } = await laptop.read();
      const event = JSON.parse(new TextDecoder().decode(value).replace(/^data: /, "")) as MachineEvent;
      expect(event).toEqual({ type: "open", machine_id: "mini", pane_id: "w3:p2" });

      // this PC by one of its own addresses, as an SSH config may name it
      expect(await (await open("100.96.150.40", "vps", "127.0.0.1")).json()).toEqual({ windows: 1 });
      expect((await open("100.1.2.3", "vps")).status).toBe(404);
      // an address matches whole, not by its first label: every tailnet address starts `100.`
      expect((await open("100.96.150.40", "100.200.1.1")).status).toBe(404);
      expect((await open("100.96.150.40", "elsewhere")).status).toBe(404);
    } finally {
      abort.abort();
      await laptop.cancel().catch(() => undefined);
      await phone.cancel().catch(() => undefined);
    }
  });
});

describe("POST /api/machines/open over the terminal WebSocket", () => {
  // a browser whose machine events ride its terminal socket: the upgrade binds the document to its device
  function socket(device: string) {
    const sent: MachineEvent[] = [];
    const machineEvents = { manager: { subscribe: () => () => undefined }, open: { subscribe: (listener: (event: MachineEvent) => void) => subscribeOpen(device, listener) } };
    const client = {
      data: connectionData({ deviceId: undefined, readOnly: false, machineEvents }),
      readyState: WebSocket.OPEN,
      close: () => undefined,
      getBufferedAmount: () => 0,
      send: (raw: string) => { const message = JSON.parse(raw) as ServerMessage; if (message.type === "machine-event") sent.push(message.event); return 1; },
    } as unknown as Client;
    return { client, sent };
  }

  test("reaches a socket with machine events on, on its device only, until they stop", async () => {
    const laptop = socket("100.96.150.41");
    const phone = socket("100.68.231.11");
    setMachineEvents(laptop.client, true);
    setMachineEvents(phone.client, true);
    expect(await (await open("100.96.150.41", "vps")).json()).toEqual({ windows: 1 });
    expect(laptop.sent).toEqual([{ type: "open", machine_id: "local", pane_id: "w3:p2" }]);
    expect(phone.sent).toEqual([]);

    setMachineEvents(laptop.client, false);
    expect((await open("100.96.150.41", "vps")).status).toBe(404);
    setMachineEvents(laptop.client, true);
    expect(await (await open("100.96.150.41", "vps")).json()).toEqual({ windows: 1 });
    setMachineEvents(laptop.client, false);
    setMachineEvents(phone.client, false);
    expect((await open("100.68.231.11", "vps")).status).toBe(404);
  });
});

describe("readFinishes", () => {
  test("lists a finished pane once its latest finish is read", () => {
    const mini = { ...machines[1]!, snapshot: { finish_epoch: "e1", panes: [
      { pane_id: "w1:p1", agent_status: "done", finish_id: 2 },
      { pane_id: "w1:p2", agent_status: "done", finish_id: 3 },
      { pane_id: "w1:p3", agent_status: "idle", finish_id: 1 },
    ] } } as unknown as Machine;
    const seen = [
      { pc: "mini", epoch: "e1", pane: "w1:p1", id: 2 },
      { pc: "mini", epoch: "e1", pane: "w1:p2", id: 2 }, // an earlier finish: the latest is unread
      { pc: "mini", epoch: "e1", pane: "w1:p3", id: 1 },
    ];
    expect(readFinishes([mini], seen)).toEqual([{ hosts: ["ricardos-mac-mini"], pane_id: "w1:p1" }]);
    expect(readFinishes([mini], seen.map((f) => ({ ...f, epoch: "e0" })))).toEqual([]);
  });
});
