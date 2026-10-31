import type { Locator, Page } from "playwright-core";

/**
 * A work block folds each stretch of calls into one line of counts (ChatView's WorkRunRow), and
 * draws its rows only once that line is open: open every folded line in `scope`, so a check can
 * reach a tool's row as it would after a tap.
 */
export async function openWorkRuns(scope: Page | Locator): Promise<void> {
  const closed = scope.locator('.work-run-head[aria-expanded="false"]');
  for (let left = 50; left > 0 && await closed.count() > 0; left--) await closed.first().click();
}
