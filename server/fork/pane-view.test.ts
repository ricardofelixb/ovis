import { afterEach, beforeEach, expect, it, spyOn } from "bun:test";
import { HcConnection } from "../herdr-core/connection.ts";
import { FakeHcCore } from "../herdr-core/core.fake.ts";
import * as runtime from "../herdr-core/runtime.ts";
import { FORK_PANE_VIEW_PATH } from "../../shared/fork/pane.ts";
import { handlePaneView } from "./pane-view.ts";

let fake: FakeHcCore;
let hc: HcConnection;
let connection: ReturnType<typeof spyOn>;
beforeEach(() => {
  fake = new FakeHcCore();
  hc = new HcConnection(() => fake.transport());
  connection = spyOn(runtime, "coreConnection").mockReturnValue(hc);
  runtime.setRuntime("herdr-core");
});
afterEach(() => { connection.mockRestore(); hc.close(); runtime.setRuntime(null); });

const ask = (body: object, readOnly = false, endpoint: (id: string) => { url: string; token: string } | undefined = () => undefined) =>
  handlePaneView(new Request(`http://ovis${FORK_PANE_VIEW_PATH}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), readOnly, endpoint);

it("hides a pane with ovis.view=hidden and unhides it by taking the label off", async () => {
  const pane = fake.spawn({ labels: { "ovis.name": "kept" } }).address;
  expect((await ask({ machine_id: "local", pane_id: pane, hidden: true })).status).toBe(200);
  expect(fake.terminal(pane).labels).toEqual({ "ovis.name": "kept", "ovis.view": "hidden" });
  expect((await ask({ machine_id: "local", pane_id: pane, hidden: false })).status).toBe(200);
  expect(fake.terminal(pane).labels).toEqual({ "ovis.name": "kept" });
});

it("never clears or overwrites ovis.view=work", async () => {
  const pane = fake.spawn({ labels: { "ovis.view": "work" } }).address;
  for (const hidden of [true, false]) {
    const answer = await ask({ machine_id: "local", pane_id: pane, hidden });
    expect(answer.status).toBe(409);
    expect(fake.terminal(pane).labels["ovis.view"]).toBe("work");
  }
});

it("refuses a caller that only watches, and herdr", async () => {
  const pane = fake.spawn().address;
  const watching = await ask({ machine_id: "local", pane_id: pane, hidden: true }, true);
  expect(watching.status).toBe(403);
  expect(((await watching.json()) as { error: { code: string } }).error.code).toBe("read_only");
  runtime.setRuntime("herdr");
  expect((await ask({ machine_id: "local", pane_id: pane, hidden: true })).status).toBe(409);
  expect(fake.terminal(pane).labels["ovis.view"]).toBeUndefined();
});

it("hands another PC's pane to that PC with its token", async () => {
  const fetched = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));
  try {
    expect((await ask({ machine_id: "pc2", pane_id: "p9", hidden: true }, false, (id) => id === "pc2" ? { url: "http://pc2:7317", token: "t2" } : undefined)).status).toBe(200);
    const [url, init] = fetched.mock.calls[0]!;
    expect(url).toBe(`http://pc2:7317${FORK_PANE_VIEW_PATH}`);
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer t2");
    expect(JSON.parse(String(init?.body))).toEqual({ machine_id: "local", pane_id: "p9", hidden: true });
    expect((await ask({ machine_id: "gone", pane_id: "p9", hidden: true })).status).toBe(503);
  } finally { fetched.mockRestore(); }
});
