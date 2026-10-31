/**
 * The header's lens menu, for the browser scripts: one button at the end of the tabs says the lens
 * the open pane shows (its `data-view`) and opens both (components/ViewMenu.tsx). It is a popover
 * on a desktop and a bottom sheet on a phone (RowMenu), so an item is found in either, by its place:
 * Chat first, Terminal second, in any language.
 */
import type { Page } from "playwright-core";

export const VIEW_BUTTON = ".app-header .view-menu-button";
const ITEMS = '.row-menu [role="menuitem"], .row-sheet .row-sheet-item';

export type Lens = "chat" | "terminal";

/** Opens the menu, tapped on a touch-only page, so a timed pick can start from it. */
export async function openLensMenu(page: Page, { tap = false }: { tap?: boolean } = {}): Promise<void> {
  const button = page.locator(VIEW_BUTTON);
  await (tap ? button.tap() : button.click());
  // a trial click waits out the sheet's slide-in, which a timed tap would otherwise count
  await page.locator(ITEMS).first().click({ trial: true });
}

/** Shows `lens` from the menu, tapped on a touch-only page; the menu closes with the pick. */
export async function pickLens(page: Page, lens: Lens, { tap = false }: { tap?: boolean } = {}): Promise<void> {
  const item = page.locator(ITEMS).nth(lens === "chat" ? 0 : 1);
  if (!(await item.isVisible())) {
    const button = page.locator(VIEW_BUTTON);
    await (tap ? button.tap() : button.click());
  }
  await (tap ? item.tap() : item.click());
  await item.waitFor({ state: "hidden" });
}

/** The lens the header says the open pane shows, once its button is there. */
export function shownLens(page: Page): Promise<string | null> {
  return page.locator(VIEW_BUTTON).getAttribute("data-view");
}
