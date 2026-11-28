import { expect, it } from "bun:test";
import { groupAgentTabs } from "./groupAgentTabs.ts";
import { movedTabOrder } from "../../lib/tabOrder.ts";

const tab = (id: string, workspace = "w") => ({ tab_id: id, workspace_id: workspace });
const pane = (id: string, parent?: string, workspace = "w") => ({ pane_id: id, tab_id: id, workspace_id: workspace, parent_pane_id: parent });
const ids = (tabs: ReturnType<typeof tab>[]) => tabs.map((tab) => tab.tab_id);

it("hides job agent tabs and lists them on their parent in stable order without changing tabs", () => {
  const tabs = [tab("review"), tab("other"), tab("parent"), tab("implement")];
  const panes = [pane("parent"), pane("review", "parent"), pane("implement", "parent")];
  const grouped = groupAgentTabs(tabs, panes, true);
  expect(ids(grouped.tabs)).toEqual(["other", "parent"]);
  expect(ids(grouped.children.get("parent") ?? [])).toEqual(["review", "implement"]);
  expect(grouped.parentOf.get("review")).toBe("parent");
  expect(ids(tabs)).toEqual(["review", "other", "parent", "implement"]);
  expect(groupAgentTabs(tabs, panes, false).tabs).toEqual(tabs);
});

it("folds every pane of a hidden tab onto its parent, a shell sharing the job's tab too", () => {
  const tabs = [tab("parent"), tab("job"), tab("grandchild")];
  const panes = [pane("parent"), { ...pane("shell"), tab_id: "job" }, pane("review", "parent"), pane("grandchild", "review")].map((entry) => entry.pane_id === "review" ? { ...entry, tab_id: "job" } : entry);
  const grouped = groupAgentTabs(tabs, panes, true);
  expect(ids(grouped.tabs)).toEqual(["parent"]);
  expect(grouped.folded.get("parent")?.map((entry) => entry.pane_id)).toEqual(["shell", "review", "grandchild"]);
  expect(groupAgentTabs(tabs, panes, false).folded.size).toBe(0);
});

it("moves a parent to its visible neighbour in one step, keeping children pinned", () => {
  const tabs = [tab("parent"), tab("child"), tab("next"), tab("next-child"), tab("last")];
  const panes = [pane("parent"), pane("child", "parent"), pane("next"), pane("next-child", "next"), pane("last")];
  const group = groupAgentTabs(tabs, panes, true);
  const boundary = group.adjacentBoundary("parent", 1);
  expect(boundary).toBe(3);
  const moved = movedTabOrder(ids(tabs), "parent", boundary!)!;
  const reordered = moved.map((id) => tabs.find((tab) => tab.tab_id === id)!);
  expect(ids(groupAgentTabs(reordered, panes, true).tabs)).toEqual(["next", "parent", "last"]);
  expect(group.adjacentBoundary("next", -1)).toBe(0);
  expect(group.adjacentBoundary("parent", -1)).toBeNull();
  expect(group.adjacentBoundary("last", 1)).toBeNull();
  expect(groupAgentTabs(tabs, panes, false).adjacentBoundary("child", 1)).toBe(3);
});

it("keeps orphans, same-tab children, other workspaces and cycles as normal tabs", () => {
  const tabs = [tab("orphan"), tab("parent", "elsewhere"), tab("child"), tab("self"), tab("a"), tab("b")];
  const panes = [pane("orphan", "gone"), pane("parent", undefined, "elsewhere"), pane("child", "parent"), pane("self", "self"), pane("a", "b"), pane("b", "a")];
  expect(groupAgentTabs(tabs, panes, true).tabs).toEqual(tabs);
  expect(groupAgentTabs([], [], true).tabs).toEqual([]);
});

it("folds descendants into the visible root and temporarily exposes a rename field", () => {
  const tabs = [tab("grandchild"), tab("parent"), tab("child")];
  const panes = [pane("parent"), pane("child", "parent"), pane("grandchild", "child")];
  const grouped = groupAgentTabs(tabs, panes, true);
  expect(ids(grouped.tabs)).toEqual(["parent"]);
  expect(ids(grouped.children.get("parent") ?? [])).toEqual(["child", "grandchild"]);
  expect(grouped.parentOf.get("grandchild")).toBe("parent");
  expect(ids(groupAgentTabs(tabs, panes, true, "child").tabs)).toEqual(["parent", "child"]);
});
