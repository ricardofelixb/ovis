/**
 * Panes side by side in columns, as windows snapped across the screen: a tab, a sidebar or Agents
 * row, or a pane's title dragged onto the pane area opens its pane there. Dropped on a column's
 * middle it opens in that column; on its edge (or on either half of a single pane) it opens in a
 * new column there, while the area has room for one (`MIN_COLUMN_WIDTH`). The selected pane (App's)
 * is the active column's; every other column keeps its own. The columns are independent: several
 * may show one tab (each draws it on a connection of its own), and a pick from the sidebar changes
 * the active column alone. A dropped pane a column already shows moves that column instead.
 *
 * Each column is a slot (`a` to `f`) that keeps its pane when the active one changes or columns
 * come and go, so no terminal attaches again for a click. A single pane is shown in one of them
 * (App's solo slot, `a` at first); split, `order` lists the slots left to right. The column left
 * when a split ends stays in its slot, so its terminal keeps its connection.
 */

export const SPLIT_SLOTS = ["a", "b", "c", "d", "e", "f"] as const;
export type SplitSlot = typeof SPLIT_SLOTS[number];

/** the narrowest a column is drawn: a narrower area shows fewer columns, the active one among them */
export const MIN_COLUMN_WIDTH = 280;

export interface SplitTarget {
  machineId: string;
  paneId: string;
}

export interface SplitState {
  /** the columns' slots, left to right: two or more */
  order: SplitSlot[];
  /** the slot of the selected pane */
  active: SplitSlot;
  /** the pane of every column but the active one */
  panes: Partial<Record<SplitSlot, SplitTarget>>;
}

/** Where a dragged pane lands: in column `index`, or in a new column put before column `index`. */
export interface SplitDrop {
  index: number;
  insert: boolean;
}

/** what a dragged tab or sidebar row carries: the pane it opens, and the PC it is on */
export const PANE_DRAG_TYPE = "application/x-herdr-pane";

const STORAGE_KEY = "ovis:split";

export function sameTarget(a: SplitTarget | null, b: SplitTarget | null): boolean {
  return a !== null && b !== null && a.machineId === b.machineId && a.paneId === b.paneId;
}

/** The panes the columns other than the active one show. */
export function otherTargets(state: SplitState | null): SplitTarget[] {
  return state ? state.order.flatMap((slot) => state.panes[slot] ?? []) : [];
}

/** How many columns an area this wide draws: two at least, as the split always could. */
export function columnsFit(width: number): number {
  return Math.min(SPLIT_SLOTS.length, Math.max(2, Math.floor(width / MIN_COLUMN_WIDTH)));
}

/** The columns drawn: as many as fit, keeping the active one among them. */
export function shownColumns(state: SplitState, fit: number): SplitSlot[] {
  if (state.order.length <= fit) return state.order;
  const at = state.order.indexOf(state.active);
  const start = Math.max(0, Math.min(at - Math.floor((fit - 1) / 2), state.order.length - fit));
  return state.order.slice(start, start + fit);
}

/** A column's edge, as a share of its width, that opens a new column instead of this one. */
const EDGE = 0.25;

/**
 * The drop at a point over `count` equal columns. A single pane splits on the side of the drop, held
 * near the midpoint so the preview does not flicker there; with no room for another column, a drop
 * opens in the column under it.
 */
export function dropAt(x: number, left: number, width: number, count: number, room: boolean, previous: SplitDrop | null = null): SplitDrop {
  if (count <= 1) {
    const middle = left + width / 2;
    const margin = Math.min(12, width / 4);
    if (previous?.insert && previous.index === 0 && x <= middle + margin) return previous;
    if (previous?.insert && previous.index === 1 && x >= middle - margin) return previous;
    return { index: x < middle ? 0 : 1, insert: true };
  }
  const column = width / count;
  const index = Math.max(0, Math.min(count - 1, Math.floor((x - left) / column)));
  const within = (x - left - index * column) / column;
  if (room && within < EDGE) return { index, insert: true };
  if (room && within > 1 - EDGE) return { index: index + 1, insert: true };
  return { index, insert: false };
}

function without(panes: SplitState["panes"], slot: SplitSlot): SplitState["panes"] {
  const next = { ...panes };
  delete next[slot];
  return next;
}

/** Whether a column shows `target`: dropped, it moves that column instead of opening in another. */
export function inColumn(state: SplitState | null, active: SplitTarget | null, target: SplitTarget): boolean {
  return state !== null && active !== null && slotOf(state, active, target) !== undefined;
}

/** The column that shows `target`: the active one, else the first other one, if any. */
function slotOf(state: SplitState, active: SplitTarget, target: SplitTarget): SplitSlot | undefined {
  return sameTarget(target, active) ? state.active : state.order.find((slot) => sameTarget(state.panes[slot] ?? null, target));
}

