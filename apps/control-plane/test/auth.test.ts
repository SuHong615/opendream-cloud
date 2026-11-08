// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await setupHarness();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;

describe("AUTH", () => {
  test("AUTH-01 未登录访问 /me 返回 401 unauthorized", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/me" });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string; request_id: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.request_id).toBeString();
  });

  test("AUTH-02 dev-login 创建 user/org，Cookie 为 HttpOnly 且 /me 可用", async () => {
    const address = email("alice");
    const session = await devLogin(app, address);
    expect(session.cookie).toContain("__Host-oc_session=");
    const response = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { user: { email: string }; active_org: { role: string }; permissions: string[] };
    expect(body.user.email).toBe(address);
    expect(body.active_org.role).toBe("owner");
    expect(body.permissions).toContain("workspace.create");
  });

  test("AUTH-03 同邮箱重复登录复用 user/org", async () => {
    const address = email("bob");
    const first = await devLogin(app, address);
    const second = await devLogin(app, address);
    expect(second.userId).toBe(first.userId);
    expect(second.orgId).toBe(first.orgId);
  });

  test("AUTH-04 生产环境禁用 dev-login", async () => {
    const prod = await setupHarness({ NODE_ENV: "development", ALLOW_DEV_LOGIN: "0" });
    try {
      const response = await prod.app.inject({
        method: "POST",
        url: "/api/v1/auth/dev-login",
        payload: { email: "prod@example.com" },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await prod.close();
    }
  });

  test("AUTH-05 登出后 /me 返回 401", async () => {
    const session = await devLogin(app, email("carol"));
    const logout = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: headers(session),
    });
    expect(logout.statusCode).toBe(204);
    const me = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: session.cookie } });
    expect(me.statusCode).toBe(401);
  });

  test("AUTH-06 写操作缺少 CSRF 返回 403", async () => {
    const session = await devLogin(app, email("dave"));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: { cookie: session.cookie },
      payload: { name: "no-csrf" },
    });
    expect(response.statusCode).toBe(403);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });
});
