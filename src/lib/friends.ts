import { useEffect, useSyncExternalStore } from "react";

import { friendKey, type Friend, type FriendsResponse } from "../../shared/friends.ts";
import type { Machine } from "../../shared/machines.ts";

// The friend each workspace wears, as this server's /api/friends answered (server/friends.ts).
let friends: Record<string, Friend> = {};
const listeners = new Set<() => void>();
let asked = "";

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const current = () => friends;

/** The friends as this browser last heard, for a reader that leaves the asking to App (useWorkspaceFriends). */
export const useFriends = (): Record<string, Friend> => useSyncExternalStore(subscribe, current, current);

/** The friend a workspace wears, as this browser last heard: for alerts raised in App's event handlers. */
export const workspaceFriend = (machineId: string, workspaceId: string): Friend | undefined => friends[friendKey(machineId, workspaceId)];

/**
 * The friends of the workspaces on the PCs this browser has: told to the server whenever the
 * workspaces change, which gives a new one a friend and takes a closed one's back. A server
 * that predates it or a watching device answers nothing, and the rows keep their agents' marks.
 */
export function useWorkspaceFriends(machines: readonly Machine[]): Record<string, Friend> {
  const known = machines.filter((machine) => machine.state === "connected" && machine.snapshot);
  const live = known.flatMap((machine) => machine.snapshot!.workspaces.map((workspace) => friendKey(machine.id, workspace.workspace_id))).sort();
  const ids = known.map((machine) => machine.id).sort();
  const request = JSON.stringify({ live, machines: ids });
  useEffect(() => {
    if (request === asked || ids.length === 0) return;
    asked = request;
    void fetch("/api/friends", { method: "POST", headers: { "content-type": "application/json" }, body: request })
      .then(async (response) => {
        if (!response.ok) return;
        friends = ((await response.json()) as FriendsResponse).friends;
        for (const listener of [...listeners]) listener();
      })
      .catch(() => { if (asked === request) asked = ""; });
  }, [request, ids.length]);
  return useFriends();
}
