// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let workflow: ReturnType<typeof Bun.serve>;
let dh: ReturnType<typeof Bun.serve>;
let wfHeaders: Record<string, string> = {};
let wfGetContentType: string | null = null;

beforeAll(async () => {
  workflow = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      wfHeaders = {
        org: String(request.headers.get("x-oc-org-id") ?? ""),
        user: String(request.headers.get("x-oc-user-id") ?? ""),
        roles: String(request.headers.get("x-oc-roles") ?? ""),
      };
      if (url.pathname.endsWith("/healthz")) return Response.json({ status: "ok" });
      if (request.method === "DELETE") return new Response(null, { status: 204 });
      if (request.method !== "GET") {
        const body = await request.json().catch(() => ({}));
        return Response.json({ id: "wf-1", echo: body, path: url.pathname }, { status: 201 });
      }
      wfGetContentType = request.headers.get("content-type");
      return Response.json({ items: [{ id: "wf-1", path: url.pathname }], next_cursor: null });
    },
  });
  dh = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/healthz")) return Response.json({ status: "ok" });
      return Response.json({ items: [{ id: "dh-session-1", path: url.pathname }], next_cursor: null });
    },
  });
  harness = await setupHarness({
    WORKFLOW_URL: `http://127.0.0.1:${workflow.port}`,
    DIGITAL_HUMAN_URL: `http://127.0.0.1:${dh.port}`,
  });
});

afterAll(async () => {
  await harness.close();
  workflow.stop(true);
  dh.stop(true);
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 6)}@example.com`;

describe("control-plane workflow / digital-human 门面", () => {
  test("WF-PROXY-01 GET 转发并透传 principal 头", async () => {
    const session = await devLogin(harness.app, email("wf1"));
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/workflows?limit=5", headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: Array<{ path: string }> }).items[0]?.path).toBe("/api/v1/workflows");
    expect(wfHeaders.org).toBe(session.orgId);
    expect(wfHeaders.user).toBe(session.userId);
    expect(wfHeaders.roles).toBe("owner");
  });

  test("WF-PROXY-02 写操作 CSRF + 审计；204 透传", async () => {
    const session = await devLogin(harness.app, email("wf2"));
    const denied = await harness.app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: { cookie: session.cookie },
      payload: { name: "flow" },
    });
    expect(denied.statusCode).toBe(403);

    const created = await harness.app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: headers(session),
      payload: { name: "flow" },
    });
    expect(created.statusCode).toBe(201);
    const audit = await harness.app.inject({ method: "GET", url: "/api/v1/audit-logs?limit=20", headers: { cookie: session.cookie } });
    expect((audit.json() as { items: Array<{ action: string }> }).items.some((item) => item.action === "workflow.proxy.post")).toBe(true);

    const deleted = await harness.app.inject({ method: "DELETE", url: "/api/v1/workflow-runs/run-1", headers: headers(session) });
    expect(deleted.statusCode).toBe(204);
  });

  test("WF-PROXY-03 上游不可用 502 upstream_error", async () => {
    const broken = await setupHarness({ WORKFLOW_URL: "http://127.0.0.1:1", DIGITAL_HUMAN_URL: "http://127.0.0.1:1" });
    try {
      const session = await devLogin(broken.app, email("wf3"));
      const response = await broken.app.inject({ method: "GET", url: "/api/v1/workflows", headers: { cookie: session.cookie } });
      expect(response.statusCode).toBe(502);
      expect((response.json() as { error: { code: string } }).error.code).toBe("upstream_error");
    } finally {
      await broken.close();
    }
  });

  test("WF-PROXY-04 非用户动作 advance/internal 被门面阻断；GET 不发送 content-type", async () => {
    const session = await devLogin(harness.app, email("wf4"));
    for (const path of ["/api/v1/workflow-runs/run-1/advance", "/api/v1/workflows/internal/dev"]) {
      const response = await harness.app.inject({ method: "POST", url: path, headers: headers(session), payload: {} });
      expect(response.statusCode).toBe(404);
      expect((response.json() as { error: { code: string } }).error.code).toBe("not_found");
    }
    const get = await harness.app.inject({
      method: "GET",
      url: "/api/v1/workflows?x=1",
      headers: { cookie: session.cookie, "content-type": "application/json" },
    });
    expect(get.statusCode).toBe(200);
    // fake 上游记录 GET 请求头
    const echoed = (get.json() as { items: Array<{ path: string }> }).items[0];
    expect(echoed?.path).toBe("/api/v1/workflows");
    expect(wfGetContentType).toBeNull();
  });

  test("DH-PROXY-01 /api/v1/dh* 转发 + 健康检查", async () => {
    const session = await devLogin(harness.app, email("dh1"));
    const sessions = await harness.app.inject({ method: "GET", url: "/api/v1/dh/sessions", headers: { cookie: session.cookie } });
    expect(sessions.statusCode).toBe(200);
    expect((sessions.json() as { items: Array<{ id: string }> }).items[0]?.id).toBe("dh-session-1");

    const health = await harness.app.inject({ method: "GET", url: "/api/v1/digital-human/health", headers: { cookie: session.cookie } });
    expect(health.statusCode).toBe(200);
    expect((health.json() as { status: string }).status).toBe("ok");
  });
});
