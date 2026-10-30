import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Bell, BellOff, Ellipsis, Terminal } from "lucide-react";

import { paneStorageId } from "../../shared/machines.ts";
import { paneTokenValues } from "../../shared/pane-tokens.ts";
import type { AgentStatus, PlanSummary, SessionSnapshot, TabInfo } from "../../shared/protocol.ts";
import { currentAgentRowTokens, subscribeAgentRowTokens } from "../lib/agentRowTokens.ts";
import { useT } from "../lib/i18n.ts";
import { useMachineId } from "../lib/machineContext.tsx";
import { currentPaneMutes, paneMuteKey, prunePaneMutes, setPaneMutes, subscribePaneMutes, togglePaneMute } from "../lib/paneMutes.ts";
import { agentContext, agentRowName, paneMark, renamedTab, type SidebarAgent } from "../lib/sidebarAgents.ts";
import { useSettings } from "../lib/settings.ts";
import { useSidebarActivity } from "../lib/sidebarActivity.tsx";
import { machineFilter } from "../lib/sidebarFilter.ts";
import { useSidebarFilter } from "../lib/sidebarFilterContext.ts";
import { PANE_DRAG_TYPE, paneDragData } from "../lib/split.ts";
import { AgentMark, hasAgentMark } from "./AgentMark.tsx";
import { AgentFriend } from "./AgentFriend.tsx";
import type { Friend } from "../../shared/friends.ts";
import { friendKey } from "../../shared/friends.ts";
import { useFriends } from "../lib/friends.ts";
import { RowMenu } from "./RowMenu.tsx";
import { BackgroundBadge, displayPaneTitle, onRowContextMenu, PlanBadge, StatusBadge } from "./Sidebar.tsx";
import "./AgentSidebar.css";

interface AgentRowBodyProps {
  /** the agent's kind or name; null draws a terminal, for a shell */
  mark: string | null;
  /** the friend the agent's workspace wears, drawn with the mark as its badge */
  friend?: Friend;
  /** the kind the mark draws, left off the second line: said for a screen reader, since the mark is aria-hidden */
  markKind: string | null;
  title: string;
  /** the live name other tools address the agent by, when it has one */
  name: string | null;
  context: string;
  /** what herdr plugins report on the pane (`$name` tokens), in the order herdr's rows draw them */
  tokens: readonly string[];
  backgroundTasks?: number;
  plan?: PlanSummary;
  status?: AgentStatus;
  /** why a row the filter did not match is drawn all the same: it is the selected one */
  note?: string | null;
  /** its alerts are off for everyone (lib/paneMutes.ts): said beside the state, as a word for a screen reader */
  muted: boolean;
}

/**
 * One agent in a list: the coding agent's mark, what it is working on, who and where it is, what
 * its plugins report, and how it is doing.
 */
function AgentRowBody({ mark, friend, markKind, title, name, context, tokens, backgroundTasks, plan, status, note = null, muted }: AgentRowBodyProps) {
  const t = useT();
  return <>
    <span className="sidebar-mark" aria-hidden="true">{mark === null ? <Terminal /> : friend ? <AgentFriend friend={friend} agent={mark} status={status} /> : <AgentMark agent={mark} size={18} />}</span>
    <span className="agent-copy">
      {markKind && <span className="visually-hidden">{markKind}: </span>}
      <span className="agent-main">
        <span className="agent-title-line">
          <span className="agent-title">{title}</span>
        </span>
        {(name || context) && <span className="agent-context">
          {name && <span className="agent-name">{name}</span>}
          {name && context && " · "}
          {context}
        </span>}
      </span>
      {/* text as the plugin wrote it, never markup; its own line in either row height, cut where it is too long */}
      {tokens.length > 0 && <span className="agent-tokens">{tokens.join(" · ")}</span>}
    </span>
    <span className="agent-row-status">
      {note !== null && <span className="sidebar-filter-note">{note}</span>}<BackgroundBadge count={backgroundTasks} /><PlanBadge plan={plan} />
      {muted && <span className="agent-muted" title={t("Alerts muted")} data-testid="alerts-muted"><BellOff aria-hidden="true" /><span className="visually-hidden">{t("Alerts muted")}</span></span>}
    </span>
    {/* drawn at the row's right edge, after its ⋯, as a workspace row's state is (AgentSidebar.css) */}
    <span className="agent-row-state"><StatusBadge status={status} compact /></span>
  </>;
}

