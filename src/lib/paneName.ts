import { AGENT_CHROME, codexThreadTitle, folderName, SHELL_PREFIX, shortPathTitle, stripPaneChrome } from "../../shared/pane-title.ts";

// shared with the server's push titles, which name a pane as the client's alerts do
export { codexThreadTitle, folderName, shortPathTitle, stripPaneChrome };

/**
 * A pane's live title as the browser tab shows it: as a row's, with the agent's glyph and spinner
 * kept in front. The tab has no row mark or badge, so its title is where a working agent shows it
 * is working (#2568). The rest is shortened as a row's is, so a path after the mark is still its folder.
 */
export function tabTitle(title: string, agent: string | null | undefined): string {
  const rest = shortPathTitle(stripPaneChrome(title, agent));
  const mark = agent ? title.replace(SHELL_PREFIX, "").match(AGENT_CHROME)?.[0] ?? "" : "";
  return rest ? `${mark}${rest}` : "";
}

/** "workspace · folder", without saying the same name twice. */
export function placeLine(workspace: string, folder: string): string {
  return !folder || folder === workspace ? workspace : !workspace ? folder : `${workspace} · ${folder}`;
}
