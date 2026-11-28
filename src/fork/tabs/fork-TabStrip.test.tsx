import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Pencil, Terminal } from "lucide-react";
import { act, createElement } from "react";

import type { HerdrPane, PaneInfo, SessionSnapshot, WorkspaceInfo } from "../../../shared/protocol.ts";
import { TabStrip, type TabStripProps } from "../../components/TabStrip.tsx";
import { AppLayoutContext, appLayoutOf, type LayoutOffer } from "../../lib/machineContext.tsx";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { paneDrag } from "../../lib/paneDrag.ts";
import { SettingsProvider } from "../../lib/settings.ts";

const TUI = appLayoutOf({ version: "0.9.5", protocol: 22 });
const OVIS_CORE = appLayoutOf({ version: "0.1.17", protocol: 22, runtime: "herdr-core", layout: { rename: true, split: true, move: true, arrange: true, worktrees: true } });

const workspace: WorkspaceInfo = { workspace_id: "w1", label: "w1", active_tab_id: "w1:t1", number: 1, tab_count: 2, pane_count: 2, focused: false, agent_status: "idle", worktree: null };
const pane = (tabId: string, fields: Partial<HerdrPane> = {}): HerdrPane =>
  ({ pane_id: `${tabId}:p`, workspace_id: "w1", tab_id: tabId, terminal_id: `${tabId}:term`, revision: 1, focused: false, agent_status: "idle", ...fields }) as HerdrPane;
const tabOf = (id: string, number: number, panes = 1) => ({ tab_id: id, workspace_id: "w1", label: "", number, pane_count: panes, focused: number === 1, agent_status: "idle" as const });
const parent = pane("w1:t1");
// a job agent in its own tab, under the first tab's pane
const child = pane("w1:t2", { parent_pane_id: parent.pane_id, agent_role: "review" });
const snapshotOf = (panes: PaneInfo[], parentPanes = 1): SessionSnapshot => ({
  protocol: 22, version: "test", workspaces: [workspace], layouts: [], agents: [],
  tabs: [tabOf("w1:t1", 1, parentPanes), tabOf("w1:t2", 2)], panes,
});

