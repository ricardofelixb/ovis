import type { CSSProperties } from "react";
import { useT } from "../lib/i18n.ts";
import type { SplitDrop } from "../lib/split.ts";
import "./SplitDropPreview.css";

/** A guide over the pane area; it never takes a drag, focus or space from the terminals. Its
 *  highlight is where the pane would be drawn: the column it opens in, or a new column's place. */
export function SplitDropPreview({ visible, columns, drop }: { visible: boolean; columns: number; drop: SplitDrop | null }) {
  const t = useT();
  const count = drop?.insert ? columns + 1 : columns;
  const place = drop ? { "--drop-at": drop.index, "--drop-count": count } as CSSProperties : undefined;
  // the side of the area the highlight is on: with two columns, the half it was always named by
  const side = drop === null ? undefined : drop.index === 0 ? "left" : drop.index === count - 1 ? "right" : "middle";
  return <div className={`split-drop${visible ? " is-visible" : ""}`} data-side={side} style={place} aria-hidden="true">
    <div className="split-drop-track">
      <div className="split-drop-target" />
      {columns > 1 ? Array.from({ length: columns }, (_, index) => <div key={index} className="split-drop-column" />) : <>
        <div className="split-drop-column"><span className="split-drop-label">{t("Drop on the left")}</span></div>
        <div className="split-drop-column"><span className="split-drop-label">{t("Drop on the right")}</span></div>
      </>}
    </div>
  </div>;
}
