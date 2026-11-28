import { afterEach, beforeEach, expect, it } from "bun:test";
import type { Machine } from "../../../shared/machines.ts";
import type { Translate } from "../../lib/i18n.ts";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { useHiddenLens } from "./hiddenAgents.ts";
import { forkHideItem } from "./hideItem.ts";

let page: Page;
const t = ((key: string, vars?: Record<string, string>) => key.replace(/\{(\w+)\}/g, (_, name: string) => vars?.[name] ?? name)) as Translate;
const machines = [{ id: "core", runtime: "herdr-core", state: "connected", snapshot: null }, { id: "herdr", state: "connected", snapshot: null }] as unknown as Machine[];
function Lens() { useHiddenLens(machines); return null; }

beforeEach(async () => {
  page = openPage();
  await page.render(<Lens />);
});
afterEach(() => page.close());

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
