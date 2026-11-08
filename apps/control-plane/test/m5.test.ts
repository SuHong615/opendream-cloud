// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let upstream: ReturnType<typeof Bun.serve>;
let upstreamUrl: string;
let lastUpstreamHeaders: Record<string, string> = {};
let lastMemoryAuth = "";

beforeAll(async () => {
  upstream = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      lastUpstreamHeaders = {
        org: String(request.headers.get("x-oc-org-id") ?? ""),
        roles: String(request.headers.get("x-oc-roles") ?? ""),
      };
      if (url.pathname.endsWith("/healthz")) return Response.json({ status: "ok" });
      if (url.pathname === "/api/v1/eval-datasets" && request.method === "GET") {
        return Response.json({ items: [{ id: "ds-1", name: "dataset" }], next_cursor: null });
      }
      if (url.pathname === "/api/v1/eval-datasets" && request.method === "POST") {
        return Response.json({ id: "ds-new", ...((await request.json()) as Record<string, unknown>) }, { status: 201 });
      }
      if (url.pathname.startsWith("/v1/memories")) {
        lastMemoryAuth = String(request.headers.get("authorization") ?? "");
        if (url.pathname === "/v1/memories" && request.method === "GET") {
          return Response.json({ results: [{ id: "mem-1", memory: "hello" }], items: [{ id: "mem-1" }], count: 1, request_id: "req-1" });
        }
        if (url.pathname === "/v1/memories" && request.method === "POST") {
          return Response.json({ id: "mem-new", memory_id: "mem-new", memory: "hello", scope: "user", created_at: Date.now() }, { status: 201 });
        }
        if (url.pathname === "/v1/memories/search") {
          return Response.json({ results: [{ id: "mem-1", memory: "hello", score: 0.9 }], count: 1 });
        }
        return Response.json({ message: "deleted", id: "mem-1" });
      }
      if (url.pathname === "/api/v1/experiences" && request.method === "GET") {
        return Response.json({ items: [{ id: "exp-1" }], count: 1, next_cursor: null });
      }
      return Response.json({ ok: true, path: url.pathname });
    },
  });
  upstreamUrl = `http://127.0.0.1:${upstream.port}`;
  harness = await setupHarness({
    EVAL_CENTER_URL: upstreamUrl,
    MEMORY_URL: upstreamUrl,
    MEMORY_API_KEY: "test-memory-key",
    MCP_HUB_URL: upstreamUrl,
    WORKFLOW_URL: upstreamUrl,
    DIGITAL_HUMAN_URL: upstreamUrl,
    APP_CENTER_URL: upstreamUrl,
  });
});

