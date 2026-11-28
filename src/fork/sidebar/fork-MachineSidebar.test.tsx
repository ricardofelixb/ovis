import { afterEach, beforeEach, expect, it } from "bun:test";
import { createElement } from "react";

import type { Machine } from "../../../shared/machines.ts";
import { MachineSidebar } from "../../components/MachineSidebar.tsx";
import type { AppActions } from "../../lib/actions.ts";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { AGENT_GROUPS_STORAGE_KEY, FOLD_HELPERS_STORAGE_KEY, SettingsProvider, SIDEBAR_AGENT_TREE_STORAGE_KEY } from "../../lib/settings.ts";

const actions = new Proxy({}, { get: () => () => {} }) as AppActions;
const activity = { seqs: () => new Map<string, number>(), status: () => undefined };
const laptop = { id: "local", kind: "local", name: "Laptop", state: "connected", snapshot: null, error: null, action_required: null, remote_ovis: null } as unknown as Machine;

const descriptors = new Map<string, PropertyDescriptor | undefined>();
let page: Page;

beforeEach(() => {
  page = openPage();
  Object.defineProperty(page.window.document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(page.window.navigator, "platform", { configurable: true, value: "Linux" });
  Object.defineProperty(page.window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(page.window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(page.window, "requestAnimationFrame", { configurable: true, value: (run: FrameRequestCallback) => { run(0); return 1; } });
  Object.defineProperty(page.window, "cancelAnimationFrame", { configurable: true, value: () => {} });
  Object.defineProperty(page.window.HTMLElement.prototype, "offsetWidth", { configurable: true, value: 200 });
  Object.defineProperty(page.window.HTMLElement.prototype, "offsetHeight", { configurable: true, value: 100 });
  for (const [key, value] of Object.entries({ localStorage: page.window.localStorage, HTMLElement: page.window.HTMLElement })) {
    descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
});

afterEach(async () => {
  await page.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function draw(settings: { foldHelpers: boolean; agentTree: boolean; agentGroups: boolean }) {
  localStorage.setItem(FOLD_HELPERS_STORAGE_KEY, String(settings.foldHelpers));
  localStorage.setItem(SIDEBAR_AGENT_TREE_STORAGE_KEY, String(settings.agentTree));
  localStorage.setItem(AGENT_GROUPS_STORAGE_KEY, String(settings.agentGroups));
  await page.render(createElement(SettingsProvider, null, createElement(MachineSidebar, {
    machines: [laptop], selectedMachineId: "local", selectedPaneId: null, screenMachineId: null, onScreen: () => {}, activity, actions,
    onSelect: () => {}, onNew: () => {}, onSetup: () => {}, onUsageLogin: () => {}, inbox: { waiting: 0, open: () => {} },
  })));
  const count = (selector: string) => page.container.querySelectorAll(selector).length;
  const drawn = { agents: count("section.agents-sidebar"), splits: count(".sidebar-split"), pcs: count(".pcs-sidebar") > 0, inbox: count(".sidebar-footer-inbox") > 0, settings: count(".sidebar-footer-settings") > 0 };
  await page.render(null);
  return drawn;
}

it("draws no Agents list nor its divider while both settings are on, above or below the PCs, and keeps the rest", async () => {
  for (const agentGroups of [false, true]) {
    expect(await draw({ foldHelpers: true, agentTree: true, agentGroups })).toEqual({ agents: 0, splits: 0, pcs: true, inbox: true, settings: true });
  }
});

it("keeps the Agents list and its divider while either setting is off", async () => {
  for (const [foldHelpers, agentTree] of [[true, false], [false, true], [false, false]] as const) {
    for (const agentGroups of [false, true]) {
      expect(await draw({ foldHelpers, agentTree, agentGroups })).toEqual({ agents: 1, splits: 1, pcs: true, inbox: true, settings: true });
    }
  }
});
