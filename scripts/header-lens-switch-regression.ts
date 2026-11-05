/** More holds the Terminal switch on desktop and touch; the old header toggle is gone. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "playwright-core";
import { workspaceClose, workspaceCreate } from "../server/herdr/client.ts";
import { chromePath } from "./chrome-path.ts";
import { pickLens, shownLens, VIEW_BUTTON } from "./view-toggle.ts";

async function checkTabSurface(page: Page): Promise<void> {
  await page.locator(".header-tabs .tab-strip-add").waitFor();
  const backgrounds = await page.locator(".header-tabs .tab-strip-row, .header-tabs .tab-strip, .header-tabs .tab-strip-add")
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
  assert.deepEqual(backgrounds, Array(3).fill("rgba(0, 0, 0, 0)"), "the tabs and + share the header's surface, without an opaque band");
  assert.equal(await page.locator(".header-tabs .tab-strip .tab-strip-add").count(), 0, "the + sits outside the scrolling tabs so it needs no opaque cover");
}

export async function checkHeaderLensSwitch(browser: Browser, origin: string, evidence?: string): Promise<void> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ovis-lens-switch-")));
  let workspaceId: string | null = null;
  try {
    const created = await workspaceCreate({ cwd: root, label: "ovis-test-lens-switch" });
    workspaceId = created.workspace.workspace_id;
    for (const width of [390, 412, 720, 1280]) {
      const touch = width < 769;
      const sheet = width <= 640;
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: touch, hasTouch: touch, locale: "en-US" });
      try {
        await context.addInitScript(() => {
          if (!localStorage.getItem("ovis:settings")) localStorage.setItem("ovis:settings", JSON.stringify({ language: "en" }));
        });
        const page = await context.newPage();
        await page.goto(`${origin}/?pane=${encodeURIComponent(created.root_pane.pane_id)}`);
        await page.locator(VIEW_BUTTON).waitFor();
        assert.equal(await page.locator(".app-header .view-toggle").count(), 0, "the old header toggle is removed");
        await pickLens(page, "chat", { tap: touch });
        await checkTabSurface(page);
        if (touch) await page.locator(".drawer-toggle").click();
        const sidebarMenu = page.locator(".sidebar-row-action.row-menu-toggle").first();
        await sidebarMenu.waitFor({ state: "attached" });
        if (touch) assert.equal(await sidebarMenu.isVisible(), true, "the phone drawer shows its row menus");
        assert.deepEqual(await sidebarMenu.evaluate((button) => {
          const style = getComputedStyle(button);
          return { border: style.borderTopWidth, background: style.backgroundColor };
        }), { border: "0px", background: "rgba(0, 0, 0, 0)" }, "sidebar menu triggers stay borderless and transparent, not styled as switches");
        if (touch) await page.locator(".drawer-toggle").click();
        await page.locator(VIEW_BUTTON).click();
        const menu = page.locator(sheet ? ".row-sheet" : ".row-menu");
        const toggle = menu.locator("button:has(.row-menu-switch-track)");
        await toggle.waitFor();
        assert.equal(await toggle.getAttribute(sheet ? "aria-pressed" : "aria-checked"), "false", "Chat means Terminal is off");
        const bounds = await toggle.boundingBox();
        if (sheet) assert.ok(bounds && bounds.height >= 44, "the sheet switch has a finger-sized target");
        if (evidence) await page.screenshot({ path: join(evidence, `terminal-menu-${width}.png`) });
        await toggle.press("Space");
        await menu.waitFor({ state: "detached" });
        await page.locator(`${VIEW_BUTTON}[data-view="terminal"]`).waitFor();
        assert.equal(await shownLens(page), "terminal");
        await checkTabSurface(page);
        await page.reload();
        await page.locator(`${VIEW_BUTTON}[data-view="terminal"]`).waitFor();
        await page.locator(VIEW_BUTTON).click();
        await toggle.waitFor();
        assert.equal(await toggle.getAttribute(sheet ? "aria-pressed" : "aria-checked"), "true", "the switch remembers Terminal");
        await page.keyboard.press("Escape");
        assert.equal(await shownLens(page), "terminal", "dismissing More does not change the lens");
        await page.keyboard.press("ControlOrMeta+Shift+J");
        await page.locator(`${VIEW_BUTTON}[data-view="chat"]`).waitFor();
      } finally { await context.close(); }
    }
    console.log("PASS Terminal switch in More, keyboard and touch, persisted selection and shortcut at 390, 412, 720 and 1280px");
  } finally {
    if (workspaceId) await workspaceClose(workspaceId).catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await import("./test-herdr.ts");
  const { chromium } = await import("playwright-core");
  const { createServer } = await import("../server/index.ts");
  const { UsageService } = await import("../server/usage.ts");
  const state = mkdtempSync(join(tmpdir(), "ovis-lens-switch-state-"));
  const evidence = process.env["UI_EVIDENCE_DIR"];
  if (evidence) mkdirSync(evidence, { recursive: true });
  const server = createServer({ port: 0, hostname: "127.0.0.1", token: "", stateDir: state, usage: new UsageService(undefined, []) });
  const browser = await chromium.launch({ executablePath: chromePath(), headless: true, args: ["--no-sandbox"] });
  try { await checkHeaderLensSwitch(browser, `http://127.0.0.1:${server.port}`, evidence); }
  finally { await browser.close(); server.stop(); rmSync(state, { recursive: true, force: true }); }
}