describe("the tab strip folds job agents into their parent's tab (Agent friends)", () => {
  let page: Page;
  const browserGlobals = ["HTMLElement", "Element", "Node", "Event", "CustomEvent", "CSS", "localStorage", "requestAnimationFrame", "cancelAnimationFrame"] as const;
  const savedBrowserGlobals = new Map(browserGlobals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let hover = false;
  let requested: string[];

  beforeEach(() => {
    page = openPage();
    requested = [];
    hover = false;
    Object.defineProperties(page.window, {
      matchMedia: { configurable: true, writable: true, value: (query: string) => ({ matches: hover && query.startsWith("(hover: hover)"), addEventListener() {}, removeEventListener() {} }) },
      innerWidth: { configurable: true, value: 1280 },
      innerHeight: { configurable: true, value: 800 },
      requestAnimationFrame: { configurable: true, value: () => 1 },
      cancelAnimationFrame: { configurable: true, value: () => {} },
    });
    Object.defineProperty(page.window.navigator, "platform", { configurable: true, value: "Linux" });
    Object.defineProperty(page.window.document, "visibilityState", { configurable: true, value: "visible" });
    for (const key of browserGlobals) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: page.window[key] });
    localStorage.setItem("ovis:settings", JSON.stringify({ agentFriends: true }));
  });

  afterEach(async () => {
    paneDrag.cancel();
    await page.close();
    for (const [key, descriptor] of savedBrowserGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  const draw = (offer: LayoutOffer, options: Partial<TabStripProps> = {}, snapshot = snapshotOf([parent, child])) => page.render(
    createElement(SettingsProvider, null, createElement(AppLayoutContext.Provider, { value: offer },
      createElement(TabStrip, { snapshot, workspace, selectedPane: parent, onSelectPane: () => {}, onNewTab: () => {}, onNewTerminal: async () => {}, onMoveToWorkspace: async () => {}, ...options }))));
  const tab = () => page.one<HTMLButtonElement>('[data-tab-id="w1:t1"]');
  const contextMenu = (node: HTMLElement) => act(async () => {
    node.dispatchEvent(new window.PointerEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  /** the item ids of each open menu or sheet, one list per menu */
  const menus = () => [...document.querySelectorAll(".row-menu, .row-sheet")].map((menu) => [...menu.querySelectorAll("button[data-item]")].map((item) => item.getAttribute("data-item")!));
  const item = (id: string, within: string) => [...document.querySelectorAll<HTMLButtonElement>(`.row-menu button[data-item="${id}"], .row-sheet button[data-item="${id}"]`)]
    .find((button) => button.closest(".row-menu, .row-sheet")?.querySelector(`[data-item="${within}"]`));

  for (const phoneRow of [false, true]) it(`hides a job agent's tab, counts it on its parent and lists it in the parent's menus (phone row: ${phoneRow})`, async () => {
    const sheet = document.createElement("div");
    document.body.appendChild(sheet);
    let selected = "";
    await draw(OVIS_CORE, { phoneRow, sheet: sheet as unknown as HTMLElement, onSheetClose() {}, selectedPane: child, onSelectPane: (id) => { selected = id; } });
    expect(page.container.querySelectorAll(".tab-strip-label")).toHaveLength(1);
    expect(page.one(".workspace-fold-count").textContent).toBe("+1");
    expect(tab().closest(".tab-strip-item")?.classList.contains("is-active")).toBe(true);
    expect(tab().getAttribute("aria-selected")).toBe("true");
    expect(menus()[0]!.filter((id) => /^(tab|job):/.test(id))).toEqual(["tab:w1:t1", `job:${child.pane_id}`]);
    await contextMenu(tab());
    // the tab's own menu keeps its items (Close) beside the job
    const job = item(`job:${child.pane_id}`, "close-tab")!;
    expect(job.getAttribute("aria-current")).toBe("true");
    expect(job.textContent).toContain("review");
    await act(async () => job.click());
    expect(selected).toBe(child.pane_id);
  });

  it("offers to move the visible parent in the tabs sheet while its hidden job is selected", async () => {
    const sheet = document.createElement("div");
    document.body.appendChild(sheet);
    const snapshot = snapshotOf([parent, child, pane("w1:t3")]);
    snapshot.tabs.push(tabOf("w1:t3", 3));
    await draw(OVIS_CORE, { phoneRow: true, sheet, onSheetClose() {}, selectedPane: child }, snapshot);
    expect(menus()[0]).toEqual(expect.arrayContaining(["tab:w1:t1", `job:${child.pane_id}`, "tab:w1:t3", "move-right"]));
  });

  it("keeps the open parent's touch menu while its hidden job agent is the selected pane", async () => {
    hover = true;
    const paneActions = (paneId: string) => [{ id: `rename-pane:${paneId}`, label: "Rename pane", icon: Terminal, run() {} }];
    await draw(TUI, { phoneRow: true, selectedPane: child, paneActions });
    // a held touch: Android's contextmenu comes while the press is down
    await act(async () => { tab().dispatchEvent(new window.PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, cancelable: true })); });
    await contextMenu(tab());
    expect(menus()).toHaveLength(1);
    // the open child's own pane actions stay on its parent's touch menu, beside its job item
    expect(menus()[0]).toEqual(expect.arrayContaining([`job:${child.pane_id}`, `rename-pane:${child.pane_id}`]));
  });

  it("shows no pane position on a split parent while its hidden job agent is the selected pane", async () => {
    await draw(TUI, { phoneRow: true, selectedPane: child }, snapshotOf([parent, { ...parent, pane_id: "w1:t1:p2" }, child], 2));
    expect(tab().getAttribute("aria-selected")).toBe("true");
    expect(page.container.querySelectorAll(".tab-strip-position")).toHaveLength(0);
  });

  it("does not move a parent against its own folded child by menu or keys", async () => {
    const fetch = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: string | URL | Request) => {
      requested.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return Response.json({});
    }, { preconnect: globalThis.fetch.preconnect }));
    try {
      await draw(TUI);
      await contextMenu(tab());
      expect(menus().flat()).not.toContain("move-right");
      await act(async () => {
        tab().focus();
        tab().dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
      });
      expect(requested).toEqual([]);
    } finally { fetch.mockRestore(); }
  });

  it("leaves the selected pane's Hide out of a split tab's tap menu, beside its other pane actions", async () => {
    const lead = { ...pane("w1:t1"), agent: "claude" } as PaneInfo;
    const shell = { ...pane("w1:t1"), pane_id: "w1:t1:q", terminal_id: "w1:t1:q:term", agent: "pi" } as PaneInfo;
    const paneActions = (paneId: string) => [{ id: "rename", label: "Rename pane", icon: Pencil, run() {} }, { id: `hide:${paneId}`, label: "Hide agent", icon: Pencil, run() {} }];
    Object.defineProperty(page.window, "matchMedia", { configurable: true, writable: true,
      value: (query: string) => ({ matches: query.includes("(max-width: 768px)") && !query.includes("max-height"), addEventListener() {}, removeEventListener() {} }) });
    await draw(TUI, { selectedPane: shell, paneActions }, snapshotOf([lead, shell, pane("w1:t2")], 2));
    await act(async () => tab().click());
    const splitMenu = menus().flat();
    expect(splitMenu).toContain("rename");
    expect(splitMenu.filter((id) => id.startsWith("hide:"))).toEqual([]);
  });
});
