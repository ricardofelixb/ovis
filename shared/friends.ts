/** The agent friends agents wear in the sidebar (src/assets/friends), one per agent pane. */
export const FRIENDS = ["hoshi", "kokoro", "kuma", "maru", "mikan", "neko", "sankaku", "shikaku", "usagi"] as const;
export type Friend = (typeof FRIENDS)[number];

/**
 * POST /api/friends: the agent panes a browser sees now (`machine:pane` keys) on the PCs whose
 * panes it has (`machines`). A new one is given a friend none of the others wears; one of those
 * PCs' agent panes that is gone gives its friend back. The answer is every agent pane's friend.
 */
export interface FriendsRequest { live: string[]; machines: string[] }
export interface FriendsResponse { friends: Record<string, Friend> }

export const friendKey = (machineId: string, paneId: string): string => `${machineId}:${paneId}`;

/** A friend's picture at a fixed address (vite.config.ts emits the copies), for notifications: public/sw.js builds the same path. */
export const friendPicturePath = (friend: Friend): string => `/friends/${friend}.png`;
