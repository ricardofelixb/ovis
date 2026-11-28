import { afterEach, beforeEach, expect, test } from "bun:test";
import { act } from "react";
import type { WorktreeListing } from "../../../shared/protocol.ts";
import { createGithubFilesReader } from "../../../server/fork/github.ts";
import { openPage, type Page } from "../../lib/page.fixture.ts";
import { SettingsProvider } from "../../lib/settings.ts";
import { closeGithubPull, ForkGithubPane, GithubInbox, refreshGithubListing } from "./GithubInbox.tsx";
import { ForkRailPlaces } from "../inbox/Rail.tsx";
import { setPlace } from "../inbox/place.ts";

let page: Page;
const saved = new Map<string, PropertyDescriptor | undefined>();
let calls = 0;
let payload: unknown;
let responseCode = 200;
beforeEach(() => {
  for (const key of ["fetch", "cancelAnimationFrame", "ResizeObserver"]) saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  page = openPage();
  Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => {} });
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: page.window.ResizeObserver });
  // the page's popstate listener is bound to the window it was loaded with, not this page's: keep the phone's
  // pull request off this page's history, so closing it closes it at once
  Object.defineProperty(page.window.history, "pushState", { configurable: true, value: () => {} });
  calls = 0; responseCode = 200;
  payload = { accounts: ["me"], review: [{ repository: "owner/repo", number: 1, title: "Fix this", url: "https://github.com/owner/repo/pull/1", branch: "topic", checks: "failing", review: "review_required", workspace_id: "w1" }], yours: [] };
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string) => {
    if (url.startsWith(DETAIL)) return detailUnread();
    calls++; expect(url).toBe("/api/fork/github/pulls"); return Response.json(payload, { status: responseCode });
  } });
  window.localStorage.setItem("ovis:settings", JSON.stringify({ pullRequests: true }));
  refreshGithubListing();
  setPlace("inbox");
});
afterEach(async () => {
  await page.close();
  closeGithubPull();
  for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
});
// A pull request's page reads its detail; these tests are about the list and Checkout, so it stays unread.
const DETAIL = "/api/fork/github/pull?";
const detailUnread = () => Response.json({ error: { code: "gh_failed", message: "Unread" } }, { status: 409 });
const saysName = (node: Node, name: string): boolean => [...node.childNodes].some((child) => child.nodeType === 3 ? child.nodeValue === name : saysName(child, name));
const button = (name: string) => [...page.container.querySelectorAll("button")].find((node) => node.getAttribute("aria-label") === name || saysName(node, name))!;
const click = (name: string) => act(async () => button(name).click());
const unmount = () => page.render(null);
async function rail(enabled: boolean, notes = false) {
  window.localStorage.setItem("ovis:settings", JSON.stringify({ pullRequests: enabled, notes }));
  await page.render(<SettingsProvider><ForkRailPlaces><button aria-current="page">Inbox</button></ForkRailPlaces></SettingsProvider>);
}

const checkoutListing = (sourceId: string | null = "w1"): WorktreeListing => ({
  source: { repo_key: "repo", repo_name: "repo", repo_root: "/repo", source_checkout_path: sourceId ? "/repo" : "/linked", source_workspace_id: sourceId },
  worktrees: [{ path: "/pr", branch: "topic", label: "topic", is_linked_worktree: true, is_bare: false, is_detached: false, is_prunable: false, open_workspace_id: null }],
});
function checkoutApi(listings: WorktreeListing[], replies: Record<string, unknown> = {}) {
  const requests: { path: string; body?: unknown }[] = [];
  let reads = 0;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (path: string, init?: RequestInit) => {
    if (path.startsWith(DETAIL)) return detailUnread();
    requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === "/api/fork/github/pulls") return Response.json(payload);
    if (path === "/api/worktree/list?workspace_id=w1") return Response.json(listings[Math.min(reads++, listings.length - 1)]);
    expect(Object.hasOwn(replies, path)).toBe(true);
    return Response.json(replies[path]);
  } });
  return requests;
}
/** The wide layout: the list, and the page it opens beside it. */
async function wideGithub(watching = false, onOpened = (_opened: unknown) => {}) {
  setPlace("github");
  await page.render(<SettingsProvider><GithubInbox wide watching={watching} onOpened={onOpened} /><ForkGithubPane wide watching={watching} onOpened={onOpened} /></SettingsProvider>);
}
async function openPull(onOpened = (_opened: unknown) => {}, watching = false) {
  await wideGithub(watching, onOpened);
  await click("Fix this");
}
async function closeAll() { await unmount(); await act(async () => closeGithubPull()); }

