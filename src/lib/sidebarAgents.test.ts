import { describe, expect, it } from "bun:test";
import type { AgentInfo, HerdrPane, SessionSnapshot, TabInfo, WorkspaceInfo } from "../../shared/protocol.ts";
import { agentContext, agentRowName, agentTabName, paneMark, sidebarAgents, workspaceAgentLabels, type SidebarAgent } from "./sidebarAgents.ts";

function workspace(id: string): WorkspaceInfo {
  return { workspace_id: id, active_tab_id: `${id}:t1`, label: id, number: 1, tab_count: 1, pane_count: 1, focused: false, agent_status: "idle" };
}

function tab(id: string, workspaceId: string): TabInfo {
  return { tab_id: id, workspace_id: workspaceId, label: id, number: 1, pane_count: 1, focused: false, agent_status: "idle" };
}

function pane(id: string, overrides: Partial<HerdrPane> = {}): HerdrPane {
  return { pane_id: id, workspace_id: "w1", tab_id: "w1:t1", terminal_id: `${id}:term`, revision: 1, focused: false, agent_status: "idle", ...overrides };
}

function agent(pane: HerdrPane, overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { ...pane, ...overrides };
}

function snapshot(panes: HerdrPane[], agents: AgentInfo[] = []): SessionSnapshot {
  return { protocol: 22, version: "test", workspaces: [workspace("w1")], tabs: [tab("w1:t1", "w1")], layouts: [], panes, agents };
}

describe("sidebarAgents", () => {
  it("uses the API roster and excludes ordinary shells regardless of their status", () => {
    const named = pane("named");
    const rows = sidebarAgents(snapshot([
      pane("shell", { agent_status: "working" }),
      pane("waiting-shell", { agent_status: "blocked" }),
      named,
    ], [agent(named, { name: "reviewer" })]));
    expect(rows.map(({ pane }) => pane.pane_id)).toEqual(["named"]);
    expect(rows[0]!.agentLabel).toBe("reviewer");
  });

  it("includes a recognized OmO pane before herdr registers it, without duplicates", () => {
    const omo = pane("omo", { agent: "omo", agent_status: "working", background_tasks: 2 });
    const codex = pane("codex", { agent: "codex" });
    const rows = sidebarAgents(snapshot([omo, codex], [agent(codex), agent(codex, { name: "duplicate" })]));
    expect(rows.map(({ pane }) => pane.pane_id)).toEqual(["omo", "codex"]);
    expect(rows[0]).toMatchObject({ canonicalAgent: "omo", agent: null });
    expect(rows[0]!.pane).toBe(omo);
  });

  it("keeps the current pane state and bridge identity when agent metadata is stale", () => {
    const current = pane("omo", { agent: "omo", agent_status: "blocked", background_tasks: 3 });
    const rows = sidebarAgents(snapshot([current], [agent(current, { agent: "pi", agent_status: "idle", workspace_id: "old-workspace", tab_id: "old-tab" })]));
    expect(rows[0]!.pane).toBe(current);
    expect(rows[0]).toMatchObject({ canonicalAgent: "omo", workspace: { workspace_id: "w1" }, tab: { tab_id: "w1:t1" } });
    expect(rows[0]!.pane.agent_status).toBe("blocked");
  });

  it("drops closed agents and panes whose workspace no longer exists", () => {
    const missing = pane("missing", { agent: "codex" });
    const orphan = pane("orphan", { workspace_id: "gone", agent: "claude" });
    expect(sidebarAgents(snapshot([orphan], [agent(missing), agent(orphan)]))).toEqual([]);
    expect(sidebarAgents(null)).toEqual([]);
  });

  it("preserves server workspace, tab and pane order across the complete roster", () => {
    const first = pane("first", { tab_id: "w1:t1", agent: "codex" });
    const sameTab = pane("same-tab", { tab_id: "w1:t1", agent: "claude" });
    const otherTab = pane("other-tab", { tab_id: "w1:t2", agent: "codex" });
    const otherWorkspace = pane("other-workspace", { workspace_id: "w2", tab_id: "w2:t1", agent: "omo" });
    const current = snapshot([otherWorkspace, otherTab, first, sameTab], [agent(otherTab), agent(otherWorkspace), agent(sameTab), agent(first)]);
    current.workspaces.push(workspace("w2"));
    current.tabs = [tab("w2:t1", "w2"), tab("w1:t1", "w1"), tab("w1:t2", "w1")];
    expect(sidebarAgents(current).map(({ pane }) => pane.pane_id)).toEqual(["first", "same-tab", "other-tab", "other-workspace"]);
  });

  it("retains a live pane when its optional tab context is missing", () => {
    const current = pane("codex", { tab_id: "missing-tab", agent: "codex" });
    expect(sidebarAgents(snapshot([current]))[0]).toMatchObject({ pane: current, tab: null });
  });

  it("honors API display and named identities before the canonical provider", () => {
    const current = pane("codex", { agent: "codex" });
    expect(sidebarAgents(snapshot([current], [agent(current, { display_agent: "Review bot", name: "reviewer" })]))[0]!.agentLabel).toBe("Review bot");
    expect(sidebarAgents(snapshot([current], [agent(current, { display_agent: " ", name: "reviewer" })]))[0]!.agentLabel).toBe("reviewer");
    expect(sidebarAgents(snapshot([current], [agent(current)]))[0]!.agentLabel).toBe("codex");
  });
});

