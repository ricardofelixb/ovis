import { FORK_PANE_VIEW_PATH } from "../../shared/fork/pane.ts";
import { HcReplyError } from "../herdr-core/connection.ts";
import { coreConnection } from "../herdr-core/runtime.ts";
import { errorResponse, jsonResponse, readJsonObject } from "../http.ts";
import { readCapped } from "../remote-json.ts";
import { capabilities } from "../runtime/capabilities.ts";

const VIEW = "ovis.view";
const refused = (code: string, message: string, status: number) => jsonResponse({ error: { code, message } }, status);

/**
 * POST FORK_PANE_VIEW_PATH: hides one agent (`ovis.view=hidden`, listed only by the inbox's Hidden filter) or shows it
 * again by taking that label off. herdr-core only: herdr has no labels. Any other `ovis.view` (a `work` runner's) is
 * never touched. Another PC's pane goes to that PC's own route with its bridge token, as its pane routes do (machine-api.ts).
 */
export async function handlePaneView(request: Request, readOnly: boolean, endpoint: (machineId: string) => { url: string; token: string } | undefined): Promise<Response> {
  if (request.method !== "POST") return refused("method_not_allowed", "use POST", 405);
  if (readOnly) return refused("read_only", "This device only watches", 403);
  const body = await readJsonObject<{ machine_id?: unknown; pane_id?: unknown; hidden?: unknown }>(request);
  if (body instanceof Response) return body;
  const { machine_id: machineId = "local", pane_id: paneId, hidden } = body;
  if (typeof machineId !== "string" || typeof paneId !== "string" || paneId === "" || typeof hidden !== "boolean") return refused("invalid_body", "machine_id, pane_id and hidden are required", 400);
  try {
    if (machineId !== "local") {
      const pc = endpoint(machineId);
      if (!pc) return refused("machine_offline", "This PC is disconnected", 503);
      const answer = await fetch(`${pc.url}${FORK_PANE_VIEW_PATH}`, {
        method: "POST", redirect: "error", signal: request.signal,
        headers: { authorization: `Bearer ${pc.token}`, "content-type": "application/json" },
        body: JSON.stringify({ machine_id: "local", pane_id: paneId, hidden }),
      });
      return new Response(await readCapped(answer, 16 * 1024), { status: answer.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    }
    // labels on terminals, which herdr has none of: herdr-core writes its seen marks with them too
    if (capabilities().seen !== "label") return refused("unsupported", "Only herdr-core hides agents", 409);
    const hc = coreConnection();
    const view = (await hc.call("terminal.get", { terminal: paneId })).labels?.[VIEW];
    if (view !== undefined && view !== "hidden") return refused("view_taken", `This terminal is ${VIEW}=${view}`, 409);
    if (hidden !== (view === "hidden")) await hc.call("terminal.label", { terminal: paneId, labels: { [VIEW]: hidden ? "hidden" : "" } });
    return jsonResponse({ ok: true, hidden });
  } catch (error) {
    if (error instanceof HcReplyError && error.kind === "not_found") return refused("pane_not_found", `pane ${paneId} not found`, 404);
    return errorResponse(error);
  }
}
