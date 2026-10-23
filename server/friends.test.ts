import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FRIENDS } from "../shared/friends.ts";
import { FriendStore } from "./friends.ts";

describe("FriendStore", () => {
  test("a new workspace gets a friend nobody wears, keeps it, and gives it back once gone", () => {
    const dir = mkdtempSync(join(tmpdir(), "friends-"));
    const store = new FriendStore(dir);
    const first = store.see(["local:w1", "mini:w1"], ["local", "mini"]).friends;
    expect(first["local:w1"]).not.toBe(first["mini:w1"]);
    expect(store.see(["local:w1", "mini:w1", "local:w2"], ["local", "mini"]).friends["local:w1"]).toBe(first["local:w1"]!);
    // a browser that only has the laptop's workspaces leaves the mini's alone
    expect(store.see(["local:w1"], ["local"]).friends).toEqual({ "local:w1": first["local:w1"]!, "mini:w1": first["mini:w1"]! });
    // kept across a restart
    expect(new FriendStore(dir).see(["local:w1"], []).friends["local:w1"]).toBe(first["local:w1"]!);
    // all nine in use: the tenth repeats one
    const many = Array.from({ length: 10 }, (_, i) => `pc:w${i}`);
    expect(new Set(Object.values(new FriendStore(mkdtempSync(join(tmpdir(), "friends-"))).see(many, ["pc"]).friends)).size).toBe(FRIENDS.length);
  });
});
