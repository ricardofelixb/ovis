import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { SettingsProvider } from "../../lib/settings.ts";
import { ForkInboxBack } from "./InboxBack.tsx";

let page: Page;
beforeEach(() => { page = openPage(); });
afterEach(() => page.close());
function settings(agentFriends: boolean, language = "en") {
  page.window.localStorage.setItem("ovis:settings", JSON.stringify({ agentFriends, language }));
}
const draw = (wide: boolean) => renderToStaticMarkup(<SettingsProvider><ForkInboxBack wide={wide} onBack={() => {}}><span>Upstream brand</span></ForkInboxBack></SettingsProvider>);

test("keeps upstream branding with Agent friends off", () => {
  settings(false);
  expect(draw(true)).toBe("<span>Upstream brand</span>");
  expect(draw(false)).toBe("<span>Upstream brand</span>");
});

test("phone inbox home draws neither a logo nor a misleading back arrow", () => {
  settings(true);
  expect(draw(false)).toBe("");
});

test("desktop inbox draws an accessible Back arrow, translated by fork i18n", () => {
  settings(true);
  const out = draw(true);
  expect(out).toContain('aria-label="Back"');
  expect(out).toContain('title="Back"');
  expect(out).toContain("lucide-arrow-left");
  expect(out).not.toContain("Upstream brand");
  settings(true, "ja");
  expect(draw(true)).toContain('aria-label="戻る"');
});

test("Back invokes the supplied inbox-exit action and preserves rail classes", async () => {
  settings(true);
  let exited = 0;
  await page.render(<SettingsProvider><ForkInboxBack wide onBack={() => { exited++; }} className="inbox-rail-item inbox-rail-exit" /></SettingsProvider>);
  const back = page.one("button");
  expect(back.className).toContain("inbox-rail-exit");
  await act(async () => { back.click(); });
  expect(exited).toBe(1);
});
