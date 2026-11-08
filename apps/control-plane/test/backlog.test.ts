// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await setupHarness({ OIDC_ENABLED: "1", OIDC_MOCK: "1", OIDC_REDIRECT_URI: "http://localhost:4000/api/v1/auth/callback" });
  app = harness.app;
});
afterAll(async () => {
  await harness.close();
});

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
  return list.map((item) => item.split(";")[0]!).join("; ");
}

describe("M2 backlog / OIDC", () => {
  test("OIDC mock 登录 → callback → session/refresh", async () => {
    const start = await app.inject({ method: "GET", url: "/api/v1/auth/login?redirect=/workspaces" });
    expect(start.statusCode).toBe(302);
    const location = String(start.headers.location);
    expect(location).toContain("/api/v1/auth/mock-authorize");
    const state = new URL(location, "http://localhost").searchParams.get("state")!;
    const authorize = await app.inject({ method: "GET", url: `/api/v1/auth/mock-authorize?state=${encodeURIComponent(state)}&email=sso-e2e@example.com` });
    expect(authorize.statusCode).toBe(302);
    const callbackUrl = new URL(String(authorize.headers.location));
    const callback = await app.inject({ method: "GET", url: `${callbackUrl.pathname}${callbackUrl.search}` });
    expect(callback.statusCode).toBe(302);
    const cookie = cookieFrom(callback);
    expect(cookie).toContain("__Host-oc_session=");
    const me = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe("sso-e2e@example.com");
    const refresh = await app.inject({ method: "POST", url: "/api/v1/auth/refresh", headers: { cookie } });
    expect(refresh.statusCode).toBe(200);
    expect((refresh.json() as { ok: boolean }).ok).toBe(true);
  });

  test("API key 轮换 / org CRUD / quotas / exports / events", async () => {
    const session = await devLogin(app, `backlog-${Date.now()}@example.com`);
    const auth = { ...headers(session), cookie: session.cookie };

    const key = await app.inject({ method: "POST", url: "/api/v1/api-keys", headers: auth, payload: { name: "rotate-me" } });
    expect(key.statusCode).toBe(201);
    const keyId = (key.json() as { id: string }).id;
    const rotated = await app.inject({ method: "POST", url: `/api/v1/api-keys/${keyId}/rotate`, headers: auth, payload: {} });
    expect(rotated.statusCode).toBe(200);
    expect((rotated.json() as { plaintext: string }).plaintext.startsWith("ock_")).toBe(true);

    const org = await app.inject({ method: "POST", url: "/api/v1/orgs", headers: auth, payload: { name: "Backlog Org" } });
    expect(org.statusCode).toBe(201);
    const orgId = (org.json() as { id: string }).id;
    expect((await app.inject({ method: "GET", url: `/api/v1/orgs/${orgId}`, headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/v1/orgs", headers: auth })).statusCode).toBe(200);

    const quota = await app.inject({ method: "GET", url: "/api/v1/quotas", headers: auth });
    expect(quota.statusCode).toBe(200);
    const request = await app.inject({ method: "POST", url: "/api/v1/quota-requests", headers: auth, payload: { resource: "workspaces", amount: 2, reason: "test" } });
    expect(request.statusCode).toBe(201);

    const exportJob = await app.inject({ method: "POST", url: "/api/v1/audit-logs/exports", headers: auth, payload: {} });
    expect(exportJob.statusCode).toBe(202);
    const exportId = (exportJob.json() as { id: string }).id;
    expect((await app.inject({ method: "GET", url: `/api/v1/audit-logs/exports/${exportId}`, headers: auth })).statusCode).toBe(200);

    const event = await app.inject({ method: "GET", url: "/api/v1/events" });
    expect(event.statusCode).toBe(401);

    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.body).toContain("opendream_http_requests_total");
    expect(metrics.body).toContain("opendream_workspaces");
  });
});
