// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let center: ReturnType<typeof Bun.serve>;
let lastHeaders: Record<string, string> = {};

beforeAll(async () => {
  center = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      lastHeaders = {
        org: String(request.headers.get("x-oc-org-id") ?? ""),
        user: String(request.headers.get("x-oc-user-id") ?? ""),
        roles: String(request.headers.get("x-oc-roles") ?? ""),
      };
      if (url.pathname === "/api/v1/apps" && request.method === "GET") {
        return Response.json({ items: [{ id: "a1", org_id: lastHeaders.org, name: "demo" }], next_cursor: null });
      }
      if (url.pathname === "/api/v1/apps" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        return Response.json({ id: "a-new", version: 1, ...body }, { status: 201 });
      }
      if (url.pathname.endsWith("/forbidden")) {
        return Response.json({ error: { code: "forbidden", message: "requires edit permission" } }, { status: 403 });
      }
      return Response.json({ ok: true, path: url.pathname });
    },
  });
  harness = await setupHarness({ APP_CENTER_URL: `http://127.0.0.1:${center.port}` });
});

afterAll(async () => {
  await harness.close();
  center.stop(true);
});

describe("control-plane App Center 门面", () => {
  test("APP-PROXY-01 GET 转发并携带租户身份", async () => {
    const session = await devLogin(harness.app, `app-proxy-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/apps", headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { items: Array<{ id: string }> }).items[0]?.id).toBe("a1");
    expect(lastHeaders.org).toBe(session.orgId);
    expect(lastHeaders.user).toBe(session.userId);
  });

  test("APP-PROXY-02 写操作必须 CSRF；app-center 403 原样透传", async () => {
    const session = await devLogin(harness.app, `app-proxy-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const noCsrf = await harness.app.inject({ method: "POST", url: "/api/v1/apps", headers: { cookie: session.cookie }, payload: { name: "x" } });
    expect(noCsrf.statusCode).toBe(403);

    const created = await harness.app.inject({
      method: "POST",
      url: "/api/v1/apps",
      headers: headers(session),
      payload: { name: "x" },
    });
    expect(created.statusCode).toBe(201);

    const forbidden = await harness.app.inject({ method: "GET", url: "/api/v1/apps/a1/forbidden", headers: { cookie: session.cookie } });
    expect(forbidden.statusCode).toBe(403);
  });

  test("APP-PROXY-03 app-center 不可用 → 502 upstream_error", async () => {
    const broken = await setupHarness({ APP_CENTER_URL: "http://127.0.0.1:1" });
    try {
      const session = await devLogin(broken.app, `app-proxy-${crypto.randomUUID().slice(0, 6)}@example.com`);
      const response = await broken.app.inject({ method: "GET", url: "/api/v1/apps", headers: { cookie: session.cookie } });
      expect(response.statusCode).toBe(502);
      expect((response.json() as { error: { code: string } }).error.code).toBe("upstream_error");
    } finally {
      await broken.close();
    }
  });
});
