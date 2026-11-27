import { Eye, EyeOff } from "lucide-react";
import { FORK_PANE_VIEW_PATH } from "../../../shared/fork/pane.ts";
import type { HerdrPane } from "../../../shared/protocol.ts";
import type { RowMenuItem } from "../../components/RowMenu.tsx";
import { sendJson } from "../../lib/api.ts";
import type { Translate } from "../../lib/i18n.ts";
import { hidesOn, releaseHeld } from "./hiddenAgents.ts";

type HidePane = Pick<HerdrPane, "pane_id" | "agent"> & { ovis_hidden?: true };

/**
 * An agent pane menu's Hide (or Unhide, for a hidden one), the same in every menu that lists an agent: herdr-core's PCs
 * only, refused to a watching device. The row leaves or joins the lists with the next snapshot.
 */
export function forkHideItem(machineId: string, pane: HidePane | undefined, t: Translate, watching: boolean, name?: string): RowMenuItem[] {
  if (!pane || pane.agent == null || !hidesOn(machineId)) return [];
  const hidden = pane.ovis_hidden === true;
  const label = name === undefined ? t(hidden ? "Unhide agent" : "Hide agent") : t(hidden ? "Unhide {name}" : "Hide {name}", { name });
  return [{
    // keyed by pane: a tab's menu lists its agents' items beside the selected pane's own, which it drops by id (TabStrip pickerItems)
    id: `${hidden ? "unhide" : "hide"}:${pane.pane_id}`, label, icon: hidden ? Eye : EyeOff, disabled: watching,
    run: () => {
      if (!hidden) releaseHeld(machineId, pane.pane_id);
      // POST FORK_PANE_VIEW_PATH (server/fork/pane-view.ts); a refusal leaves the row where it is
      void sendJson(FORK_PANE_VIEW_PATH, "POST", { machine_id: machineId, pane_id: pane.pane_id, hidden: !hidden }).catch(() => undefined);
    },
  }];
}

/**
 * A tab's agents, one item each: by name where the tab holds more than one, so a split tab says which agent goes, and a
 * name two of them share gets each one's place among them ("Pi (2)").
 */
export function forkHideItems<P extends HidePane>(machineId: string, panes: readonly P[], t: Translate, watching: boolean, nameOf: (pane: P) => string): RowMenuItem[] {
  const agents = panes.filter((pane) => pane.agent != null);
  if (agents.length < 2) return agents.flatMap((pane) => forkHideItem(machineId, pane, t, watching));
  const names = agents.map(nameOf);
  return agents.flatMap((pane, index) => {
    const name = names[index] ?? "";
    const shared = names.filter((other) => other === name).length > 1;
    const place = names.slice(0, index).filter((other) => other === name).length + 1;
    return forkHideItem(machineId, pane, t, watching, shared ? `${name} (${place})` : name);
  });
}
