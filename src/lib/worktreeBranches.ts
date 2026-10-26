import type { WorkspaceInfo, WorktreeListing, WorktreeOpened } from "../../shared/protocol.ts";

export interface WorkspaceBranch {
  checkoutPath: string;
  branch: string | null;
  isDetached: boolean;
}

interface CheckoutIdentity { repoKey: string; checkoutPath: string }
interface StoredBranch extends WorkspaceBranch { repoKey: string | null }
/** What a cache last read, kept on the device so the next start names branches before it reads git again. */
export interface SavedBranches { records: [string, StoredBranch][]; unmarked: [string, WorkspaceBranch][] }

const isBranch = (value: unknown): value is WorkspaceBranch => {
  const branch = value as Partial<WorkspaceBranch> | null;
  return typeof branch === "object" && branch !== null && typeof branch.checkoutPath === "string"
    && (branch.branch === null || typeof branch.branch === "string") && typeof branch.isDetached === "boolean";
};
const isStoredBranch = (value: unknown): value is StoredBranch => {
  const repoKey = (value as Partial<StoredBranch> | null)?.repoKey;
  return isBranch(value) && (repoKey === null || typeof repoKey === "string");
};
const entries = <T>(value: unknown, valid: (item: unknown) => item is T): [string, T][] =>
  Array.isArray(value) ? value.filter((entry): entry is [string, T] => Array.isArray(entry) && typeof entry[0] === "string" && valid(entry[1])) : [];
export interface WorktreeRepository { repoKey: string; workspaceId: string }

/** Compare API checkout paths without changing meaningful spaces or POSIX backslashes. */
export function normalizeCheckoutPath(path: string): string {
  const windows = /^[a-z]:[\\/]/i.test(path) || path.startsWith("\\\\");
  const separators = windows ? path.replace(/\\/g, "/").replace(/^([a-z]):/i, (_, drive: string) => `${drive.toUpperCase()}:`) : path;
  if (windows && /^[A-Z]:\/+$/i.test(separators)) return separators.slice(0, 3);
  return separators.replace(/\/+$/, "") || "/";
}

function checkoutIdentities(workspaces: readonly WorkspaceInfo[]): Map<string, CheckoutIdentity> {
  const identities = new Map<string, CheckoutIdentity>();
  for (const workspace of workspaces) if (workspace.worktree) identities.set(workspace.workspace_id, {
    repoKey: workspace.worktree.repo_key,
    checkoutPath: normalizeCheckoutPath(workspace.worktree.checkout_path),
  });
  return identities;
}

/** Status, workspace labels and reorder events do not cause another git inventory request. */
export function worktreeWorkspaceSignature(workspaces: readonly WorkspaceInfo[]): string {
  return JSON.stringify([...checkoutIdentities(workspaces)].sort(([left], [right]) => left.localeCompare(right))
    .map(([id, identity]) => [id, identity.repoKey, identity.checkoutPath]));
}

/**
 * One authoritative inventory per repository, preferably through its main checkout. Every
 * repository is read, one without linked worktrees too: the sidebar names each one's branch.
 */
export function worktreeRepositories(workspaces: readonly WorkspaceInfo[]): WorktreeRepository[] {
  const repositories = new Map<string, WorkspaceInfo>();
  for (const workspace of workspaces) {
    if (!workspace.worktree) continue;
    const previous = repositories.get(workspace.worktree.repo_key);
    if (!previous || (previous.worktree?.is_linked_worktree && !workspace.worktree.is_linked_worktree)) {
      repositories.set(workspace.worktree.repo_key, workspace);
    }
  }
  return [...repositories].sort(([left], [right]) => left.localeCompare(right))
    .map(([repoKey, workspace]) => ({ repoKey, workspaceId: workspace.workspace_id }));
}

function matches(branch: StoredBranch, identity: CheckoutIdentity): boolean {
  return branch.checkoutPath === identity.checkoutPath && (branch.repoKey === null || branch.repoKey === identity.repoKey);
}

/**
 * Branches belong to an exact workspace checkout. Request generations reject inventory
 * responses read before a create/open result or a roster change. A fresh result can arrive
 * before its workspace's next snapshot; that seed lasts until the next structural snapshot.
 */
export class WorkspaceBranchCache {
  private identities = new Map<string, CheckoutIdentity>();
  private records = new Map<string, StoredBranch>();
  /** git workspaces herdr has not marked (no `worktree`), by workspace id */
  private unmarked = new Map<string, WorkspaceBranch>();
  private signature = "";
  private revision = 0;

  get generation(): number { return this.revision; }

