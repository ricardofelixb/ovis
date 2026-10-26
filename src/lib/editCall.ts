/** An edit call's input, read for the chat: the file it names and each change as old and new text. */
export interface EditCall {
  path: string | null;
  edits: Array<{ before: string; after: string }>;
}

const text = (input: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) if (typeof input[key] === "string") return input[key];
  return undefined;
};

/**
 * An edit tool call's input, or null when the input is no such call. Claude Code names one change
 * `old_string`/`new_string` beside `file_path`; pi names it `oldText`/`newText` beside `path`.
 * Either may instead list several changes under `edits`, each read the same way, in order.
 */
export function editCall(input: Record<string, unknown>): EditCall | null {
  const path = text(input, "file_path", "path") ?? null;
  const before = text(input, "old_string", "oldText");
  const after = text(input, "new_string", "newText");
  if (before !== undefined || after !== undefined) return { path, edits: [{ before: before ?? "", after: after ?? "" }] };
  const edits = input["edits"];
  if (!Array.isArray(edits) || !edits.every((item) => item !== null && typeof item === "object")) return null;
  return { path, edits: (edits as Array<Record<string, unknown>>).map((item) => ({
    before: text(item, "old_string", "oldText") ?? "",
    after: text(item, "new_string", "newText") ?? "",
  })) };
}
