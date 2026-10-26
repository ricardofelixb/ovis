/**
 * The tailnet's offline machines, as Tailscale knows them: the sidebar hides a PC whose SSH host is
 * one of them. Tailscale's IPN bus tells when its network map changes, a peer going on or offline
 * among it, so nothing polls. Without Tailscale, or while it can't say, no PC counts as offline.
 */

export interface TailnetPeer { HostName?: string; DNSName?: string; TailscaleIPs?: string[]; Online?: boolean }

/** "user@host.tailnet.ts.net." → "host", "100.64.0.1" → "100.64.0.1": how a peer and an SSH destination meet. */
export function hostKey(name: string): string {
  const host = name.trim().toLowerCase().replace(/^[^@]*@/, "").replace(/\.$/, "");
  return /^[\d.]+$/.test(host) || host.includes(":") ? host : host.split(".")[0]!;
}

/** Every name an offline peer answers to: its MagicDNS name, its host name and its addresses. */
export function offlineHosts(peers: TailnetPeer[]): Set<string> {
  const offline = new Set<string>();
  for (const peer of peers) {
    if (peer.Online !== false) continue;
    for (const name of [peer.DNSName, peer.HostName, ...(peer.TailscaleIPs ?? [])]) if (name) offline.add(hostKey(name));
  }
  return offline;
}

async function readPeers(): Promise<TailnetPeer[]> {
  const child = Bun.spawn(["tailscale", "status", "--json"], { stdout: "pipe", stderr: "ignore", timeout: 10_000 });
  const text = await new Response(child.stdout).text();
  if (await child.exited !== 0) throw new Error("tailscale status failed");
  const status = JSON.parse(text) as { Peer?: Record<string, TailnetPeer> };
  return Object.values(status.Peer ?? {});
}

/** Lines on Tailscale's IPN bus, each one a change; null where there is no Tailscale to watch. */
function watchBus(onChange: () => void, onEnd: () => void): (() => void) | null {
  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn(["tailscale", "debug", "watch-ipn"], { stdout: "pipe", stderr: "ignore" });
  } catch {
    return null;
  }
  void (async () => {
    for await (const _ of child.stdout as ReadableStream<Uint8Array>) onChange();
    onEnd();
  })().catch(onEnd);
  return () => child.kill();
}

export class TailnetPresence {
  private offlineNow = new Set<string>();
  private stopWatch: (() => void) | null = null;
  private readTimer?: ReturnType<typeof setTimeout>;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;

  constructor(private onChange: () => void, private read = readPeers, private watch = watchBus) {}

  /** Whether Tailscale says the machine behind this SSH destination is offline. */
  offline(destination: string | undefined): boolean {
    return destination !== undefined && this.offlineNow.has(hostKey(destination));
  }

  start(): void {
    if (this.stopped || this.stopWatch) return;
    this.stopWatch = this.watch(() => this.changed(), () => {
      this.stopWatch = null;
      // tailscaled restarted, or went away: watch again in a while
      if (!this.stopped) { this.restartTimer = setTimeout(() => this.start(), 60_000); this.restartTimer.unref?.(); }
    });
    if (this.stopWatch) this.changed();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.readTimer);
    clearTimeout(this.restartTimer);
    this.stopWatch?.();
    this.stopWatch = null;
  }

  // a change comes as a burst of bus messages: read the status once it settles
  private changed(): void {
    clearTimeout(this.readTimer);
    this.readTimer = setTimeout(() => void this.refresh(), 500);
    this.readTimer.unref?.();
  }

  private async refresh(): Promise<void> {
    let next: Set<string>;
    try {
      next = offlineHosts(await this.read());
    } catch {
      next = new Set();
    }
    if (this.stopped || sameSet(next, this.offlineNow)) return;
    this.offlineNow = next;
    this.onChange();
  }
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item));
}
