import { join } from "node:path";
import { FRIENDS, type Friend, type FriendsResponse } from "../shared/friends.ts";
import { badRequest, isJsonObject, jsonResponse } from "./http.ts";
import { readStateDocument, writeStateDocument } from "./state-document.ts";

const MAX_KEYS = 2000;
const isFriend = (value: unknown): value is Friend => (FRIENDS as readonly unknown[]).includes(value);

/**
 * Which friend each workspace wears (shared/friends.ts), kept beside preferences.json so every
 * browser of this server shows the same one. A damaged or unreadable file starts over: the picks
 * are only looks.
 */
export class FriendStore {
  private friends: Record<string, Friend> = {};
  private readonly path: string;

  constructor(stateDir: string, private readonly random = Math.random) {
    this.path = join(stateDir, "friends.json");
    try {
      const read = readStateDocument(this.path);
      if (read.kind === "json" && isJsonObject(read.value)) {
        for (const [key, friend] of Object.entries(read.value)) if (isFriend(friend)) this.friends[key] = friend;
      }
    } catch { /* starts empty */ }
  }

  /** Frees the gone workspaces of `machines`, gives each new live one a friend, and answers them all. */
  see(live: readonly string[], machines: readonly string[]): FriendsResponse {
    const seen = new Set(live);
    const ownedBy = (key: string) => machines.some((machine) => key.startsWith(`${machine}:`));
    let changed = false;
    for (const key of Object.keys(this.friends)) {
      if (!seen.has(key) && ownedBy(key)) { delete this.friends[key]; changed = true; }
    }
    for (const key of seen) {
      if (this.friends[key]) continue;
      // the friends nobody wears, else the ones fewest wear: past nine workspaces they repeat evenly
      const worn = new Map<Friend, number>(FRIENDS.map((friend) => [friend, 0]));
      for (const friend of Object.values(this.friends)) worn.set(friend, (worn.get(friend) ?? 0) + 1);
      const least = Math.min(...worn.values());
      const free = FRIENDS.filter((friend) => worn.get(friend) === least);
      this.friends[key] = free[Math.floor(this.random() * free.length)] ?? FRIENDS[0];
      changed = true;
    }
    if (changed) {
      try { writeStateDocument(this.path, `${JSON.stringify(this.friends, null, 2)}\n`, false); }
      catch (error) { console.error(`Cannot write ${this.path}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { friends: { ...this.friends } };
  }
}

/** /api/friends: POST what a browser sees, answered with every workspace's friend. */
export async function handleFriendsRequest(request: Request, store: FriendStore): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ error: { code: "method_not_allowed", message: "Use POST /api/friends" } }, 405);
  let body: unknown;
  try { body = await request.json(); } catch { return badRequest("invalid_json", "The body is not JSON"); }
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_KEYS && value.every((item) => typeof item === "string" && item.length <= 300);
  if (!isJsonObject(body) || !strings(body.live) || !strings(body.machines)) return badRequest("invalid_body", "Send { live: string[], machines: string[] }");
  return jsonResponse(store.see(body.live, body.machines), 200, { "cache-control": "no-store" });
}
