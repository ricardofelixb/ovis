/**
 * The model menu's thinking level: a thin track with a stop per level the model takes. A drag
 * or a tap moves the knob and the level switches when it is let go (the native range's change
 * event), so passing a stop on the way does not switch to it. Arrow keys step and switch.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";

import "./ThinkingSlider.css";

import { useT } from "../lib/i18n.ts";

interface Props {
  levels: string[];
  /** the level pi runs at; one it does not offer the model shows the knob at the first stop */
  value: string | null;
  disabled: boolean;
  onCommit: (level: string) => void;
}

export function ThinkingSlider({ levels, value, disabled, onCommit }: Props) {
  const t = useT();
  const recorded = Math.max(0, value === null ? 0 : levels.indexOf(value));
  const [index, setIndex] = useState(recorded);
  useEffect(() => setIndex(recorded), [recorded]);
  const input = useRef<HTMLInputElement>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    const range = input.current;
    if (!range) return;
    const change = () => {
      const level = levels[Number(range.value)];
      if (level !== undefined && level !== value) commit.current(level);
    };
    range.addEventListener("change", change);
    return () => range.removeEventListener("change", change);
  }, [levels, value]);
  const last = Math.max(1, levels.length - 1);
  const shown = levels[index] ?? "";
  return (
    <div className="thinking-slider" style={{ "--fill": `${(index / last) * 100}%` } as CSSProperties}>
      <div className="thinking-slider-head">
        <span>{t("Thinking")}</span>
        <span className="thinking-slider-level">{shown}</span>
      </div>
      <div className="thinking-slider-track">
        {levels.map((level, stop) => (
          <span key={level} className={`thinking-slider-stop${stop <= index ? " is-on" : ""}`} style={{ left: `${(stop / last) * 100}%` }} aria-hidden="true" />
        ))}
        <input
          ref={input}
          type="range"
          min={0}
          max={levels.length - 1}
          step={1}
          value={index}
          disabled={disabled}
          aria-label={t("Thinking")}
          aria-valuetext={shown}
          onChange={(event) => setIndex(Number(event.currentTarget.value))}
        />
      </div>
    </div>
  );
}
