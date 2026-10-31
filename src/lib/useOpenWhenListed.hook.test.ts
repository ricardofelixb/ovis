import { afterEach, beforeEach, expect, it } from "bun:test";
import { createElement, useRef } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Machine } from "../../shared/machines.ts";
import { markSelection, type SelectionMark } from "./selectionMark.ts";
import { useOpenWhenListed } from "./useSelection.ts";

// The real hook: a tab created while another was still on its way opens once the roster lists it,
// even when the older one's answer comes last.
let saved: PropertyDescriptor | undefined;
let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  saved = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
});

afterEach(async () => {
  await act(async () => { renderer?.unmount(); });
  renderer = undefined;
  if (saved) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", saved);
  else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
});

const roster = (paneIds: string[]) => [{ id: "pc", snapshot: { panes: paneIds.map((pane_id) => ({ pane_id })) } }] as unknown as Machine[];

it("opens the newer tab when an older creation answers after it", async () => {
  const opened: string[] = [];
  const selection: { current: SelectionMark } = { current: { machineId: "pc", paneId: "p1", generation: 0 } };
  let open!: ReturnType<typeof useOpenWhenListed>;
  function Probe({ machines }: { machines: Machine[] }) {
    const machinesRef = useRef(machines); machinesRef.current = machines;
    const selectTargetRef = useRef((_machineId: string, paneId: string | null) => { if (paneId) opened.push(paneId); });
    open = useOpenWhenListed({ machines, machinesRef, selectionRef: selection, selectTargetRef });
    return null;
  }
  await act(async () => { renderer = create(createElement(Probe, { machines: roster(["p1", "p2"]) })); });

  // Given: tab A is asked for from p1, the user moves to p2 and asks for tab B
  const askedA = selection.current;
  selection.current = markSelection(selection.current, "pc", "p2");
  const askedB = selection.current;

  // When: B answers first, then A, and only then does the roster list both
  await act(async () => { open("pc", "b", askedB); });
  await act(async () => { open("pc", "a", askedA); });
  await act(async () => { renderer!.update(createElement(Probe, { machines: roster(["p1", "p2", "a", "b"]) })); });

  // Then: B opens, and A, asked from a selection the user left, does not
  expect(opened).toEqual(["b"]);
});
