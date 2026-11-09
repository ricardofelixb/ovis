import type { Machine } from "../shared/machines.ts";
import type { HcMachine } from "./herdr-core/machine-bridge.ts";
import { sshAddress } from "./ssh-address.ts";
import { hostKey } from "./tailnet.ts";

/**
 * The computer is on this server's roster twice when a person added it as an SSH or relay PC (files, chat,
 * diffs) and also gave this PC's core the same computer (`hc machine add`, which Ovis shows as a PC of its own,
 * without files or chat history). The SSH or relay PC wins and the core's machine is not shown, nor its server
 * started, for as long as the first one stays on the roster (MachineManager.syncHcMachines).
 *
 * Two entries are one computer when they share a name: each side's host written the way a person or ssh gave it
 * (`user@omarchy`, `omarchy.tailnet.ts.net`, `100.64.0.5:22` all keyed by hostKey, which drops the user, the
 * port, a trailing dot and the domain), what ssh resolves an SSH PC's alias to (`ssh -G`, once it has answered),
 * and the name each calls it. A relay PC has only its name. Their ids say nothing: the core's machine id is
 * that core's own, unrelated to an SSH or relay PC's.
 */
export function hcTwin(hc: HcMachine, pcs: Iterable<Machine>): Machine | null {
  const hcKeys = new Set([hostOf(hc.target), hostOf(hc.host), hc.name.trim().toLowerCase()].filter(Boolean));
  for (const pc of pcs) {
    if (pc.kind !== "ssh" && pc.kind !== "relay") continue;
    if (pcKeys(pc).some((key) => hcKeys.has(key))) return pc;
  }
  return null;
}

function pcKeys(pc: Machine): string[] {
  const keys = [pc.name.trim().toLowerCase()];
  if (pc.kind === "ssh" && pc.target) {
    keys.push(hostOf(pc.target.destination));
    const resolved = sshAddress(pc.target);
    // `user@hostname:port`, as ssh resolves the alias
    if (typeof resolved === "string") keys.push(hostOf(resolved.slice(resolved.indexOf("@") + 1).replace(/:\d+$/, "")));
  }
  return keys.filter(Boolean);
}

/** one host as written: `ssh://user@Host:22`, `user@host.tailnet.ts.net.`, `host` → `host`; an IP address stays whole */
function hostOf(written: string | undefined): string {
  if (!written) return "";
  const bare = written.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, "").replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/^([^:@]+(?:@[^:@]+)?):\d+$/, "$1");
  return bare ? hostKey(bare) : "";
}
