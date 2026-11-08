// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test, afterEach } from "bun:test";
import { buildApp } from "../src/app";
import { RuntimeStore } from "../src/store";

let app: ReturnType<typeof buildApp>;
afterEach(async () => { await app?.close(); });

const headers = (key = "k1", org = "org_1") => ({ "x-oc-org-id": org, "x-oc-user-id": "user_1", "idempotency-key": key });

async function createSession(key = "s1") {
  const response = await app.inject({ method: "POST", url: "/api/v1/runtime/sessions", headers: headers(key), payload: { workspace: { mode: "cloud" }, agent: { role: "lead" } } });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("agentcore runtime contract", () => {
  test("creates session/run and returns ordered steps", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const session = await createSession();
    expect(session.state).toBe("created");
    const runResponse = await app.inject({ method: "POST", url: `/api/v1/runtime/sessions/${session.id}/runs`, headers: headers("r1"), payload: { input: "build a report" } });
    expect(runResponse.statusCode).toBe(202);
    const run = runResponse.json();
    expect(run.state).toBe("succeeded");
    expect(run.steps.map((step: { seq: number }) => step.seq)).toEqual([1, 2, 3]);
    const get = await app.inject({ method: "GET", url: `/api/v1/runtime/runs/${run.id}`, headers: { "x-oc-org-id": "org_1", "x-oc-user-id": "user_1" } });
    expect(get.statusCode).toBe(200);
    expect(get.json().usage.tokens).toBeGreaterThan(0);
  });

  test("idempotency key returns same run", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const session = await createSession();
    const first = await app.inject({ method: "POST", url: `/api/v1/runtime/sessions/${session.id}/runs`, headers: headers("same"), payload: { input: "once" } });
    const second = await app.inject({ method: "POST", url: `/api/v1/runtime/sessions/${session.id}/runs`, headers: headers("same"), payload: { input: "twice" } });
    expect(first.json().id).toBe(second.json().id);
  });

  test("requires principal and idempotency key", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const noPrincipal = await app.inject({ method: "POST", url: "/api/v1/runtime/sessions", headers: { "idempotency-key": "x" }, payload: {} });
    expect(noPrincipal.statusCode).toBe(401);
    const noKey = await app.inject({ method: "POST", url: "/api/v1/runtime/sessions", headers: { "x-oc-org-id": "org_1", "x-oc-user-id": "u" }, payload: {} });
    expect(noKey.statusCode).toBe(400);
  });

  test("tenant isolation hides runs", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const session = await createSession();
    const run = await app.inject({ method: "POST", url: `/api/v1/runtime/sessions/${session.id}/runs`, headers: headers("r1"), payload: { input: "secret" } });
    const other = await app.inject({ method: "GET", url: `/api/v1/runtime/runs/${run.json().id}`, headers: { "x-oc-org-id": "org_2", "x-oc-user-id": "u2" } });
    expect(other.statusCode).toBe(404);
  });

  test("completed run cannot be canceled", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const session = await createSession();
    const run = await app.inject({ method: "POST", url: `/api/v1/runtime/sessions/${session.id}/runs`, headers: headers("r1"), payload: { input: "done" } });
    const cancel = await app.inject({ method: "POST", url: `/api/v1/runtime/runs/${run.json().id}/cancel`, headers: headers("c1"), payload: {} });
    expect(cancel.statusCode).toBe(409);
  });

  test("M2b legacy import is idempotent by legacy id", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const body = { legacy_run_id: "run_legacy_1", goal: "legacy goal", status: "completed", tasks: [{ title: "plan", employee_name: "lead", status: "completed", output: "ok" }] };
    const first = await app.inject({ method: "POST", url: "/api/v1/runtime/import/legacy-run", headers: headers("import-1"), payload: body });
    const second = await app.inject({ method: "POST", url: "/api/v1/runtime/import/legacy-run", headers: headers("import-2"), payload: body });
    expect(first.statusCode).toBe(201);
    expect(first.json().id).toBe(second.json().id);
    expect(first.json().legacy.id).toBe("run_legacy_1");
  });

  test("M2b legacy read exposes the original agent-workforce shape", async () => {
    app = buildApp({ store: new RuntimeStore(":memory:") });
    const raw = { id: "run_legacy_2", squad_id: "sq_1", goal: "migrate", status: "running", tasks: [{ title: "a", status: "completed" }] };
    const imported = await app.inject({ method: "POST", url: "/api/v1/runtime/import/legacy-run", headers: headers("import-raw"), payload: { legacy_run_id: raw.id, goal: raw.goal, status: raw.status, tasks: raw.tasks, legacy_data: raw } });
    expect(imported.statusCode).toBe(201);
    const list = await app.inject({ method: "GET", url: "/api/v1/runtime/legacy-runs", headers: { "x-oc-org-id": "org_1", "x-oc-user-id": "user_1" } });
    expect(list.statusCode).toBe(200);
    expect(list.json().items[0].data).toEqual(raw);
    const detail = await app.inject({ method: "GET", url: "/api/v1/runtime/legacy-runs/run_legacy_2", headers: { "x-oc-org-id": "org_1", "x-oc-user-id": "user_1" } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.squad_id).toBe("sq_1");
    const other = await app.inject({ method: "GET", url: "/api/v1/runtime/legacy-runs/run_legacy_2", headers: { "x-oc-org-id": "org_2", "x-oc-user-id": "u2" } });
    expect(other.statusCode).toBe(404);
  });
});
