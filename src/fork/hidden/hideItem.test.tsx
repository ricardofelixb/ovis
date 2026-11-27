import { afterEach, beforeEach, expect, it } from "bun:test";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import type { Machine } from "../../../shared/machines.ts";
import type { Translate } from "../../lib/i18n.ts";
import { useHiddenLens } from "./hiddenAgents.ts";
import { forkHideItems } from "./hideItem.ts";

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

const shell = { pane_id: "s", agent: null, title: "zsh" };
const pi = { pane_id: "a", agent: "pi", title: "Pi" };
const codex = { pane_id: "b", agent: "codex", title: "Codex", ovis_hidden: true as const };
const items = (machineId: string, panes: { pane_id: string; agent: string | null; title: string; ovis_hidden?: true }[]) =>
  forkHideItems(machineId, panes, t, false, (pane) => pane.title).map((item) => [item.id, item.label]);

it("a split tab offers each of its agents by name, and a tab with one agent its plain Hide", () => {
  expect(items("core", [shell, pi, codex])).toEqual([["hide:a", "Hide Pi"], ["unhide:b", "Unhide Codex"]]);
  expect(items("core", [shell, pi])).toEqual([["hide:a", "Hide agent"]]);
  expect(items("core", [shell])).toEqual([]);
  expect(items("herdr", [pi])).toEqual([]);
});
