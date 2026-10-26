import { useEffect, type RefObject } from "react";

import { REST_MS, sheetDismisses, sheetDragVerdict } from "./sheets.ts";

/** The share of the screen's height a drag on the orb travels to go all the way. */
export const ORB_TRAVEL_SHARE = 0.4;

/** How far, 0..1, a drag `offset` px along its way has gone over `travel` px. */
export function orbPull(offset: number, travel: number): number {
  return travel > 0 ? Math.min(1, Math.max(0, offset / travel)) : 0;
}

/**
 * A drag on the call's orb, `up` from the composer to open the full call or `down` on the full
 * call to put it back. Only a stroke that starts on `handle` counts, so the chat under the orb
 * still scrolls. While it moves, `surface` follows the finger through `--pi-voice-pull` (0..1);
 * let go past a third of the way, or flicked, it calls `onDrag`, and otherwise springs back.
 * A tap is the handle's own click, which a drag swallows.
 */
export function useOrbDrag(handle: RefObject<HTMLElement | null>, surface: RefObject<HTMLElement | null>, direction: "up" | "down", onDrag: () => void): void {
  useEffect(() => {
    const node = handle.current;
    if (!node) return;
    const sign = direction === "up" ? -1 : 1;
    let stroke: { id: number; x: number; y: number; verdict: ReturnType<typeof sheetDragVerdict>; offset: number; at: number; speed: number; travel: number } | null = null;
    let dragged = false;
    const settle = () => {
      const target = surface.current;
      target?.classList.remove("is-dragging");
      target?.style.removeProperty("--pi-voice-pull");
    };
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      dragged = false;
      stroke = { id: event.pointerId, x: event.clientX, y: event.clientY, verdict: "pending", offset: 0, at: event.timeStamp, speed: 0, travel: window.innerHeight * ORB_TRAVEL_SHARE };
    };
    const move = (event: PointerEvent) => {
      if (!stroke || event.pointerId !== stroke.id || stroke.verdict === "ignore") return;
      const offset = (event.clientY - stroke.y) * sign;
      if (stroke.verdict === "pending") {
        stroke.verdict = sheetDragVerdict(event.clientX - stroke.x, offset, 0);
        if (stroke.verdict !== "drag") return;
        node.setPointerCapture(event.pointerId);
        surface.current?.classList.add("is-dragging");
      }
      const elapsed = event.timeStamp - stroke.at;
      if (elapsed > 0) stroke.speed = (offset - stroke.offset) / elapsed;
      stroke.offset = offset;
      stroke.at = event.timeStamp;
      surface.current?.style.setProperty("--pi-voice-pull", String(orbPull(offset, stroke.travel)));
    };
    const up = (event: PointerEvent) => {
      const was = stroke;
      if (!was || event.pointerId !== was.id) return;
      stroke = null;
      if (was.verdict !== "drag") return;
      dragged = true;
      settle();
      if (event.timeStamp - was.at > REST_MS) was.speed = 0;
      if (sheetDismisses(was.offset, was.travel, was.speed)) onDrag();
    };
    const cancel = (event: PointerEvent) => {
      if (stroke?.id !== event.pointerId) return;
      stroke = null;
      settle();
    };
    // a drag ends in a click on the handle: it is not a tap
    const click = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.stopPropagation();
      event.preventDefault();
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", cancel);
    node.addEventListener("click", click);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", cancel);
      node.removeEventListener("click", click);
      settle();
    };
  }, [handle, surface, direction, onDrag]);
}
