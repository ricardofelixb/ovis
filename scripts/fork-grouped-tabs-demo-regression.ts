import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionSnapshot } from "../shared/protocol.ts";
import panes from "../site/demo/fixtures/panes.json";
import { withDemoBrowser } from "./demo-browser.ts";
import { serveDemo } from "./demo-server.ts";

/** All metadata is synthetic and confined to this disposable demo, never a live session. */
function fixture(snapshot: SessionSnapshot | null, ids: string[]): void {
  const parent = snapshot?.panes.find((pane) => pane.pane_id === ids[0]);
  if (!snapshot || !parent) return;
  for (const [index, id] of ids.slice(0, Number(localStorage.getItem("qa:children") ?? 2) + 1).entries()) {
    const pane = snapshot.panes.find((candidate) => candidate.pane_id === id)!;
    const name = ["QA parent", "QA implementer", "QA reviewer"][index] ?? `QA helper ${index}`;
    Object.assign(pane, { workspace_id: parent.workspace_id, label: name, ...(index ? { parent_pane_id: parent.pane_id, agent_role: index === 1 ? "implement" : index === 2 ? "review" : "explore" } : {}) });
    Object.assign(snapshot.tabs.find((tab) => tab.tab_id === pane.tab_id)!, { workspace_id: parent.workspace_id, label: name });
    const layout = snapshot.layouts?.find((candidate) => candidate.tab_id === pane.tab_id);
    if (layout) layout.workspace_id = parent.workspace_id;
  }
  if (localStorage.getItem("qa:overflow") === "true" && !snapshot.tabs.some((tab) => tab.tab_id === "qa:other:0")) {
    const tab = snapshot.tabs.find((entry) => entry.tab_id === parent.tab_id)!;
    for (let index = 0; index < 12; index++) {
      const id = `qa:other:${index}`;
      const name = `QA unrelated ${index}`;
      snapshot.tabs.push({ ...tab, tab_id: id, number: index + 10, label: name });
      snapshot.panes.push({ ...parent, pane_id: id, tab_id: id, label: name });
    }
    snapshot.tabs.splice(snapshot.tabs.indexOf(tab), 1);
    snapshot.tabs.push(tab);
  }
}

await withDemoBrowser({
  tempPrefix: "ovis-grouped-tabs-demo-",
  serve(app) {
    const transportPath = join(app, "demo-transport.js");
    const transport = readFileSync(transportPath, "utf8");
    assert.ok(transport.includes("function readSnapshot(machine) {"), "the demo's snapshot hook is available");
    writeFileSync(transportPath, transport.replace("function readSnapshot(machine) {", `function readSnapshot(machine) { (${fixture.toString()})(machine.snapshot, ${JSON.stringify([panes.api, panes.web, panes.flaky, panes.omp, panes.cli, panes.hermes, panes.shell])});`));
    return serveDemo(app);
  },
}, async ({ newContext, baseUrl, evidence }) => {
  for (const width of [1280, 390]) for (const { enabled, children, overflow = false } of [{ enabled: false, children: 2 }, { enabled: true, children: 2 }, { enabled: true, children: 6 }, { enabled: true, children: 2, overflow: true }]) {
    if (overflow && width < 768) continue;
    const context = await newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
    try {
      await context.addInitScript(({ enabled: agentFriends, children: count, overflow: more }) => {
        localStorage.setItem("qa:children", String(count));
        localStorage.setItem("qa:overflow", String(more));
        localStorage.setItem("ovis:settings", JSON.stringify({ language: "en", agentFriends, alertsOn: false }));
        localStorage.setItem("ovis:phone-tabs", JSON.stringify("header"));
        Reflect.set(window, "__ovisDemoHoldTurn", true);
      }, { enabled, children, overflow });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${baseUrl}?pane=${encodeURIComponent(panes.api)}`);
      await page.locator(".conn-live").waitFor();
      const row = page.locator(".header-tabs .tab-strip");
      await row.getByRole("tab", { name: /^QA parent/ }).waitFor();
      const parent = row.getByRole("tab", { name: /^QA parent/ });
      if (overflow) {
        await row.getByRole("tab", { name: "QA unrelated 0", exact: true }).click();
        await page.locator(".header-tabs .tab-strip-more").click();
        const more = page.getByRole("menu", { name: "More tabs", exact: true });
        await more.getByRole("menuitem", { name: /^QA implementer/ }).click();
        await page.locator(`[data-layout-pane=${JSON.stringify(panes.web)}]`).waitFor({ state: "visible" });
      } else if (!enabled) {
        assert.equal(await row.locator(".workspace-fold-count").count(), 0);
        assert.equal(await row.getByRole("tab", { name: /^QA implementer/ }).count(), 1);
      } else {
        assert.equal(await row.getByRole("tab", { name: /^QA (implementer|reviewer|helper)/ }).count(), 0, "job agents have no tab of their own");
        assert.equal(await parent.locator(".workspace-fold-count").textContent(), `+${children}`);
        const label = (await parent.locator(".tab-strip-label").boundingBox())!;
        const count = (await parent.locator(".workspace-fold-count").boundingBox())!;
        assert.ok(count.x >= label.x + label.width - 1, `"+N" follows the tab's name (count at ${count.x}px, name ends at ${label.x + label.width}px)`);
        let menu;
        if (width < 768) {
          await parent.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, clientX: 0, clientY: 0 });
          menu = page.getByRole("dialog", { name: "QA parent", exact: true });
          await menu.waitFor();
          await parent.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1 });
        } else {
          await parent.click({ button: "right" });
          menu = page.getByRole("menu", { name: "QA parent", exact: true });
          await menu.waitFor();
        }
        const job = menu.getByRole(width < 768 ? "button" : "menuitem", { name: /^QA implementer/ });
        assert.equal(await job.locator(".lucide-bot").count(), 1);
        assert.equal(await menu.getByRole(width < 768 ? "button" : "menuitem", { name: /^Rename tab/ }).count(), 1, "the tab's own items stay");
        await job.click();
        await menu.waitFor({ state: "detached" });
        await page.locator(`[data-layout-pane=${JSON.stringify(panes.web)}]`).waitFor({ state: "visible" });
        assert.equal(await parent.getAttribute("aria-selected"), "true");
        assert.ok((await page.title()).includes("QA implementer"), "the window title names the selected child");
        assert.equal(await row.locator(".tab-strip-item.is-active .tab-strip-label").textContent(), "QA parent");
        if (width < 768) {
          if (process.env.QA_SHOTS) await page.screenshot({ path: `${process.env.QA_SHOTS}/phone-${children}.png`, clip: { x: 0, y: 0, width, height: 120 } });
          await page.locator(".header-tabs-sheet").click();
          const sheet = page.locator(".row-sheet");
          const review = sheet.getByRole("button", { name: /^QA reviewer/ });
          await review.waitFor();
          assert.equal(await review.locator(".lucide-bot").count(), 1);
          await review.click();
          await sheet.waitFor({ state: "detached" });
          await page.locator(`[data-layout-pane=${JSON.stringify(panes.flaky)}]`).waitFor({ state: "visible" });
        }
        if (evidence && children === 2) await page.screenshot({ path: join(evidence, `grouped-tabs-${width}.png`) });
      }
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      console.log(`PASS grouped tabs: width=${width}, agentFriends=${enabled}, children=${children}, overflow=${overflow}`);
    } finally { await context.close(); }
  }
});
