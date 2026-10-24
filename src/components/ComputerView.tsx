import { useEffect, useState } from "react";
import { t } from "../lib/i18n.ts";
import "./ComputerView.css";

type Screen = { path: string } | { error: string } | null;

/**
 * The Computer view: the PC's desktop, live, over the pane's Chat or Terminal, which stay connected
 * under it. The server opens screen-here's bridge to that PC (server/screen.ts) and passes on its
 * viewer, which carries the desktop, its sound and a login when the PC asks for one.
 */
export function ComputerView({ machineId, machineName }: { machineId: string; machineName: string }) {
  const [screen, setScreen] = useState<Screen>(null);
  useEffect(() => {
    let live = true;
    setScreen(null);
    void fetch("/api/screen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ machine_id: machineId }), credentials: "same-origin" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { path?: string; error?: { message?: string } } | null;
        if (!live) return;
        setScreen(response.ok && body?.path ? { path: body.path } : { error: body?.error?.message ?? t("This PC's desktop can't be shown.") });
      })
      .catch(() => { if (live) setScreen({ error: t("This PC's desktop can't be shown.") }); });
    return () => { live = false; };
  }, [machineId]);

  if (screen === null) return <div className="computer-view is-message">{t("Connecting…")}</div>;
  if ("error" in screen) return <div className="computer-view is-message" role="alert">{screen.error}</div>;
  return <iframe className="computer-view" src={screen.path} title={t("{name}'s desktop", { name: machineName })} allow="autoplay; clipboard-read; clipboard-write" />;
}
