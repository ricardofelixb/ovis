/** Fork only. The plugin's settings file (`env` in its config dir) of Ricardo's own Ovis, as scripts/deploy-orgo.ts keeps it. */

/**
 * `text`, a file of `KEY=value` lines, with `name` set to `value`: its line changed in place, or
 * added after the others. Comments and the other lines stay as they are.
 */
export function withSetting(text: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  const lines = text.split("\n");
  const at = lines.findIndex((candidate) => candidate.trim().split("=")[0]!.trim() === name);
  if (at >= 0) {
    if (lines[at] !== line) lines[at] = line;
    return lines.join("\n");
  }
  return `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`;
}
