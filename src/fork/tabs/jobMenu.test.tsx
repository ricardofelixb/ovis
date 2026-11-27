import { expect, it } from "bun:test";
import { Terminal } from "lucide-react";
import type { HerdrPane } from "../../../shared/protocol.ts";
import { SUB_AGENT_ICON } from "../friends/AgentRole.tsx";
import { forkJobCount, forkJobItems } from "./jobMenu.tsx";

const pane = (id: string, fields: Partial<HerdrPane> = {}) => ({ pane_id: id, tab_id: "job", ...fields }) as HerdrPane;

it("lists each folded pane under its own id: a job with its role and state, a shell sharing its tab as a plain terminal", () => {
  const selected: string[] = [];
  const panes = [pane("shell"), pane("review", { parent_pane_id: "parent", agent_role: "review", agent_status: "working" }), pane("done", { parent_pane_id: "parent", agent_status: "done" })];
  const items = forkJobItems(panes, (folded) => `Pane ${folded.pane_id}`, "review", (id) => selected.push(id));
  expect(items.map(({ id, label, hint, current }) => ({ id, label, hint, current }))).toEqual([
    { id: "job:shell", label: "Pane shell", hint: undefined, current: false },
    { id: "job:review", label: "Pane review", hint: "review", current: true },
    { id: "job:done", label: "Pane done", hint: undefined, current: false },
  ]);
  expect(items.map((item) => (item.glyph as { props: { status: string } } | undefined)?.props.status)).toEqual([undefined, "working", "done"]);
  expect(items.map((item) => item.icon)).toEqual([Terminal, SUB_AGENT_ICON, SUB_AGENT_ICON]);
  items[1]!.run();
  items[0]!.run();
  expect(selected).toEqual(["review", "shell"]);
  expect(forkJobCount(panes)).toBe(2);
  expect(forkJobCount()).toBe(0);
});
