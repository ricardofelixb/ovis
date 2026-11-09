import { useT } from "../lib/i18n.ts";
import { useSettings } from "../lib/settings.ts";

/** Two native pressed buttons: Tab reaches each choice; Space or Enter selects it. */
export function SidebarViewSwitch() {
  const t = useT();
  const { settings, update } = useSettings();
  return <div className="segmented sidebar-view-switch" role="group" aria-label={t("Terminal view")}>
    <button type="button" aria-pressed={settings.sidebarView === "coding"} onClick={() => update({ sidebarView: "coding" })}>{t("Coding")}</button>
    <button type="button" aria-pressed={settings.sidebarView === "work"} onClick={() => update({ sidebarView: "work" })}>{t("Work")}</button>
  </div>;
}
