/**
 * Columns gliding to where a split change put them: their places are read before the change, and
 * once the new layout is drawn each column starts at its old place and slides to its new one, while
 * a new column fades in. A column stays the same element throughout (the split changes only its
 * CSS order), so its terminal or chat keeps running while it moves. Reduced motion skips it.
 */

const MOTION_MS = 200;
const EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

function drawnColumns(area: HTMLElement | null): HTMLElement[] {
  return area ? [...area.querySelectorAll<HTMLElement>(".pane-slot[data-slot]")] : [];
}

/** Where each drawn column's left edge is, by its slot: a hidden one is left out. */
export function columnPlaces(area: HTMLElement | null): Map<string, number> {
  const places = new Map<string, number>();
  for (const column of drawnColumns(area)) {
    const box = column.getBoundingClientRect();
    if (box.width > 0) places.set(column.dataset.slot!, box.left);
  }
  return places;
}

/** Slides each drawn column from its place in `before` to where it is now; one not in it fades in. */
export function slideColumns(area: HTMLElement | null, before: ReadonlyMap<string, number>): void {
  if (typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const column of drawnColumns(area)) {
    const box = column.getBoundingClientRect();
    if (box.width === 0 || typeof column.animate !== "function") continue;
    const from = before.get(column.dataset.slot!);
    if (from === undefined) column.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MOTION_MS, easing: EASING });
    else if (Math.abs(from - box.left) >= 1) column.animate([{ transform: `translateX(${from - box.left}px)` }, { transform: "none" }], { duration: MOTION_MS, easing: EASING });
  }
}
