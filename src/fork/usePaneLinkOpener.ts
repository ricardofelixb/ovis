import { useCallback } from "react";
import { LOCAL_MACHINE, type Machine } from "../../shared/machines.ts";
import { openExternal } from "../lib/externalLink.ts";
import { remotePcUrl, type WebPanelOpener } from "../lib/webPanel.ts";

/** The panel frames this PC only. Open a remote PC's loopback link in a tab on its SSH host. */
export function usePaneLinkOpener(machines: readonly Pick<Machine, "id" | "target">[], openWebPage: WebPanelOpener): WebPanelOpener {
  return useCallback<WebPanelOpener>((uri, shiftKey, machineId) => {
    const remote = machineId === LOCAL_MACHINE ? null : remotePcUrl(uri, machines.find((item) => item.id === machineId)?.target?.destination);
    if (remote === null) return openWebPage(uri, shiftKey, machineId);
    openExternal(remote, "link", false);
    return true;
  }, [machines, openWebPage]);
}
