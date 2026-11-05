import { afterEach, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureSourceBundle } from "./source-bundle.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ovis-source-build-")); roots.push(root);
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts/build-remote-bundle.ts"), "stand-in");
  const publish = (platform: string, revision: string) => {
    writeFileSync(join(root, "remote-bundles/bundle.tgz"), "stand-in");
    writeFileSync(join(root, `remote-bundles/manifest-${platform}.json`), JSON.stringify({ version: "42", revision, assets: { [platform]: { url: "bundle.tgz" } } }));
  };
  return { root, publish };
}

it("builds a stale bundle once for concurrent reconnects, and reuses it", async () => {
  const { root, publish } = fixture();
  mkdirSync(join(root, "remote-bundles")); publish("linux-x64", "old");
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const options = { root, version: "current", build: async (platform: string) => { calls++; await gate; publish(platform, "current"); } };
  const first = ensureSourceBundle("linux-x64", options);
  const second = ensureSourceBundle("linux-x64", options);
  release();
  await Promise.all([first, second]);
  expect(calls).toBe(1);
  await ensureSourceBundle("linux-x64", options);
  expect(calls).toBe(1);
});

it("retries failed builds and refuses a build with the wrong identity", async () => {
  const { root, publish } = fixture();
  await expect(ensureSourceBundle("darwin-arm64", { root, version: "new", build: async () => { throw new Error("build failed"); } })).rejects.toThrow("build failed");
  await expect(ensureSourceBundle("darwin-arm64", { root, version: "new", build: async (platform) => publish(platform, "old") })).rejects.toThrow("matching bridge bundle");
  await ensureSourceBundle("darwin-arm64", { root, version: "new", build: async (platform) => publish(platform, "new") });
});

it("does not build from a packaged runtime or accept a platform as shell input", async () => {
  const { root } = fixture();
  rmSync(join(root, "scripts"), { recursive: true });
  let calls = 0;
  await ensureSourceBundle("linux-x64", { root, build: async () => { calls++; } });
  expect(calls).toBe(0);
  await expect(ensureSourceBundle("../linux-x64", { root })).rejects.toThrow("Unsupported bundle platform");
});
