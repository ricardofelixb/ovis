import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { WorktreeEntry } from "../shared/protocol.ts";
import { checksOf, fetchPullRequestBranch, forgetPullRequestAccounts, ghAccounts, githubRepository, listPullRequests, parsePullRequests, PullRequestError, setPullRequestOptions } from "./pull-requests.ts";

const scratch = realpathSync(mkdtempSync(join(tmpdir(), "herdr-pull-requests-")));
const gh = join(scratch, "gh");
const git = join(scratch, "git");
const log = join(scratch, "gh.log");

const ROW = { number: 7, title: "Fix reconnect", url: "https://github.com/acme/app/pull/7", headRefName: "fix/reconnect", author: { login: "ana" }, isDraft: false, isCrossRepository: false, updatedAt: "2026-11-01T10:00:00Z", statusCheckRollup: [{ status: "COMPLETED", conclusion: "SUCCESS" }], reviewDecision: "APPROVED" };

/** A `gh` that signs in `accounts` and lists pull requests only for `visibleTo`, and logs the account of each listing. */
function standInGh(accounts: string[], visibleTo: string[], rows: unknown[] = [ROW]): void {
  writeFileSync(gh, `#!/bin/sh
case "$1 $2" in
  "auth status") ${accounts.map((name) => `echo "  ✓ Logged in to github.com account ${name} (keyring)"`).join("; ")}; exit 0 ;;
  "auth token") echo "token-for-$4"; exit 0 ;;
  "pr list") echo "$GH_TOKEN" >> '${log}'
    case "$GH_TOKEN" in ${visibleTo.map((name) => `token-for-${name}`).join("|") || "none"}) cat <<'JSON'
${JSON.stringify(rows)}
JSON
      exit 0 ;; esac
    echo "GraphQL: Could not resolve to a Repository with the name 'acme/app'. (repository)" >&2; exit 1 ;;
esac
exit 2
`);
  chmodSync(gh, 0o755);
}

function standInGit(origin: string, fetchExit = 0): void {
  writeFileSync(git, `#!/bin/sh
case "$*" in
  *"remote get-url origin"*) echo '${origin}'; exit 0 ;;
  *"check-ref-format"*) case "$2" in *..*|*" "*) exit 1 ;; esac; exit 0 ;;
  *" fetch "*) echo "$*" > '${join(scratch, "fetch.log")}'; [ ${fetchExit} -eq 0 ] || { echo "fatal: couldn't find remote ref" >&2; exit 128; }; exit 0 ;;
esac
exit 0
`);
  chmodSync(git, 0o755);
}

beforeAll(() => setPullRequestOptions({ gh, git, deadlineMs: 5000 }));
afterEach(() => { forgetPullRequestAccounts(); rmSync(log, { force: true }); });
afterAll(() => { setPullRequestOptions(); rmSync(scratch, { recursive: true, force: true }); });

const worktrees: WorktreeEntry[] = [
  { path: "/r", branch: "main", label: "r", is_linked_worktree: false, is_bare: false, is_detached: false, is_prunable: false, open_workspace_id: "w1" },
  { path: "/r-fix", branch: "fix/reconnect", label: "fix", is_linked_worktree: true, is_bare: false, is_detached: false, is_prunable: false, open_workspace_id: "w2" },
];

