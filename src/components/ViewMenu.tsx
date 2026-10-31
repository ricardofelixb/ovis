import { useState } from "react";
import { ChevronDown, MessageSquare, SquareTerminal } from "lucide-react";

import { useT } from "../lib/i18n.ts";
import { RowMenu, type RowMenuItem } from "./RowMenu.tsx";

type PaneView = "chat" | "terminal";

/**
 * The open pane's lens at the end of the header's tabs: one button that says the lens it shows and
 * opens both (⌘⇧J flips them). `covered` while a PC's desktop covers the pane area: neither is
 * current, and a pick shows the pane again. Each pane keeps its own lens (lib/usePaneLens.ts).
 */
export function ViewMenu({ view, covered, terminalAttach, onPick }: { view: PaneView; covered: boolean; terminalAttach: boolean; onPick: (view: PaneView) => void }) {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const label = { chat: t("Chat"), terminal: t("Terminal") };
  const items: RowMenuItem[] = [
    { id: "chat", label: label.chat, title: t("Chat transcript (⌘⇧J)"), icon: MessageSquare, current: !covered && view === "chat", run: () => onPick("chat") },
    { id: "terminal", label: label.terminal, title: terminalAttach ? t("Live terminal (⌘⇧J)") : t("Live terminal: coming to Windows PCs once herdr can attach there"), hint: terminalAttach ? undefined : t("soon"), icon: SquareTerminal, current: !covered && view === "terminal", run: () => onPick("terminal") },
  ];
  const Icon = view === "chat" ? MessageSquare : SquareTerminal;
  return <>
    <button type="button" className="view-menu-button" data-covered={covered || undefined} aria-label={label[view]} title={label[view]} aria-haspopup="menu" aria-expanded={anchor !== null}
      onClick={(event) => { const target = event.currentTarget; setAnchor((open) => open ? null : target); }}>
      <Icon aria-hidden="true" />
      <ChevronDown className="view-menu-chevron" aria-hidden="true" />
    </button>
    {anchor && <RowMenu anchor={anchor} restoreFocusTo={anchor} title={t("View")} items={items} onClose={() => setAnchor(null)} />}
  </>;
}
