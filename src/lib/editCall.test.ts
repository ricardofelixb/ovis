import { expect, test } from "bun:test";
import { editCall } from "./editCall.ts";

test("a pi edit reads as its path and each change, in order", () => {
  expect(editCall({ path: "docs/a.md", edits: [{ oldText: "a", newText: "b" }, { oldText: "c", newText: "" }] })).toEqual({
    path: "docs/a.md",
    edits: [{ before: "a", after: "b" }, { before: "c", after: "" }],
  });
  expect(editCall({ path: "docs/a.md", oldText: "a", newText: "b" })).toEqual({ path: "docs/a.md", edits: [{ before: "a", after: "b" }] });
});

test("a Claude Code edit still reads as before", () => {
  expect(editCall({ file_path: "src/a.ts", old_string: "a", new_string: "b" })).toEqual({ path: "src/a.ts", edits: [{ before: "a", after: "b" }] });
  expect(editCall({ file_path: "src/a.ts", edits: [{ old_string: "a", new_string: "b" }] })).toEqual({ path: "src/a.ts", edits: [{ before: "a", after: "b" }] });
});

test("an input with no edit in it is no edit call", () => {
  expect(editCall({ path: "src/a.ts" })).toBeNull();
  expect(editCall({ edits: ["a"] })).toBeNull();
});
