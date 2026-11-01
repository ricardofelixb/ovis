/**
 * An Omarchy theme as a device's theme-set hook sends it (scripts/omarchy-theme-hook.sh): the
 * colors.toml of `~/.local/state/omarchy/current/theme`, the keys every theme Omarchy ships has.
 * The server keeps one per device and tells it to that device's browsers; a browser that follows it
 * (Settings → Appearance) is drawn in it (src/lib/omarchyTheme.ts).
 */
export const OMARCHY_COLOR_KEYS = [
  "background", "dark_background", "foreground", "bright_foreground", "accent", "selection", "muted",
  "red", "yellow", "green", "cyan", "blue", "magenta",
  "bright_red", "bright_yellow", "bright_green", "bright_cyan", "bright_blue", "bright_magenta",
] as const;

export type OmarchyColorKey = (typeof OMARCHY_COLOR_KEYS)[number];

export interface OmarchyTheme {
  /** the theme's folder name, as `theme.name` holds it ("miasma", "catppuccin-latte") */
  name: string;
  mode: "dark" | "light";
  colors: Record<OmarchyColorKey, string>;
}

/** The largest colors.toml taken: Omarchy's are under 1 KB. */
export const MAX_OMARCHY_THEME_BYTES = 16 * 1024;

const HEX = /^#[0-9a-f]{6}$/i;

/** A theme from a parsed colors.toml (or a stored one), or null when a color is missing or not `#rrggbb`. */
export function omarchyTheme(raw: unknown, name: unknown): OmarchyTheme | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const colors = {} as Record<OmarchyColorKey, string>;
  for (const key of OMARCHY_COLOR_KEYS) {
    const value = record[key];
    if (typeof value !== "string" || !HEX.test(value)) return null;
    colors[key] = value.toLowerCase();
  }
  const label = typeof name === "string" ? name.trim().slice(0, 64) : "";
  return { name: label, mode: record["mode"] === "light" ? "light" : "dark", colors };
}
