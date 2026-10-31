import { type Dispatch, type DragEvent, type RefObject, type SetStateAction, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { HerdrPane, HerdrWorkspace } from "../../shared/protocol.ts";
import { paneStorageId, type Machine } from "../../shared/machines.ts";
import { fetchSession, type HealthInfo } from "./api.ts";
import { activateColumn, closeColumn, columnsFit, dockPane, draggedPane, dropAt, inColumn, PANE_DRAG_TYPE, sameTarget, shownColumns, storedSplit, storeSplit, type SplitDrop, type SplitSlot, type SplitState, type SplitTarget } from "./split.ts";
import { paneDrag, type PaneDrag } from "./paneDrag.ts";
import { columnPlaces, slideColumns } from "./columnMotion.ts";

const SELECTION_KEY = "ovis:selection";
type StoredSelection = { machine_id?: string; pane_id?: string | null };

/**
 * The pane to open: this window's own (sessionStorage is per window and survives
 * its reloads), else the last one any window showed, for a newly opened window.
 */
export function storedSelection(): StoredSelection | null {
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try {
      const value: unknown = JSON.parse(window[storage].getItem(SELECTION_KEY) ?? "null");
      if (value !== null && typeof value === "object") return value as StoredSelection;
    } catch {
      /* private mode */
    }
  }
  return null;
}

export function storeSelection(machineId: string, paneId: string | null): void {
  for (const storage of ["sessionStorage", "localStorage"] as const) {
    try { window[storage].setItem(SELECTION_KEY, JSON.stringify({ machine_id: machineId, pane_id: paneId })); } catch {}
  }
}

export function useSplitRecheck() {
  // a split column whose pane the PC could not be asked about is checked again on the next roster
  const otherRecheck = useRef(false);
  const [otherRosterTick, setOtherRosterTick] = useState(0);
  return { otherRecheck, otherRosterTick, setOtherRosterTick };
}

