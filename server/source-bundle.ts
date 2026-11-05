/** Source installs build bridge bundles on demand. Packaged installs and configured manifests never build. */
import { access, mkdir, readFile } from "node:fs/promises";
import { closeSync, openSync } from "node:fs";
import { join, resolve } from "node:path";
import { REMOTE_BUNDLE_VERSION, sourceBundleVersion } from "./bundle-version.ts";

interface SourceBundleOptions {
  root?: string;
  version?: string;
  build?(platform: string, root: string): Promise<void>;
}
const builds = new Map<string, Promise<void>>();

async function buildBundle(platform: string, root: string): Promise<void> {
  const log = join(root, "remote-bundles", `build-${platform}.log`);
  const fd = openSync(log, "w", 0o600);
  try {
    const child = Bun.spawn([process.execPath, "run", "build:remote", platform], { cwd: root, stdin: "ignore", stdout: fd, stderr: fd });
    const timer = setTimeout(() => child.kill(), 15 * 60_000);
    try {
      if (await child.exited !== 0) throw new Error(`Building the ${platform} bridge failed; see ${log}`);
    } finally { clearTimeout(timer); }
  } finally { closeSync(fd); }
}

/** Missing or stale local bundles are built once per platform even when several machines reconnect together. */
export async function ensureSourceBundle(platform: string, options: SourceBundleOptions = {}): Promise<void> {
  if (!/^((linux|darwin)-(x64|arm64)|win32-x64)$/.test(platform)) throw new Error(`Unsupported bundle platform: ${platform}`);
  const root = options.root ?? resolve(import.meta.dir, "..");
  // No source builder in remote runtimes. Never bootstrap builds by installing software or dependencies.
  try { await access(join(root, "scripts/build-remote-bundle.ts")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  const version = options.version ?? REMOTE_BUNDLE_VERSION;
  const manifest = join(root, "remote-bundles", `manifest-${platform}.json`);
  const ready = async (): Promise<boolean> => {
    try {
      const parsed = JSON.parse(await readFile(manifest, "utf8")) as { revision?: unknown; assets?: Record<string, { url?: unknown }> };
      const url = parsed.assets?.[platform]?.url;
      if (parsed.revision !== version || typeof url !== "string" || !/^[\w.-]+\.tgz$/.test(url)) return false;
      await access(join(root, "remote-bundles", url));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return false;
      throw error;
    }
  };
  if (await ready()) return;
  const key = `${root}\0${version}\0${platform}`;
  let running = builds.get(key);
  if (!running) {
    running = (async () => {
      if (await ready()) return;
      if (!options.build && sourceBundleVersion(root) !== version) throw new Error("The server's source changed; restart Ovis before building bridge bundles");
      await mkdir(join(root, "remote-bundles"), { recursive: true });
      await (options.build ?? buildBundle)(platform, root);
      if (!await ready()) throw new Error(`The ${platform} build did not produce a matching bridge bundle`);
    })().finally(() => builds.delete(key));
    builds.set(key, running);
  }
  await running;
}