export interface WorkspaceAgentsProps {
  /** the workspace's agents, in herdr's tab and pane order (lib/sidebarAgents.ts) */
  agents: readonly SidebarAgent[];
  /** the workspace's tabs: a row names its tab, or leads with its name */
  tabs: readonly TabInfo[];
  /** the PC's roster, which a mute's change prunes of gone panes */
  snapshot: SessionSnapshot | null;
  online: boolean;
  selectedPaneId: string | null;
  /** this device only watches: it sees the shared mutes and cannot change them */
  watching: boolean;
  onSelect(paneId: string): void;
}

/**
 * The row whose menu is open: at its ⋯, or at the pointer for a right-click. What the menu says of
 * the row is read from the row at each render, so a value that changes while it is open changes in it too.
 */
interface AgentMenu { paneId: string; anchor: HTMLElement; point?: { x: number; y: number }; previousFocus?: HTMLElement | null }

/**
 * A workspace's agents, under its row (Sidebar.tsx). A row's ⋯, or a right-click on it, opens its
 * menu, which mutes or unmutes its alerts for every browser and device; on a desktop only a
 * right-click (or the context-menu key) opens it.
 */
export function WorkspaceAgents({ agents, tabs, snapshot, online, selectedPaneId, watching, onSelect }: WorkspaceAgentsProps) {
  const t = useT();
  const machineId = useMachineId();
  const { settings } = useSettings();
  // the panes whose alerts are off, shared with the other browsers of this server; null on a server
  // that keeps no such list, which then offers no mute
  const muted = useSyncExternalStore(subscribePaneMutes, currentPaneMutes, currentPaneMutes);
  // which `$name` tokens herdr's own sidebar draws, from this server's herdr config (server/herdr-sidebar.ts)
  const rowTokens = useSyncExternalStore(subscribeAgentRowTokens, currentAgentRowTokens, currentAgentRowTokens);
  const activity = useSidebarActivity();
  const friends = useFriends();
  // the sidebar's filter (lib/sidebarFilter.ts) keeps the matched rows and the selected one
  const { filter } = useSidebarFilter();
  const filtered = machineFilter(filter, machineId);
  const rows = filtered === null ? agents : agents.filter((entry) => filtered.panes.has(entry.pane.pane_id));
  const [menu, setMenu] = useState<AgentMenu | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const menuEntry = menu === null || !online ? undefined : rows.find((entry) => entry.pane.pane_id === menu.paneId);
  // a row that left the list or whose PC stopped connecting takes its menu with it
  useEffect(() => {
    if (menu && (menuEntry === undefined || !menu.anchor.isConnected)) setMenu(null);
  }, [menu, menuEntry]);
  const toggleMute = (paneId: string): void => {
    // the mutes of panes this PC no longer has leave with this change, and no other PC's
    if (muted === null) return;
    const machine = { id: machineId, state: online ? "connected" as const : "disconnected" as const, snapshot };
    setPaneMutes(togglePaneMute(prunePaneMutes(muted, [machine]), paneMuteKey(machineId, paneId)));
  };
  if (rows.length === 0) return null;

  // what a row says of its agent, for the row and for its open menu
  const describe = (entry: SidebarAgent) => {
    const { pane, agent, agentLabel } = entry;
    const title = agentRowName(entry, tabs, agents) ?? displayPaneTitle(pane);
    const name = agent?.name?.trim() || null;
    // the name has its own place on the line: the label beside it says the kind instead
    const kindLabel = name !== null && agentLabel === name ? entry.canonicalAgent ?? agent?.title?.trim() ?? null : agentLabel;
    const mark = paneMark(entry);
    const markAgent = mark && hasAgentMark(mark) ? mark : null;
    const contextParts = agentContext({ agentLabel: kindLabel, title, markAgent, agentTitle: agent?.title ?? null, tabName: renamedTab(entry.tab, tabs) });
    const kind = kindLabel?.trim() || null;
    const markKind = kind && kind !== title.trim() && !contextParts.includes(kind) ? kind : null;
    // a PC that is away says nothing of its agents now, its plugins' words included
    const tokens = online ? paneTokenValues(rowTokens, entry.canonicalAgent, pane.tokens ?? agent?.tokens) : [];
    return { title, name, mark, context: contextParts.join(" · "), markKind, tokens };
  };

  const agentItem = (entry: SidebarAgent) => {
    const { pane, agent } = entry;
    const selected = pane.pane_id === selectedPaneId;
    // under the filter a row it did not match is there for the selection: drawn as context, and said so
    const filterContext = filtered !== null && !filtered.matchedPanes.has(pane.pane_id);
    const { title, name, mark, context, markKind, tokens } = describe(entry);
    // the row cuts a long value: the tooltip, and a phone's menu sheet, say each in full
    const tooltip = [...new Set([pane.pane_id, title, context, ...tokens, markKind, name, agent?.display_agent, pane.cwd].filter(Boolean))].join("\n");
    const menuOpen = menu?.paneId === pane.pane_id;
    // one menu for the ⋯ and a right-click, which opens it at the pointer and leaves the focus where it was
    const toggleMenu = (anchor: HTMLElement, point?: { x: number; y: number }, previousFocus?: HTMLElement | null): void =>
      setMenu(menuOpen ? null : { paneId: pane.pane_id, anchor, point, previousFocus });
    const hasMenu = muted !== null && online;
    return <li className={`agent-item${selected ? " is-selected" : ""}${online ? "" : " is-offline"}${filterContext ? " is-filter-context" : ""}`} key={paneStorageId(machineId, pane.pane_id)} data-machine={machineId} data-pane={pane.pane_id}
      onMouseDownCapture={(event) => { if (hasMenu && (event.button === 2 || (event.button === 0 && event.ctrlKey))) event.preventDefault(); }}
      onContextMenu={hasMenu ? (event) => onRowContextMenu(event, toggleMenu) : undefined}>
      <button type="button" className="agent-select agent-row" disabled={!online} aria-current={selected ? "true" : undefined} title={tooltip} onClick={() => onSelect(pane.pane_id)}
        draggable={online}
        // dropped on the pane area, the row opens its pane in half of it (lib/split.ts)
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(PANE_DRAG_TYPE, paneDragData({ machineId, paneId: pane.pane_id }));
        }}>
        {/* a saved roster's state is not news: a PC that is away says nothing about its agents */}
        <AgentRowBody mark={mark} friend={friends[friendKey(machineId, entry.workspace.workspace_id)]} markKind={markKind} title={title} name={name} context={context} tokens={tokens} backgroundTasks={online ? pane.background_tasks : 0} plan={online ? pane.plan : undefined} status={online ? activity.status(machineId, pane) : undefined} note={filterContext && selected ? t("Selected") : null} muted={muted?.includes(paneMuteKey(machineId, pane.pane_id)) === true} />
      </button>
      {hasMenu && <div className="agent-actions">
        <button type="button" className="sidebar-row-action row-menu-toggle" aria-label={t("More for {title}", { title })} aria-haspopup="menu" aria-expanded={menuOpen} onClick={(event) => toggleMenu(event.currentTarget)}>
          <Ellipsis aria-hidden="true" />
        </button>
      </div>}
    </li>;
  };

  const menuShown = menuEntry === undefined ? null : describe(menuEntry);
  const menuMuted = menuEntry !== undefined && muted !== null && muted.includes(paneMuteKey(machineId, menuEntry.pane.pane_id));
  // Settings -> Sidebar rows -> One line: an agent row is one line too, its place dim after its title
  const oneLine = settings.sidebarRows === "one";
  return <>
    <ul className={`agent-list workspace-agents${oneLine ? " is-one-line" : ""}`} aria-label={t("Agents")}>{rows.map(agentItem)}</ul>
    {menu && menuEntry && menuShown && <RowMenu anchor={menu.anchor} point={menu.point} restoreFocusTo={menu.previousFocus} title={menuShown.title} subtitle={menuShown.context} detail={menuShown.tokens.join(" · ") || undefined} onClose={closeMenu} items={[
      // one switch for every alert channel and every browser (lib/paneMutes.ts); a watching device sees its state and cannot flip it
      {
        id: "mute", label: menuMuted ? t("Unmute alerts") : t("Mute alerts"), icon: menuMuted ? Bell : BellOff, checked: menuMuted, disabled: watching,
        run: () => toggleMute(menuEntry.pane.pane_id),
      },
    ]} />}
  </>;
}
