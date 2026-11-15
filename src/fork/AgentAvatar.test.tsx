import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";

import type { Machine } from "../../shared/machines.ts";
import { SettingsProvider } from "../lib/settings.ts";
import { AgentAvatar, friendMood } from "./AgentAvatar.tsx";
import { useAgentFriends } from "./friends.ts";

const machine = { id: "m1", state: "connected", snapshot: { panes: [{ pane_id: "p1", agent: "claude" }, { pane_id: "p2", agent: "codex" }] } } as unknown as Machine;

/** the stored settings this device has, and the friends /api/friends answers */
function device(agentFriends: boolean, friends: Record<string, string>) {
  const win = globalThis.window as unknown as { localStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> };
  win.localStorage = { getItem: (key) => key === "ovis:settings" ? JSON.stringify({ agentFriends }) : null, setItem() {}, removeItem() {} };
  globalThis.fetch = (async () => new Response(JSON.stringify({ friends }), { headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

function Asking({ children }: { children: React.ReactNode }) {
  useAgentFriends([machine]);
  return <>{children}</>;
}

describe("AgentAvatar", () => {
  const realFetch = globalThis.fetch;
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  let renderer: ReactTestRenderer | undefined;
  beforeEach(() => {
    for (const key of ["window", "document", "navigator", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"]) descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const events = new EventTarget();
    const media = { matches: true, addEventListener() {}, removeEventListener() {} };
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { languages: ["en-US"] } });
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      matchMedia: () => media, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
      requestAnimationFrame: () => 1, cancelAnimationFrame() {}, location: { href: "http://localhost/" },
    } });
    Object.defineProperty(globalThis, "document", { configurable: true, value: {
      body: { nodeType: 1, children: [] }, documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } },
      querySelector: () => null, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    } });
    Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: () => ({ getPropertyValue: () => "" }) });
  });
  afterEach(async () => {
    await act(async () => { renderer?.unmount(); });
    renderer = undefined;
    globalThis.fetch = realFetch;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    descriptors.clear();
  });

  const draw = async (avatar: React.ReactNode): Promise<string> => {
    await act(async () => { renderer = create(<SettingsProvider><Asking>{avatar}</Asking></SettingsProvider>); });
    // the answer to /api/friends lands after the first paint
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    return JSON.stringify(renderer!.toJSON());
  };

  it("draws the friend alone, with no harness logo, when Agent friends is on and the pane has one", async () => {
    device(true, { "m1:p1": "neko" });
    const out = await draw(<AgentAvatar agent="claude" size={18} machineId="m1" paneId="p1" status="working" />);
    expect(out).toContain("agent-friend is-working");
    expect(out).toContain('"width":22');
    expect(out).not.toContain("agent-mark");
  });

  it("draws the agent's mark when friends are off, the pane has none, or no pane is named", async () => {
    device(false, { "m1:p1": "neko" });
    expect(await draw(<AgentAvatar agent="claude" size={18} machineId="m1" paneId="p1" />)).toContain("agent-mark");
    await act(async () => renderer?.unmount());
    device(true, { "m1:p1": "neko" });
    const none = await draw(<><AgentAvatar agent="codex" machineId="m1" paneId="p2" /><AgentAvatar agent="claude" machineId="m1" /></>);
    expect(none).not.toContain("agent-friend");
    expect(none.match(/agent-mark/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("maps a pane's status to its friend's mood", () => {
    expect([friendMood("waiting"), friendMood("unknown"), friendMood("done"), friendMood(undefined)]).toEqual(["working", undefined, "done", undefined]);
  });
});
