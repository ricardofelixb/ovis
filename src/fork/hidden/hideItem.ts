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
export function forkHideItem(machineId: string, pane: HidePane | undefined, t: Translate, watching: boolean): RowMenuItem[] {
  if (!pane || pane.agent == null || !hidesOn(machineId)) return [];
  const hidden = pane.ovis_hidden === true;
  return [{
    // keyed by pane: a one-pane tab's menu lists its agent's item beside the selected pane's own, which it drops by id (TabStrip pickerItems)
    id: `${hidden ? "unhide" : "hide"}:${pane.pane_id}`, label: t(hidden ? "Unhide agent" : "Hide agent"), icon: hidden ? Eye : EyeOff, disabled: watching,
    run: () => {
      if (!hidden) releaseHeld(machineId, pane.pane_id);
      // POST FORK_PANE_VIEW_PATH (server/fork/pane-view.ts); a refusal leaves the row where it is
      void sendJson(FORK_PANE_VIEW_PATH, "POST", { machine_id: machineId, pane_id: pane.pane_id, hidden: !hidden }).catch(() => undefined);
    },
  }];
}

/** A forkHideItem's id: a split tab's menu drops the selected pane's own, since it would not say which of the tab's panes goes. */
export const isForkHideItem = (item: RowMenuItem): boolean => /^(?:un)?hide:/.test(item.id);
