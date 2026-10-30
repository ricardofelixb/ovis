import { afterEach, describe, expect, it } from "bun:test";
import { activateColumn, closeColumn, columnsFit, dockPane, draggedPane, dropAt, paneDragData, shownColumns, storedSplit, storeSplit, type SplitState } from "./split.ts";

const A = { machineId: "local", paneId: "w1:p1" };
const B = { machineId: "local", paneId: "w1:p2" };
const C = { machineId: "pc2", paneId: "w1:p1" };
const D = { machineId: "local", paneId: "w2:p1" };
const E = { machineId: "local", paneId: "w2:p2" };
const F = { machineId: "local", paneId: "w3:p1" };

describe("split view", () => {
  it("opens a dropped pane beside the single one, on the side it was dropped on", () => {
    expect(dockPane(null, A, B, { index: 1, insert: true })).toEqual({ split: { order: ["a", "b"], active: "b", panes: { a: A } }, select: B });
    expect(dockPane(null, A, B, { index: 0, insert: true })).toEqual({ split: { order: ["b", "a"], active: "b", panes: { a: A } }, select: B });
  });

  it("keeps the single pane in its own slot when that is not slot a", () => {
    // a split closed from its left column leaves its pane in slot b: dropping again keeps it there
    expect(dockPane(null, A, B, { index: 1, insert: true }, "b")).toEqual({ split: { order: ["b", "a"], active: "a", panes: { b: A } }, select: B });
  });

  it("does nothing for a pane dropped into the active column that shows it, or with nothing open", () => {
    expect(dockPane(null, null, B, { index: 0, insert: true })).toBeNull();
    const split: SplitState = { order: ["a", "b"], active: "b", panes: { a: A } };
    expect(dockPane(split, B, B, { index: 1, insert: false })).toBeNull();
  });

  it("opens a pane no column shows in the column it is dropped on, making that column active", () => {
    const split: SplitState = { order: ["a", "b"], active: "b", panes: { a: A } };
    expect(dockPane(split, B, C, { index: 1, insert: false })).toEqual({ split, select: C });
    expect(dockPane(split, B, C, { index: 0, insert: false })).toEqual({ split: { order: ["a", "b"], active: "a", panes: { b: B } }, select: C });
  });

  it("adds a third column between two, in a free slot, and the dropped pane is selected there", () => {
    const split: SplitState = { order: ["a", "b"], active: "b", panes: { a: A } };
    expect(dockPane(split, B, C, { index: 1, insert: true })).toEqual({ split: { order: ["a", "c", "b"], active: "c", panes: { a: A, b: B } }, select: C });
    expect(dockPane(split, B, C, { index: 2, insert: true })).toEqual({ split: { order: ["a", "b", "c"], active: "c", panes: { a: A, b: B } }, select: C });
  });

  it("refuses a new column once every slot is taken", () => {
    const split: SplitState = { order: ["a", "b", "c", "d", "e", "f"], active: "a", panes: { b: B, c: B, d: B, e: B, f: B } };
    expect(dockPane(split, A, C, { index: 0, insert: true })).toBeNull();
  });

  it("maps a drop on the drawn columns to the split's own order when not all of them are drawn", () => {
    const split: SplitState = { order: ["a", "b", "c", "d", "e"], active: "c", panes: { a: A, b: B, d: D, e: D } };
    const shown = shownColumns(split, 3);
    expect(shown).toEqual(["b", "c", "d"]);
    expect(dockPane(split, C, E, { index: 0, insert: false }, "a", shown)).toEqual({ split: { order: ["a", "b", "c", "d", "e"], active: "b", panes: { a: A, c: C, d: D, e: D } }, select: E });
  });

  it("swaps two columns when a pane another column shows is dropped on one", () => {
    const split: SplitState = { order: ["a", "b", "c"], active: "b", panes: { a: A, c: C } };
    expect(dockPane(split, B, A, { index: 2, insert: false })).toEqual({ split: { order: ["c", "b", "a"], active: "a", panes: { b: B, c: C } }, select: A });
    // the active column's own pane dropped on another column moves the active column
    expect(dockPane(split, B, B, { index: 0, insert: false })).toEqual({ split: { order: ["b", "a", "c"], active: "b", panes: { a: A, c: C } }, select: B });
    // dropped back on its own column, nothing changes
    expect(dockPane(split, B, B, { index: 1, insert: false })).toBeNull();
  });

  it("moves a column to the edge its pane is dropped on, without adding one", () => {
    const split: SplitState = { order: ["a", "b", "c"], active: "b", panes: { a: A, c: C } };
    expect(dockPane(split, B, A, { index: 3, insert: true })).toEqual({ split: { order: ["b", "c", "a"], active: "a", panes: { b: B, c: C } }, select: A });
    expect(dockPane(split, B, C, { index: 1, insert: true })).toEqual({ split: { order: ["a", "c", "b"], active: "c", panes: { a: A, b: B } }, select: C });
    // a full split still moves its columns
    const full: SplitState = { order: ["a", "b", "c", "d", "e", "f"], active: "a", panes: { b: B, c: C, d: D, e: E, f: F } };
    expect(dockPane(full, A, F, { index: 0, insert: true })?.split.order).toEqual(["f", "a", "b", "c", "d", "e"]);
    // dropped next to where it already is, nothing changes
    expect(dockPane(split, B, B, { index: 2, insert: true })).toBeNull();
  });

  it("does not split a single pane with itself", () => {
    expect(dockPane(null, A, A, { index: 1, insert: true })).toBeNull();
  });

  it("makes another column active without moving any pane", () => {
    const split: SplitState = { order: ["a", "b", "c"], active: "b", panes: { a: A, c: C } };
    expect(activateColumn(split, "c", B)).toEqual({ split: { order: ["a", "b", "c"], active: "c", panes: { a: A, b: B } }, select: C });
    expect(activateColumn(split, "b", B)).toBeNull();
  });

  it("closes a column: the others stay, and the active one hands over to its neighbour", () => {
    const split: SplitState = { order: ["a", "b", "c"], active: "b", panes: { a: A, c: C } };
    expect(closeColumn(split, "a", B)).toEqual({ split: { order: ["b", "c"], active: "b", panes: { c: C } }, select: B, remaining: "b" });
    expect(closeColumn(split, "b", B)).toEqual({ split: { order: ["a", "c"], active: "c", panes: { a: A } }, select: C, remaining: "c" });
    // the last column closed hands over to the one on its left; two columns end the split
    expect(closeColumn({ order: ["a", "b"], active: "b", panes: { a: A } }, "b", B)).toEqual({ split: null, select: A, remaining: "a" });
  });

  it("draws as many columns as fit, two at least, keeping the active one drawn", () => {
    expect(columnsFit(500)).toBe(2);
    expect(columnsFit(900)).toBe(3);
    expect(columnsFit(10_000)).toBe(6);
    const split: SplitState = { order: ["a", "b", "c", "d"], active: "d", panes: { a: A, b: B, c: C } };
    expect(shownColumns(split, 4)).toEqual(["a", "b", "c", "d"]);
    expect(shownColumns(split, 3)).toEqual(["b", "c", "d"]);
    expect(shownColumns({ ...split, active: "a" }, 3)).toEqual(["a", "b", "c"]);
  });

  it("splits a single pane on the side of the drop, held near the middle", () => {
    expect(dropAt(100, 0, 400, 1, true)).toEqual({ index: 0, insert: true });
    expect(dropAt(250, 0, 400, 1, true)).toEqual({ index: 1, insert: true });
    expect(dropAt(212, 0, 400, 1, true, { index: 0, insert: true })).toEqual({ index: 0, insert: true });
    expect(dropAt(213, 0, 400, 1, true, { index: 0, insert: true })).toEqual({ index: 1, insert: true });
    expect(dropAt(188, 100, 400, 1, true, { index: 1, insert: true })).toEqual({ index: 0, insert: true });
  });

  it("opens a new column at a column's edge while there is room, else in the column", () => {
    // two columns of 300 from x 100
    expect(dropAt(150, 100, 600, 2, true)).toEqual({ index: 0, insert: true });
    expect(dropAt(250, 100, 600, 2, true)).toEqual({ index: 0, insert: false });
    expect(dropAt(390, 100, 600, 2, true)).toEqual({ index: 1, insert: true });
    expect(dropAt(690, 100, 600, 2, true)).toEqual({ index: 2, insert: true });
    expect(dropAt(690, 100, 600, 2, false)).toEqual({ index: 1, insert: false });
  });

  it("reads only a pane's drag data", () => {
    expect(draggedPane(paneDragData(C))).toEqual(C);
    expect(draggedPane("{\"workspace_id\":\"w1\"}")).toBeNull();
    expect(draggedPane("not json")).toBeNull();
  });
});

