import { describe, expect, test } from "bun:test";
import { hostKey, offlineHosts, TailnetPresence, type TailnetPeer } from "./tailnet.ts";

const peers: TailnetPeer[] = [
  { HostName: "DESKTOP-BC7NOT7", DNSName: "desktop-bc7not7.tailb4e5ae.ts.net.", TailscaleIPs: ["100.69.31.118"], Online: false },
  { HostName: "omarchybook", DNSName: "omarchybook.tailb4e5ae.ts.net.", TailscaleIPs: ["100.96.150.40"], Online: true },
];

describe("tailnet presence", () => {
  test("an SSH destination meets the peer it names, however it is spelled", () => {
    expect(hostKey("ricardo@Desktop-BC7NOT7.tailb4e5ae.ts.net.")).toBe("desktop-bc7not7");
    expect(hostKey("100.69.31.118")).toBe("100.69.31.118");
    const offline = offlineHosts(peers);
    expect([...offline].sort()).toEqual(["100.69.31.118", "desktop-bc7not7"]);
  });

  test("tells the PC list only when the offline set changes, and never hides on a failed read", async () => {
    let bus: () => void = () => {};
    let reads: (TailnetPeer[] | Error)[] = [peers];
    let changes = 0;
    const presence = new TailnetPresence(() => changes++, async () => {
      const next = reads.shift();
      if (next instanceof Error) throw next;
      return next ?? peers;
    }, (onChange) => { bus = onChange; return () => {}; });
    presence.start();
    await Bun.sleep(600);
    expect(presence.offline("desktop-bc7not7")).toBe(true);
    expect(presence.offline("omarchybook")).toBe(false);
    expect(changes).toBe(1);

    reads = [peers];
    bus();
    await Bun.sleep(600);
    expect(changes).toBe(1);

    reads = [new Error("tailscaled went away")];
    bus();
    await Bun.sleep(600);
    expect(presence.offline("desktop-bc7not7")).toBe(false);
    expect(changes).toBe(2);
    presence.stop();
  });
});