describe("paneMark", () => {
  it("draws the agent of the pane a row opens, never another pane's", () => {
    const shell = pane("shell");
    const codex = pane("codex", { agent: "codex" });
    const byPane = new Map(sidebarAgents(snapshot([shell, codex], [agent(codex)])).map((entry) => [entry.pane.pane_id, entry]));
    expect(paneMark(byPane.get("codex"))).toBe("codex");
    expect(paneMark(byPane.get("shell"))).toBeNull();
  });

  it("falls back to the name of an agent herdr lists without a kind", () => {
    const named = pane("named");
    const [entry] = sidebarAgents(snapshot([named], [agent(named, { name: "reviewer" })]));
    expect(paneMark(entry)).toBe("reviewer");
  });
});

describe("workspaceAgentLabels", () => {
  it("names each agent of a workspace once, in roster order", () => {
    const first = pane("first", { agent: "claude" });
    const second = pane("second", { agent: "claude" });
    const third = pane("third", { agent: "codex" });
    const labels = workspaceAgentLabels(sidebarAgents(snapshot([first, second, third, pane("shell")])));
    expect([...labels]).toEqual([["w1", ["claude", "codex"]]]);
  });
});

describe("agentContext", () => {
  const base = { agentLabel: "claude", title: "Idempotent payments", markAgent: null, agentTitle: null, tabName: null };

  it("names neither the workspace nor the PC: the row sits under them", () => {
    expect(agentContext(base)).toEqual(["claude"]);
  });

  it("says the agent's own title and a renamed tab when the first line does not", () => {
    expect(agentContext({ ...base, title: "Payments", agentTitle: "Idempotent payments", tabName: "Payments" })).toEqual(["claude", "Idempotent payments"]);
    expect(agentContext({ ...base, agentTitle: "Idempotent payments", tabName: "Review" })).toEqual(["claude", "Review"]);
    expect(agentContext({ ...base, tabName: " " })).toEqual(["claude"]);
    expect(agentContext({ ...base, title: "claude" })).toEqual([]);
  });

  it("leaves out the kind its mark already draws, and keeps a kind the mark does not say", () => {
    expect(agentContext({ ...base, markAgent: "claude", tabName: "Review" })).toEqual(["Review"]);
    expect(agentContext({ ...base, agentLabel: "Claude", markAgent: "claude" })).toEqual([]);
    expect(agentContext({ ...base, agentLabel: "reviewer-bot", markAgent: "claude" })).toEqual(["reviewer-bot"]);
  });
});

describe("agentRowName", () => {
  const tab = (tab_id: string, label: string, number: number) => ({ tab_id, workspace_id: "w1", label, number, focused: false, pane_count: 1 }) as unknown as TabInfo;
  const entry = (paneId: string, tabInfo: TabInfo, names: { label?: string; agentTitle?: string; paneTitle?: string } = {}) => ({
    pane: { pane_id: paneId, label: names.label ?? null, title: names.paneTitle ?? null },
    tab: tabInfo,
    agent: names.agentTitle === undefined ? null : { title: names.agentTitle },
  }) as unknown as SidebarAgent;

  it("leads with the pane's name, then a renamed tab, then the agent's own title, then the pane's", () => {
    const renamed = tab("t1", "Payments", 1);
    const tabs = [renamed];
    expect(agentRowName(entry("p1", renamed, { label: "Mine", agentTitle: "Idempotent payments" }), tabs, [])).toBe("Mine");
    const alone = entry("p1", renamed, { agentTitle: "Idempotent payments" });
    expect(agentRowName(alone, tabs, [alone])).toBe("Payments");
    const numbered = tab("t1", "1", 1);
    const plain = entry("p1", numbered, { agentTitle: "Idempotent payments" });
    expect(agentRowName(plain, [numbered], [plain])).toBe("Idempotent payments");
    const untitled = entry("p1", numbered, { paneTitle: "zsh" });
    expect(agentRowName(untitled, [numbered], [untitled])).toBe("zsh");
  });

  it("leaves a tab's name to the agents' own titles when two agents share the tab", () => {
    const shared = tab("t1", "Payments", 1);
    const first = entry("p1", shared, { agentTitle: "Write the code" });
    const second = entry("p2", shared, { agentTitle: "Review it" });
    expect(agentRowName(first, [shared], [first, second])).toBe("Write the code");
    expect(agentRowName(second, [shared], [first, second])).toBe("Review it");
  });
});

describe("agentTabName", () => {
  const t = (key: string, vars?: Record<string, string | number>) => key.replace("{n}", String(vars?.n));

  it("names a tab only beside another tab or once it was renamed", () => {
    const only = tab("w1:t1", "w1");
    only.label = "1";
    expect(agentTabName(only, [only], t)).toBeNull();
    expect(agentTabName({ ...only, label: "Review" }, [only], t)).toBe("Review");
    const second = { ...tab("w1:t2", "w1"), label: "2", number: 2 };
    expect(agentTabName(second, [only, second], t)).toBe("Tab 2");
    expect(agentTabName(null, [only], t)).toBeNull();
  });

  it("does not take the tab that moved up after a close for a renamed one", () => {
    // herdr relabels the survivor "1" and leaves its number at 2
    const survivor = { ...tab("w1:t2", "w1"), label: "1", number: 2 };
    expect(agentTabName(survivor, [survivor], t)).toBeNull();
  });
});
