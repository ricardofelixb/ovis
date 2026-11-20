import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { useSettings } from "../../lib/settings.ts";

/** Minutes the view stays connected out of sight after Chat or Terminal is picked, so coming back needs no new connection. */
const KEEP_MINUTES = 2;

// Logins an older Computer view kept on this device; it no longer reads or writes them, only wipes them.
const LOGIN_PREFIX = "ovis:computer-login:";

/** On sign-out: no PC's login stays on a device that is no longer signed in. */
export function forgetComputerLogins(): void {
  try {
    for (const name of Object.keys(localStorage)) if (name.startsWith(LOGIN_PREFIX)) localStorage.removeItem(name);
  } catch { /* no storage: nothing was kept */ }
}

/**
 * Which PC's desktop is shown over the pane area, opened from that PC's sidebar header (null: none), and
 * which one is kept connected out of sight for a few minutes after it closes.
 */
export function useComputerView(): [shown: string | null, show: Dispatch<SetStateAction<string | null>>, kept: string | null] {
  const { settings } = useSettings();
  const [shown, setShown] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  useEffect(() => {
    if (shown !== null) {
      setKept(shown);
      return;
    }
    if (kept === null) return;
    const timer = setTimeout(() => setKept(null), KEEP_MINUTES * 60_000);
    return () => clearTimeout(timer);
  }, [shown, kept]);
  useEffect(() => { if (!settings.computerView) { setShown(null); setKept(null); } }, [settings.computerView]);
  return [settings.computerView ? shown : null, setShown, settings.computerView ? kept : null];
}
