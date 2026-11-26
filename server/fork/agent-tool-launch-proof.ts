import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Whether a Linux process's environment names this run's token file, as both launch paths set it
 * (`OVIS_AGENT_TOKEN_FILE`). pi, OmO and Claude Code set process.title, which rewrites their
 * /proc/<pid>/cmdline to their name alone and hides the launch argv; the environment stays. An
 * environment that cannot be read proves nothing.
 */
export function launchedWithToken(pid: number | undefined, dir: string, id: string): boolean {
  if (process.platform !== "linux" || pid === undefined) return false;
  const entry = `OVIS_AGENT_TOKEN_FILE=${join(dir, "tokens", `${id}.token`)}`;
  try { return readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").includes(entry); } catch { return false; }
}
