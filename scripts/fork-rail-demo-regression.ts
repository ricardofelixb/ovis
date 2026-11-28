/** Navigation → Rail over the demo, never a live session: the rail beside the workspaces sidebar. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import panes from "../site/demo/fixtures/panes.json";
import { withDemoBrowser, type DemoBrowserSession } from "./demo-browser.ts";
import { serveDemo } from "./demo-server.ts";

// Headless Chrome has no notch: the served CSS gets a 28px top inset in its place, as a landscape phone has.
const SAFE_TOP = 28;
const shots = process.env["QA_SHOTS"];
if (shots) mkdirSync(shots, { recursive: true });

async function open({ newContext, baseUrl }: DemoBrowserSession, viewport: { width: number; height: number }, theme: "dark" | "light", path: string, run: (page: Page) => Promise<void>): Promise<void> {
  const context = await newContext({ viewport, isMobile: true, hasTouch: true });
  try {
    await context.addInitScript((theme) => {
      localStorage.setItem("ovis:settings", JSON.stringify({ language: "en", alertsOn: false, theme }));
      localStorage.setItem("ovis:fork-settings", JSON.stringify({ navigation: "rail", pullRequests: true, notes: true }));
    }, theme);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}${path}`);
    await run(page);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

/** The rail's surface at its top-left corner, under the top inset, and its first button's top. */
const railTop = (page: Page, rail: string) => page.evaluate((rail) => {
  const node = document.querySelector(rail)!;
  const box = node.getBoundingClientRect();
  const under = document.elementFromPoint(box.x + 2, 2);
  return { top: box.y, corner: under?.closest(rail) === node, button: node.querySelector("button")!.getBoundingClientRect().y };
}, rail);

await withDemoBrowser({
  tempPrefix: "ovis-fork-rail-demo-",
  serve(app) {
    for (const file of readdirSync(app, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".css"))) {
      const path = join(app, file);
      writeFileSync(path, readFileSync(path, "utf8").replace(/env\(safe-area-inset-top(?:,\s*0(?:px)?)?\)/g, `${SAFE_TOP}px`));
    }
    return serveDemo(app);
  },
}, async (session) => {
  const landscape = { width: 844, height: 390 };
  for (const theme of ["dark", "light"] as const) {
    let inbox = 0;
    await open(session, landscape, theme, "?app=inbox", async (page) => {
      await page.locator(".inbox-column .inbox-rail").waitFor();
      inbox = (await railTop(page, ".inbox-column .inbox-rail")).button;
      const selector = '.inbox-rail-item[aria-current="page"]';
      const current = page.locator(selector);
      await current.waitFor();
      const fill = () => current.evaluate((button) => getComputedStyle(button).backgroundColor);
      const transparent = "rgba(0, 0, 0, 0)";
      assert.equal(await fill(), transparent, `${theme}: Rail marks the current place with its glyph, not a fill`);
      await current.hover();
      assert.equal(await fill(), transparent, `${theme}: hovering does not fill the current place`);
      await page.mouse.down();
      await page.waitForFunction(([selector, transparent]) => getComputedStyle(document.querySelector(selector)!).backgroundColor !== transparent, [selector, transparent] as const);
      await page.mouse.move(700, 300);
      await page.mouse.up();
    });
    await open(session, landscape, theme, `?pane=${encodeURIComponent(panes.api)}`, async (page) => {
      const rail = ".sidebar:not(.inbox-column) > .inbox-rail";
      await page.locator(rail).waitFor();
      const top = await railTop(page, rail);
      assert.ok(top.corner, `${theme}: the rail's surface reaches the window's top over the ${SAFE_TOP}px inset, not the header's (the rail starts at ${top.top})`);
      assert.equal(top.button, inbox, `${theme}: the rail's first button stands where it stands in the inbox's rail`);
      if (shots) await page.screenshot({ path: join(shots, `rail-landscape-${theme}.png`) });
    });
    console.log(`PASS ${theme}: at 844 by 390 under a ${SAFE_TOP}px top inset the rail beside the workspaces covers the header's top corner, its first button at ${inbox}px as in the inbox`);

    // A phone has no rail: under Rail its drawer is Default's, with upstream's Inbox in the foot.
    await open(session, { width: 390, height: 844 }, theme, `?pane=${encodeURIComponent(panes.api)}`, async (page) => {
      await page.getByRole("button", { name: "Open workspace list", exact: true }).click();
      const drawer = page.locator("#workspace-drawer.is-open");
      await drawer.waitFor();
      await drawer.locator(".sidebar-footer-inbox").waitFor();
      assert.equal(await page.locator(".inbox-rail").count(), 0, `${theme}: a phone draws no rail`);
      for (const name of ["Workspace list", "Agent inbox", "Pull requests", "Notes"]) assert.equal(await drawer.locator(".sidebar-footer").getByRole("button", { name, exact: true }).count(), 0, `${theme}: the drawer's foot has no ${name} place`);
      await drawer.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
      if (shots) await page.screenshot({ path: join(shots, `rail-phone-drawer-${theme}.png`) });
      await drawer.locator(".sidebar-footer-inbox").click();
      for (const name of ["Notes", "Pull requests"]) await page.locator(".mode-inbox .inbox-top").getByRole("button", { name, exact: true }).waitFor();
    });
    console.log(`PASS ${theme}: at 390 by 844 under Rail the drawer is Default's, upstream's Inbox in its foot and no rail or place icons, and the inbox's top row opens Notes and Pull requests`);
  }
});
