import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { createElement, useRef } from "react";
import { HIDDEN_WORKSPACE_ID } from "../../../shared/fork/pane.ts";
import type { Machine } from "../../../shared/machines.ts";
import * as api from "../../lib/api.ts";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { useSelectTarget } from "../../lib/useSelection.ts";
import { shownMachines } from "./hiddenAgents.ts";

let page: Page;
let picked: (string | null)[];
let session: ReturnType<typeof spyOn>;

// p2 was just hidden: the PC's own session still lists it, marked and in the hidden workspace
const full = {
  workspaces: [{ workspace_id: "1", label: "alpha", active_tab_id: "1:1" }, { workspace_id: HIDDEN_WORKSPACE_ID, label: "hidden", active_tab_id: "h:1" }],
  tabs: [{ tab_id: "1:1", workspace_id: "1" }, { tab_id: "h:1", workspace_id: HIDDEN_WORKSPACE_ID }],
  panes: [{ pane_id: "p1", workspace_id: "1", tab_id: "1:1", focused: false }, { pane_id: "p2", workspace_id: HIDDEN_WORKSPACE_ID, tab_id: "h:1", focused: true, ovis_hidden: true }],
  agents: [], focused_pane_id: "p2", layouts: [],
};
const machine = shownMachines([{ id: "local", state: "connected", snapshot: full } as unknown as Machine])[0]!;

beforeEach(() => {
  page = openPage();
  picked = [];
  session = spyOn(api, "fetchSession").mockResolvedValue(full as never);
});

afterEach(async () => {
  await page.close();
  session.mockRestore();
});

function Probe() {
  const none = () => {};
  useSelectTarget({
    selectedMachineId: "local", setConnected: none, setConnectedBefore: none, setSelectedMachineId: none,
    setSelectedPaneId: (next) => { picked.push(typeof next === "function" ? next("p2") : next); }, setAutoSelected: none, setDrawerOpen: none,
    setOutputStopped: none, setNotificationViewTarget: none, setTerminalPeek: none, pendingLink: useRef(null), pendingFile: useRef(null),
    setLinkLanded: none, selectionHint: useRef(null), selectionSince: useRef(0), rosterSeq: useRef(0), snapshot: machine.snapshot,
    selectedMachine: machine, selectedPaneId: "p2", setHeaderNote: none, linkTick: 0, movingPanes: useRef(new Set<string>()),
  } as Parameters<typeof useSelectTarget>[0]);
  return null;
}

it("a selected pane just hidden leaves the selection as a closed one does, for a shown pane", async () => {
  await page.render(createElement(Probe));
  expect(session).toHaveBeenCalled();
  expect(picked).toEqual(["p1"]);
});
