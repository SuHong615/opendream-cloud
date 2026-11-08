// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterEach, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { AgentLoopStore } from "../src/store";

let app: ReturnType<typeof buildApp>;
afterEach(async () => { await app?.close(); });
const h = (key = "k1", org = "org_1") => ({ "x-oc-org-id": org, "x-oc-user-id": "u1", "idempotency-key": key });

describe("agentloop quality plane", () => {
  test("trace -> eval -> gate", async () => {
    app = buildApp({ store: new AgentLoopStore(":memory:") });
    const trace = await app.inject({ method: "POST", url: "/api/v1/quality/traces", headers: h("t1"), payload: { trace_id: "tr_1", run_id: "run_1", status: "ok", spans: [{ name: "plan", status: "ok" }] } });
    expect(trace.statusCode).toBe(201);
    const evalRun = await app.inject({ method: "POST", url: "/api/v1/quality/eval-runs", headers: h("e1"), payload: { name: "release", cases: [{ trace_id: "tr_1" }] } });
    expect(evalRun.statusCode).toBe(201);
    expect(evalRun.json().status).toBe("passed");
    expect(evalRun.json().score).toBe(1);
    const gate = await app.inject({ method: "POST", url: "/api/v1/quality/gates", headers: h("g1"), payload: { name: "release-gate", min_score: 0.9 } });
    expect(gate.statusCode).toBe(201);
    expect(gate.json().active).toBe(true);
  });

  test("failed trace fails eval", async () => {
    app = buildApp({ store: new AgentLoopStore(":memory:") });
    await app.inject({ method: "POST", url: "/api/v1/quality/traces", headers: h("t1"), payload: { trace_id: "tr_bad", run_id: "run_1", status: "error", spans: [{ name: "execute", status: "error" }] } });
    const evalRun = await app.inject({ method: "POST", url: "/api/v1/quality/eval-runs", headers: h("e1"), payload: { name: "release", cases: [{ trace_id: "tr_bad" }] } });
    expect(evalRun.json().status).toBe("failed");
  });

  test("idempotency and tenant isolation", async () => {
    app = buildApp({ store: new AgentLoopStore(":memory:") });
    const first = await app.inject({ method: "POST", url: "/api/v1/quality/traces", headers: h("same"), payload: { trace_id: "tr_1", run_id: "run_1", status: "ok", spans: [] } });
    const second = await app.inject({ method: "POST", url: "/api/v1/quality/traces", headers: h("same"), payload: { trace_id: "tr_2", run_id: "run_2", status: "ok", spans: [] } });
    expect(first.json().id).toBe(second.json().id);
    const other = await app.inject({ method: "GET", url: "/api/v1/quality/traces/tr_1", headers: h("x", "org_2") });
    expect(other.statusCode).toBe(404);
  });
});
