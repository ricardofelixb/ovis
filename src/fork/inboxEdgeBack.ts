import { useEffect, useRef } from "react";

import { drawerSettles, strokeFree, swipeVerdict } from "../lib/edgeSwipe.ts";

/** How long the thread takes to slide the rest of the way out, or back, once the finger lifts. */
const SETTLE_MS = 180;

/**
 * In an agent inbox thread on a phone, a swipe in from the left edge goes back to the list, as the drawer's
 * swipe does in the workspaces view (lib/edgeSwipe.ts, with the same edge, distance and flick). The Android
 * app keeps the middle of that edge from the system's Back for the page (MainActivity.claimDrawerEdge), so
 * without this the inbox, which has no drawer, left it doing nothing. The thread (`.app`) follows the finger;
 * let go past half its width, or flicked, it slides out and `back` runs, the header's Back.
 */
export function useInboxEdgeBack(on: boolean, back: () => void): void {
  const backRef = useRef(back); backRef.current = back;
  useEffect(() => {
    if (!on) return;
    const narrow = window.matchMedia("(max-width: 768px)");
    let start: { x: number; y: number; at: number } | null = null;
    let follow: { shell: HTMLElement; width: number; shown: number; x: number; at: number; speed: number } | null = null;
    const reset = (shell: HTMLElement): void => { shell.style.transition = ""; shell.style.transform = ""; shell.style.opacity = ""; };
    const onStart = (event: TouchEvent): void => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch && narrow.matches && strokeFree(event.target, false) ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp } : null;
      if (follow !== null) reset(follow.shell);
      follow = null;
    };
    const onMove = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (start === null || !touch) return;
      const dx = touch.clientX - start.x;
      if (follow === null) {
        const verdict = swipeVerdict(false, start.x, dx, touch.clientY - start.y);
        if (verdict === "pending") return;
        if (verdict === "ignore") { start = null; return; }
        const shell = document.querySelector<HTMLElement>(".app");
        if (shell === null) { start = null; return; }
        const speed = event.timeStamp > start.at ? dx / (event.timeStamp - start.at) : 0;
        follow = { shell, width: shell.getBoundingClientRect().width, shown: 0, x: touch.clientX, at: event.timeStamp, speed };
        shell.style.transition = "none";
      }
      // the stroke is the thread's now, not the transcript's or the terminal's under the finger
      event.preventDefault();
      event.stopPropagation();
      if (event.timeStamp > follow.at) follow.speed = (touch.clientX - follow.x) / (event.timeStamp - follow.at);
      follow.shown = Math.min(follow.width, Math.max(0, dx));
      follow.x = touch.clientX;
      follow.at = event.timeStamp;
      follow.shell.style.transform = `translateX(${follow.shown}px)`;
      follow.shell.style.opacity = String(1 - (follow.shown / Math.max(1, follow.width)) * 0.4);
    };
    const onEnd = (event: TouchEvent): void => {
      const held = follow;
      start = null;
      follow = null;
      if (held === null) return;
      const rested = event.timeStamp - held.at > 100;
      const leave = drawerSettles(held.shown, held.width, rested ? 0 : held.speed);
      held.shell.style.transition = `transform ${SETTLE_MS}ms ease-out, opacity ${SETTLE_MS}ms ease-out`;
      held.shell.style.transform = leave ? `translateX(${held.width}px)` : "";
      held.shell.style.opacity = leave ? "0.6" : "";
      window.setTimeout(() => {
        if (leave) backRef.current();
        reset(held.shell);
      }, SETTLE_MS);
    };
    // on the window, so it hears the stroke before the drawer's watcher on the document
    window.addEventListener("touchstart", onStart, { capture: true, passive: true });
    window.addEventListener("touchmove", onMove, { capture: true, passive: false });
    window.addEventListener("touchend", onEnd, { capture: true, passive: true });
    window.addEventListener("touchcancel", onEnd, { capture: true, passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart, { capture: true });
      window.removeEventListener("touchmove", onMove, { capture: true });
      window.removeEventListener("touchend", onEnd, { capture: true });
      window.removeEventListener("touchcancel", onEnd, { capture: true });
      if (follow !== null) reset(follow.shell);
    };
  }, [on]);
}
