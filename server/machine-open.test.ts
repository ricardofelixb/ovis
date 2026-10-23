import { describe, expect, test } from "bun:test";

import type { Machine, MachineEvent } from "../shared/machines.ts";
import { handleMachineRequest } from "./machine-api.ts";
import type { MachineManager } from "./machines.ts";

const machines = [
  { id: "local", name: "orgo-desktop", kind: "local" },
  { id: "mini", name: "Mini", kind: "ssh", target: { destination: "ricardos-mac-mini" } },
] as Machine[];
const manager = { subscribe: () => () => undefined, list: () => machines } as unknown as MachineManager;
const base = "http://127.0.0.1:7317/api/machines";

async function stream(device: string, signal: AbortSignal) {
  const response = await handleMachineRequest(new Request(`${base}/events`, { signal, headers: { "x-forwarded-for": device } }), manager);
  return response.body!.getReader();
}

function open(device: string, host: string) {
  return handleMachineRequest(new Request(`${base}/open`, {
    method: "POST",
    headers: { "x-forwarded-for": device, "x-herdr-machine": "1", "content-type": "application/json" },
    body: JSON.stringify({ host, pane_id: "w3:p2" }),
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

      expect((await open("100.1.2.3", "orgo-desktop")).status).toBe(404);
      expect((await open("100.96.150.40", "elsewhere")).status).toBe(404);
    } finally {
      abort.abort();
      await laptop.cancel().catch(() => undefined);
      await phone.cancel().catch(() => undefined);
    }
  });
});
