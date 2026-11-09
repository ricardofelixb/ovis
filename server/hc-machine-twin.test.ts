import { afterEach, describe, expect, it } from "bun:test";
import type { Machine } from "../shared/machines.ts";
import type { HcMachine } from "./herdr-core/machine-bridge.ts";
import { hcTwin } from "./hc-machine-twin.ts";
import { forgetSshAddresses, sshAddresses, warmSshAddresses } from "./ssh-address.ts";

const hc = (name: string, target: string, host = name): HcMachine => ({ id: "abc", name, target, host, connected: true, why: null });
const ssh = (name: string, destination: string): Machine => ({ id: "ssh-1", name, kind: "ssh", target: { destination }, enabled: true, state: "connected", error: null, snapshot: null });
const relay = (name: string): Machine => ({ id: "relay-1", name, kind: "relay", relay: { server_id: "s", relay: "r" }, enabled: true, state: "connected", error: null, snapshot: null });

const resolver = sshAddresses.resolve;
afterEach(() => { sshAddresses.resolve = resolver; forgetSshAddresses(); });
/** what `ssh -G` says each destination reaches */
async function resolved(map: Record<string, string>, ...destinations: string[]) {
  sshAddresses.resolve = async (target) => map[target.destination] ?? null;
  await warmSshAddresses(destinations.map((destination) => ({ destination })));
}

describe("hcTwin", () => {
  it("matches the same host however each side wrote it", () => {
    expect(hcTwin(hc("x", "ricardo@omarchy.tail1e211e.ts.net."), [ssh("Desk", "omarchy.tail1e211e.ts.net")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("x", "omarchy"), [ssh("Desk", "ricardo@Omarchy:2222")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("x", "ssh://ricardo@mini.local:22"), [ssh("Desk", "mini.local")])?.id).toBe("ssh-1");
  });

  it("matches two aliases that ssh resolves to one endpoint, and the core's own host name", async () => {
    await resolved({ "mini-core": "ricardo@100.64.0.5:22", desktop: "ricardo@100.64.0.5:22" }, "mini-core", "desktop");
    expect(hcTwin(hc("mini", "mini-core", "mac-mini.local"), [ssh("Office", "desktop")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("x", "10.0.0.9", "office.local"), [ssh("Office", "office.local")])?.id).toBe("ssh-1");
  });

  it("matches by display name only where no host tells them apart", () => {
    expect(hcTwin(hc("omarchybook", "laptop-core"), [ssh("OmarchyBook", "laptop-alias")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("omarchybook", "omarchybook.tail1e211e.ts.net"), [ssh("OmarchyBook", "laptop-alias")])?.id).toBe("ssh-1");
    expect(hcTwin(hc("mac-mini", "mac-mini.local"), [relay("Mac-Mini")])?.id).toBe("relay-1");
  });

  it("keeps different computers apart, however alike their names", async () => {
    expect(hcTwin(hc("prod", "lab.prod.example.com"), [ssh("dev", "lab.dev.example.com")])).toBeNull();
    expect(hcTwin(hc("lab", "lab.prod.example.com"), [ssh("lab", "lab.dev.example.com")])).toBeNull();
    expect(hcTwin(hc("lab", "100.64.0.5"), [ssh("lab", "100.64.0.6")])).toBeNull();
    await resolved({ "mini-core": "ricardo@100.64.0.5:22", desktop: "ricardo@100.64.0.6:22" }, "mini-core", "desktop");
    expect(hcTwin(hc("office", "mini-core"), [ssh("office", "desktop")])).toBeNull();
    expect(hcTwin(hc("lab", "ricardo@lab"), [ssh("Other", "ricardo@elsewhere")])).toBeNull();
    expect(hcTwin(hc("lab", "lab"), [{ ...ssh("lab", "lab"), kind: "hc" }, { ...ssh("lab", "lab"), kind: "local" }])).toBeNull();
  });
});
