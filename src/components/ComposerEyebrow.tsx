import { useT } from "../lib/i18n.ts";
import { DETACHED, usePaneBranch } from "../lib/paneBranch.ts";
import { HeaderBranch } from "./HeaderBranch.tsx";

/**
 * Where the message goes, over the message box: the pane's workspace and its branch, in less than
 * half the box's width. The header gave its title row to the tabs, so this is where a pane says it.
 */
export function ComposerEyebrow({ machineId, workspaceId, workspace }: { machineId: string; workspaceId: string; workspace: string }) {
  const t = useT();
  const branch = usePaneBranch(machineId, workspaceId);
  return <div className="composer-eyebrow">
    <div className="composer-eyebrow-line">
      <span className="composer-eyebrow-workspace" title={workspace}>{workspace}</span>
      {branch !== null && <><span className="composer-eyebrow-sep" aria-hidden="true">·</span><HeaderBranch branch={branch === DETACHED ? t("Detached HEAD") : branch} /></>}
    </div>
  </div>;
}
