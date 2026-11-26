import { expect, test } from "bun:test";
import type { Machine } from "../../../shared/machines.ts";
import type { HerdrPane } from "../../../shared/protocol.ts";
import { agentRowTitle } from "../../components/AgentSidebar.tsx";
import { agentRoster } from "../../lib/agentRoster.ts";
import { agentTabName } from "../../lib/sidebarAgents.ts";
import { forkAgentsRoster, forkTreeOn, forkTreeRows, forkTreeTab } from "./treeRows.ts";

const entry = (id: string, parent?: string) => ({ pane: { pane_id: id, parent_pane_id: parent } });
type Entry = ReturnType<typeof entry>;
const ids = (rows: readonly Entry[]) => rows.map((row) => row.pane.pane_id);
const folds = (open: string[] = [], selectedPaneId: string | null = null, fold = true) => ({
  fold, open, selectedPaneId, blocked: (row: Entry) => row.pane.pane_id === "asking",
});
// a workspace's agents in snapshot order: helpers before or after their agent, and one from another workspace's agent
const workspace = [entry("child", "root"), entry("other"), entry("root"), entry("grandchild", "child"), entry("asking", "root"), entry("stray", "elsewhere")];

test("only both settings together turn the tree's folds on", () => {
  expect(forkTreeOn({ foldHelpers: true, sidebarAgentTree: true })).toBe(true);
  expect(forkTreeOn({ foldHelpers: true, sidebarAgentTree: false })).toBe(false);
  expect(forkTreeOn({ foldHelpers: false, sidebarAgentTree: true })).toBe(false);
});

test("a helper sits under its agent, a helper's helper under that helper, and one whose agent is elsewhere stays a row", () => {
  const rows = forkTreeRows("local", workspace, folds(["local:root"]));
  expect(ids(rows)).toEqual(["root", "child", "grandchild", "asking", "other", "stray"]);
  expect(rows.map((row) => row.forkTree?.["data-depth"] ?? 0)).toEqual([0, 1, 2, 1, 0, 0]);
  expect(rows[0]!.forkFold).toEqual({ key: "local:root", open: true, hidden: 0 });
  expect(rows.find((row) => row.pane.pane_id === "stray")!.forkFold).toBeUndefined();
});

test("a folded agent hides its helpers, except the one that needs the person and the selected one", () => {
  const folded = forkTreeRows("local", workspace, folds());
  expect(ids(folded)).toEqual(["root", "asking", "other", "stray"]);
  expect(folded[0]!.forkFold).toEqual({ key: "local:root", open: false, hidden: 2 });
  expect(folded[1]!.forkTree).toEqual({ "data-depth": 1 });
  const selected = forkTreeRows("local", workspace, folds([], "grandchild"));
  expect(ids(selected)).toEqual(["root", "grandchild", "asking", "other", "stray"]);
  expect(selected.map((row) => row.forkTree?.["data-depth"] ?? 0)).toEqual([0, 2, 1, 0, 0]);
  expect(selected[0]!.forkFold?.hidden).toBe(1);
});

test("the open state is per PC: another PC's open agent does not open this one", () => {
  expect(ids(forkTreeRows("local", workspace, folds(["remote:root"])))).toEqual(["root", "asking", "other", "stray"]);
});

test("under a filter the family order stays and nothing folds", () => {
  const rows = forkTreeRows("local", workspace, folds([], null, false));
  expect(ids(rows)).toEqual(["root", "child", "grandchild", "asking", "other", "stray"]);
  expect(rows.every((row) => row.forkFold === undefined)).toBe(true);
});

test("the tree's agent rows drop the tab name only while its folds are on", () => {
  expect(forkTreeTab(true, "Tab 1")).toBeNull();
  expect(forkTreeTab(false, "Tab 1")).toBe("Tab 1");
});

// one agent in a tab the user named "release", beside a second tab
const pane: HerdrPane = { pane_id: "w1:p1", workspace_id: "w1", tab_id: "w1:t1", terminal_id: "term-1", focused: false, revision: 1, agent: "claude", agent_status: "idle", title: "Guard the export button" };
const machine: Machine = { id: "local", name: "workstation", kind: "local", enabled: true, state: "connected", error: null, snapshot: {
  protocol: 22, version: "0.9.5", layouts: [], panes: [pane], agents: [],
  workspaces: [{ workspace_id: "w1", label: "checkout-api", number: 1, focused: false, pane_count: 1, tab_count: 2, active_tab_id: "w1:t1", agent_status: "idle" }],
  tabs: [
    { tab_id: "w1:t1", workspace_id: "w1", label: "release", number: 1, focused: false, pane_count: 1, agent_status: "idle" },
    { tab_id: "w1:t2", workspace_id: "w1", label: "2", number: 2, focused: false, pane_count: 0, agent_status: "idle" },
  ],
} };
const listRow = (foldHelpers: boolean) => forkAgentsRoster({ foldHelpers }, agentRoster([machine], { byActivity: false, seqs: () => new Map(), pinned: [] })).rest[0]!;
const tabs = machine.snapshot!.tabs;
const t = (key: string, values?: Record<string, string | number>) => values ? `${key} ${Object.values(values).join(" ")}` : key;

test("the Agents list's rows drop the tab name while Fold helpers is on, from the one-line title and the second line", () => {
  expect(agentRowTitle(listRow(true), true).drawn).toBe("Guard the export button");
  expect(agentTabName(listRow(true).entry.tab, tabs, t)).toBeNull();
  expect(agentRowTitle(listRow(false), true).drawn).toBe("release");
  expect(agentTabName(listRow(false).entry.tab, tabs, t)).toBe("release");
});

test("with Fold helpers off the Agents list gets upstream's roster untouched", () => {
  const roster = agentRoster([machine], { byActivity: false, seqs: () => new Map(), pinned: [] });
  expect(forkAgentsRoster({ foldHelpers: false }, roster)).toBe(roster);
});
