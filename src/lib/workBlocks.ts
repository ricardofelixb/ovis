import type { ConversationPart, ConversationTurn } from "../../shared/protocol.ts";
import { turnSkills } from "./skillActivity.ts";
import { isTodoTool } from "./todos.ts";
import { t } from "./i18n.ts";

export type ToolPart = Extract<ConversationPart, { kind: "tool" }>;
export type ThinkingPart = Extract<ConversationPart, { kind: "thinking" }>;
export type TextPart = Extract<ConversationPart, { kind: "text" }>;

/**
 * A turn the way Codex shows it: everything the agent did on the way — tool calls,
 * reasoning and the narration between them — folded under one "Worked for 7s · 1 edit"
 * header, and only what it said after the last action left out in the open as the answer.
 */
export interface SplitTurn {
  work: ConversationPart[];
  answer: TextPart[];
}

export function splitTurn(parts: ConversationPart[]): SplitTurn {
  let lastAction = -1;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part?.kind !== "text" || part.phase === "commentary") lastAction = index;
  }
  const isProse = (part: ConversationPart): part is TextPart => part.kind === "text" && part.text.trim().length > 0;
  return {
    work: parts.filter((part, index) => part.kind !== "text" || (isProse(part) && part.phase !== "final_answer" && index <= lastAction)),
    answer: parts.filter((part, index): part is TextPart => isProse(part) && (part.phase === "final_answer" || index > lastAction)),
  };
}

/**
 * A work block is open while its turn runs and folded once the turn settles: the answer stays
 * outside the fold, so a finished turn reads as its answer under one "Worked for" row.
 *
 * A settled turn keeps its block open when the work holds words the answer does not end on:
 * prose with no answer at all (an action came after the last words, or Codex commentary had no
 * final answer), or prose recorded after the last answer part. Folding would hide the newest
 * thing the agent said, or all of it. It takes the turn's parts, not the split: the order decides.
 */
export function workStartsOpen(live: boolean, parts: ConversationPart[]): boolean {
  if (live) return true;
  const lastAnswer = splitTurn(parts).answer.at(-1);
  const after = lastAnswer === undefined ? 0 : parts.lastIndexOf(lastAnswer) + 1;
  // everything readable after the last answer part is work: it is inside the fold
  return parts.slice(after).some((part) => part.kind === "text" && part.text.trim().length > 0);
}

type WorkCategory = "edit" | "read" | "command" | "other";

/** "{n} edit" / "{n} edits": both forms are translated, Korean uses one */
export const CATEGORY_LABEL: Record<WorkCategory, [singular: string, plural: string]> = {
  edit: ["{n} edit", "{n} edits"],
  read: ["{n} file read", "{n} file reads"],
  command: ["{n} command", "{n} commands"],
  other: ["{n} other tool", "{n} other tools"],
};

function categorize(name: string): WorkCategory {
  const lower = name.toLowerCase();
  if (/edit|write|patch|create_file|multiedit/.test(lower)) return "edit";
  if (/^(read|glob|grep|ls|list|search|find|cat)/.test(lower)) return "read";
  if (/bash|command|shell|exec|eval|run/.test(lower)) return "command";
  return "other";
}

/**
 * "1 edit · 2 file reads · 1 command" — the block's header, in the order a reader cares about.
 * The failures are not in it (`workFailed`): a narrow header cuts this line short.
 */
export function workSummary(parts: readonly ConversationPart[]): string {
  const counts: Record<WorkCategory, number> = { edit: 0, read: 0, command: 0, other: 0 };
  for (const part of parts) {
    if (part.kind !== "tool") continue;
    // a todo update is the plan, pinned under the chat, not an edit: TodoWrite would match /write/
    if (!part.skill && !isTodoTool(part.name)) counts[categorize(part.name)] += 1;
  }
  const skills = turnSkills(parts).length;
  return [...(skills > 0 ? [t(skills === 1 ? "{n} skill" : "{n} skills", { n: skills })] : []), ...(Object.keys(counts) as WorkCategory[])
    .filter((category) => counts[category] > 0)
    .map((category) => t(CATEGORY_LABEL[category][counts[category] === 1 ? 0 : 1], { n: counts[category] }))]
    .join(" · ");
}

/**
 * How many calls failed, whatever they were. The folded header says it apart from the counts, where
 * it is never cut: it is what a glance at a finished turn must not miss, and the fold hides the row.
 */
