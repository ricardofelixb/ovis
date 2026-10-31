import { useState } from "react";
import { ChevronDown, MessageSquare, Monitor, SquareTerminal } from "lucide-react";

import { useT } from "../lib/i18n.ts";
import { RowMenu, type RowMenuItem } from "./RowMenu.tsx";

export type ShownView = "chat" | "terminal" | "computer";

const ICONS = { chat: MessageSquare, terminal: SquareTerminal, computer: Monitor } as const;

/**
 * The open pane's lens at the end of the header's tabs: one button that says the lens it shows and
 * opens the other two. Each pane keeps its own (lib/usePaneLens.ts, lib/computerSettings.ts).
 */
export function ViewMenu({ view, terminalAttach, onPick }: { view: ShownView; terminalAttach: boolean; onPick: (view: ShownView) => void }) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = { chat: t("Chat"), terminal: t("Terminal"), computer: t("Computer") };
  const items: RowMenuItem[] = [
    { id: "chat", label: label.chat, title: t("Chat transcript (⌘⇧J)"), icon: MessageSquare, current: view === "chat", run: () => onPick("chat") },
    { id: "terminal", label: label.terminal, title: terminalAttach ? t("Live terminal (⌘⇧J)") : t("Live terminal: coming to Windows PCs once herdr can attach there"), hint: terminalAttach ? undefined : t("soon"), icon: SquareTerminal, current: view === "terminal", run: () => onPick("terminal") },
    { id: "computer", label: label.computer, title: t("The PC's desktop"), icon: Monitor, current: view === "computer", run: () => onPick("computer") },
  ];
  const Icon = ICONS[view];
  return <>
    <button type="button" className="view-menu-button" aria-label={label[view]} title={label[view]} aria-haspopup="menu" aria-expanded={anchor !== null}
      onClick={(event) => { const target = event.currentTarget; setAnchor((open) => open ? null : target); }}>
      <Icon aria-hidden="true" />
      <ChevronDown className="view-menu-chevron" aria-hidden="true" />
    </button>
    {anchor && <RowMenu anchor={anchor} restoreFocusTo={anchor} items={items} onClose={() => setAnchor(null)} />}
  </>;
}