describe("github remotes and gh output", () => {
  it("names the repository behind https, ssh and ssh host-alias remotes, and no other host", () => {
    expect(githubRepository("https://github.com/acme/app.git")).toBe("acme/app");
    expect(githubRepository("git@github.com:acme/app.git\n")).toBe("acme/app");
    expect(githubRepository("ssh://git@github.com/acme/app")).toBe("acme/app");
    expect(githubRepository("git@github.com-work:acme/app.git")).toBe("acme/app");
    expect(githubRepository("https://gitlab.com/acme/app.git")).toBeNull();
    expect(githubRepository("git@notgithub.com:acme/app.git")).toBeNull();
  });

  it("lists each signed-in account once, from either spelling of gh's status", () => {
    expect(ghAccounts("github.com\n  ✓ Logged in to github.com account ana (keyring)\n  - Active account: true\n  ✓ Logged in to github.com account bo (keyring)")).toEqual(["ana", "bo"]);
    expect(ghAccounts("✓ Logged in to github.com as ana (oauth_token)")).toEqual(["ana"]);
    expect(ghAccounts("You are not logged into any GitHub hosts.")).toEqual([]);
  });

  it("takes the worst of the checks", () => {
    expect(checksOf([])).toBe("none");
    expect(checksOf([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "SKIPPED" }])).toBe("passing");
    expect(checksOf([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "IN_PROGRESS", conclusion: "" }])).toBe("pending");
    expect(checksOf([{ status: "IN_PROGRESS" }, { status: "COMPLETED", conclusion: "FAILURE" }])).toBe("failing");
    expect(checksOf([{ state: "SUCCESS" }, { state: "ERROR" }])).toBe("failing");
    expect(checksOf([{ state: "PENDING" }])).toBe("pending");
  });

  it("reads the rows, newest first, with the checkout of each branch and no row it cannot read", () => {
    const older = { ...ROW, number: 3, headRefName: "feat/x", updatedAt: "2026-10-01T00:00:00Z", reviewDecision: "", isDraft: true, isCrossRepository: true, author: null };
    const entries = parsePullRequests(JSON.stringify([older, ROW, { number: "x" }, null]), worktrees);
    expect(entries.map((entry) => entry.number)).toEqual([7, 3]);
    expect(entries[0]).toMatchObject({ branch: "fix/reconnect", author: "ana", draft: false, fork: false, checks: "passing", review: "approved", checkout: { path: "/r-fix", open_workspace_id: "w2" } });
    expect(entries[1]).toMatchObject({ draft: true, fork: true, review: "none", author: null, checkout: null });
    expect(() => parsePullRequests("not json", worktrees)).toThrow(PullRequestError);
  });
});

describe("listPullRequests", () => {
  it("tries the account named like the owner first and remembers the one that can see the repository", async () => {
    standInGit("git@github.com:acme/app.git");
    standInGh(["ana", "acme"], ["acme"]);
    const listing = await listPullRequests("/r", worktrees);
    expect(listing).toMatchObject({ repository: "acme/app", account: "acme" });
    expect(listing.pull_requests).toHaveLength(1);
    expect((await Bun.file(log).text()).trim().split("\n")).toEqual(["token-for-acme"]);
    await listPullRequests("/r", worktrees);
    expect((await Bun.file(log).text()).trim().split("\n")).toEqual(["token-for-acme", "token-for-acme"]);
  });

  it("falls to the next account when the first cannot see the repository", async () => {
    standInGit("https://github.com/acme/app.git");
    standInGh(["acme", "ana"], ["ana"]);
    expect((await listPullRequests("/r", worktrees)).account).toBe("ana");
    expect((await Bun.file(log).text()).trim().split("\n")).toEqual(["token-for-acme", "token-for-ana"]);
  });

  it("says so when no account can see it, when none is signed in, when gh is missing and when the remote is not GitHub", async () => {
    standInGit("https://github.com/acme/app.git");
    standInGh(["ana"], []);
    await expect(listPullRequests("/r", worktrees)).rejects.toMatchObject({ code: "repository_unreachable" });
    standInGh([], []);
    await expect(listPullRequests("/r", worktrees)).rejects.toMatchObject({ code: "gh_signed_out" });
    setPullRequestOptions({ gh: join(scratch, "absent"), git, deadlineMs: 5000 });
    await expect(listPullRequests("/r", worktrees)).rejects.toMatchObject({ code: "gh_missing" });
    setPullRequestOptions({ gh, git, deadlineMs: 5000 });
    standInGit("https://gitlab.com/acme/app.git");
    await expect(listPullRequests("/r", worktrees)).rejects.toMatchObject({ code: "not_github" });
  });
});

describe("fetchPullRequestBranch", () => {
  it("fetches the branch into origin/<branch>", async () => {
    standInGit("git@github.com:acme/app.git");
    expect(await fetchPullRequestBranch("/r", "fix/reconnect")).toBe("origin/fix/reconnect");
    expect((await Bun.file(join(scratch, "fetch.log")).text()).trim()).toContain("+refs/heads/fix/reconnect:refs/remotes/origin/fix/reconnect");
  });

  it("refuses a name git does not allow, and says what git said when the fetch fails", async () => {
    standInGit("git@github.com:acme/app.git");
    await expect(fetchPullRequestBranch("/r", "--upload-pack=x")).rejects.toMatchObject({ code: "invalid_branch" });
    await expect(fetchPullRequestBranch("/r", "a..b")).rejects.toMatchObject({ code: "invalid_branch" });
    standInGit("git@github.com:acme/app.git", 1);
    await expect(fetchPullRequestBranch("/r", "gone")).rejects.toMatchObject({ code: "fetch_failed", message: "fatal: couldn't find remote ref" });
  });
});
