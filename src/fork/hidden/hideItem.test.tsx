import { afterEach, beforeEach, expect, it } from "bun:test";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import type { Machine } from "../../../shared/machines.ts";
import type { Translate } from "../../lib/i18n.ts";
import { useHiddenLens } from "./hiddenAgents.ts";
import { forkHideItem } from "./hideItem.ts";

let saved: PropertyDescriptor | undefined;
let renderer: ReactTestRenderer | undefined;
const t = ((key: string, vars?: Record<string, string>) => key.replace(/\{(\w+)\}/g, (_, name: string) => vars?.[name] ?? name)) as Translate;
const machines = [{ id: "core", runtime: "herdr-core", state: "connected", snapshot: null }, { id: "herdr", state: "connected", snapshot: null }] as unknown as Machine[];
function Lens() { useHiddenLens(machines); return null; }

beforeEach(async () => {
  saved = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  await act(async () => { renderer = create(<Lens />); });
});
afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  if (saved) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", saved);
  else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

const shell = { pane_id: "s", agent: null };
const pi = { pane_id: "a", agent: "pi" };
const codex = { pane_id: "b", agent: "codex", ovis_hidden: true as const };
const item = (machineId: string, pane: { pane_id: string; agent: string | null; ovis_hidden?: true }, watching = false) =>
  forkHideItem(machineId, pane, t, watching).map((entry) => [entry.id, entry.label, entry.disabled]);

it("offers Hide or Unhide for an agent on a herdr-core PC, disabled while watching, and nothing else", () => {
  expect(item("core", pi)).toEqual([["hide:a", "Hide agent", false]]);
  expect(item("core", codex, true)).toEqual([["unhide:b", "Unhide agent", true]]);
  expect(item("core", shell)).toEqual([]);
  expect(item("herdr", pi)).toEqual([]);
});
