/**
 * The agent mark a sidebar row draws. With Agent friends on, a linked worktree row drops its
 * agent's friend so the row falls back to upstream's branch icon and reads as a worktree, not an
 * agent row; plain workspace rows keep their friend. With Agent friends off, upstream's mark stays.
 */
export const forkWorktreeMark = (mark: string | null, agentFriends: boolean, linked: boolean): string | null =>
  agentFriends && linked ? null : mark;
