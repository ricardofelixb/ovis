import { expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunStore } from "../agent-tools/runs.ts";

// pi, OmO and Claude Code set process.title, which rewrites /proc/<pid>/cmdline to their name alone:
// a restart must still keep the run its launch environment names (devswha/ovis #4628).
it.skipIf(process.platform !== "linux")("a TUI whose title hides its launch argv keeps the run its environment names across a restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "runs-"));
  const tuis: ReturnType<typeof Bun.spawn>[] = [];
  try {
    const store = new RunStore(dir);
    const [kept, wrong, none] = ["t1", "t2", "t3"].map(self => {
      const run = store.reserve();
      run.bind({ self, harness: "pi", started_by: null, root: run.id, depth: 0 });
      return run;
    });
    const env = (tokenFile?: string) => {
      const { OVIS_AGENT_TOKEN_FILE: _, ...rest } = process.env;
      return tokenFile ? { ...rest, OVIS_AGENT_TOKEN_FILE: tokenFile } : rest;
    };
    for (const [run, tokenFile] of [[kept!, kept!.tokenFile], [wrong!, kept!.tokenFile], [none!, undefined]] as const) {
      const tui = Bun.spawn(["sleep", "30"], { env: env(tokenFile) });
      tuis.push(tui);
      store.rememberForeground(run.id, tui.pid);
    }
    mkdirSync(join(dir, "mcp"), { recursive: true });
    for (const run of [kept!, wrong!, none!]) writeFileSync(join(dir, "mcp", `${run.id}.js`), "export default () => {};\n");
    const tokens = [kept!, wrong!, none!].map(run => readFileSync(run.tokenFile, "utf8"));
    const restored = new RunStore(dir);
    restored.reconcile(tuis.map((tui, i) => ({ address: `t${i + 1}`, state: "live", labels: {}, foreground: { pid: tui.pid, argv: ["pi"] } })), () => undefined);
    expect(restored.verify(tokens[0]!)).toMatchObject({ self: "t1", harness: "pi" });
    expect(existsSync(kept!.tokenFile)).toBe(true);
    expect(existsSync(join(dir, "mcp", `${kept!.id}.js`))).toBe(true);
    for (const [i, run] of [[1, wrong!], [2, none!]] as const) {
      expect(restored.verify(tokens[i]!)).toBeNull();
      expect(existsSync(run.tokenFile)).toBe(false);
      expect(existsSync(join(dir, "mcp", `${run.id}.js`))).toBe(false);
    }
  } finally {
    for (const tui of tuis) tui.kill();
    await Promise.all(tuis.map(tui => tui.exited));
    rmSync(dir, { recursive: true, force: true });
  }
});
