import { MessageSquare, SquareTerminal } from "lucide-react";

import { useT } from "../lib/i18n.ts";

type PaneView = "chat" | "terminal";

/**
 * The open pane's lens at the end of the header's tabs: one button with both lenses, the shown one lit,
 * that flips to the other (⌘⇧J). `view` is null while a PC's desktop covers the pane area: neither is lit,
 * and a press shows the pane again. Each pane keeps its own lens (lib/usePaneLens.ts).
 */
export function ViewToggle({ view, terminalAttach, onPick }: { view: PaneView | null; terminalAttach: boolean; onPick: (view: PaneView) => void }) {
  const t = useT();
  const next: PaneView = view === null ? "chat" : view === "chat" ? "terminal" : "chat";
  const disabled = next === "terminal" && !terminalAttach;
  const title = next === "terminal"
    ? terminalAttach ? t("Live terminal (⌘⇧J)") : t("Live terminal: coming to Windows PCs once herdr can attach there")
    : t("Chat transcript (⌘⇧J)");
  return <button type="button" className="view-toggle" aria-label={next === "terminal" ? t("Terminal") : t("Chat")} title={title} aria-disabled={disabled || undefined}
    onClick={() => { if (!disabled) onPick(next); }}>
    <MessageSquare className={view === "chat" ? "is-shown" : undefined} aria-hidden="true" />
    <SquareTerminal className={view === "terminal" ? "is-shown" : undefined} aria-hidden="true" />
  </button>;
}
