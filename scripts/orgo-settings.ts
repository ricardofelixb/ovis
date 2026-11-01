/** Fork only. The plugin's settings file (`env` in its config dir) of Ricardo's own Ovis, as scripts/deploy-orgo.ts keeps it. */

/**
 * `text`, a file of `KEY=value` lines, with `name` set to `value`: each line that sets it changed in
 * place (the plugin reads the last one), or one added after the others. Comments and the other
 * lines stay as they are.
 */
export function withSetting(text: string, name: string, value: string): string {
  const line = `${name}=${value}`;
  const lines = text.split("\n");
  const sets = (candidate: string) => candidate.trim().split("=")[0]!.trim() === name;
  if (lines.some(sets)) return lines.map((candidate) => (sets(candidate) ? line : candidate)).join("\n");
  return `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`;
}
