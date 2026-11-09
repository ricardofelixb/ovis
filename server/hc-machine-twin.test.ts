import { describe, expect, it } from "bun:test";
import type { Machine } from "../shared/machines.ts";
import type { HcMachine } from "./herdr-core/machine-bridge.ts";
import { hcTwin } from "./hc-machine-twin.ts";

const hc = (name: string, target: string, host = name): HcMachine => ({ id: "abc", name, target, host, connected: true, why: null });
const ssh = (name: string, destination: string): Machine => ({ id: "ssh-1", name, kind: "ssh", target: { destination }, enabled: true, state: "connected", error: null, snapshot: null });
const relay = (name: string): Machine => ({ id: "relay-1", name, kind: "relay", relay: { server_id: "s", relay: "r" }, enabled: true, state: "connected", error: null, snapshot: null });

describe("hcTwin", () => {
  it("matches the host however each side wrote it", () => {
    expect(hcTwin(hc("x", "ricardo@omarchy.tail1e211e.ts.net."), [ssh("Desk", "omarchy")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("x", "omarchy"), [ssh("Desk", "ricardo@Omarchy.tail1e211e.ts.net:2222")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("x", "ssh://ricardo@mini:22"), [ssh("Desk", "mini")])?.id).toBe("ssh-1");
  });

  it("matches the name each calls it, and a relay PC only by its name", () => {
    expect(hcTwin(hc("omarchybook", "10.0.0.9"), [ssh("OmarchyBook", "laptop-alias")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("mac-mini", "mac-mini.local"), [relay("Mac-Mini")])?.id).toBe("relay-1");
  });

  it("leaves a different computer, an IP that is not the same, the Host and another core's machine alone", () => {
    expect(hcTwin(hc("lab", "ricardo@lab"), [ssh("Other", "ricardo@elsewhere")])).toBeNull();
    expect(hcTwin(hc("lab", "100.64.0.5"), [ssh("Other", "100.64.0.6")])).toBeNull();
    expect(hcTwin(hc("lab", "lab"), [{ ...ssh("lab", "lab"), kind: "hc" }, { ...ssh("lab", "lab"), kind: "local" }])).toBeNull();
  });
});