describe("split storage", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storageKey = "ovis:split";

  afterEach(() => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  it("stores and restores the split in session storage, not local storage", () => {
    const session = new Map<string, string>();
    const local = new Map<string, string>();
    const storage = (entries: Map<string, string>) => ({
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => { entries.set(key, value); },
      removeItem: (key: string) => { entries.delete(key); },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: storage(session), localStorage: storage(local) },
    });

    const split: SplitState = { order: ["a", "c", "b"], active: "c", panes: { a: A, b: B } };
    storeSplit(split);
    expect(session.get(storageKey)).toBe(JSON.stringify(split));
    expect(local.has(storageKey)).toBe(false);
    expect(storedSplit()).toEqual(split);

    // a split saved by the two-half version opens as a single pane
    session.set(storageKey, JSON.stringify({ other: A, bSide: "right", active: "b" }));
    expect(storedSplit()).toBeNull();

    storeSplit(null);
    expect(session.has(storageKey)).toBe(false);
    expect(local.has(storageKey)).toBe(false);
  });

  it("keeps storage access failures non-fatal", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        sessionStorage: {
          getItem() { throw new Error("storage denied"); },
          setItem() { throw new Error("storage denied"); },
          removeItem() { throw new Error("storage denied"); },
        },
      },
    });

    expect(storedSplit()).toBeNull();
    expect(() => storeSplit({ order: ["a", "b"], active: "b", panes: { a: A } })).not.toThrow();
    expect(() => storeSplit(null)).not.toThrow();
  });
});