test("restores and records list scroll after returning from a phone PR", async () => {
  const scrollTo = (top: number) => { const host = page.one(".inbox-scroll"); host.scrollTop = top; host.dispatchEvent(new page.window.Event("scroll") as unknown as Event); };
  await page.render(<SettingsProvider><GithubInbox wide={false} watching={false} onOpened={() => {}} /></SettingsProvider>);
  scrollTo(250);
  await click("Fix this");
  await click("Back");
  expect(page.one(".inbox-scroll").scrollTop).toBe(250);
  scrollTo(320);
  await click("Fix this");
  await click("Back");
  expect(page.one(".inbox-scroll").scrollTop).toBe(320);
});

test("reloads open file patches when a cached PR receives a new head", async () => {
  (payload as { review: { url: string }[] }).review[0]!.url = "https://github.com/owner/repo/pull/9876";
  let detailReads = 0, patchReads = 0;
  let patch = "old head";
  const received: string[] = [];
  const readFiles = createGithubFilesReader(async (args) => {
    if (args[1] === "token") return { code: 0, stdout: "test-token", stderr: "" };
    patchReads++;
    return { code: 0, stdout: JSON.stringify([{ files: [{ filename: "a.txt", patch: `@@ -1 +1 @@\n-original\n+${patch}` }] }]), stderr: "" };
  }, () => 0);
  let resolveDetail: (response: Response) => void = () => {};
  const detail = { repository: "owner/repo", number: 1, url: "https://github.com/owner/repo/pull/9876", title: "Fix this", body: "", state: "open", draft: false, author: "me", created_at: "2026-01-01", updated_at: "2026-01-01", head: "topic", base: "main", fork: false, additions: 1, deletions: 0, changed_files: 1, commits: 1, checks: { passing: 0, failing: 0, pending: 0, skipped: 0 }, check_list: [], merge: "clean", review: "none", reviewers: [], labels: [], head_sha: "a".repeat(40), viewer: "me", can_write: false, merge_methods: [], conversation: [], files: [{ path: "a.txt", additions: 1, deletions: 0, change: "modified" }] };
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (url: string) => {
    if (url.startsWith("/api/fork/github/pull/files?")) {
      const params = new URL(url, "http://localhost").searchParams;
      const files = await readFiles("owner/repo", 1, "me", params.get("head") ?? "", params.get("base") ?? "");
      received.push(files[0]?.patch ?? "");
      // Rendering the diff needs browser workers; the assertion above captures the real server patch.
      return Response.json({ files: files.map((file) => ({ ...file, patch: null })) });
    }
    if (url.startsWith(DETAIL)) { detailReads++; return detailReads === 1 ? Response.json(detail) : new Promise<Response>((resolve) => { resolveDetail = resolve; }); }
    return Response.json(payload);
  } });
  await openPull();
  await click("Files 1");
  await click("Expand all");
  expect(patchReads).toBe(1);
  await closeAll();
  await openPull();
  expect(button("Collapse all")).toBeDefined();
  patch = "new head";
  await act(async () => { resolveDetail(Response.json({ ...detail, head_sha: "b".repeat(40) })); });
  expect(received[1]).toContain("new head");
  expect(patchReads).toBe(2);
  expect(button("Collapse all")).toBeDefined();
});

test("opens an existing same-repository worktree without fetching or creating a branch", async () => {
  const opened = { workspace_id: "fork", pane_id: "p1", path: "/pr", branch: "topic", already_open: true };
  const requests = checkoutApi([checkoutListing()], { "/api/worktree/open": opened });
  let result: unknown;
  await openPull((next) => { result = next; });
  expect(button("Checkout")).toBeDefined();
  await click("Checkout");
  expect(result).toEqual(opened);
  expect(requests.filter((request) => request.body)).toEqual([{ path: "/api/worktree/open", body: { workspace_id: "w1", path: "/pr" } }]);
});

