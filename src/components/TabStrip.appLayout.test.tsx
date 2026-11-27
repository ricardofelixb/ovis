import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { Pencil, Terminal } from "lucide-react";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";

import type { HerdrPane, PaneInfo, SessionSnapshot, WorkspaceInfo } from "../../shared/protocol.ts";
import { AppLayoutContext, appLayoutOf, type LayoutOffer } from "../lib/machineContext.tsx";
import { SettingsProvider } from "../lib/settings.ts";
import { setSidebarPins } from "../lib/sidebarPins.ts";
import { paneDrag } from "../lib/paneDrag.ts";
import { RowMenu } from "./RowMenu.tsx";
import { TabStrip, type TabStripProps } from "./TabStrip.tsx";

const TUI = appLayoutOf({ version: "0.9.5", protocol: 22 });
const APP_CORE = appLayoutOf({ version: "0.1.17", protocol: 22, runtime: "herdr-core" });
const OVIS_CORE = appLayoutOf({ version: "0.1.17", protocol: 22, runtime: "herdr-core", layout: { rename: true, split: true, move: true, arrange: true, worktrees: true } });

const workspace = (id: string, tabs: number): WorkspaceInfo =>
  ({ workspace_id: id, label: id, active_tab_id: `${id}:t1`, number: 1, tab_count: tabs, pane_count: tabs, focused: false, agent_status: "idle", worktree: null });
const pane = (workspaceId: string, tabId: string): PaneInfo =>
  ({ pane_id: `${tabId}:p`, workspace_id: workspaceId, tab_id: tabId, terminal_id: `${tabId}:term`, revision: 1, focused: false, agent_status: "idle" });
const snapshot: SessionSnapshot = {
  protocol: 22, version: "test", workspaces: [workspace("w1", 2), workspace("w2", 1)], layouts: [], agents: [],
  tabs: [
    { tab_id: "w1:t1", workspace_id: "w1", label: "", number: 1, pane_count: 1, focused: true, agent_status: "idle" },
    { tab_id: "w1:t2", workspace_id: "w1", label: "", number: 2, pane_count: 1, focused: false, agent_status: "idle" },
    { tab_id: "w2:t1", workspace_id: "w2", label: "", number: 1, pane_count: 1, focused: false, agent_status: "idle" },
  ],
  panes: [pane("w1", "w1:t1"), pane("w1", "w1:t2"), pane("w2", "w2:t1")],
};
// the test renderer draws no DOM: a node stands in for every element, connected and measurable, so the tab's menu can open
const node = (): HTMLElement => ({
  isConnected: true, offsetWidth: 200, offsetHeight: 100, dataset: {}, scrollLeft: 0, scrollWidth: 0, clientWidth: 0,
  getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 }),
  querySelector: () => null, querySelectorAll: () => [], contains: () => false, closest: () => null,
  focus() {}, addEventListener() {}, removeEventListener() {},
}) as unknown as HTMLElement;
const noKeys = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, repeat: false, preventDefault() {}, stopPropagation() {} };