  /**
   * Branches saved by an earlier start, shown until the first inventory: each one only while its
   * workspace's checkout is still the one it was read from (branchesFor, reconcile). Anything
   * malformed is dropped.
   */
  restore(saved: unknown): void {
    const value = saved as Partial<SavedBranches> | null;
    if (typeof value !== "object" || value === null) return;
    for (const [id, branch] of entries(value.records, isStoredBranch)) if (!this.records.has(id)) this.records.set(id, branch);
    for (const [id, branch] of entries(value.unmarked, isBranch)) if (!this.unmarked.has(id)) this.unmarked.set(id, branch);
  }

  saved(): SavedBranches {
    return { records: [...this.records], unmarked: [...this.unmarked] };
  }

  invalidate(): void { this.revision++; }

  reconcile(workspaces: readonly WorkspaceInfo[]): void {
    const signature = worktreeWorkspaceSignature(workspaces);
    if (signature === this.signature) return;
    this.signature = signature;
    this.identities = checkoutIdentities(workspaces);
    this.invalidate();
    const retained = new Map<string, StoredBranch>();
    for (const [id, branch] of this.records) {
      const identity = this.identities.get(id);
      if (identity && matches(branch, identity)) retained.set(id, { ...branch, repoKey: identity.repoKey });
    }
    this.records = retained;
  }

  rememberOpened(opened: WorktreeOpened): void {
    this.invalidate();
    if (opened.branch == null) {
      // The response has no detached flag. Await the inventory before calling it detached.
      this.records.delete(opened.workspace_id);
      return;
    }
    const checkoutPath = normalizeCheckoutPath(opened.path);
    const identity = this.identities.get(opened.workspace_id);
    this.records.set(opened.workspace_id, {
      checkoutPath,
      branch: opened.branch,
      isDetached: false,
      repoKey: identity?.checkoutPath === checkoutPath ? identity.repoKey : null,
    });
  }

  applyListing(repoKey: string, listing: WorktreeListing, generation: number): boolean {
    if (generation !== this.revision || listing.source.repo_key !== repoKey) return false;
    for (const [id, identity] of this.identities) {
      if (identity.repoKey !== repoKey) continue;
      const entry = listing.worktrees.find((candidate) => candidate.open_workspace_id === id
        && normalizeCheckoutPath(candidate.path) === identity.checkoutPath);
      if (!entry) { this.records.delete(id); continue; }
      this.records.set(id, {
        repoKey,
        checkoutPath: identity.checkoutPath,
        branch: entry.branch ?? null,
        isDetached: entry.is_detached,
      });
    }
    return true;
  }

  /** A git workspace herdr has not marked: the branch of the checkout it answered from. */
  applyUnmarked(workspaceId: string, listing: WorktreeListing, generation: number): boolean {
    if (generation !== this.revision) return false;
    const source = normalizeCheckoutPath(listing.source.source_checkout_path);
    const entry = listing.worktrees.find((candidate) => normalizeCheckoutPath(candidate.path) === source);
    if (!entry) return this.unmarked.delete(workspaceId);
    const before = this.unmarked.get(workspaceId);
    const branch = { checkoutPath: source, branch: entry.branch ?? null, isDetached: entry.is_detached };
    this.unmarked.set(workspaceId, branch);
    return before?.branch !== branch.branch || before.isDetached !== branch.isDetached || before.checkoutPath !== branch.checkoutPath;
  }

  /** git refused an unmarked workspace (a 4xx): it is no checkout now, so its branch goes. */
  forgetUnmarked(workspaceId: string, generation: number): boolean {
    return generation === this.revision && this.unmarked.delete(workspaceId);
  }

  /**
   * Filter against this render's snapshot as well, before the reconciliation effect runs.
   * `unmarked`: the git workspaces herdr has not marked that are still known as such.
   */
  branchesFor(workspaces: readonly WorkspaceInfo[], unmarked: ReadonlySet<string> = new Set()): ReadonlyMap<string, WorkspaceBranch> {
    const branches = new Map<string, WorkspaceBranch>();
    for (const workspace of workspaces) {
      const branch = workspace.worktree ? undefined : unmarked.has(workspace.workspace_id) ? this.unmarked.get(workspace.workspace_id) : undefined;
      if (branch) branches.set(workspace.workspace_id, branch);
    }
    for (const [id, identity] of checkoutIdentities(workspaces)) {
      const branch = this.records.get(id);
      if (branch && matches(branch, identity)) branches.set(id, {
        checkoutPath: branch.checkoutPath,
        branch: branch.branch,
        isDetached: branch.isDetached,
      });
    }
    return branches;
  }
}
