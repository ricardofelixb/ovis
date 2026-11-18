import { BellOff } from "lucide-react";
import { useT } from "../lib/i18n.ts";
import { useSettings } from "../lib/settings.ts";
import { SettingsRow, Toggle } from "./SettingsControls.tsx";

export function MuteHelpersRow() {
  const { settings, update } = useSettings();
  const t = useT();
  return (
    <SettingsRow icon={BellOff} label={t("Mute helpers")} reset={["muteHelpers"]} condition={<span className="settings-condition">{t("On every device, agents another agent started send no alerts; the one that started them still does.")}</span>} description={t("On every device, a helper (an agent another agent started) sends no alert, push, notification or sound. The agent that started it still alerts. Only herdr-core tells helpers apart.")}>
      <Toggle label={t("Mute helpers")} checked={settings.muteHelpers} onChange={(muteHelpers) => update({ muteHelpers })} />
    </SettingsRow>
  );
}
