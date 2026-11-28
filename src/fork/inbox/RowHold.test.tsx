import { afterEach, beforeEach, expect, jest, test } from "bun:test";
import { act } from "react";
import { HIDDEN_WORKSPACE_ID } from "../../../shared/fork/pane.ts";
import type { Machine } from "../../../shared/machines.ts";
import fixture from "../../../site/demo/fixtures/machines.json";
import { InboxList } from "../../components/InboxList.tsx";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { PanePressContext } from "../../lib/paneSubmitContext.ts";
import { SettingsProvider } from "../../lib/settings.ts";
import type { SidebarActivity } from "../../lib/sidebarActivity.tsx";
import { newQuestionReads } from "../../lib/useInboxQuestions.ts";
import { SummaryReads } from "../../lib/useInboxSummaries.ts";
import { useHiddenLens } from "../hidden/hiddenAgents.ts";

let page: Page;
beforeEach(() => {
  page = openPage();
  Object.defineProperty(page.window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) });
  jest.useFakeTimers();
});
afterEach(async () => {
  jest.useRealTimers();
  await page.close();
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
  await page.render(<SettingsProvider><PanePressContext.Provider value={(_machine, pane) => presses.push(pane)}>
      <Lens machines={machines} />
      <InboxList machines={machines} activity={activity} watching={false} wide={false} filter={hidden ? "hidden" : "all"} onFilter={() => {}} query="" onQuery={() => {}}
        scroll={{ current: 0 }} focus={{ opening: 0, taken: { current: 0 } }} onOpen={(_machine, pane) => opened.push(pane)} onNew={() => {}}
        questionReads={newQuestionReads(() => () => {})} summaryReads={new SummaryReads(() => new Promise(() => {}), () => () => {})} />
    </PanePressContext.Provider></SettingsProvider>);
  const row = () => page.one<HTMLButtonElement>('li[data-pane="w1C:p1"] button.inbox-row');
  const send = (type: string, detail: { button?: number; pointerType?: string; clientY?: number } = {}) => {
    row().dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerType: "touch", clientX: 20, clientY: 20, ...detail }));
  };
  const menus = () => [...document.querySelectorAll(".row-menu, .row-sheet")]
    .map((menu) => [...menu.querySelectorAll("button[data-item]")].map((item) => item.getAttribute("data-item")));
  return { row, send, menus, presses, opened };
}

test("a long press opens the row's menu, not its agent, and reads nothing ahead", async () => {
  const { row, send, menus, presses, opened } = await draw();
  await act(async () => { send("pointerdown"); });
  await act(async () => { jest.advanceTimersByTime(450); });
  expect(menus()).toHaveLength(1);
  expect(menus()[0]).toEqual(["close"]);
  await act(async () => { send("pointerup"); row().click(); });
  expect(opened).toEqual([]);
  expect(presses).toEqual([]);
});

test("a tap still opens the agent, and a finger that scrolls opens no menu", async () => {
  const { row, send, menus, presses, opened } = await draw();
  await act(async () => { send("pointerdown"); send("pointerup"); row().click(); });
  await act(async () => { send("pointerdown"); send("pointermove", { clientY: 60 }); });
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(menus()).toHaveLength(0);
  expect(opened).toEqual(["w1C:p1"]);
  expect(presses).toEqual(["w1C:p1"]);
});

test("a right click opens the menu; herdr-core offers Hide, and Unhide in the Hidden filter", async () => {
  const ids = async (options: Parameters<typeof draw>[0]) => {
    const { send, menus } = await draw(options);
    await act(async () => { send("contextmenu", { button: 2, pointerType: "mouse" }); });
    const shown = menus()[0];
    await page.render(null);
    return shown;
  };
  expect(await ids({ runtime: "herdr-core" })).toEqual(["hide:w1C:p1", "close"]);
  expect(await ids({ runtime: "herdr-core", hidden: true })).toEqual(["unhide:w1C:p1", "close"]);
});
