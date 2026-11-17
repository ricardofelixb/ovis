import { useState } from "react";

import { HELPERS_OPEN_KEY, HelpersToggle, loadOpenHelpers } from "../../components/AgentSidebar.tsx";
import type { ForkFold } from "./inboxRows.ts";

/**
 * The agents whose helpers the agent inbox keeps unfolded: the sidebar's own choice on this device
 * (AgentSidebar.tsx), so an agent opened in one list is open in the other.
 */
export function useForkOpenHelpers(): { open: readonly string[]; toggle(key: string): void } {
  const [open, setOpen] = useState(loadOpenHelpers);
  const toggle = (key: string): void => {
    // read anew, so another list's or tab's choices are kept; the sidebar prunes the agents that are gone
    const stored = loadOpenHelpers();
    const next = stored.includes(key) ? stored.filter((held) => held !== key) : [...stored, key];
    setOpen(next);
    try { window.localStorage.setItem(HELPERS_OPEN_KEY, JSON.stringify(next)); } catch { /* private mode: this page keeps it */ }
  };
  return { open, toggle };
}

/** The agent inbox's line under an agent that folds its helpers: the sidebar's, hanging from the agent's tree. */
export function ForkHelpersLine({ fold, agentTitle, onToggle }: { fold: ForkFold | undefined; agentTitle: string; onToggle(key: string): void }) {
  if (fold === undefined) return null;
  return <li className="agent-helpers fork-inbox-helpers" data-more={fold.more ? "" : undefined}>
    <HelpersToggle open={fold.open} agentTitle={agentTitle} states={fold.states} onToggle={() => onToggle(fold.key)} />
  </li>;
}