export function workFailed(parts: readonly ConversationPart[]): number {
  return parts.filter((part) => part.kind === "tool" && part.error === true).length;
}

/** "7s" / "1m 12s" for a block header; null when the span is unknown or nonsense. */
export function formatWorkDuration(startTs: string | null, endTs: string | null): string | null {
  if (startTs === null || endTs === null) return null;
  const ms = Date.parse(endTs) - Date.parse(startTs);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return t("{s}s", { s: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest > 0 ? t("{m}m {s}s", { m: minutes, s: rest }) : t("{m}m", { m: minutes });
  return t("{h}h {m}m", { h: Math.floor(minutes / 60), m: minutes % 60 });
}

/**
 * end_ts is the latest activity time, not proof that an approval-blocked turn finished.
 *
 * `sentOver` is the assistant turn that was last when a message was sent. The pushed status turns
 * `working` before the transcript holds the new user message, so until it does, that finished turn
 * is still the last one and must not be titled as if it were the one running. The turn itself, not
 * its time: a turn may have no `ts`, and the browser's clock and the transcript's need not agree.
 */
export function isLiveWorkTurn(turn: ConversationTurn, last: boolean, status?: string, sentOver?: ConversationTurn | null): boolean {
  if (turn === sentOver) return false;
  return last && turn.role === "assistant" && (status === "working" || status === "blocked");
}

/** The rows a work block draws: skills are chips beside the prompt, thinking only when shown. */
export function visibleWorkParts(parts: ConversationPart[], showThinking: boolean): ConversationPart[] {
  return parts.filter((part) => part.kind !== "skill" && (showThinking || part.kind !== "thinking"));
}

/**
 * A work block's rows the way pi-minimalist folds pi's own transcript: each stretch of calls and
 * thinking between two pieces of narration is one run (`✓ think ×3, bash ×2`), opened by a tap.
 * `start` is the run's first part's index in the turn: a run that grows keeps its row's state.
 */
export type WorkItem =
  | { kind: "run"; start: number; parts: (ToolPart | ThinkingPart)[] }
  | { kind: "part"; part: ConversationPart };

export function workItems(visible: ConversationPart[], parts: ConversationPart[]): WorkItem[] {
  const items: WorkItem[] = [];
  for (const part of visible) {
    const last = items.at(-1);
    if (part.kind !== "tool" && part.kind !== "thinking") items.push({ kind: "part", part });
    else if (last?.kind === "run") last.parts.push(part);
    else items.push({ kind: "run", start: parts.indexOf(part), parts: [part] });
  }
  return items;
}

export interface RunCount { name: string; count: number }

/**
 * A run's calls by outcome, each in first-seen order (read, edit, read → read ×2, edit ×1). A call
 * with no result is running only in a live block: in a settled one it was cut off, and counts done.
 */
export function runCounts(run: readonly (ToolPart | ThinkingPart)[], live: boolean): { done: RunCount[]; failed: RunCount[]; running: RunCount[] } {
  const outcomes = { done: new Map<string, number>(), failed: new Map<string, number>(), running: new Map<string, number>() };
  for (const part of run) {
    const outcome = part.kind === "tool" && part.error ? "failed" : part.kind === "tool" && part.running && live ? "running" : "done";
    const name = runName(part);
    outcomes[outcome].set(name, (outcomes[outcome].get(name) ?? 0) + 1);
  }
  const list = (counts: Map<string, number>) => [...counts].map(([name, count]) => ({ name, count }));
  return { done: list(outcomes.done), failed: list(outcomes.failed), running: list(outcomes.running) };
}

/** pi-minimalist's names: `think`, the tool's own name, and the MCP tool an `mcp` call reaches */
function runName(part: ToolPart | ThinkingPart): string {
  if (part.kind === "thinking") return "think";
  if (part.name !== "mcp") return part.name;
  try {
    const tool = (JSON.parse(part.input) as { tool?: unknown }).tool;
    return typeof tool === "string" && tool.length > 0 ? tool : part.name;
  } catch {
    return part.name;
  }
}

/**
 * Whether the open work block's head says the agent waits for the user ("Needs you") instead of
 * "Working…". By the pane's status, not by a parsed prompt: a blocked pane whose menu no reader
 * knows waits just the same, and a question in Codex's queue leaves Codex working.
 */
export function isWaitingWorkTurn(live: boolean, status?: string): boolean {
  return live && status === "blocked";
}