/**
 * A pane dropped on the columns `shown` (all of them, or the active one's neighbours when not all
 * fit): the split after it, and the pane to select (the dropped one, whose column becomes the
 * active one). Null when nothing changes: a pane dropped where it already is, or a new column with
 * every slot taken.
 * - Single pane: it stays in its slot (`solo`), and the dropped pane opens in a new column beside it.
 * - A pane a column already shows moves with its column: dropped on another column the two trade
 *   places, and on an edge its column moves there.
 * - Any other pane opens in the column under the drop, or in a new column at its edge.
 */
export function dockPane(
  state: SplitState | null,
  active: SplitTarget | null,
  dragged: SplitTarget,
  drop: SplitDrop,
  solo: SplitSlot = "a",
  shown: readonly SplitSlot[] = state?.order ?? [solo],
): { split: SplitState; select: SplitTarget } | null {
  if (active === null) return null;
  const current: SplitState = state ?? { order: [solo], active: solo, panes: {} };
  const activePanes = { ...current.panes, [current.active]: active };
  const from = slotOf(current, active, dragged);
  if (state === null && from !== undefined) return null;
  const moved = (order: SplitSlot[], slot: SplitSlot): { split: SplitState; select: SplitTarget } | null =>
    order.join() === current.order.join() && slot === current.active ? null : { split: { order, active: slot, panes: without(activePanes, slot) }, select: dragged };
  if (drop.insert) {
    const at = drop.index < shown.length ? current.order.indexOf(shown[drop.index]!) : current.order.indexOf(shown[shown.length - 1]!) + 1;
    if (from !== undefined) return moved([...current.order.slice(0, at).filter((slot) => slot !== from), from, ...current.order.slice(at).filter((slot) => slot !== from)], from);
    const slot = SPLIT_SLOTS.find((item) => !current.order.includes(item));
    if (slot === undefined) return null;
    return { split: { order: [...current.order.slice(0, at), slot, ...current.order.slice(at)], active: slot, panes: activePanes }, select: dragged };
  }
  const slot = shown[drop.index];
  if (state === null || slot === undefined) return null;
  if (from !== undefined) return moved(state.order.map((item) => item === slot ? from : item === from ? slot : item), from);
  if (slot === state.active) return { split: state, select: dragged };
  return { split: { order: state.order, active: slot, panes: without(activePanes, slot) }, select: dragged };
}

/** Another column made active: a click in it. */
export function activateColumn(state: SplitState, slot: SplitSlot, active: SplitTarget): { split: SplitState; select: SplitTarget } | null {
  const select = state.panes[slot];
  if (slot === state.active || !select) return null;
  return { split: { order: state.order, active: slot, panes: without({ ...state.panes, [state.active]: active }, slot) }, select };
}

/**
 * A column closed: the split after it (null when one column is left, which keeps its slot as the
 * solo one), and the pane to select. The active column closed hands the selection to its right
 * neighbour, or its left one at the end.
 */
export function closeColumn(state: SplitState, slot: SplitSlot, active: SplitTarget): { split: SplitState | null; select: SplitTarget; remaining: SplitSlot } {
  const at = state.order.indexOf(slot);
  const order = state.order.filter((item) => item !== slot);
  const nextActive = slot === state.active ? order[Math.min(at, order.length - 1)]! : state.active;
  const select = slot === state.active ? state.panes[nextActive] ?? active : active;
  const panes = without(without({ ...state.panes, [state.active]: active }, slot), nextActive);
  return { split: order.length > 1 ? { order, active: nextActive, panes } : null, select, remaining: nextActive };
}

/** A pane dragged in, if the drag carries one. */
export function draggedPane(data: string): SplitTarget | null {
  try {
    const value = JSON.parse(data) as { machine_id?: unknown; pane_id?: unknown };
    return typeof value.machine_id === "string" && typeof value.pane_id === "string" ? { machineId: value.machine_id, paneId: value.pane_id } : null;
  } catch {
    return null;
  }
}

export function paneDragData(target: SplitTarget): string {
  return JSON.stringify({ machine_id: target.machineId, pane_id: target.paneId });
}

/** The split this device left, if any: a reload opens it again while its panes are still there. */
export function storedSplit(): SplitState | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SplitState> | null;
    const slot = (item: unknown): item is SplitSlot => SPLIT_SLOTS.includes(item as SplitSlot);
    if (!value || !Array.isArray(value.order) || !value.order.every(slot) || !slot(value.active)) return null;
    const order = [...new Set(value.order)];
    if (order.length < 2 || !order.includes(value.active)) return null;
    const panes: SplitState["panes"] = {};
    for (const item of order) {
      if (item === value.active) continue;
      const pane = value.panes?.[item];
      if (typeof pane?.machineId !== "string" || typeof pane.paneId !== "string") return null;
      panes[item] = { machineId: pane.machineId, paneId: pane.paneId };
    }
    return { order, active: value.active, panes };
  } catch {
    return null;
  }
}

export function storeSplit(state: SplitState | null): void {
  try {
    if (state === null) window.sessionStorage.removeItem(STORAGE_KEY);
    else window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode: the split just is not kept across a reload */
  }
}
