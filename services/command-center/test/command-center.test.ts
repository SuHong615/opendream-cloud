// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterEach, describe, expect, test } from "bun:test";
import { buildApp } from "../src/app";
import { CommandStore } from "../src/store";

let app: ReturnType<typeof buildApp>;
afterEach(async () => { await app?.close(); });
const h = (key = "k1", org = "org_1") => ({ "x-oc-org-id": org, "x-oc-user-id": "u1", "idempotency-key": key });

describe("command center projection", () => {
  test("ingest event and fronts", async () => {
    app = buildApp({ store: new CommandStore(":memory:") });
    const event = await app.inject({ method: "POST", url: "/api/v1/command/events", headers: h("e1"), payload: { id: "evt_1", type: "loopforge.gate.waiting", subject: "approval/appr_1", data: { gate: "review" } } });
    expect(event.statusCode).toBe(201);
    const fronts = await app.inject({ method: "GET", url: "/api/v1/command/fronts", headers: h() });
    expect(fronts.json().items[0].events).toBe(1);
    expect(fronts.json().items[0].waiting_human).toBe(1);
  });

  test("intervention idempotent and tenant isolated", async () => {
    app = buildApp({ store: new CommandStore(":memory:") });
    const body = { mission_id: "m1", target_run_id: "r1", action: "pause", reason: "risk" };
    const first = await app.inject({ method: "POST", url: "/api/v1/command/interventions", headers: h("i1"), payload: body });
    const second = await app.inject({ method: "POST", url: "/api/v1/command/interventions", headers: h("i1"), payload: body });
    expect(first.statusCode).toBe(202);
    expect(second.json().id).toBe(first.json().id);
    const other = await app.inject({ method: "GET", url: "/api/v1/command/fronts", headers: h("x", "org_2") });
    expect(other.json().items[0].events).toBe(0);
  });

  test("cancel intervention dispatches to agent-workforce", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "r1", status: "canceled" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    app = buildApp({ store: new CommandStore(":memory:"), workforceUrl: "http://aw:4106/", fetchImpl });
    const response = await app.inject({ method: "POST", url: "/api/v1/command/interventions", headers: h("c1"), payload: { mission_id: "m1", target_run_id: "r1", action: "cancel", reason: "stop" } });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe("dispatched");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://aw:4106/api/v1/agent-runs/r1/cancel");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.headers as Record<string, string>)["x-oc-org-id"]).toBe("org_1");
  });

  test("send_back intervention forwards reason", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "r1", status: "running" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    app = buildApp({ store: new CommandStore(":memory:"), workforceUrl: "http://aw:4106", fetchImpl });
    const response = await app.inject({ method: "POST", url: "/api/v1/command/interventions", headers: h("sb1"), payload: { mission_id: "m1", target_run_id: "r1", action: "send_back", reason: "验收不通过" } });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe("dispatched");
    expect(calls[0]?.url).toBe("http://aw:4106/api/v1/agent-runs/r1/send-back");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ reason: "验收不通过" });
  });

  test("cancel intervention records failure when agent-workforce rejects", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    app = buildApp({ store: new CommandStore(":memory:"), workforceUrl: "http://aw:4106", fetchImpl });
    const response = await app.inject({ method: "POST", url: "/api/v1/command/interventions", headers: h("c2"), payload: { mission_id: "m1", target_run_id: "missing", action: "cancel", reason: "stop" } });
    expect(response.statusCode).toBe(202);
    expect(response.json().status).toBe("failed");
  });
});