describe("the tab strip on a PC the Herdr app lays out", () => {
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const stored = new Map<string, string>();
  let renderer: ReactTestRenderer | undefined;
  let media: { matches: boolean; addEventListener(): void; removeEventListener(): void };
  let events: EventTarget;
  let requested: string[];
  let activeTab: { dataset: { tabId: string } };

  beforeEach(() => {
    for (const key of ["window", "document", "navigator", "getComputedStyle", "localStorage", "HTMLElement", "CSS", "IS_REACT_ACT_ENVIRONMENT", "requestAnimationFrame", "cancelAnimationFrame"]) descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    stored.clear();
    requested = [];
    activeTab = { dataset: { tabId: "w1:t1" } };
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); }, removeItem: (key: string) => { stored.delete(key); } };
    events = new EventTarget();
    media = { matches: false, addEventListener() {}, removeEventListener() {} };
    const define = (key: string, value: unknown) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    define("IS_REACT_ACT_ENVIRONMENT", true);
    define("requestAnimationFrame", () => 1);
    define("cancelAnimationFrame", () => {});
    define("HTMLElement", class HTMLElement {});
    define("CSS", { escape: (value: string) => value });
    define("localStorage", storage);
    define("requestAnimationFrame", () => 1);
    define("cancelAnimationFrame", () => {});
    define("navigator", { languages: ["en-US"], platform: "Linux" });
    define("window", { localStorage: storage, matchMedia: (query: string) => query === "(pointer: coarse)" ? { ...media, matches: false } : media, innerWidth: 1280, innerHeight: 800, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout, clearTimeout });
    define("document", { visibilityState: "visible", activeElement: activeTab, body: { nodeType: 1, children: [], createNodeMock: node }, documentElement: { dataset: {}, hasAttribute: () => false, style: { setProperty() {}, removeProperty() {} } }, querySelector: () => null, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) });
    define("getComputedStyle", () => ({ getPropertyValue: () => "" }));
  });

  afterEach(async () => {
    paneDrag.cancel();
    await act(async () => renderer?.unmount());
    renderer = undefined;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });

  async function draw(offer: LayoutOffer, workspace: WorkspaceInfo | null = snapshot.workspaces[0]!, beside?: WorkspaceInfo, options: Partial<TabStripProps> = {}): Promise<void> {
    const strip = (shown: WorkspaceInfo) => createElement(TabStrip, { snapshot, workspace: shown, selectedPane: snapshot.panes[0]!, onSelectPane: () => {}, onNewTab: () => {}, onNewTerminal: async () => {}, onMoveToWorkspace: async () => {}, ...options });
    const tree = createElement(SettingsProvider, null, createElement(AppLayoutContext.Provider, { value: offer },
      workspace && strip(workspace), beside && strip(beside)));
    await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree, { createNodeMock: node }); });
  }
  const tab = () => renderer!.root.findByProps({ "data-tab-id": "w1:t1" });
  const strip = () => renderer!.root.findByProps({ role: "tablist" });
  const menuOf = async (): Promise<string[]> => {
    await act(async () => tab().props.onContextMenu({ type: "contextmenu", currentTarget: node(), clientX: 0, clientY: 0, preventDefault() {} }));
    return (renderer!.root.findByType(RowMenu).props.items as { id: string }[]).map((item) => item.id);
  };
  const keyDown = async (key: string, modifiers: Partial<typeof noKeys> = {}): Promise<void> => {
    await act(async () => strip().props.onKeyDown({ ...noKeys, ...modifiers, key, currentTarget: { querySelectorAll: () => [activeTab] } }));
  };
  const renameFields = () => renderer!.root.findAllByProps({ className: "input tab-strip-rename" }).length;
  const withFetch = async (run: () => Promise<void>): Promise<void> => {
    const fetch = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: string | URL | Request) => {
      requested.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      return Response.json({ tabs: [{ tab_id: "w1:t2" }, { tab_id: "w1:t1" }] });
    }, { preconnect: globalThis.fetch.preconnect }));
    try { await run(); } finally { fetch.mockRestore(); }
  };

  for (const phoneRow of [false, true]) it(`hides a job agent's tab, counts it on its parent and lists it in the parent's menus (phone row: ${phoneRow})`, async () => {
    const child = snapshot.panes[1]! as HerdrPane;
    child.parent_pane_id = snapshot.panes[0]!.pane_id;
    child.agent_role = "review";
    stored.set("ovis:settings", JSON.stringify({ agentFriends: true }));
    let selected = "";
    try {
      await draw(OVIS_CORE, undefined, undefined, { phoneRow, sheet: node(), onSheetClose() {}, selectedPane: child, onSelectPane: (id) => { selected = id; } });
      expect(renderer!.root.findAllByProps({ className: "tab-strip-label" })).toHaveLength(1);
      expect(renderer!.root.findByProps({ className: "workspace-fold-count" }).children).toEqual(["+", "1"]);
      const parent = renderer!.root.findAllByType("div").find((item) => item.props.className?.startsWith("tab-strip-item"));
      expect(parent?.props.className).toContain("is-active");
      expect(tab().props["aria-selected"]).toBe(true);
      const sheet = renderer!.root.findByType(RowMenu);
      expect(sheet.props.items.filter((item: { id: string }) => /^(tab|job):/.test(item.id)).map((item: { id: string }) => item.id)).toEqual(["tab:w1:t1", `job:${child.pane_id}`]);
      await act(async () => tab().props.onContextMenu({ type: "contextmenu", currentTarget: node(), clientX: 4, clientY: 4, preventDefault() {} }));
      const menu = renderer!.root.findAllByType(RowMenu).find((item) => item.props.items.some((entry: { id: string }) => entry.id === "new-agent-tab"))!;
      const items = menu.props.items as { id: string; hint?: string; current?: boolean; run(): void }[];
      const job = items.find((item) => item.id === `job:${child.pane_id}`)!;
      expect(job).toMatchObject({ hint: "review", current: true });
      expect(items.map((item) => item.id)).toContain("close-tab");
      await act(async () => job.run());
      expect(selected).toBe(child.pane_id);
    } finally { delete child.parent_pane_id; delete child.agent_role; }
  });

  it("keeps the open parent's touch menu while its hidden job agent is the selected pane", async () => {
    const child = snapshot.panes[1]! as HerdrPane;
    child.parent_pane_id = snapshot.panes[0]!.pane_id;
    stored.set("ovis:settings", JSON.stringify({ agentFriends: true }));
    // a mouse's tab menu button (no sheet): the tab's own menu stays open only while its tab is the open one
    Object.assign(window, { matchMedia: (query: string) => ({ ...media, matches: query.startsWith("(hover: hover)") }) });
    try {
      const paneActions = (paneId: string) => [{ id: `rename-pane:${paneId}`, label: "Rename pane", icon: Terminal, run() {} }];
      await draw(TUI, undefined, undefined, { phoneRow: true, selectedPane: child, paneActions });
      await act(async () => tab().props.onContextMenu({ type: "click", detail: 1, currentTarget: node(), clientX: 0, clientY: 0, preventDefault() {}, nativeEvent: {} }));
      const menus = renderer!.root.findAllByType(RowMenu).map((menu) => (menu.props.items as { id: string }[]).map((item) => item.id));
      expect(menus).toHaveLength(1);
      // the open child's own pane actions stay on its parent's touch menu, beside its job item
      expect(menus[0]).toEqual(expect.arrayContaining([`job:${child.pane_id}`, `rename-pane:${child.pane_id}`]));
    } finally { delete child.parent_pane_id; }
  });

  it("does not move a parent against its own folded child by menu or keys", async () => {
    const child = snapshot.panes[1]! as HerdrPane;
    child.parent_pane_id = snapshot.panes[0]!.pane_id;
    stored.set("ovis:settings", JSON.stringify({ agentFriends: true }));
    try {
      await withFetch(async () => {
        await draw(TUI);
        expect(await menuOf()).not.toContain("move-right");
        await keyDown("ArrowRight", { altKey: true, shiftKey: true });
        expect(requested).toEqual([]);
      });
    } finally { delete child.parent_pane_id; }
  });

  it("offers a TUI PC's tab its moves and rename, by menu, keys and a double-click", async () => {
    await withFetch(async () => {
      await draw(TUI);
      expect(await menuOf()).toEqual(["move-right", "move-workspace", "new-agent-tab", "rename-tab", "close-tab"]);
      expect(tab().props["aria-keyshortcuts"]).toBe("Shift+F10 Alt+Shift+ArrowLeft Alt+Shift+ArrowRight");
      expect(typeof tab().props.onDoubleClick).toBe("function");
      await keyDown("F2");
      expect(renameFields()).toBe(1);
      await keyDown("ArrowRight", { altKey: true, shiftKey: true });
      expect(strip().props["aria-busy"]).toBe(true);
      expect(requested).toEqual(["/api/tab/move"]);
    });
  });

  it("keeps a core PC's tab as the Herdr app names and orders it: New tab with agent and Close stay", async () => {
    await withFetch(async () => {
      await draw(APP_CORE);
      expect(await menuOf()).toEqual(["new-agent-tab", "close-tab"]);
      expect(tab().props["aria-keyshortcuts"]).toBe("Shift+F10");
      expect(tab().props.onDoubleClick).toBeUndefined();
      await keyDown("F2");
      expect(renameFields()).toBe(0);
      await keyDown("ArrowRight", { altKey: true, shiftKey: true });
      expect(strip().props["aria-busy"]).toBe(false);
      expect(requested).toEqual([]);
    });
  });

  it("offers no Close tab for a tab holding a locked pinned agent, and its Delete and middle click close nothing (#2432)", async () => {
    stored.set("ovis:settings", JSON.stringify({ agentLocks: true, lockedAgents: ["local:w1:t1:p"] }));
    setSidebarPins(["local:w1:t1:p"]);
    try {
      await withFetch(async () => {
        await draw(TUI);
        expect(await menuOf()).toEqual(["move-right", "move-workspace", "new-agent-tab", "rename-tab"]);
        await keyDown("Delete");
        await act(async () => tab().props.onAuxClick({ button: 1, preventDefault() {} }));
        expect(requested).toEqual([]);
      });
    } finally {
      setSidebarPins([]);
    }
  });

  it("offers no Close tab for a tab whose locked pane the strip leaves out of its list, as a DAG viewer's (#2432)", async () => {
    const viewer = { pane_id: "w1:t1:dag", workspace_id: "w1", tab_id: "w1:t1", terminal_id: "w1:t1:dag:term", revision: 1, focused: false, agent_status: "idle", label: "DAG · s" } as PaneInfo;
    snapshot.panes.push(viewer);
    stored.set("ovis:settings", JSON.stringify({ agentLocks: true, lockedAgents: ["local:w1:t1:dag"] }));
    setSidebarPins(["local:w1:t1:dag"]);
    try {
      await withFetch(async () => {
        await draw(TUI);
        expect(await menuOf()).not.toContain("close-tab");
        await keyDown("Delete");
        expect(requested).toEqual([]);
      });
    } finally {
      snapshot.panes.pop();
      setSidebarPins([]);
    }
  });

  it("renames, reorders and moves a core PC's tab to another workspace where Ovis keeps its layout", async () => {
    await withFetch(async () => {
      await draw(OVIS_CORE);
      expect(await menuOf()).toEqual(["move-right", "move-workspace", "new-agent-tab", "rename-tab", "close-tab"]);
      await keyDown("F2");
      expect(renameFields()).toBe(1);
    });
  });

  it("keeps a tab's inline rename draft across Escape and blur until it is saved", async () => {
    await withFetch(async () => {
      await draw(TUI);
      const input = () => renderer!.root.findByProps({ className: "input tab-strip-rename" });
      await act(async () => tab().props.onDoubleClick());
      expect(renameFields()).toBe(1);
      await act(async () => input().props.onChange({ target: { value: "Escape draft survives" } }));
      await act(async () => input().props.onKeyDown({ key: "Escape", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 27 } }));
      expect(renameFields()).toBe(0);
      expect(requested).toEqual([]);

      await act(async () => tab().props.onDoubleClick());
      expect(input().props.value).toBe("Escape draft survives");

      await act(async () => input().props.onKeyDown({ key: "Enter", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 13 } }));
      expect(renameFields()).toBe(0);
      expect(requested).toEqual(["/api/tab/rename"]);
    });
  });

  it("keeps one half's unfinished name when the split view's other half opens another workspace", async () => {
    await draw(TUI);
    const input = () => renderer!.root.findByProps({ className: "input tab-strip-rename" });
    await act(async () => tab().props.onDoubleClick());
    await act(async () => input().props.onChange({ target: { value: "keep me" } }));
    await act(async () => input().props.onKeyDown({ key: "Escape", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 27 } }));

    await draw(TUI, snapshot.workspaces[0]!, { ...snapshot.workspaces[0]!, workspace_id: "w-other" });

    await act(async () => tab().props.onDoubleClick());
    expect(input().props.value).toBe("keep me");
    await withFetch(async () => act(async () => input().props.onKeyDown({ key: "Enter", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 13 } })));
  });

  it("keeps one half's unfinished name when the other half of a split on the same workspace opens another", async () => {
    await draw(TUI, snapshot.workspaces[0]!, snapshot.workspaces[0]!);
    const first = () => renderer!.root.findAllByProps({ "data-tab-id": "w1:t1" })[0]!;
    const input = () => renderer!.root.findByProps({ className: "input tab-strip-rename" });
    await act(async () => first().props.onDoubleClick());
    await act(async () => input().props.onChange({ target: { value: "keep me" } }));
    await act(async () => input().props.onKeyDown({ key: "Escape", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 27 } }));

    await draw(TUI, snapshot.workspaces[0]!, { ...snapshot.workspaces[0]!, workspace_id: "w-other" });

    await act(async () => first().props.onDoubleClick());
    expect(input().props.value).toBe("keep me");
    await withFetch(async () => act(async () => input().props.onKeyDown({ key: "Enter", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 13 } })));
  });

  it("keeps a workspace's unfinished name while its strip moves, and drops it once its last strip goes", async () => {
    await draw(TUI);
    const input = () => renderer!.root.findByProps({ className: "input tab-strip-rename" });
    await act(async () => tab().props.onDoubleClick());
    const saved = input().props.value as string;
    await act(async () => input().props.onChange({ target: { value: "moving" } }));
    await act(async () => input().props.onKeyDown({ key: "Escape", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 27 } }));

    await draw(TUI, null, snapshot.workspaces[0]!);
    await act(async () => tab().props.onDoubleClick());
    expect(input().props.value).toBe("moving");
    await act(async () => input().props.onKeyDown({ key: "Escape", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 27 } }));

    await draw(TUI, null);
    await draw(TUI);
    await act(async () => tab().props.onDoubleClick());
    expect(input().props.value).toBe(saved);
  });

  it("reopens a field moved by a turn with the name just sent, before herdr confirms it", async () => {
    await withFetch(async () => {
      await draw(TUI);
      const input = () => renderer!.root.findByProps({ className: "input tab-strip-rename" });
      await act(async () => tab().props.onDoubleClick());
      await act(async () => input().props.onChange({ target: { value: "Sent name" } }));
      await act(async () => input().props.onKeyDown({ key: "Enter", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 13 } }));
      await act(async () => tab().props.onDoubleClick());
      expect(input().props.value).toBe("Sent name");

      await draw(TUI, null);
      media.matches = true;
      await draw(TUI);

      expect(input().props.value).toBe("Sent name");
      await act(async () => input().props.onKeyDown({ key: "Enter", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 13 } }));
      expect(renameFields()).toBe(0);
    });
  });

  it("names a phone's open split tab for its open pane, and a tap on it lists the tab's panes once", async () => {
    const lead = { ...pane("w1", "w1:t1"), agent: "claude" } as PaneInfo;
    const shell = { ...pane("w1", "w1:t1"), pane_id: "w1:t1:q", terminal_id: "w1:t1:q:term", label: "build shell" } as PaneInfo;
    const split = (label: string): SessionSnapshot => ({ ...snapshot, tabs: snapshot.tabs.map((entry) => entry.tab_id === "w1:t1" ? { ...entry, label, pane_count: 2 } : entry), panes: [lead, shell, ...snapshot.panes.slice(1)] });
    // the header's tabs hand the pane's own actions over with the tab's panes in them
    const paneActions = () => [{ id: "pane:w1:t1:p", label: "lead", icon: Terminal, run() {} }, { id: "rename", label: "Rename pane", icon: Pencil, run() {} }];
    const drawSplit = async (shown: SessionSnapshot): Promise<void> => {
      const tree = createElement(SettingsProvider, null, createElement(AppLayoutContext.Provider, { value: TUI },
        createElement(TabStrip, { snapshot: shown, workspace: shown.workspaces[0]!, selectedPane: shell, onSelectPane: (paneId: string) => { picked.push(paneId); }, onNewTab: () => {}, onNewTerminal: async () => {}, paneActions })));
      await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree, { createNodeMock: node }); });
    };
    const picked: string[] = [];
    const menu = () => renderer!.root.findByType(RowMenu).props as { title: string; items: { id: string; run: () => void }[] };
    const chip = () => tab().findByProps({ className: "tab-strip-label" }).children.join("");
    const marks = () => tab().findAll((found) => found.props.className === "tab-strip-agent").length;
    // a 700px window: one pane of a split at a time, the menu a popover rather than a phone's sheet
    const wide = window.matchMedia;
    window.matchMedia = (query: string) => ({ ...media, matches: query.includes("(max-width: 768px)") && !query.includes("max-height") }) as unknown as MediaQueryList;

    await drawSplit(split(""));
    expect(chip()).toBe("build shell");
    expect(marks()).toBe(0);
    await act(async () => tab().props.onClick({ currentTarget: node(), detail: 1, ctrlKey: false }));
    expect(menu().items.map((item) => item.id))
      .toEqual(["pane:w1:t1:p", "pane:w1:t1:q", "rename", "move-right", "new-agent-tab", "rename-tab", "close-tab"]);
    await act(async () => menu().items[0]!.run());
    expect(picked).toEqual(["w1:t1:p"]);

    // named from elsewhere while its menu is open: the chip and the menu take the new name
    await drawSplit(split("deploy"));
    expect(chip()).toBe("deploy");
    expect(menu().title).toBe("deploy");

    window.matchMedia = wide;
    await act(async () => renderer?.unmount());
    renderer = undefined;
    await drawSplit(split(""));
    expect(chip()).toBe("Tab 1");
    expect(marks()).toBe(1);
  });

  it("leaves the selected pane's Hide out of a split tab's tap menu, beside its other pane actions", async () => {
    const lead = { ...pane("w1", "w1:t1"), agent: "claude" } as PaneInfo;
    const shell = { ...pane("w1", "w1:t1"), pane_id: "w1:t1:q", terminal_id: "w1:t1:q:term", agent: "pi" } as PaneInfo;
    const split: SessionSnapshot = { ...snapshot, tabs: snapshot.tabs.map((entry) => entry.tab_id === "w1:t1" ? { ...entry, pane_count: 2 } : entry), panes: [lead, shell, ...snapshot.panes.slice(1)] };
    const paneActions = (paneId: string) => [{ id: "rename", label: "Rename pane", icon: Pencil, run() {} }, { id: `hide:${paneId}`, label: "Hide agent", icon: Pencil, run() {} }];
    const menuIds = async (shown: SessionSnapshot, selectedPane: PaneInfo): Promise<string[]> => {
      const tree = createElement(SettingsProvider, null, createElement(AppLayoutContext.Provider, { value: TUI },
        createElement(TabStrip, { snapshot: shown, workspace: shown.workspaces[0]!, selectedPane, onSelectPane: () => {}, onNewTab: () => {}, onNewTerminal: async () => {}, paneActions })));
      await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree, { createNodeMock: node }); });
      await act(async () => tab().props.onClick({ currentTarget: node(), detail: 1, ctrlKey: false }));
      return (renderer!.root.findByType(RowMenu).props.items as { id: string }[]).map((item) => item.id);
    };
    const wide = window.matchMedia;
    window.matchMedia = (query: string) => ({ ...media, matches: query.includes("(max-width: 768px)") && !query.includes("max-height") }) as unknown as MediaQueryList;
    try {
      const splitMenu = await menuIds(split, shell);
      expect(splitMenu).toContain("rename");
      expect(splitMenu.filter((id) => id.startsWith("hide:"))).toEqual([]);
    } finally { window.matchMedia = wide; }
  });

  it("leaves a tab's unfinished name behind when the strip moves to another workspace", async () => {
    await draw(TUI);
    const input = () => renderer!.root.findByProps({ className: "input tab-strip-rename" });
    await act(async () => tab().props.onDoubleClick());
    const saved = input().props.value as string;
    await act(async () => input().props.onChange({ target: { value: "left behind" } }));
    await act(async () => input().props.onKeyDown({ key: "Escape", stopPropagation() {}, nativeEvent: { isComposing: false, keyCode: 27 } }));

    await draw(TUI, { ...snapshot.workspaces[0]!, workspace_id: "w-other" });
    await draw(TUI);

    await act(async () => tab().props.onDoubleClick());
    expect(input().props.value).toBe(saved);
  });

  it("moves a single-pane tab dropped onto another workspace row, honors Move-to-workspace guards, and cancels on Escape", async () => {
    const moved: Array<{ tabId: string; workspaceId: string }> = [];
    let pointerElement: Element | null = null;
    (globalThis.document as unknown as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint = () => pointerElement;

    const fakeWorkspaceRow = (workspaceId: string): Element => {
      const machineNode = { closest: (sel: string) => sel === ".machine-workspaces[data-machine]" ? machineNode : null, dataset: { machine: "local" } };
      const groupNode = { closest: (sel: string) => sel === ".workspace-group[data-workspace]" ? groupNode : machineNode.closest(sel), dataset: { workspace: workspaceId } };
      const headerNode = { closest: (sel: string) => sel === ".workspace-header" ? headerNode : groupNode.closest(sel), dataset: {} };
      return headerNode as unknown as Element;
    };

    const drawForDrag = async (offer: LayoutOffer, { shown = snapshot, closable = true, splitDrag = true }: { shown?: SessionSnapshot; closable?: boolean; splitDrag?: boolean } = {}): Promise<void> => {
      const tree = createElement(SettingsProvider, null, createElement(AppLayoutContext.Provider, { value: offer },
        createElement(TabStrip, {
          snapshot: shown,
          workspace: shown.workspaces[0]!,
          selectedPane: shown.panes[0]!,
          onSelectPane: () => {},
          onNewTab: () => {},
          onNewTerminal: async () => {},
          onMoveToWorkspace: async (tabId, workspaceId) => { moved.push({ tabId, workspaceId }); },
          splitDrag,
          closable,
        })));
      await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree, { createNodeMock: node }); });
    };

    const dragTabOver = async (workspaceId: string, action: "drop" | "escape"): Promise<typeof paneDrag extends { snapshot(): infer R } ? R : never> => {
      pointerElement = fakeWorkspaceRow(workspaceId);
      const captureTarget = { ...node(), setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
      await act(async () => {
        tab().props.onPointerDown({ pointerType: "mouse", button: 0, ctrlKey: false, isPrimary: true, pointerId: 1, clientX: 40, clientY: 5, preventDefault() {}, currentTarget: captureTarget });
      });
      await act(async () => {
        tab().props.onPointerMove({ pointerId: 1, clientX: 40, clientY: 120 });
      });
      const hitWhileOver = paneDrag.snapshot();
      if (action === "escape") {
        await act(async () => {
          const esc = new Event("keydown") as unknown as KeyboardEvent;
          Object.assign(esc, { key: "Escape", preventDefault() {}, stopPropagation() {} });
          events.dispatchEvent(esc);
        });
      }
      await act(async () => {
        tab().props.onPointerUp({ pointerId: 1, clientX: 40, clientY: 120 });
      });
      return hitWhileOver;
    };

    await drawForDrag(TUI);
    expect((await dragTabOver("w1", "drop"))?.workspaceTarget).toBeUndefined();
    expect(moved).toEqual([]);

    expect((await dragTabOver("w2", "escape"))?.workspaceTarget).toEqual({ machineId: "local", workspaceId: "w2" });
    expect(paneDrag.snapshot()).toBeNull();
    expect(moved).toEqual([]);

    expect((await dragTabOver("w2", "drop"))?.workspaceTarget).toEqual({ machineId: "local", workspaceId: "w2" });
    expect(moved).toEqual([{ tabId: "w1:t1", workspaceId: "w2" }]);

    moved.length = 0;
    await drawForDrag(OVIS_CORE);
    expect((await dragTabOver("w2", "drop"))?.workspaceTarget).toEqual({ machineId: "local", workspaceId: "w2" });
    expect(moved).toEqual([{ tabId: "w1:t1", workspaceId: "w2" }]);

    moved.length = 0;
    await drawForDrag(APP_CORE);
    expect((await dragTabOver("w2", "drop"))?.workspaceTarget).toBeUndefined();
    expect(moved).toEqual([]);

    await drawForDrag(TUI, { closable: false });
    expect((await dragTabOver("w2", "drop"))?.workspaceTarget).toBeUndefined();
    expect(moved).toEqual([]);

    const splitSnapshot: SessionSnapshot = {
      ...snapshot,
      panes: [...snapshot.panes, { ...pane("w1", "w1:t1"), pane_id: "w1:t1:second", terminal_id: "w1:t1:second:term" }],
    };
    await drawForDrag(TUI, { shown: splitSnapshot });
    expect((await dragTabOver("w2", "drop"))?.workspaceTarget).toBeUndefined();
    expect(moved).toEqual([]);

    // A second pane joining mid-drag clears the sidebar target immediately and prevents moving on drop.
    await drawForDrag(TUI);
    pointerElement = fakeWorkspaceRow("w2");
    const captureTarget = { ...node(), setPointerCapture() {}, hasPointerCapture: () => true, releasePointerCapture() {} };
    await act(async () => {
      tab().props.onPointerDown({ pointerType: "mouse", button: 0, ctrlKey: false, isPrimary: true, pointerId: 2, clientX: 40, clientY: 5, preventDefault() {}, currentTarget: captureTarget });
    });
    await act(async () => {
      tab().props.onPointerMove({ pointerId: 2, clientX: 40, clientY: 120 });
    });
    expect(paneDrag.snapshot()?.workspaceTarget).toEqual({ machineId: "local", workspaceId: "w2" });
    await drawForDrag(TUI, { shown: splitSnapshot });
    expect(paneDrag.snapshot()?.workspaceTarget).toBeUndefined();
    await act(async () => {
      tab().props.onPointerUp({ pointerId: 2, clientX: 40, clientY: 120 });
    });
    expect(moved).toEqual([]);

    // Disabling splitDrag mid-drag (e.g. viewport resize below 769px) cancels the shared drag cleanly.
    await drawForDrag(TUI);
    await act(async () => {
      tab().props.onPointerDown({ pointerType: "mouse", button: 0, ctrlKey: false, isPrimary: true, pointerId: 3, clientX: 40, clientY: 5, preventDefault() {}, currentTarget: captureTarget });
    });
    await act(async () => {
      tab().props.onPointerMove({ pointerId: 3, clientX: 40, clientY: 120 });
    });
    expect(paneDrag.snapshot()?.workspaceTarget).toEqual({ machineId: "local", workspaceId: "w2" });
    await drawForDrag(TUI, { splitDrag: false });
    expect(paneDrag.snapshot()).toBeNull();
    await act(async () => {
      tab().props.onPointerUp({ pointerId: 3, clientX: 40, clientY: 120 });
    });
    expect(moved).toEqual([]);

    // In-strip mouse drag-to-reorder still works when splitDrag is already false (e.g. below 769px).
    await drawForDrag(TUI, { splitDrag: false });
    await act(async () => {
      tab().props.onPointerDown({ pointerType: "mouse", button: 0, ctrlKey: false, isPrimary: true, pointerId: 4, clientX: 40, clientY: 5, preventDefault() {}, currentTarget: captureTarget });
    });
    await act(async () => {
      tab().props.onPointerMove({ pointerId: 4, clientX: 80, clientY: 5 });
    });
    expect(renderer!.root.findAll((el) => typeof el.props.className === "string" && el.props.className.includes("is-dragging"))).toHaveLength(1);
    await act(async () => {
      tab().props.onPointerUp({ pointerId: 4, clientX: 80, clientY: 5 });
    });
  });

  it("hands phone typing to the picked pane's visible tab field, re-selects the current pane, and keeps touch long-press handoff", async () => {
    const t1a = { ...pane("w1", "w1:t1"), pane_id: "w1:t1:a", terminal_id: "w1:t1:a:term" } as PaneInfo;
    const t1b = { ...pane("w1", "w1:t1"), pane_id: "w1:t1:b", terminal_id: "w1:t1:b:term" } as PaneInfo;
    const t2a = { ...pane("w1", "w1:t2"), pane_id: "w1:t2:a", terminal_id: "w1:t2:a:term" } as PaneInfo;
    const t2b = { ...pane("w1", "w1:t2"), pane_id: "w1:t2:b", terminal_id: "w1:t2:b:term" } as PaneInfo;
    const splitSnap = (layouts: SessionSnapshot["layouts"]): SessionSnapshot => ({
      ...snapshot,
      layouts,
      tabs: snapshot.tabs.map((entry) => entry.tab_id === "w1:t1" || entry.tab_id === "w1:t2" ? { ...entry, pane_count: 2 } : entry),
      panes: [t1a, t1b, t2a, t2b, snapshot.panes[2]!],
    });
    const picked: string[] = [];
    const focused: string[] = [];
    const frames = new Map<string, Element>();
    const makeFrame = (paneId: string): Element => {
      const field = { focus: () => { focused.push(paneId); } };
      return {
        querySelector: (selector: string) => selector === ".terminal-input textarea" ? field : null,
      } as unknown as Element;
    };
    for (const id of [t1a.pane_id, t1b.pane_id, t2a.pane_id, t2b.pane_id]) frames.set(id, makeFrame(id));

    const prevQuerySelector = document.querySelector;
    const prevComputed = globalThis.getComputedStyle;
    const prevMatchMedia = window.matchMedia;
    const typingField = Object.assign(new HTMLElement(), {
      closest: (selector: string) => selector === ".pane-frame" ? {} : null,
      matches: (selector: string) => selector === "input, textarea",
      isContentEditable: false,
    });
    (document as unknown as { activeElement: unknown; querySelector: (sel: string) => Element | null }).querySelector = (selector: string) => {
      const match = /\[data-layout-pane="([^"]+)"\]/.exec(selector);
      return match ? frames.get(match[1]!) ?? null : null;
    };
    globalThis.getComputedStyle = (() => ({ visibility: "visible", getPropertyValue: () => "" })) as unknown as typeof getComputedStyle;
    window.matchMedia = (query: string) => ({ ...media, matches: query.includes("(max-width: 768px)") }) as unknown as MediaQueryList;

    const drawSnap = async (shown: SessionSnapshot, selected: PaneInfo): Promise<void> => {
      const tree = createElement(SettingsProvider, null, createElement(AppLayoutContext.Provider, { value: TUI },
        createElement(TabStrip, {
          snapshot: shown,
          workspace: shown.workspaces[0]!,
          selectedPane: selected,
          onSelectPane: (paneId: string) => { picked.push(paneId); },
          onNewTab: () => {},
          onNewTerminal: async () => {},
        })));
      await act(async () => { if (renderer) renderer.update(tree); else renderer = create(tree, { createNodeMock: node }); });
    };
    const menuItems = () => (renderer!.root.findByType(RowMenu).props as { items: { id: string; run: () => void }[] }).items;
    const pressStripWhileTyping = async (): Promise<void> => {
      (document as unknown as { activeElement: unknown }).activeElement = typingField;
      const target = {} as Node;
      await act(async () => strip().props.onPointerDownCapture({ currentTarget: { contains: (candidate: Node) => candidate === target }, target }));
    };

    try {
      // 1. Current pane pick while typing still calls onSelectPane (closing Terminal Peek / inbox) and focuses the field.
      await drawSnap(splitSnap([]), t1a);
      await pressStripWhileTyping();
      await act(async () => tab().props.onClick({ currentTarget: node(), detail: 1, ctrlKey: false }));
      await act(async () => menuItems().find((item) => item.id === `pane:${t1a.pane_id}`)!.run());
      expect(picked).toEqual([t1a.pane_id]);
      expect(focused).toEqual([t1a.pane_id]);

      // 2. Touch long-press (contextmenu) on an inactive split tab in the default under-header row keeps typing,
      //    and reads zoom from the picked pane's tab rather than the tab being left.
      picked.length = 0; focused.length = 0;
      const tab2 = () => renderer!.root.findByProps({ "data-tab-id": "w1:t2" });
      await drawSnap(splitSnap([
        { tab_id: "w1:t1", workspace_id: "w1", zoomed: true, focused_pane_id: t1a.pane_id, area: { x: 0, y: 0, width: 100, height: 100 }, panes: [], splits: [] },
        { tab_id: "w1:t2", workspace_id: "w1", zoomed: true, focused_pane_id: t2b.pane_id, area: { x: 0, y: 0, width: 100, height: 100 }, panes: [], splits: [] },
      ]), t1a);
      await pressStripWhileTyping();
      await act(async () => tab2().props.onContextMenu({ type: "contextmenu", currentTarget: node(), clientX: 120, clientY: 48, detail: 0, nativeEvent: { pointerType: "touch" }, preventDefault() {} }));
      await act(async () => menuItems().find((item) => item.id === `pane:${t2a.pane_id}`)!.run());
      expect(picked).toEqual([t2a.pane_id]);
      expect(focused).toEqual([t2b.pane_id]);

      // 3. Leaving a zoomed tab for an unzoomed inactive split tab focuses the picked pane, not the old zoomed pane.
      picked.length = 0; focused.length = 0;
      await drawSnap(splitSnap([
        { tab_id: "w1:t1", workspace_id: "w1", zoomed: true, focused_pane_id: t1a.pane_id, area: { x: 0, y: 0, width: 100, height: 100 }, panes: [], splits: [] },
      ]), t1a);
      await pressStripWhileTyping();
      await act(async () => tab2().props.onContextMenu({ type: "contextmenu", currentTarget: node(), clientX: 120, clientY: 48, detail: 0, nativeEvent: { pointerType: "touch" }, preventDefault() {} }));
      await act(async () => menuItems().find((item) => item.id === `pane:${t2a.pane_id}`)!.run());
      expect(picked).toEqual([t2a.pane_id]);
      expect(focused).toEqual([t2a.pane_id]);

      // 4. Keyboard contextmenu (0, 0, no touch pointerType) never reuses a stale pointer typing sample.
      picked.length = 0; focused.length = 0;
      await pressStripWhileTyping();
      await act(async () => tab2().props.onContextMenu({ type: "contextmenu", currentTarget: node(), clientX: 0, clientY: 0, detail: 0, nativeEvent: { pointerType: "" }, preventDefault() {} }));
      await act(async () => menuItems().find((item) => item.id === `pane:${t2a.pane_id}`)!.run());
      expect(picked).toEqual([t2a.pane_id]);
      expect(focused).toEqual([]);
    } finally {
      document.querySelector = prevQuerySelector;
      globalThis.getComputedStyle = prevComputed;
      window.matchMedia = prevMatchMedia;
    }
  });
});
