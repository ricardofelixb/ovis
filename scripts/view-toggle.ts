/** The pane's lens is reported by More; its Terminal switch lives inside that menu. */
import type { Page } from "playwright-core";

export const VIEW_BUTTON = ".app-header .header-more-button[data-view]";
export type Lens = "chat" | "terminal";

export async function pickLens(page: Page, lens: Lens, { tap = false }: { tap?: boolean } = {}): Promise<void> {
  const button = page.locator(VIEW_BUTTON);
  await button.waitFor();
  if ((await button.getAttribute("data-view")) !== lens) {
    if (await button.getAttribute("aria-expanded") !== "true") await (tap ? button.tap() : button.click());
    const toggle = page.locator(".row-menu, .row-sheet").locator("button:has(.row-menu-toggle)");
    await (tap ? toggle.tap() : toggle.click());
  }
  await page.locator(`${VIEW_BUTTON}[data-view="${lens}"]`).waitFor();
}

export function shownLens(page: Page): Promise<string | null> {
  return page.locator(VIEW_BUTTON).getAttribute("data-view");
}