test("fork PRs offer only GitHub, even when an unrelated local branch has the same name", async () => {
  (payload as { review: { fork: boolean }[] }).review[0]!.fork = true;
  for (const worktrees of [checkoutListing().worktrees, []]) {
    const requests = checkoutApi([{ ...checkoutListing(), worktrees }]);
    await openPull();
    expect(button("Checkout")).toBeUndefined();
    expect(page.one("a").getAttribute("href")).toBe("https://github.com/owner/repo/pull/1");
    expect(requests).toEqual([{ path: "/api/fork/github/pulls", body: undefined }]);
    await closeAll(); refreshGithubListing();
  }
});

test("creates from the main workspace when only a linked checkout is selected", async () => {
  for (const sourceId of [null, "main"]) {
    const listing = checkoutListing(sourceId);
    listing.source.source_checkout_path = "/linked"; listing.worktrees = [];
    const opened = { workspace_id: "new", pane_id: "p2", path: "/new", branch: "topic", already_open: false };
    const requests = checkoutApi([listing], {
      "/api/worktree/open": { workspace_id: "main", pane_id: "p0", path: "/repo", branch: "main", already_open: false },
      "/api/worktree/pull-request-fetch": { ref: "origin/topic" },
      "/api/worktree/create": opened,
    });
    let result: unknown;
    await openPull((next) => { result = next; });
    await click("Checkout");
    expect(requests.filter((request) => request.body)).toEqual([
      ...(sourceId ? [] : [{ path: "/api/worktree/open", body: { workspace_id: "w1", path: "/repo" } }]),
      { path: "/api/worktree/pull-request-fetch", body: { workspace_id: "main", branch: "topic" } },
      { path: "/api/worktree/create", body: { workspace_id: "main", branch: "topic", base: "origin/topic" } },
    ]);
    expect(result).toEqual(opened);
    await closeAll(); refreshGithubListing();
  }
});

test("rail is opt-in, switches current place, and Inbox switches back", async () => {
  await rail(false); expect(button("Pull requests")).toBeUndefined();
  await unmount(); await rail(true);
  await click("Pull requests");
  expect(button("Pull requests").getAttribute("aria-current")).toBe("page");
  expect(button("Inbox").getAttribute("aria-current")).toBeNull();
  await click("Inbox");
  expect(button("Inbox").getAttribute("aria-current")).toBe("page");
});

test("under Default navigation the inbox's rail has Notes under Pull requests", async () => {
  await rail(true, true);
  const labels = [...page.container.querySelectorAll("button")].map((node) => node.getAttribute("aria-label") ?? "Inbox");
  expect(labels).toEqual(["Inbox", "Pull requests", "Notes"]);
});

test("loads once, opens the page beside the list, and refreshes without redirecting", async () => {
  await wideGithub();
  expect(calls).toBe(1);
  expect(page.container.querySelectorAll("a")).toHaveLength(0);
  expect(page.container.textContent).toContain("Choose a pull request to open it here.");
  await click("Fix this");
  expect(page.one("a").getAttribute("href")).toBe("https://github.com/owner/repo/pull/1");
  expect(button("Checkout")).toBeDefined();
  // one repository: no filter to offer (githubGroups' own tests cover choosing one)
  expect(button("Repositories")).toBeUndefined();
  await click("Refresh"); expect(calls).toBe(2);
});

test("offers a clone for unknown repos, nothing to observers, and shows empty and CLI errors", async () => {
  for (const watching of [false, true]) {
    (payload as { review: { workspace_id?: string }[] }).review[0]!.workspace_id = watching ? "w1" : undefined;
    await openPull(() => {}, watching);
    expect(button("Checkout")).toBeUndefined();
    expect(button("Clone and checkout") !== undefined).toBe(!watching);
    await closeAll(); refreshGithubListing();
  }
  setPlace("inbox");
  payload = { accounts: ["me"], review: [], yours: [] };
  await page.render(<SettingsProvider><GithubInbox wide watching={false} onOpened={() => {}} /></SettingsProvider>);
  expect(page.container.textContent).toContain("Nothing needs you");
  for (const code of ["gh_missing", "gh_signed_out", "rate_limited", "gh_failed"]) {
    responseCode = 409; payload = { error: { code, message: "Failure" } };
    await click("Refresh");
    expect(page.container.querySelector('[role="alert"]')).not.toBeNull();
  }
});
