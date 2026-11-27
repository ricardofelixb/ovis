import { afterEach, beforeEach, expect, jest, mock, test } from "bun:test";
import * as ReactDom from "react-dom";
import { act, type ReactNode } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { HIDDEN_WORKSPACE_ID } from "../../../shared/fork/pane.ts";
import type { Machine } from "../../../shared/machines.ts";
import fixture from "../../../site/demo/fixtures/machines.json";
import { PanePressContext } from "../../lib/paneSubmitContext.ts";
import { SettingsProvider } from "../../lib/settings.ts";
import type { SidebarActivity } from "../../lib/sidebarActivity.tsx";

await mock.module("react-dom", () => ({ ...ReactDom, createPortal: (node: ReactNode) => node }));
const rowMenu = await import("../../components/RowMenu.tsx");
function RowMenu(_props: Parameters<typeof rowMenu.RowMenu>[0]) { return null; }
await mock.module("../../components/RowMenu.tsx", () => ({ ...rowMenu, RowMenu }));
const { InboxList } = await import("../../components/InboxList.tsx");
const { useHiddenLens } = await import("../hidden/hiddenAgents.ts");
const { newQuestionReads } = await import("../../lib/useInboxQuestions.ts");
const { SummaryReads } = await import("../../lib/useInboxSummaries.ts");

const saved = new Map<string, PropertyDescriptor | undefined>();
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  jest.useFakeTimers();
  for (const key of ["window", "document", "navigator", "getComputedStyle", "IS_REACT_ACT_ENVIRONMENT"]) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  const events = new EventTarget();
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { languages: ["en"] } });
  Object.defineProperty(globalThis, "getComputedStyle", { configurable: true, value: () => ({ getPropertyValue: () => "" }) });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    body: { nodeType: 1, children: [] }, querySelector: () => null,
    documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {} },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    history: { state: null, pushState() {}, replaceState() {}, back() {} }, location: { href: "http://localhost/", search: "" },
  } });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  jest.useRealTimers();
  for (const [key, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
  saved.clear();
});

function Lens({ machines }: { machines: Machine[] }) { useHiddenLens(machines); return null; }

async function draw({ runtime, hidden = false }: { runtime?: "herdr-core"; hidden?: boolean } = {}) {
  const machines = (structuredClone(fixture.machines) as Machine[]).map((machine) => ({ ...machine, ...(runtime ? { runtime } : {}),
    // a hidden agent sits in the hidden workspace, a tab of its own (shared/fork/core-terminals.ts)
    snapshot: !hidden ? machine.snapshot : { ...machine.snapshot!, workspaces: machine.snapshot!.workspaces.slice(0, 1).map((workspace) => ({ ...workspace, workspace_id: HIDDEN_WORKSPACE_ID })),
      tabs: machine.snapshot!.tabs.map((tab) => ({ ...tab, workspace_id: HIDDEN_WORKSPACE_ID })),
      panes: machine.snapshot!.panes.map((pane) => ({ ...pane, workspace_id: HIDDEN_WORKSPACE_ID, ovis_hidden: true as const })) } }));
  const activity: SidebarActivity = { seqs: () => new Map(), status: () => "idle" };
  const presses: string[] = [];
  const opened: string[] = [];
  await act(async () => {
    renderer = create(<SettingsProvider><PanePressContext.Provider value={(_machine, pane) => presses.push(pane)}>
      <Lens machines={machines} />
      <InboxList machines={machines} activity={activity} watching={false} wide={false} filter={hidden ? "hidden" : "all"} onFilter={() => {}} query="" onQuery={() => {}}
        scroll={{ current: 0 }} focus={{ opening: 0, taken: { current: 0 } }} onOpen={(_machine, pane) => opened.push(pane)} onNew={() => {}}
        questionReads={newQuestionReads(() => () => {})} summaryReads={new SummaryReads(() => new Promise(() => {}), () => () => {})} />
    </PanePressContext.Provider></SettingsProvider>);
  });
  const root = renderer!.root;
  const row = (): ReactTestInstance => root.find((node) => node.type === "li" && node.props["data-pane"] === "w1C:p1").find((node) => node.type === "button" && node.props.className === "inbox-row");
  const menus = () => root.findAllByType(RowMenu);
  return { row, menus, presses, opened };
}

const finger = { button: 0, pointerType: "touch", clientX: 20, clientY: 20, currentTarget: { isConnected: true }, preventDefault() {} };

test("a long press opens the row's menu, not its agent, and reads nothing ahead", async () => {
  const { row, menus, presses, opened } = await draw();
  await act(async () => { row().props.onPointerDown(finger); });
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(menus()).toHaveLength(1);
  expect(menus()[0]!.props.items.map((item: { id: string }) => item.id)).toEqual(["close"]);
  await act(async () => { row().props.onPointerUp(finger); row().props.onClick(); });
  expect(opened).toEqual([]);
  expect(presses).toEqual([]);
});

test("a tap still opens the agent, and a finger that scrolls opens no menu", async () => {
  const { row, menus, presses, opened } = await draw();
  await act(async () => { row().props.onPointerDown(finger); row().props.onPointerUp(finger); row().props.onClick(); });
  await act(async () => { row().props.onPointerDown(finger); row().props.onPointerMove({ ...finger, clientY: 60 }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(menus()).toHaveLength(0);
  expect(opened).toEqual(["w1C:p1"]);
  expect(presses).toEqual(["w1C:p1"]);
});

test("a right click opens the menu; herdr-core offers Hide, and Unhide in the Hidden filter", async () => {
  const ids = async (options: Parameters<typeof draw>[0]) => {
    const { row, menus } = await draw(options);
    await act(async () => { row().props.onContextMenu({ ...finger, button: 2 }); });
    const shown = menus()[0]!.props.items.map((item: { id: string }) => item.id);
    await act(async () => renderer?.unmount());
    return shown;
  };
  expect(await ids({ runtime: "herdr-core" })).toEqual(["hide", "close"]);
  expect(await ids({ runtime: "herdr-core", hidden: true })).toEqual(["unhide", "close"]);
});
