import { useContext, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent } from "react";
import { X } from "lucide-react";
import type { Machine } from "../../../shared/machines.ts";
import type { HerdrPane } from "../../../shared/protocol.ts";
import { ConfirmDialog } from "../../components/ConfirmDialog.tsx";
import { RowMenu, type RowMenuItem } from "../../components/RowMenu.tsx";
import { closePane } from "../../lib/api.ts";
import { useT } from "../../lib/i18n.ts";
import { usePaneLocked } from "../../lib/paneLocks.ts";
import { PanePressContext } from "../../lib/paneSubmitContext.ts";
import { forkHideItem } from "../hidden/hideItem.ts";

/** as TabStrip's long press: how long a still finger holds, how far it may drift, how long the lift's click is swallowed */
const HOLD_MS = 450;
const HOLD_SLOP_PX = 8;
const LIFT_CLICK_MS = 600;

interface Target { machine: Machine; pane: HerdrPane; title: string }
interface Held { timer: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean; until: number }

/**
 * An inbox row's menu (Close, Hide or Unhide): a touch hold opens it, and a right click. A held row opens no agent and
 * reads none ahead (PanePressContext): a finger's read waits for its lift, a press that becomes a scroll cancels the hold.
 */
export function useForkRowHold(watching: boolean) {
  const t = useT();
  const pressPane = useContext(PanePressContext);
  const holding = useRef<Held | null>(null);
  const [menu, setMenu] = useState<{ target: Target; anchor: HTMLElement; point?: { x: number; y: number } } | null>(null);
  const [closing, setClosing] = useState<Target | null>(null);
  const cancel = (): void => { if (holding.current) clearTimeout(holding.current.timer); holding.current = null; };
  useEffect(() => cancel, []);
  const open = (pressed: Held, target: Target, anchor: HTMLElement): void => {
    clearTimeout(pressed.timer);
    if (holding.current !== pressed || pressed.fired) return;
    pressed.fired = true;
    pressed.until = Infinity;
    if (anchor.isConnected !== false) setMenu({ target, anchor });
  };
  const row = (target: Target, online: boolean) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      cancel();
      if (event.button !== 0 || !online) return;
      if (event.pointerType !== "touch" && event.pointerType !== "pen") { pressPane?.(target.machine.id, target.pane.pane_id); return; }
      const anchor = event.currentTarget;
      const pressed: Held = { x: event.clientX, y: event.clientY, fired: false, until: Infinity, timer: setTimeout(() => open(pressed, target, anchor), HOLD_MS) };
      holding.current = pressed;
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const pressed = holding.current;
      if (pressed && !pressed.fired && Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > HOLD_SLOP_PX) cancel();
    },
    onPointerUp: () => {
      const pressed = holding.current;
      if (!pressed) return;
      if (pressed.fired) { pressed.until = performance.now() + LIFT_CLICK_MS; return; }
      cancel();
      pressPane?.(target.machine.id, target.pane.pane_id);
    },
    // the browser took the finger for a scroll
    onPointerCancel: cancel,
    // the lift of a held press sends no mouse events or click: the focus they move would close the menu it opened
    onTouchEnd: (event: TouchEvent<HTMLElement>) => { if (holding.current?.fired) event.preventDefault(); },
    onContextMenu: (event: MouseEvent<HTMLElement>) => {
      event.preventDefault();
      // Android's own long-press contextmenu can come before the timer: one path opens the menu, once
      const pressed = holding.current;
      if (pressed) { open(pressed, target, event.currentTarget); return; }
      if (online) setMenu({ target, anchor: event.currentTarget, ...(event.clientX || event.clientY ? { point: { x: event.clientX, y: event.clientY } } : {}) });
    },
  });
  /** true for the click a hold's lift sends: the row then opens nothing */
  const held = (): boolean => {
    const pressed = holding.current;
    if (!pressed?.fired) return false;
    holding.current = null;
    return performance.now() <= pressed.until;
  };
  return {
    row, held,
    menu: <>
      {menu && <HoldMenu {...menu} watching={watching} onClose={() => setMenu(null)} onCloseAgent={setClosing} />}
      {closing && <ConfirmDialog title={t("Close pane {name}?", { name: closing.title })}
        body={t("The pane's running processes will stop. Closing its last pane also closes the workspace.")}
        confirmLabel={t("Close pane")} onClose={() => setClosing(null)}
        onConfirm={async () => { await closePane(closing.pane.pane_id, closing.machine.id); setClosing(null); }} />}
    </>,
  };
}

function HoldMenu({ target, anchor, point, watching, onClose, onCloseAgent }: { target: Target; anchor: HTMLElement; point?: { x: number; y: number }; watching: boolean; onClose(): void; onCloseAgent(target: Target): void }) {
  const t = useT();
  const locked = usePaneLocked(target.machine.id)(target.pane.pane_id);
  const { machine, pane } = target;
  const items: RowMenuItem[] = [
    ...forkHideItem(machine.id, pane, t, watching || machine.view_only === true),
    // a locked agent closes nowhere until it is unlocked (PaneCanvas)
    ...(locked ? [] : [{ id: "close", label: t("Close pane"), icon: X, danger: true, disabled: watching || machine.view_only === true, run: () => onCloseAgent(target) }]),
  ];
  if (items.length === 0 || machine.state !== "connected") return null;
  return <RowMenu anchor={anchor} {...(point ? { point } : {})} title={target.title} items={items} onClose={onClose} />;
}
