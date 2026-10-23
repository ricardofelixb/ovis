/** The agent friends a workspace's agents wear in the sidebar (src/assets/friends), one per workspace. */
export const FRIENDS = ["hoshi", "kokoro", "kuma", "maru", "mikan", "neko", "sankaku", "shikaku", "usagi"] as const;
export type Friend = (typeof FRIENDS)[number];

/**
 * POST /api/friends: the workspaces a browser sees now (`machine:workspace` keys) on the PCs whose
 * workspaces it has (`machines`). A new one is given a friend none of the others wears; one of those
 * PCs' workspaces that is gone gives its friend back. The answer is every workspace's friend.
 */
export interface FriendsRequest { live: string[]; machines: string[] }
export interface FriendsResponse { friends: Record<string, Friend> }

export const friendKey = (machineId: string, workspaceId: string): string => `${machineId}:${workspaceId}`;
