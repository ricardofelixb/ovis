import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * The Computer view's settings for one PC, kept in this browser only: a phone and a desktop want their own
 * sharpness and cursor, so these stay out of the settings Ovis shares between browsers. The viewer
 * (screen-here's) applies them; see its `options`.
 */
export interface ComputerSettings {
  /** resize the PC's desktop to the view, or keep its size and scale it to fit */
  fit: "resize" | "scale";
  /** device pixels per CSS pixel a resized desktop gets at most */
  sharpness: "1" | "1.5" | "2";
  /** percent a resized desktop draws its text and windows at: less shows more of it */
  zoom: "100" | "75" | "50";
  quality: "low" | "medium" | "high";
  /** on a touch screen: a trackpad, or a tap clicks where it lands */
  cursor: "trackpad" | "direct";
  speed: "slow" | "normal" | "fast";
  sound: boolean;
  /** minutes the view stays connected out of sight after Chat or Terminal is picked */
  keep: "0" | "2" | "5" | "10";
}

// A phone's desktop, the size of the phone, gets more room at 75%; a desktop's has room enough at 100%
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
export const COMPUTER_DEFAULTS: ComputerSettings = {
  fit: "resize", sharpness: "1.5", zoom: coarse ? "75" : "100", quality: "medium", cursor: "trackpad", speed: "normal", sound: true, keep: "2",
};

const CHOICES: { [K in keyof ComputerSettings]: readonly ComputerSettings[K][] } = {
  fit: ["resize", "scale"], sharpness: ["1", "1.5", "2"], zoom: ["100", "75", "50"], quality: ["low", "medium", "high"], cursor: ["trackpad", "direct"],
  speed: ["slow", "normal", "fast"], sound: [true, false], keep: ["0", "2", "5", "10"],
};

const key = (machineId: string): string => `ovis:computer:${encodeURIComponent(machineId)}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; settings: ComputerSettings }>();

/** What this browser keeps for the PC, a value at a time: one it doesn't know falls back to the default. */
export function readComputerSettings(machineId: string): ComputerSettings {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key(machineId));
  } catch { /* no storage: the defaults */ }
  const cached = cache.get(machineId);
  if (cached && cached.raw === raw) return cached.settings;
  let stored: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (value && typeof value === "object") stored = value as Record<string, unknown>;
  } catch { /* corrupt: the defaults */ }
  const settings = { ...COMPUTER_DEFAULTS };
  for (const name of Object.keys(CHOICES) as (keyof ComputerSettings)[]) {
    if ((CHOICES[name] as readonly unknown[]).includes(stored[name])) (settings as Record<string, unknown>)[name] = stored[name];
  }
  cache.set(machineId, { raw, settings });
  return settings;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const other = (event: StorageEvent): void => { if (event.key?.startsWith("ovis:computer:")) listener(); };
  addEventListener("storage", other);
  return () => {
    listeners.delete(listener);
    removeEventListener("storage", other);
  };
}

export function useComputerSettings(machineId: string): [ComputerSettings, (patch: Partial<ComputerSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, () => readComputerSettings(machineId));
  const update = useCallback((patch: Partial<ComputerSettings>) => {
    try {
      localStorage.setItem(key(machineId), JSON.stringify({ ...readComputerSettings(machineId), ...patch }));
    } catch { /* full or blocked: nothing is kept */ }
    for (const listener of listeners) listener();
  }, [machineId]);
  return [settings, update];
}

/** The settings as the viewer takes them, in its address's #fragment and in each change posted to it. */
export function viewerOptions(settings: ComputerSettings): Record<string, unknown> {
  return { fit: settings.fit, sharpness: Number(settings.sharpness), zoom: Number(settings.zoom) / 100, quality: settings.quality, cursor: settings.cursor, speed: settings.speed, sound: settings.sound };
}

/**
 * Whether the Computer view is open, and whether it is kept connected out of sight: for the minutes its
 * settings give after it closes (2 by default), so coming back within them needs no new connection.
 */
export function useComputerView(machineId: string): [open: boolean, setOpen: (open: boolean) => void, kept: boolean] {
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(false);
  useEffect(() => {
    if (open) {
      setKept(true);
      return;
    }
    const timer = setTimeout(() => setKept(false), Number(readComputerSettings(machineId).keep) * 60_000);
    return () => clearTimeout(timer);
  }, [open, machineId]);
  return [open, setOpen, kept];
}