afterAll(async () => {
  await harness.close();
  upstream.stop(true);
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 6)}@example.com`;

describe("M5 eval proxy / observability / organizations", () => {
  test("M5-EVAL-01 eval-* 门面：GET/POST 透传 + 写 CSRF/审计 + 502", async () => {
    const session = await devLogin(harness.app, email("m5-eval"));
    const list = await harness.app.inject({ method: "GET", url: "/api/v1/eval-datasets", headers: { cookie: session.cookie } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: Array<{ id: string }> }).items[0]?.id).toBe("ds-1");
    expect(lastUpstreamHeaders.org).toBe(session.orgId);

    const noCsrf = await harness.app.inject({ method: "POST", url: "/api/v1/eval-datasets", headers: { cookie: session.cookie }, payload: { name: "x" } });
    expect(noCsrf.statusCode).toBe(403);
    const created = await harness.app.inject({ method: "POST", url: "/api/v1/eval-datasets", headers: headers(session), payload: { name: "x" } });
    expect(created.statusCode).toBe(201);
    const audit = await harness.app.inject({ method: "GET", url: "/api/v1/audit-logs?limit=20", headers: { cookie: session.cookie } });
    expect((audit.json() as { items: Array<{ action: string }> }).items.some((item) => item.action === "eval.proxy.post")).toBe(true);

    const broken = await setupHarness({ EVAL_CENTER_URL: "http://127.0.0.1:1" });
    try {
      const s = await devLogin(broken.app, email("m5-eval-broken"));
      const response = await broken.app.inject({ method: "GET", url: "/api/v1/eval-datasets", headers: { cookie: s.cookie } });
      expect(response.statusCode).toBe(502);
      expect((response.json() as { error: { code: string } }).error.code).toBe("upstream_error");
    } finally {
      await broken.close();
    }
  });

  test("M5-MEM-01 memory/experience 门面：代理 MEMORY_URL、服务形状原样、无本地双源", async () => {
    const session = await devLogin(harness.app, email("m5-mem"));
    const memories = await harness.app.inject({ method: "GET", url: "/api/v1/memories", headers: { cookie: session.cookie } });
    expect(memories.statusCode).toBe(200);
    const memoryBody = memories.json() as { results: Array<{ id: string }>; items: Array<{ id: string }>; count: number };
    expect(memoryBody.count).toBe(1);
    expect(memoryBody.results[0]?.id).toBe("mem-1");
    expect(memoryBody.items[0]?.id).toBe("mem-1");
    expect(lastMemoryAuth).toBe("Bearer test-memory-key");
    expect(lastUpstreamHeaders.org).toBe(session.orgId);

    const search = await harness.app.inject({
      method: "POST",
      url: "/api/v1/memories/search",
      headers: headers(session),
      payload: { query: "hello" },
    });
    expect(search.statusCode).toBe(200);
    expect((search.json() as { results: Array<{ score: number }> }).results[0]?.score).toBe(0.9);

    const created = await harness.app.inject({
      method: "POST",
      url: "/api/v1/memories",
      headers: headers(session),
      payload: { messages: [{ role: "user", content: "hello" }] },
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { id: string }).id).toBe("mem-new");

    const experiences = await harness.app.inject({ method: "GET", url: "/api/v1/experiences", headers: { cookie: session.cookie } });
    expect(experiences.statusCode).toBe(200);
    expect((experiences.json() as { count: number }).count).toBe(1);

    // 旧本地别名/evaluators 不应再暴露
    expect((await harness.app.inject({ method: "GET", url: "/api/v1/memory", headers: { cookie: session.cookie } })).statusCode).toBe(404);
    expect((await harness.app.inject({ method: "GET", url: "/api/v1/evaluators", headers: { cookie: session.cookie } })).statusCode).toBe(404);
  });

  test("M5-OBS-01 overview/timeseries：只读、viewer 可读、degraded 不 5xx", async () => {
    const session = await devLogin(harness.app, email("m5-obs"));
    const overview = await harness.app.inject({ method: "GET", url: "/api/v1/observability/overview?range=24h", headers: { cookie: session.cookie } });
    expect(overview.statusCode).toBe(200);
    const body = overview.json() as {
      workspaces: { total: number; ready: number };
      usage: { tokens: number; cost_usd: number };
      services: Array<{ name: string; status: string }>;
      degraded: boolean;
    };
    expect(typeof body.workspaces.total).toBe("number");
    expect(typeof body.usage.tokens).toBe("number");
    expect(body.services.length).toBeGreaterThanOrEqual(5);
    expect(typeof body.degraded).toBe("boolean");

    for (const metric of ["tokens", "cost", "runs", "requests"]) {
      const series = await harness.app.inject({
        method: "GET",
        url: `/api/v1/observability/timeseries?metric=${metric}&window=24h`,
        headers: { cookie: session.cookie },
      });
      expect(series.statusCode).toBe(200);
      expect((series.json() as { points: unknown[] }).points).toHaveLength(24);
    }
  });

  test("M5-ORG-01 current + members + quotas（迁移 0005/审计）", async () => {
    const session = await devLogin(harness.app, email("m5-org"));
    const current = await harness.app.inject({ method: "GET", url: "/api/v1/organizations/current", headers: { cookie: session.cookie } });
    expect(current.statusCode).toBe(200);
    const orgBody = current.json() as {
      organization: { id: string; slug: string };
      quotas: { workspaces: number; members: number };
      usage: { workspaces: number; members: number };
    };
    expect(orgBody.organization.id).toBe(session.orgId);
    expect(orgBody.quotas.workspaces).toBe(10);
    expect(typeof orgBody.usage.members).toBe("number");

    const members = await harness.app.inject({ method: "GET", url: "/api/v1/organizations/current/members", headers: { cookie: session.cookie } });
    expect(members.statusCode).toBe(200);
    expect((members.json() as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);

    const add = await harness.app.inject({
      method: "POST",
      url: "/api/v1/organizations/current/members",
      headers: headers(session),
      payload: { email: `member-${Date.now()}@example.com`, role: "member" },
    });
    expect(add.statusCode).toBe(201);
    const memberId = (add.json() as { member_id: string }).member_id;
    const patched = await harness.app.inject({
      method: "PATCH",
      url: `/api/v1/organizations/current/members/${memberId}`,
      headers: headers(session),
      payload: { role: "admin" },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { role: string }).role).toBe("admin");
    const removed = await harness.app.inject({
      method: "DELETE",
      url: `/api/v1/organizations/current/members/${memberId}`,
      headers: headers(session),
    });
    expect(removed.statusCode).toBe(204);

    const quotas = await harness.app.inject({ method: "GET", url: "/api/v1/organizations/current/quotas", headers: { cookie: session.cookie } });
    expect(quotas.statusCode).toBe(200);
    const updated = await harness.app.inject({
      method: "PUT",
      url: "/api/v1/organizations/current/quotas",
      headers: headers(session),
      payload: { workspaces: 20, members: 80, budget_usd: 200, mcp_servers: 30 },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { workspaces: number }).workspaces).toBe(20);
    const reread = await harness.app.inject({ method: "GET", url: "/api/v1/organizations/current/quotas", headers: { cookie: session.cookie } });
    expect((reread.json() as { workspaces: number }).workspaces).toBe(20);

    const audit = await harness.app.inject({ method: "GET", url: "/api/v1/audit-logs?limit=50", headers: { cookie: session.cookie } });
    const actions = (audit.json() as { items: Array<{ action: string }> }).items.map((item) => item.action);
    expect(actions).toContain("org.member.add");
    expect(actions).toContain("org.quotas.update");
  });
});
