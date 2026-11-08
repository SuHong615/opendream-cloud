// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let evalCenter: ReturnType<typeof Bun.serve>;
let lastHeaders: Record<string, string> = {};
let lastGetContentType: string | null = null;

beforeAll(async () => {
  evalCenter = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      lastHeaders = {
        org: String(request.headers.get("x-oc-org-id") ?? ""),
        user: String(request.headers.get("x-oc-user-id") ?? ""),
        roles: String(request.headers.get("x-oc-roles") ?? ""),
      };
      if (request.method === "DELETE") return new Response(null, { status: 204 });
      if (request.method !== "GET") {
        const body = await request.json().catch(() => ({}));
        return Response.json({ id: "ev-1", echo: body, path: url.pathname }, { status: 201 });
      }
      lastGetContentType = request.headers.get("content-type");
      return Response.json({ items: [{ id: "ev-1", path: url.pathname }], next_cursor: null });
    },
  });
  harness = await setupHarness({ EVAL_CENTER_URL: `http://127.0.0.1:${evalCenter.port}` });
});

afterAll(async () => {
  await harness.close();
  evalCenter.stop(true);
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 6)}@example.com`;

describe("control-plane eval 门面", () => {
  test("EVAL-PROXY-01 GET 转发并透传 principal 头", async () => {
    const session = await devLogin(harness.app, email("eval1"));
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/eval-runs?limit=5", headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: Array<{ path: string }> }).items[0]?.path).toBe("/api/v1/eval-runs");
    expect(lastHeaders.org).toBe(session.orgId);
    expect(lastHeaders.user).toBe(session.userId);
    expect(lastHeaders.roles).toBe("owner");
    expect(lastGetContentType).toBeNull();
  });

  test("EVAL-PROXY-02 evaluator 写操作 CSRF + 审计；204 透传", async () => {
    const session = await devLogin(harness.app, email("eval2"));
    const denied = await harness.app.inject({ method: "POST", url: "/api/v1/eval-evaluators", headers: { cookie: session.cookie }, payload: { name: "x" } });
    expect(denied.statusCode).toBe(403);
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/v1/eval-evaluators",
      headers: headers(session),
      payload: { name: "custom" },
    });
    expect(created.statusCode).toBe(201);
    const audit = await harness.app.inject({ method: "GET", url: "/api/v1/audit-logs?limit=20", headers: { cookie: session.cookie } });
    expect((audit.json() as { items: Array<{ action: string }> }).items.some((item) => item.action === "eval.proxy.post")).toBe(true);
    const deleted = await harness.app.inject({ method: "DELETE", url: "/api/v1/eval-evaluators/ev-1", headers: headers(session) });
    expect(deleted.statusCode).toBe(204);
  });

  test("EVAL-PROXY-03 上游不可用 502 upstream_error", async () => {
    const broken = await setupHarness({ EVAL_CENTER_URL: "http://127.0.0.1:1" });
    try {
      const session = await devLogin(broken.app, email("eval3"));
      const response = await broken.app.inject({ method: "GET", url: "/api/v1/eval-runs", headers: { cookie: session.cookie } });
      expect(response.statusCode).toBe(502);
      expect((response.json() as { error: { code: string } }).error.code).toBe("upstream_error");
    } finally {
      await broken.close();
    }
  });

  test("EVAL-PROXY-04 未登录 401；/internal 段被门面阻断", async () => {
    const unauth = await harness.app.inject({ method: "GET", url: "/api/v1/eval-evaluators" });
    expect(unauth.statusCode).toBe(401);
    const session = await devLogin(harness.app, email("eval4"));
    const blocked = await harness.app.inject({ method: "GET", url: "/api/v1/eval-runs/internal/debug", headers: { cookie: session.cookie } });
    expect(blocked.statusCode).toBe(404);
  });
});
