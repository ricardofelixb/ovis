import { Terminal } from "lucide-react";
import type { HerdrPane } from "../../../shared/protocol.ts";
import type { RowMenuItem } from "../../components/RowMenu.tsx";
import { paneStatus } from "../../lib/status.ts";
import { RoleIcon, SUB_AGENT_ICON } from "../friends/AgentRole.tsx";

type FoldedPane = Pick<HerdrPane, "pane_id" | "parent_pane_id" | "agent_role" | "agent_status" | "background_wait">;

const isJob = (pane: FoldedPane): boolean => pane.parent_pane_id !== undefined;

/** The job agents a parent tab hides (groupAgentTabs' `folded`): its "+N". */
export const forkJobCount = (panes: readonly FoldedPane[] = []): number => panes.filter(isJob).length;

/**
 * One menu item per pane of the tabs a parent hides, each opening its own pane: a job agent wears the Bot in its
 * state's colour and its role, any other pane sharing its tab stays reachable as a plain terminal.
 */
export function forkJobItems<P extends FoldedPane>(panes: readonly P[], nameOf: (pane: P) => string, selectedPane: string, onSelect: (paneId: string) => void): RowMenuItem[] {
  return panes.map((pane): RowMenuItem => ({
    id: `job:${pane.pane_id}`, label: nameOf(pane),
    ...(isJob(pane) ? { icon: SUB_AGENT_ICON, glyph: <RoleIcon status={paneStatus(pane)} /> } : { icon: Terminal }),
    ...(isJob(pane) && pane.agent_role ? { hint: pane.agent_role } : {}),
    current: pane.pane_id === selectedPane, run: () => onSelect(pane.pane_id),
  }));
}
