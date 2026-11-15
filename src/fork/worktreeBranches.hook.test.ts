import { afterEach, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { SessionSnapshot } from "../../shared/protocol.ts";
import { useWorktreeBranches } from "../lib/useWorktreeBranches.ts";

const descriptors = new Map<string, PropertyDescriptor | undefined>();
let renderer: ReactTestRenderer | null = null;
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = null;
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  descriptors.clear();
});

it.each([false, true])("restores branches only when opted in, without a SettingsProvider: %s", async (persist) => {
  const read: string[] = [];
  const saved = { records: [], unmarked: [["w1", { branch: "feature/one", isDetached: false }]] };
  const define = (key: string, value: unknown) => {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  };
  define("IS_REACT_ACT_ENVIRONMENT", true);
  define("document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
  define("localStorage", { getItem: (key: string) => { read.push(key); return JSON.stringify(saved); } });
  const snapshot = { workspaces: [{ workspace_id: "w1" }], tabs: [], panes: [], agents: [] } as unknown as SessionSnapshot;
  const unmarked = new Set(["w1"]);
  let shown: string | null = null;
  function Probe() {
    shown = useWorktreeBranches(snapshot, false, false, unmarked, false, undefined, persist).branches.get("w1")?.branch ?? null;
    return null;
  }
  await act(async () => { renderer = create(createElement(Probe)); });
  expect(shown).toBe(persist ? "feature/one" : null);
  expect(read).toEqual(persist ? ["ovis:branches:local"] : []);
});
