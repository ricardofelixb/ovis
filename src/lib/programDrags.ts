import type { PaneInfo } from "../../shared/protocol.ts";

/**
 * Whether the program in a pane reads a plain drag itself, so the terminal hands the drag on rather
 * than selecting text: OpenCode selects inside the panel a drag starts in, as in a native terminal
 * (#2362), and zoe pans its graph and scrubs its timeline by drag. herdr reports which agent runs,
 * never a program's mouse mode, so this goes by the agent, and for zoe, which is no agent, by the
 * title it sets (as dagPane.ts knows the OmO DAG viewer).
 */
export function programReadsDrags(pane: Pick<PaneInfo, "agent" | "terminal_title" | "terminal_title_stripped">): boolean {
  return pane.agent === "opencode" || pane.terminal_title === "zoe" || pane.terminal_title_stripped === "zoe";
}
