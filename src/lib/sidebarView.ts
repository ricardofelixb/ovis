import type { HerdrPane, SessionSnapshot } from "../../shared/protocol.ts";

export type SidebarView = "coding" | "work";

/** Only an exact hc label opts a terminal into Work. Older servers and herdr stay Coding. */
export function inSidebarView(pane: Pick<HerdrPane, "view">, view: SidebarView): boolean {
  return (pane.view === "work") === (view === "work");
}

/** Display and search only. Keep the original snapshot for actions, pins and attention tracking. */
export function sidebarSnapshot(snapshot: SessionSnapshot | null, view: SidebarView): SessionSnapshot | null {
  if (snapshot === null) return null;
  const panes = snapshot.panes.filter((pane) => inSidebarView(pane, view));
  if (view === "coding" && panes.length === snapshot.panes.length) return snapshot;
  const paneIds = new Set(panes.map((pane) => pane.pane_id));
  const tabIds = new Set(panes.map((pane) => pane.tab_id));
  const workspaceIds = new Set(panes.map((pane) => pane.workspace_id));
  return {
    ...snapshot,
    panes,
    tabs: snapshot.tabs.filter((tab) => tabIds.has(tab.tab_id)),
    workspaces: snapshot.workspaces.filter((workspace) => workspaceIds.has(workspace.workspace_id)),
    agents: snapshot.agents.filter((agent) => paneIds.has(agent.pane_id)),
  };
}
