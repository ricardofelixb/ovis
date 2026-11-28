import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { Machine } from "../../../shared/machines.ts";
import fixture from "../../../site/demo/fixtures/machines.json";
import { InboxList } from "../../components/InboxList.tsx";
import { openPage, reactProps, type Page } from "../../lib/page.fixture.ts";
import { SettingsProvider } from "../../lib/settings.ts";
import type { SidebarActivity } from "../../lib/sidebarActivity.tsx";
import { newQuestionReads } from "../../lib/useInboxQuestions.ts";
import { SummaryReads } from "../../lib/useInboxSummaries.ts";

let page: Page;
beforeEach(() => {
  page = openPage();
  page.window.localStorage.setItem("ovis:settings", '{"agentFriends":true}');
  Object.defineProperty(page.window, "matchMedia", { configurable: true, writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
});
afterEach(() => page.close());

test.each([false, true])("a conductor arriving during keyboard focus cannot move rows or connect to an unrelated row (other first: %s)", async (otherFirst) => {
  const machines = structuredClone(fixture.machines) as Machine[];
  const machine = machines[0]!;
  const panes = machine.snapshot!.panes.slice(0, 3);
  const [helper, other, conductor] = panes;
  helper!.parent_pane_id = conductor!.pane_id;
  const initial = otherFirst ? [other!, helper!] : [helper!, other!];
  const roster = (withConductor: boolean): Machine[] => [{ ...machine, snapshot: { ...machine.snapshot!, panes: withConductor ? [...initial, conductor!] : initial } }];
  // Within a state the inbox sorts by activity, not snapshot pane order (workspace order wins ties).
  const activity: SidebarActivity = { seqs: () => new Map(initial.map((pane, index) => [pane.pane_id, index])), status: () => "working" };
  const questionReads = newQuestionReads(() => () => {});
  const summaryReads = new SummaryReads(() => new Promise(() => {}), () => () => {});
  const scroll = { current: 0 };
  const focus = { opening: 1, taken: { current: 1 } };
  const view = (withConductor: boolean) => <SettingsProvider><InboxList machines={roster(withConductor)} activity={activity}
    watching={false} wide filter="all" onFilter={() => {}} query="" onQuery={() => {}} scroll={scroll} focus={focus}
    onOpen={() => {}} onNew={() => {}} questionReads={questionReads} summaryReads={summaryReads} /></SettingsProvider>;
  await page.render(view(false));
  const order = () => [...page.container.querySelectorAll("li[data-pane]")].map((node) => node.getAttribute("data-pane"));
  // the list's own handlers, with the focus a keyboard gives and takes back
  const list = () => reactProps(page.container.querySelector("div.inbox-groups")!) as Record<"onFocus" | "onBlur", (event: object) => void>;
  expect(order()).toEqual(initial.map((pane) => pane.pane_id));
  await act(async () => { list().onFocus({ target: { matches: () => true } }); });
  await page.render(view(true));
  expect(order()).toEqual([...initial, conductor!].map((pane) => pane.pane_id));
  expect(page.container.querySelectorAll("li[data-depth]")).toHaveLength(0);
  await act(async () => { list().onBlur({ relatedTarget: null, currentTarget: {} }); });
  expect(order()).toEqual((otherFirst ? [other!, conductor!, helper!] : [conductor!, helper!, other!]).map((pane) => pane.pane_id));
  expect(page.container.querySelectorAll("li[data-depth]")).toHaveLength(1);
});
