import type { AgentStatus, HerdrPane, PlanSummary, SessionSnapshot } from "../../shared/protocol.ts";

const samePlan = (a: PlanSummary | undefined, b: PlanSummary | undefined): boolean =>
  a === b || (a !== undefined && b !== undefined && a.done === b.done && a.total === b.total && a.current === b.current);

/** Where a selected pane sat, kept while it shows so the pane beside it can open once it closes. */
export interface PanePlace { pane_id: string; workspace_id: string; tab_id: string }

/**
 * The pane to show once the selected one has gone: one beside it before any other. Its tab's focused
 * pane or another in that tab, then its workspace's active tab, then any pane in that workspace, and
 * only then herdr's focused pane or the first there is, which can be in another workspace.
 */
export function heirPane(snapshot: SessionSnapshot, gone: PanePlace | null): string | null {
  const { panes } = snapshot;
  const inTab = (tabId: string | undefined): HerdrPane | undefined => {
    if (tabId === undefined) return undefined;
    const focused = snapshot.layouts.find((layout) => layout.tab_id === tabId)?.focused_pane_id;
    return panes.find((pane) => pane.tab_id === tabId && pane.pane_id === focused) ?? panes.find((pane) => pane.tab_id === tabId);
  };
  const near = gone === null ? undefined
    : inTab(gone.tab_id)
      ?? inTab(snapshot.workspaces.find((workspace) => workspace.workspace_id === gone.workspace_id)?.active_tab_id)
      ?? panes.find((pane) => pane.workspace_id === gone.workspace_id);
  return near?.pane_id ?? panes.find((pane) => pane.pane_id === snapshot.focused_pane_id)?.pane_id ?? panes[0]?.pane_id ?? null;
}

/**
 * Merges a pushed `pane-status` into the last snapshot so the sidebar badge updates
 * instantly; the debounced /api/session refetch that follows brings the derived
 * workspace/tab rollups back in line. Pure: returns the same object when nothing changed.
 */
export function applyPaneStatus(snapshot: SessionSnapshot, paneId: string, status: AgentStatus, background?: number, waiting = false, plan?: PlanSummary | null, finishId?: number, finishEpoch?: string): SessionSnapshot {
  const epochChanged = snapshot.finish_epoch !== finishEpoch;
  let paneChanged = epochChanged;
  const panes = snapshot.panes.map((pane: HerdrPane) => {
    if (pane.pane_id !== paneId) {
      if (!epochChanged) return pane;
      const { finish_id: _finish, ...rest } = pane;
      return rest;
    }
    // a frame that says nothing of background tasks or the plan leaves them as they were; every frame says whether the pane waits
    const tasks = background === undefined ? pane.background_tasks : background > 0 ? background : undefined;
    const progress = plan === undefined ? pane.plan : plan ?? undefined;
    if (pane.agent_status === status && pane.finish_id === finishId && pane.background_tasks === tasks && (pane.background_wait === true) === waiting && samePlan(pane.plan, progress)) return pane;
    paneChanged = true;
    const { background_tasks: _before, background_wait: _waited, plan: _plan, finish_id: _finish, ...rest } = pane;
    return { ...rest, agent_status: status, ...(finishId === undefined ? {} : { finish_id: finishId }), ...(tasks === undefined ? {} : { background_tasks: tasks }), ...(waiting ? { background_wait: true as const } : {}), ...(progress === undefined ? {} : { plan: progress }) };
  });
  if (!paneChanged) return snapshot;
  const agents = snapshot.agents.map((agent) =>
    agent.pane_id === paneId && agent.agent_status !== status ? { ...agent, agent_status: status } : agent,
  );
  return { ...snapshot, finish_epoch: finishEpoch, panes, agents };
}
