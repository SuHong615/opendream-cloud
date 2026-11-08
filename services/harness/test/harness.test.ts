// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterEach, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { HarnessStore } from "../src/store";

let app: ReturnType<typeof buildApp>;
afterEach(async () => { await app?.close(); });

const h = (key = "k1", org = "org_1") => ({ "x-oc-org-id": org, "x-oc-user-id": "user_1", "idempotency-key": key });

async function createSession(key = "s1") {
  const response = await app.inject({ method: "POST", url: "/api/v1/harness/sessions", headers: h(key), payload: { mode: "local" } });
  expect(response.statusCode).toBe(201);
  return response.json();
}

describe("harness protocol", () => {
  test("local session + permission lifecycle + events", async () => {
    app = buildApp({ store: new HarnessStore(":memory:") });
    const session = await createSession();
    expect(session.runtime_session_id).toBeNull();
    const permission = await app.inject({ method: "POST", url: `/api/v1/harness/sessions/${session.id}/permissions`, headers: h(), payload: { tool: "bash", reason: "run tests" } });
    expect(permission.statusCode).toBe(201);
    const decide = await app.inject({ method: "POST", url: `/api/v1/harness/permissions/${permission.json().id}/decide`, headers: h("d1"), payload: { decision: "allow_once" } });
    expect(decide.statusCode).toBe(200);
    expect(decide.json().status).toBe("allowed");
    const events = await app.inject({ method: "GET", url: `/api/v1/harness/sessions/${session.id}/events`, headers: h() });
    expect(events.statusCode).toBe(200);
    expect(events.json().items.map((e: { type: string }) => e.type)).toEqual(["harness.session.created", "harness.permission.asked", "harness.permission.decided"]);
  });

  test("idempotency and tenant isolation", async () => {
    app = buildApp({ store: new HarnessStore(":memory:") });
    const first = await createSession("same");
    const second = await app.inject({ method: "POST", url: "/api/v1/harness/sessions", headers: h("same"), payload: { mode: "local" } });
    expect(second.json().id).toBe(first.id);
    const other = await app.inject({ method: "GET", url: `/api/v1/harness/sessions/${first.id}`, headers: h("x", "org_2") });
    expect(other.statusCode).toBe(404);
  });

  test("cloud mode creates AgentCore runtime session", async () => {
    const calls: string[] = [];
    const stub = (async (input: string | URL | Request) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ id: "sess_runtime_1" }), { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    app = buildApp({ store: new HarnessStore(":memory:"), agentcoreUrl: "http://agentcore.test", fetchImpl: stub });
    const response = await app.inject({ method: "POST", url: "/api/v1/harness/sessions", headers: h(), payload: { mode: "cloud" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().runtime_session_id).toBe("sess_runtime_1");
    expect(calls[0]).toContain("/api/v1/runtime/sessions");
  });

  test("snapshot persists", async () => {
    app = buildApp({ store: new HarnessStore(":memory:") });
    const response = await app.inject({ method: "POST", url: "/api/v1/harness/workspaces/ws_1/snapshot", headers: h(), payload: { commit: "abc123", hash: "sha256:1" } });
    expect(response.statusCode).toBe(201);
    expect(response.json().workspace_id).toBe("ws_1");
  });
});
