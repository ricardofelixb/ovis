import assert from "node:assert/strict";
import panes from "../site/demo/fixtures/panes.json";
import { appFaces } from "./app-faces.ts";
import { withDemoBrowser, type DemoBrowserSession } from "./demo-browser.ts";

// With Square corners on, the fork's header tabs stand on the strip's bottom edge. The + (and More)
// kept upstream's centring, so the + floated a few pixels above the tab it belongs to. On the demo
// app at a desktop's width, the active tab and the + share one vertical middle with the setting off
// and on. All files and HTTP traffic stay in this disposable, loopback-only app.
const PANE = panes.api;

async function check({ newContext, baseUrl }: DemoBrowserSession, squareCorners: boolean): Promise<void> {
  const context = await newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await context.addInitScript((square) => localStorage.setItem("ovis:settings", JSON.stringify({ language: "en", alertsOn: false, squareCorners: square })), squareCorners);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}?pane=${encodeURIComponent(PANE)}`);
    await page.locator(".conn-live").waitFor({ state: "attached" });
    await page.locator(".header-tabs .tab-strip-item").first().waitFor();
    await appFaces(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset["forkSquareCorners"]), String(squareCorners));
    const middle = (selector: string) => page.locator(selector).first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    const tab = await middle(".header-tabs .tab-strip-item.is-active");
    const add = await middle(".header-tabs .tab-strip-add");
    assert.ok(Math.abs(tab - add) < 1, `squareCorners ${squareCorners}: the active tab's middle (${tab}px) and the + (${add}px) are within 1px`);
    assert.deepEqual(errors, []);
    console.log(`PASS squareCorners ${squareCorners}: tab middle ${tab}px, + middle ${add}px`);
  } finally { await context.close(); }
}

await withDemoBrowser({ tempPrefix: "herdr-fork-tab-alignment-demo-" }, async (session) => {
  for (const squareCorners of [false, true]) await check(session, squareCorners);
});
