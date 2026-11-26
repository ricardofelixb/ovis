import { describe, expect, it } from "bun:test";

import { forkWorktreeMark } from "./worktreeMark.ts";

describe("forkWorktreeMark", () => {
  it("drops the agent's mark on a linked worktree row with Agent friends on, so the branch icon shows", () => {
    expect(forkWorktreeMark("claude", true, true)).toBeNull();
  });

  it("keeps the agent's mark on a plain workspace row with Agent friends on", () => {
    expect(forkWorktreeMark("claude", true, false)).toBe("claude");
  });

  it("keeps upstream's agent mark on a linked worktree row with Agent friends off", () => {
    expect(forkWorktreeMark("claude", false, true)).toBe("claude");
  });

  it("leaves a row with no agent unchanged", () => {
    expect(forkWorktreeMark(null, true, true)).toBeNull();
    expect(forkWorktreeMark(null, false, false)).toBeNull();
  });
});