export function useSplitState() {
  // tabs side by side (lib/split.ts): the columns' slots, the other columns' panes, and the active slot.
  // Only drawn where the sidebar stands beside the pane; a narrower window shows the active column
  const [split, setSplitState] = useState<SplitState | null>(storedSplit);
  const setSplit = useCallback((next: SplitState | null) => {
    setSplitState(next);
    storeSplit(next);
  }, []);
  // the slot a single pane is drawn in: the column left when a split ends keeps its slot, and with it
  // its terminals' connections and the messages those connections hold for the agent
  const [soloSlot, setSoloSlot] = useState<SplitSlot>(() => storedSplit()?.active ?? "a");
  const endSplit = useCallback((remaining: SplitSlot) => {
    setSplit(null);
    setSoloSlot(remaining);
  }, [setSplit]);
  const splitRef = useRef(split); splitRef.current = split;
  // whether the other columns are drawn: a narrow window keeps the split but shows the active column alone
  const splitShownRef = useRef(false);
  // when a key was last pressed: a focus moving into another column makes it active only right after
  // one (a Tab), never when the app's own code moves the focus (an upload that finished)
  const lastKeyAtRef = useRef(0);
  useEffect(() => {
    const onKey = (): void => { lastKeyAtRef.current = Date.now(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  // the guide appears as soon as a pane is picked up; a target is chosen only over the area
  const [paneDragging, setPaneDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState<SplitDrop | null>(null);
  const dropTargetRef = useRef<SplitDrop | null>(null);
  const showDropTarget = useCallback((drop: SplitDrop | null): void => {
    dropTargetRef.current = drop;
    setDropTarget(drop);
  }, []);
  // the pane being dragged, read at dragstart (a dragover cannot read the drag's data), and the
  // title it would trade places with if dropped now. Only a drag from the pane's own title swaps:
  // a sidebar row, a tab or a column's bar dropped on a title still opens a column
  const draggedPaneRef = useRef<SplitTarget | null>(null);
  const swapHeadRef = useRef<HTMLElement | null>(null);
  const markSwap = useCallback((head: HTMLElement | null): void => {
    if (swapHeadRef.current === head) return;
    swapHeadRef.current?.classList.remove("is-swap-target");
    head?.classList.add("is-swap-target");
    swapHeadRef.current = head;
  }, []);
  const clearDropPreview = useCallback((): void => {
    setPaneDragging(false);
    showDropTarget(null);
    markSwap(null);
    draggedPaneRef.current = null;
  }, [showDropTarget, markSwap]);
  const paneAreaRef = useRef<HTMLDivElement>(null);
  // a tab dragged out of its strip (lib/paneDrag.ts)
  const tabDrag = useSyncExternalStore(paneDrag.subscribe, paneDrag.snapshot);
  return { split, setSplit, soloSlot, endSplit, splitRef, splitShownRef, lastKeyAtRef, paneDragging, setPaneDragging, dropTarget, dropTargetRef, showDropTarget, clearDropPreview, paneAreaRef, tabDrag, draggedPaneRef, markSwap };
}

/** What a column other than the active one draws: its pane, and the PC, workspace and attach it has. */
export interface SplitColumn {
  target: SplitTarget;
  machine: Machine | undefined;
  pane: HerdrPane | null;
  workspace: HerdrWorkspace | null;
  herdr: Machine["herdr"] | HealthInfo["herdr"] | undefined;
  attach: boolean;
}

export function useSplitLayout({ machines, split, wideScreen, selectedPaneId, selectedPane, selectedMachineId, splitShownRef, health, machineRosterLoaded, endSplit, otherRecheck, otherRosterTick, setSplit, soloSlot, setConnected, setConnectedBefore, setSelectedMachineId, setSelectedPaneId, setAutoSelected, setOutputStopped, splitRef, selectPane, paneAreaRef, dropTargetRef, clearDropPreview, tabDrag, showDropTarget, setPaneDragging, movingPanes, draggedPaneRef, markSwap, swapPanes, sidebarCollapsed, setSidebarCollapsed }: {
  machines: Machine[];
  split: SplitState | null;
  wideScreen: boolean;
  selectedPaneId: string | null;
  selectedPane: HerdrPane | null;
  selectedMachineId: string;
  splitShownRef: RefObject<boolean>;
  health: HealthInfo | null;
  machineRosterLoaded: boolean;
  endSplit: (remaining: SplitSlot) => void;
  otherRecheck: RefObject<boolean>;
  otherRosterTick: number;
  setSplit: (next: SplitState | null) => void;
  soloSlot: SplitSlot;
  setConnected: Dispatch<SetStateAction<boolean>>;
  setConnectedBefore: Dispatch<SetStateAction<boolean>>;
  setSelectedMachineId: Dispatch<SetStateAction<string>>;
  setSelectedPaneId: Dispatch<SetStateAction<string | null>>;
  setAutoSelected: Dispatch<SetStateAction<boolean>>;
  setOutputStopped: Dispatch<SetStateAction<boolean>>;
  splitRef: RefObject<SplitState | null>;
  selectPane: (paneId: string, focusInput?: boolean) => void;
  paneAreaRef: RefObject<HTMLDivElement | null>;
  dropTargetRef: RefObject<SplitDrop | null>;
  clearDropPreview: () => void;
  tabDrag: PaneDrag | null;
  showDropTarget: (drop: SplitDrop | null) => void;
  setPaneDragging: Dispatch<SetStateAction<boolean>>;
  /** panes a tab move has on its way to another workspace (paneStorageId): a column waits for the move */
  movingPanes: RefObject<Set<string>>;
  draggedPaneRef: RefObject<SplitTarget | null>;
  markSwap: (head: HTMLElement | null) => void;
  /** herdr's pane.swap of the dragged pane and another pane of its tab */
  swapPanes: (dragged: SplitTarget, targetPaneId: string) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: Dispatch<SetStateAction<boolean>>;
}) {
  // The split view (lib/split.ts): drawn only where the sidebar stands beside the pane, and only
  // while a pane is selected; a narrower window shows the active column alone and keeps the split
  const splitOn = split !== null && wideScreen && selectedPaneId !== null;
  splitShownRef.current = splitOn;
  // as many columns as the pane area fits, the active one among them
  const [areaWidth, setAreaWidth] = useState(0);
  const observed = useRef<{ element: HTMLElement; observer: ResizeObserver } | null>(null);
  useEffect(() => {
    const element = paneAreaRef.current;
    if (observed.current?.element === element) return;
    observed.current?.observer.disconnect();
    observed.current = null;
    if (!element) return;
    const observer = new ResizeObserver(() => setAreaWidth(element.clientWidth));
    observer.observe(element);
    observed.current = { element, observer };
  });
  useEffect(() => () => observed.current?.observer.disconnect(), []);
  const fit = areaWidth > 0 ? columnsFit(areaWidth) : 2;
  const shown: SplitSlot[] = splitOn ? shownColumns(split, fit) : [split ? split.active : soloSlot];
  // a change to the columns drawn slides them from where they were (lib/columnMotion.ts): their
  // places are read just before the change, and a render that drew the same columns forgets them
  const placesBefore = useRef<Map<string, number> | null>(null);
  const shownKey = shown.join();
  const shownBefore = useRef(shownKey);
  useLayoutEffect(() => {
    const before = placesBefore.current;
    placesBefore.current = null;
    if (before && shownBefore.current !== shownKey) slideColumns(paneAreaRef.current, before);
    shownBefore.current = shownKey;
  });

  const columnOf = (target: SplitTarget): SplitColumn => {
    const machine = machines.find((m) => m.id === target.machineId);
    const pane = machine?.snapshot?.panes.find((item) => item.pane_id === target.paneId) ?? null;
    const workspace = pane ? machine?.snapshot?.workspaces.find((item) => item.workspace_id === pane.workspace_id) ?? null : null;
    const herdr = target.machineId === "local" ? health?.herdr : machine?.herdr;
    return { target, machine, pane, workspace, herdr, attach: herdr?.terminal_attach !== false || herdr?.terminal_mirror === true };
  };
  const columns: Partial<Record<SplitSlot, SplitColumn>> = {};
  if (splitOn) for (const slot of shown) { const target = split.panes[slot]; if (target) columns[slot] = columnOf(target); }
  // columns showing one tab draw it at the grid one of them gives the pane: one pty has one size
  // (PaneFollowContext). The active column leads its tab; another tab follows its leftmost column
  const follows = new Set<SplitSlot>();
  if (splitOn) {
    const leaders = new Map<string, SplitSlot>();
    if (selectedPane) leaders.set(`${selectedMachineId}:${selectedPane.tab_id}`, split.active);
    for (const slot of shown) {
      const pane = columns[slot]?.pane;
      if (!pane) continue;
      const key = `${split.panes[slot]!.machineId}:${pane.tab_id}`;
      if (!leaders.has(key)) leaders.set(key, slot);
      else if (leaders.get(key) !== slot) follows.add(slot);
    }
  }

  // a column's pane closed: another pane of its tab takes its place, else the column closes. An
  // offline PC's cached roster cannot say so, as for the selection itself
  const columnTabs = useRef(new Map<string, string>());
  if (split) for (const slot of split.order) {
    const target = split.panes[slot];
    const pane = target ? columnOf(target).pane : null;
    if (target && pane) columnTabs.current.set(`${target.machineId}:${target.paneId}`, pane.tab_id);
  }
  const dropColumn = (slot: SplitSlot): void => {
    const open = splitRef.current;
    if (!open || !open.order.includes(slot) || slot === open.active) return;
    const order = open.order.filter((item) => item !== slot);
    placesBefore.current = columnPlaces(paneAreaRef.current);
    if (order.length < 2) { endSplit(open.active); return; }
    const panes = { ...open.panes };
    delete panes[slot];
    setSplit({ order, active: open.active, panes });
  };
  const dropColumnRef = useRef(dropColumn); dropColumnRef.current = dropColumn;
  useEffect(() => {
    if (!split || !machineRosterLoaded) return;
    let cancelled = false;
    let panes = split.panes;
    let gone: SplitSlot | null = null;
    for (const slot of split.order) {
      const target = split.panes[slot];
      if (!target) continue;
      const machine = machines.find((m) => m.id === target.machineId);
      if (!machine) { gone = slot; break; }
      if (!machine.snapshot || machine.state !== "connected") continue;
      const all = machine.snapshot.panes;
      if (all.some((pane) => pane.pane_id === target.paneId)) continue;
      const moving = (): boolean => movingPanes.current.has(paneStorageId(target.machineId, target.paneId));
      if (moving()) continue;
      const tabId = columnTabs.current.get(`${target.machineId}:${target.paneId}`) ?? null;
      // a pane this page has not seen in the roster yet (a saved split, a pane made just before the page
      // loaded) may be newer than the cached roster: ask the PC before the column closes, as the selection does
      if (tabId === null) {
        void fetchSession(target.machineId).then((current) => {
          if (!cancelled && !moving() && !current.panes.some((pane) => pane.pane_id === target.paneId)) dropColumnRef.current(slot);
        }).catch(() => {
          // a failed read is not evidence that the pane closed: ask again on the next roster
          if (!cancelled) otherRecheck.current = true;
        });
        continue;
      }
      const focused = machine.snapshot.layouts.find((layout) => layout.tab_id === tabId)?.focused_pane_id;
      const heir = all.find((pane) => pane.tab_id === tabId && pane.pane_id === focused) ?? all.find((pane) => pane.tab_id === tabId);
      if (!heir) { gone = slot; break; }
      panes = { ...panes, [slot]: { machineId: target.machineId, paneId: heir.pane_id } };
    }
    if (gone !== null) dropColumnRef.current(gone);
    else if (panes !== split.panes) setSplit({ ...split, panes });
    return () => { cancelled = true; };
  }, [split, machineRosterLoaded, machines, otherRosterTick, endSplit, setSplit]);

  const current = (): SplitTarget | null => selectedPaneId === null ? null : { machineId: selectedMachineId, paneId: selectedPaneId };
  /** A split change, the pane it selects and the slot it is selected in. The column that becomes
   *  active keeps its terminals: only a column whose pane moves to another PC attaches again and
   *  reports its connection. */
  // `keepFocus`: the focus already went somewhere in the column made active (a Tab onto one of its
  // buttons): the column's terminal and composer must not take the keyboard from it (autoSelected)
  const applySplit = (next: SplitState | null, select: SplitTarget, after: SplitSlot, keepFocus = false): void => {
    const was = splitOn ? split : null;
    const before = after === (was ? was.active : soloSlot) ? current() : was?.panes[after] ?? null;
    if (before === null || before.machineId !== select.machineId) { setConnected(false); setConnectedBefore(false); }
    placesBefore.current = columnPlaces(paneAreaRef.current);
    if (next === null) endSplit(after); else setSplit(next);
    setSelectedMachineId(select.machineId); setSelectedPaneId(select.paneId); setAutoSelected(keepFocus); setOutputStopped(false);
    storeSelection(select.machineId, select.paneId);
  };
  const activateSlot = (slot: SplitSlot, keepFocus = false): void => {
    const active = current();
    const result = splitOn && active ? activateColumn(split, slot, active) : null;
    if (result) applySplit(result.split, result.select, slot, keepFocus);
  };
  const closeSlot = (slot: SplitSlot): void => {
    const active = current();
    if (!splitOn || !active) return;
    if (slot !== split.active) { dropColumn(slot); return; }
    const result = closeColumn(split, slot, active);
    applySplit(result.split, result.select, result.remaining);
  };
  const selectInSlot = (slot: SplitSlot, machineId: string, paneId: string, focusInput = true): void => {
    const open = splitRef.current;
    const active = current();
    if (!open || !splitOn || open.active === slot) { selectPane(paneId, focusInput); return; }
    // a pick in another column (a press on a sibling pane of its tab, a tab opened there) makes that column
    // active with the picked pane selected, in one step. The press's own activation and this pick both
    // read the state from before the event: as two steps the second would undo the first
    const result = active ? activateColumn(open, slot, active) : null;
    if (result) applySplit(result.split, { machineId, paneId }, slot, !focusInput);
  };
  /** A pane opened by a drop: the column under it, or a new one, shows it and is the active one; a
   *  pane another column shows moves with that column instead (lib/split.ts). */
  /** The pane the one column keeps when the pane it shows is dragged to a column of its own: another
   *  pane of that tab, so the tab stays beside it. A pane alone in its tab has nothing to leave. */
  const leftBehind = (dragged: SplitTarget): SplitTarget | null => {
    const active = current();
    if (splitOn || !sameTarget(active, dragged)) return active;
    const panes = machines.find((m) => m.id === dragged.machineId)?.snapshot?.panes ?? [];
    const tab = panes.find((item) => item.pane_id === dragged.paneId)?.tab_id;
    const other = panes.find((item) => item.tab_id === tab && item.pane_id !== dragged.paneId);
    return other ? { machineId: dragged.machineId, paneId: other.pane_id } : active;
  };
  const dock = (dragged: SplitTarget, drop: SplitDrop): void => {
    if (!wideScreen || selectedPaneId === null) return;
    const result = dockPane(splitOn ? split : null, leftBehind(dragged), dragged, drop, soloSlot, shown);
    if (!result) return;
    applySplit(result.split, result.select, result.split.active);
    // a new column that needs the docked sidebar's room hides the sidebar, as its button would
    if (result.split.order.length > fit) setSidebarCollapsed(true);
  };
  /** The drop a point over the pane area would make with `dragged`, if it is over it. */
  const dropOver = (x: number, y: number, dragged: SplitTarget | null): SplitDrop | null => {
    const box = paneAreaRef.current?.getBoundingClientRect();
    const inside = !!box && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    if (!box || !inside) return null;
    // a drop opens a new column only while every column is drawn and one more fits, counting the
    // docked sidebar's width: the drag mostly starts there, and dock hides it for the column
    const sidebar = sidebarCollapsed ? 0 : document.getElementById("workspace-drawer")?.offsetWidth ?? 0;
    // a pane a column shows moves that column, which needs no room
    const room = !splitOn || (split.order.length === shown.length && (shown.length < columnsFit(box.width + sidebar) || (dragged !== null && inColumn(split, current(), dragged))));
    return dropAt(x, box.left, box.width, splitOn ? shown.length : 1, room, dropTargetRef.current);
  };
  /** A pane dropped at a point: the column under it, or a new one at its edge, opens the pane. */
  const dockAt = (dragged: SplitTarget, x: number, y: number): void => {
    const drop = dropOver(x, y, dragged);
    clearDropPreview();
    if (drop !== null) dock(dragged, drop);
  };
  const dockAtRef = useRef(dockAt); dockAtRef.current = dockAt;
  const dropOverRef = useRef(dropOver); dropOverRef.current = dropOver;
  useEffect(() => {
    paneDrag.onDrop((target, x, y) => dockAtRef.current(target, x, y));
    return () => paneDrag.onDrop(null);
  }, []);
  /** the pane a drag from a sidebar row or a title carries: dragover cannot read it */
  const dragPaneRef = useRef<SplitTarget | null>(null);
  // a tab dragged out of its strip: the guide follows it as a sidebar row's drag does below
  const splitDragOn = wideScreen && selectedPaneId !== null;
  useEffect(() => {
    if (!tabDrag || !splitDragOn) { if (!tabDrag) showDropTarget(null); return; }
    const point = tabDrag.point;
    showDropTarget(point ? dropOverRef.current(point.x, point.y, tabDrag.target) : null);
  }, [tabDrag, splitDragOn, showDropTarget]);
  // dragenter too: a drop hit-tests once more, and when the node under the pointer was replaced since
  // the last dragover (xterm redraws its rows, a transcript renders again) the new node gets a
  // dragenter instead. Chromium refuses a drop whose last drag event nobody accepted.
  /** The title of another pane in the dragged pane's own tab, under the pointer: dropped there, the
   *  two trade places (herdr's pane.swap) instead of opening the pane in a column. */
  const swapHead = (target: EventTarget | null): HTMLElement | null => {
    const dragged = draggedPaneRef.current;
    const head = target instanceof Element ? target.closest<HTMLElement>(".pane-frame-head") : null;
    const slot = head?.closest<HTMLElement>(".pane-slot");
    const paneId = head?.parentElement?.getAttribute("data-layout-pane");
    if (!dragged || !head || !slot || !paneId || paneId === dragged.paneId || slot.dataset.machine !== dragged.machineId) return null;
    // the dragged pane drawn in the same canvas is in the same tab, the only place herdr swaps in
    return slot.querySelector(`.pane-frame:not(.is-hidden)[data-layout-pane="${CSS.escape(dragged.paneId)}"]`) ? head : null;
  };
  const paneDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!splitDragOn || !event.dataTransfer.types.includes(PANE_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const head = swapHead(event.target);
    markSwap(head);
    setPaneDragging(head === null);
    if (head) { showDropTarget(null); return; }
    const drop = dropOver(event.clientX, event.clientY, dragPaneRef.current);
    if (drop) showDropTarget(drop);
  };
  const paneDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    // Some browsers omit relatedTarget when crossing a child. The pointer still being inside
    // the area must not clear the preview (or its stable side at the centre).
    const box = event.currentTarget.getBoundingClientRect();
    if (event.relatedTarget === null && event.clientX >= box.left && event.clientX < box.right && event.clientY >= box.top && event.clientY < box.bottom) return;
    showDropTarget(null);
    markSwap(null);
  };
  const paneDrop = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes(PANE_DRAG_TYPE)) return;
    // the composer and the terminal take dropped files: a dropped pane is not one
    event.preventDefault();
    event.stopPropagation();
    const dragged = draggedPane(event.dataTransfer.getData(PANE_DRAG_TYPE));
    const target = swapHead(event.target)?.parentElement?.getAttribute("data-layout-pane");
    if (dragged && target) {
      clearDropPreview();
      swapPanes(dragged, target);
    } else if (dragged) dockAt(dragged, event.clientX, event.clientY);
    else clearDropPreview();
  };
  // Bubble phase: the sidebar row has put its pane type into DataTransfer by then.
  useEffect(() => {
    if (!splitDragOn) { clearDropPreview(); return; }
    const start = (event: globalThis.DragEvent): void => {
      if (event.dataTransfer?.types.includes(PANE_DRAG_TYPE)) {
        const fromTitle = event.target instanceof Element && event.target.closest(".pane-frame-head") !== null;
        dragPaneRef.current = draggedPane(event.dataTransfer.getData(PANE_DRAG_TYPE));
        draggedPaneRef.current = fromTitle ? dragPaneRef.current : null;
        showDropTarget(null);
        setPaneDragging(true);
      }
    };
    const cancel = (event: KeyboardEvent): void => { if (event.key === "Escape") clearDropPreview(); };
    window.addEventListener("dragstart", start);
    window.addEventListener("dragend", clearDropPreview);
    window.addEventListener("drop", clearDropPreview);
    window.addEventListener("blur", clearDropPreview);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("dragstart", start);
      window.removeEventListener("dragend", clearDropPreview);
      window.removeEventListener("drop", clearDropPreview);
      window.removeEventListener("blur", clearDropPreview);
      window.removeEventListener("keydown", cancel);
    };
  }, [splitDragOn, clearDropPreview, showDropTarget]);
  return { splitOn, shown, columns, follows, activateSlot, closeSlot, selectInSlot, splitDragOn, paneDragOver, paneDragLeave, paneDrop };
}
