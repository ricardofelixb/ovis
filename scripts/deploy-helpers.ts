/**
 * Fork only. What scripts/deploy-vps.ts needs of Ricardo's own Ovis: the steps that bring its
 * checkout to origin/main, and its plugin's settings file (`env` in its config dir).
 */

/**
 * The steps, for `&&`, that bring the checkout at `repo` to origin/main: `git pull --ff-only
 * origin main`, but only on the main branch. On another branch (a PR under test there) the pull
 * would fail, or move that branch to main; the steps stop first, changing nothing, as the
 * server's own updater does ("Switch the source checkout to main to update.").
 */
export function pullMainSteps(repo: string): string[] {
  return [
    `cd ${repo}`,
    `if [ "$(git branch --show-current)" != main ]; then echo "deploy-vps: the checkout is on '$(git branch --show-current)', not main, and only origin/main is deployed: switch it to main there first (nothing was changed)" >&2; exit 1; fi`,
    "git pull --ff-only origin main",
  ];
}

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
