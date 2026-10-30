import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FRIENDS } from "../shared/friends.ts";
import { FriendStore } from "./friends.ts";

describe("FriendStore", () => {
  test("a new agent pane gets a friend nobody wears, keeps it, and gives it back once gone", () => {
    const dir = mkdtempSync(join(tmpdir(), "friends-"));
    const store = new FriendStore(dir);
    const first = store.see(["local:w1:p1", "local:w1:p2", "mini:w1:p1"], ["local", "mini"]).friends;
    expect(new Set(Object.values(first)).size).toBe(3);
    expect(store.see(["local:w1:p1", "local:w1:p2", "mini:w1:p1", "local:w2:p1"], ["local", "mini"]).friends["local:w1:p1"]).toBe(first["local:w1:p1"]!);
    // a browser that only has the laptop's panes leaves the mini's alone
    expect(store.see(["local:w1:p1"], ["local"]).friends).toEqual({ "local:w1:p1": first["local:w1:p1"]!, "mini:w1:p1": first["mini:w1:p1"]! });
    // kept across a restart
    expect(new FriendStore(dir).see(["local:w1:p1"], []).friends["local:w1:p1"]).toBe(first["local:w1:p1"]!);
    // all nine in use: the tenth repeats one
    const many = Array.from({ length: 10 }, (_, i) => `pc:w1:p${i}`);
    expect(new Set(Object.values(new FriendStore(mkdtempSync(join(tmpdir(), "friends-"))).see(many, ["pc"]).friends)).size).toBe(FRIENDS.length);
  });

  test("an alert gives an agent pane no browser has shown a friend, which the sidebar later shows too", () => {
    const dir = mkdtempSync(join(tmpdir(), "friends-"));
    const store = new FriendStore(dir);
    const worn = store.see(["local:w1:p1"], ["local"]).friends["local:w1:p1"]!;
    const picked = store.friendOf("local", "w1:p2");
    expect(picked).not.toBe(worn);
    expect(store.friendOf("local", "w1:p2")).toBe(picked);
    // saved, and kept once a browser lists the pane
    expect(new FriendStore(dir).see(["local:w1:p1", "local:w1:p2"], ["local"]).friends["local:w1:p2"]).toBe(picked);
  });

  test("a workspace's friend from an older file goes to its first agent", () => {
    const dir = mkdtempSync(join(tmpdir(), "friends-"));
    writeFileSync(join(dir, "friends.json"), JSON.stringify({ "local:w1": "kuma" }));
    const friends = new FriendStore(dir).see(["local:w1:p1", "local:w1:p2"], ["local"]).friends;
    expect(friends["local:w1:p1"]).toBe("kuma");
    expect(friends["local:w1:p2"]).not.toBe("kuma");
    expect("local:w1" in friends).toBe(false);
  });
});
