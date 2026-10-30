/**
 * Puts this checkout on Ricardo's own Ovis: the server on orgo-desktop that
 * https://orgo-desktop.tailb4e5ae.ts.net:8443 fronts (this fork only, see AGENTS.md "This fork").
 *
 * 1. builds the client (`bun run build`);
 * 2. restarts the running `bun server/managed.ts` of this checkout with the environment it ran with,
 *    since a build under a running server only gets it the "Restart it there" banner;
 * 3. waits until the server runs HEAD, then checks from omarchy that the tailnet address serves the
 *    new bundle;
 * 4. restarts the Ovis app on the Xiaomi over adb, since the Android app ignores a reload.
 *
 * Exits non-zero at the first step that fails, saying which; only a clean exit means deployed.
 * `bun scripts/deploy-orgo.ts [--no-build]`. Overrides: OVIS_DEPLOY_URL, OVIS_DEPLOY_CHECK_HOST,
 * OVIS_DEPLOY_ADB_SERIAL.
 */
import { existsSync, readFileSync, readlinkSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");
const publicUrl = process.env.OVIS_DEPLOY_URL ?? "https://orgo-desktop.tailb4e5ae.ts.net:8443/";
const checkHost = process.env.OVIS_DEPLOY_CHECK_HOST ?? "omarchy";
const adbSerial = process.env.OVIS_DEPLOY_ADB_SERIAL ?? "127.0.0.1:15421";
const androidApp = "sh.ovis.app";

function fail(message: string): never {
  console.error(`deploy-orgo: ${message}`);
  process.exit(1);
}

function run(cmd: string[], options: { env?: Record<string, string>; quiet?: boolean } = {}): { ok: boolean; out: string } {
  const result = Bun.spawnSync(cmd, { cwd: repo, env: options.env ?? process.env, stdout: options.quiet === false ? "inherit" : "pipe", stderr: options.quiet === false ? "inherit" : "pipe" });
  return { ok: result.exitCode === 0, out: `${result.stdout?.toString() ?? ""}${result.stderr?.toString() ?? ""}`.trim() };
}

async function waitFor(what: string, ms: number, done: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await done()) return;
    await Bun.sleep(250);
  }
  fail(`timed out after ${ms / 1000}s waiting for ${what}`);
}

const alive = (pid: number) => existsSync(`/proc/${pid}`);

/** The running `bun server/managed.ts` started in this checkout, if any. */
function managedServer(): number | null {
  for (const entry of readdirSync("/proc")) {
    const pid = Number(entry);
    if (!Number.isInteger(pid)) continue;
    try {
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
      if (!args.some((arg) => arg.endsWith("server/managed.ts"))) continue;
      if (readlinkSync(`/proc/${pid}/cwd`) === repo) return pid;
    } catch { /* gone, or not ours to read */ }
  }
  return null;
}

function environOf(pid: number): Record<string, string> {
  const env: Record<string, string> = {};
  for (const pair of readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")) {
    const at = pair.indexOf("=");
    if (at > 0) env[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return env;
}

const bundleOf = (html: string) => html.match(/assets\/index-[^"]+\.js/)?.[0] ?? null;

const head = run(["git", "rev-parse", "HEAD"]).out;

if (!process.argv.includes("--no-build")) {
  console.log("deploy-orgo: building the client");
  if (!run(["bun", "run", "build"], { quiet: false }).ok) fail("the build failed");
}

const old = managedServer();
if (old === null) fail(`no \`bun server/managed.ts\` runs in ${repo}; start it once by hand, then rerun`);
const env = environOf(old);
const port = env.PORT ?? "7317";
let log = "/dev/null";
try { log = readlinkSync(`/proc/${old}/fd/1`); } catch { /* keep /dev/null */ }
if (!log.startsWith("/") || log.startsWith("/dev/pts")) log = "/dev/null";

console.log(`deploy-orgo: restarting the server (pid ${old}, port ${port})`);
process.kill(old, "SIGTERM");
await waitFor("the old server to stop", 20_000, () => !alive(old));
run(["sh", "-c", "setsid nohup bun server/managed.ts >>\"$1\" 2>&1 </dev/null &", "sh", log], { env });

const local = `http://127.0.0.1:${port}/`;
await waitFor(`the server to run ${head.slice(0, 8)}`, 90_000, async () => {
  try {
    const status = await (await fetch(`${local}api/updates`)).json() as { current_revision?: string; served_revision?: string | null };
    return status.current_revision === head && !status.served_revision;
  } catch { return false; }
});
const bundle = bundleOf(await (await fetch(local)).text());
if (!bundle) fail("the server answers without a client bundle");

const remote = run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", checkHost, `curl -s --max-time 20 ${publicUrl}`]);
if (!remote.ok) fail(`could not reach ${publicUrl} from ${checkHost}: ${remote.out.slice(0, 200)}`);
if (bundleOf(remote.out) !== bundle) fail(`${checkHost} gets ${bundleOf(remote.out) ?? "no bundle"} from ${publicUrl}, not ${bundle}`);
console.log(`deploy-orgo: ${checkHost} gets ${bundle} at ${publicUrl}`);

const adbOnPath = run(["sh", "-c", "command -v adb"]).out;
const adb = adbOnPath || join(homedir(), "Android/Sdk/platform-tools/adb");
if (!existsSync(adb)) fail("no adb here: restart the Ovis app on the Xiaomi by hand (swipe it away, reopen it)");
if (run([adb, "-s", adbSerial, "get-state"]).out !== "device") run([adb, "connect", adbSerial]);
if (run([adb, "-s", adbSerial, "get-state"]).out !== "device") {
  fail(`the Xiaomi (${adbSerial}) is offline: the server is deployed, but ask Ricardo to swipe the Ovis app away and reopen it`);
}
run([adb, "-s", adbSerial, "shell", "am", "force-stop", androidApp]);
run([adb, "-s", adbSerial, "shell", "monkey", "-p", androidApp, "-c", "android.intent.category.LAUNCHER", "1"]);
await waitFor("the Ovis app to start on the Xiaomi", 15_000, () => run([adb, "-s", adbSerial, "shell", "pidof", androidApp]).ok);
console.log(`deploy-orgo: deployed ${head.slice(0, 8)}; the Xiaomi app restarted. Desktop windows only need a reload.`);
