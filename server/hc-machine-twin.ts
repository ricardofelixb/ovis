import type { Machine } from "../shared/machines.ts";
import type { HcMachine } from "./herdr-core/machine-bridge.ts";
import { sshAddress } from "./ssh-address.ts";

/**
 * The computer is on this server's roster twice when a person added it as an SSH or relay PC (files, chat,
 * diffs) and also gave this PC's core the same computer (`hc machine add`, which Ovis shows as a PC of its own,
 * without files or chat history). The SSH or relay PC wins and the core's machine is not shown, nor its server
 * started, for as long as the first one stays on the roster (MachineManager.syncHcMachines).
 *
 * Hiding a PC must never take a different computer off the roster, so hosts are compared whole: a short name
 * is not the first label of a longer one (`lab.prod.example.com` is not `lab.dev.example.com`), and an IP
 * address is only itself. Each side says the hosts it reaches, as written (user, port, case and a trailing dot
 * dropped) and as `ssh -G` resolves its destination, the alias an SSH config gives it included. The two are one
 * computer, in this order:
 *   1. they share a host: both sides' hosts meet (the core's `host`, the machine's own name for itself, only
 *      ever adds a meeting; it never counts against a match);
 *   2. else, when each side has a host that tells computers apart (an IP address or a dotted name, as written or as
 *      `ssh -G` resolved it) and none meets, they are different computers, whatever they are called;
 *   3. else (a bare alias that ssh has not resolved to one, or a relay PC, which has no host at all) the same display
 *      name: the name the PC is shown under against the name the core calls the machine.
 * Their ids say nothing: the core's machine id is that core's own, unrelated to an SSH or relay PC's. A bare
 * alias is resolved in the background (ssh-address.ts), so a match through it is settled by a later read.
 */
export function hcTwin(hc: HcMachine, pcs: Iterable<Machine>): Machine | null {
  const core = identities(hc.target);
  if (hc.host) core.all.add(hostOf(hc.host));
  for (const pc of pcs) {
    if (pc.kind !== "ssh" && pc.kind !== "relay") continue;
    const own = pc.kind === "ssh" && pc.target ? identities(pc.target.destination) : { all: new Set<string>(), firm: new Set<string>() };
    if ([...own.all].some((host) => core.all.has(host))) return pc;
    if (own.firm.size > 0 && core.firm.size > 0) continue;
    if (hc.name.trim() && pc.name.trim().toLowerCase() === hc.name.trim().toLowerCase()) return pc;
  }
  return null;
}

/** every host an ssh destination reaches (all), and those that tell computers apart (firm) */
function identities(destination: string): { all: Set<string>; firm: Set<string> } {
  const all = new Set<string>(), firm = new Set<string>();
  const add = (host: string) => { if (!host) return; all.add(host); if (host.includes(".") || host.includes(":")) firm.add(host); };
  add(hostOf(destination));
  const resolved = sshAddress({ destination });
  // `user@hostname:port`, as ssh resolves the alias
  if (typeof resolved === "string") add(hostOf(resolved.slice(resolved.indexOf("@") + 1)));
  return { all, firm };
}

/** one host as written: `ssh://user@Host:22`, `user@host.tailnet.ts.net.`, `host` → `host`; never shortened */
function hostOf(written: string): string {
  const bare = written.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/.*$/, "").replace(/^[^@]*@/, "")
    .replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/^([^:]+):\d+$/, "$1").replace(/\.$/, "");
  return bare;
}
