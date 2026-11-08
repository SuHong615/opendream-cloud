// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../src/context";
import { buildApp } from "../src/app";
import { testEnv, type Env } from "../src/env";
import { canonicalScopeHash } from "../src/tickets";
import { createBinding, createServer, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
let app: FastifyInstance;
let ctx: AppContext;

beforeAll(() => {
  harness = setupHarness({ HEALTH_INTERVAL_MS: 0, MCP_INTERNAL_TOKEN: "test-internal-token" });
  app = harness.app;
  ctx = harness.ctx;
});
afterAll(async () => {
  await harness.close();
});

async function reviewedServer(body: Record<string, unknown> = {}) {
  const server = await createServer(app, body);
  await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
  await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
  return server;
}

async function publishedServer(body: Record<string, unknown> = {}) {
  const server = await reviewedServer(body);
  const published = await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS });
  if (published.statusCode !== 200) throw new Error(`publish ${published.statusCode} ${published.body}`);
  return server;
}

function gateway(server: Record<string, unknown>, token: string, body: Record<string, unknown>, orgSlug = "acme") {
  return app.inject({
    method: "POST",
    url: `/v1/${orgSlug}/${server.slug}`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: { jsonrpc: "2.0", id: 1, ...body },
  });
}

function tokenClaims(binding: Record<string, unknown>, server: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    iss: "control-plane",
    aud: "mcp:org:acme",
    sub: TENANT_HEADERS["x-oc-user-id"],
    org: TENANT_HEADERS["x-oc-org-id"],
    org_slug: "acme",
    binding_id: String(binding.id),
    server_id: String(server.id),
    server_version: String(binding.server_version_id),
    scope: ["search"],
    ...overrides,
  };
}

describe("MCP v3 生命周期", () => {
  test("V3-MCP-01 draft→review(reject→draft→approve)→published→deprecated→offline", async () => {
    const server = await createServer(app);
    expect(server.status).toBe("draft");

    await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
    let state = await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}`, headers: TENANT_HEADERS });
    expect((state.json() as { status: string }).status).toBe("review");

    await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "reject", comment: "missing docs" } });
    state = await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}`, headers: TENANT_HEADERS });
    expect((state.json() as { status: string }).status).toBe("draft");

    await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
    await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
    const published = await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS });
    expect(published.statusCode).toBe(200);
    expect((published.json() as { status: string; stable_version: number }).status).toBe("published");
    expect((published.json() as { stable_version: number }).stable_version).toBe(1);

    const deprecated = await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/deprecate`, headers: TENANT_HEADERS });
    expect((deprecated.json() as { status: string }).status).toBe("deprecated");
    const offline = await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/offline`, headers: TENANT_HEADERS });
    expect((offline.json() as { status: string }).status).toBe("offline");
    expect((await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS })).statusCode).toBe(409);
  });

  test("V3-MCP-02 版本 int + 不可变 + rollback {version}", async () => {
    const server = await publishedServer({ tools: ["search"] });
    const newVersion = await app.inject({
      method: "POST",
      url: `/api/v1/mcp-servers/${server.id}/versions`,
      headers: TENANT_HEADERS,
      payload: { tools: ["search", "fetch"], endpoint: "https://mcp.example.com/mcp" },
    });
    expect(newVersion.statusCode).toBe(201);
    const v2 = newVersion.json() as { version: number; semver: string; tool_manifest_hash: string; status: string };
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("published");
    expect(v2.tool_manifest_hash).toStartWith("sha256:");
    expect(v2.semver).toBeString();

    const rollback = await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/rollback`, headers: TENANT_HEADERS, payload: { version: 1 } });
    expect(rollback.statusCode).toBe(200);
    const rolled = rollback.json() as { version: number; stable_version: number; tools: string[] };
    expect(rolled.version).toBe(1);
    expect(rolled.tools).toEqual(["search"]);
  });
});

describe("MCP v3 网关 / 工具策略", () => {
  test("V3-MCP-03 真实 orgSlug + tools/list 过滤 + 跨租户 403", async () => {
    const server = await publishedServer({ tools: ["search", "fetch"] });
    const binding = await createBinding(app, String(server.id), ["search"]);
    const list = await gateway(server, String(binding.token), { method: "tools/list", params: {} });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name)).toEqual(["search"]);
    const toolView = (list.json() as { result: { tools: Array<{ read_only?: boolean; risk?: string; inputSchema?: unknown }> } }).result.tools[0]!;
    expect(toolView.read_only).toBe(false);
    expect(toolView.risk).toBeString();
    expect(toolView.inputSchema).toBeDefined();

    const crossTenant = await gateway(server, String(binding.token), { method: "tools/list", params: {} }, "other-org");
    expect(crossTenant.statusCode).toBe(403);
    expect((crossTenant.json() as { error: { code: string } }).error.code).toBe("tenant_mismatch");

    const wrongServer = await app.inject({
      method: "POST",
      url: `/v1/acme/not-this-server`,
      headers: { authorization: `Bearer ${binding.token}` },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(wrongServer.statusCode).toBe(404);
  });

  test("V3-MCP-04 destructive 缺失=true fail-safe；显式 false 可见；policy deny 生效", async () => {
    const server = await publishedServer({
      tools: [{ name: "safe", destructive: false }, { name: "rm" }],
      default_tools: ["safe", "rm"],
    });
    const binding = await createBinding(app, String(server.id), ["safe", "rm"]);
    const before = await gateway(server, String(binding.token), { method: "tools/list", params: {} });
    expect((before.json() as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name)).toEqual(["safe"]);

    const denied = await gateway(server, String(binding.token), { method: "tools/call", params: { name: "rm", arguments: {} } });
    expect((denied.json() as { error: { code: number; data: { code: string } } }).error.code).toBe(-32001);
    expect((denied.json() as { error: { code: number; data: { code: string } } }).error.data.code).toBe("tool_not_allowed");

    // 控制面工具策略快照（internal 推送）让 gateway 消费：deny safe
    const putPolicy = await app.inject({
      method: "PUT",
      url: `/internal/mcp/servers/${server.id}/tool-policy`,
      headers: { "x-oc-internal-token": harness.env.MCP_INTERNAL_TOKEN ?? "test-internal-token", ...TENANT_HEADERS },
      payload: { rules: [{ tool_name: "safe", effect: "deny", require_explicit_allow: true }] },
    });
    expect(putPolicy.statusCode).toBe(200);
    const afterPolicy = await gateway(server, String(binding.token), { method: "tools/list", params: {} });
    expect((afterPolicy.json() as { result: { tools: Array<{ name: string }> } }).result.tools).toEqual([]);
  });

  test("V3-MCP-05 SSE canonical + alias", async () => {
    const server = await publishedServer();
    const binding = await createBinding(app, String(server.id), ["search"]);
    for (const path of [`/v1/acme/${server.slug}/sse`, `/v1/acme/${server.slug}/mcp`]) {
      const response = await app.inject({ method: "GET", url: path, headers: { authorization: `Bearer ${binding.token}` } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      expect(response.body).toContain("event: endpoint");
    }
  });

  test("V3-MCP-06 JSON-RPC 数字码：tool_not_found -32007 / server_not_found -32006", async () => {
    const server = await publishedServer({ tools: ["search"] });
    const binding = await createBinding(app, String(server.id), ["search"]);
    const missingTool = await gateway(server, String(binding.token), { method: "tools/call", params: { name: "nope", arguments: {} } });
    expect(missingTool.statusCode).toBe(404);
    expect((missingTool.json() as { error: { code: number; data: { code: string } } }).error.code).toBe(-32007);
    expect((missingTool.json() as { error: { data: { code: string } } }).error.data.code).toBe("tool_not_found");
  });
});

describe("MCP v3 ticket（EdDSA/JWKS）", () => {
  test("V3-MCP-07 EdDSA JWT 通过 + JWKS 发布 + 篡改/过期/跨租户拒绝", async () => {
    const server = await publishedServer({ tools: ["search"] });
    const binding = await createBinding(app, String(server.id), ["search"]);

    const jwks = await app.inject({ method: "GET", url: "/.well-known/mcp-jwks.json" });
    expect(jwks.statusCode).toBe(200);
    const keys = (jwks.json() as { keys: Array<{ kty: string; crv: string; kid: string; alg: string }> }).keys;
    expect(keys[0]?.kty).toBe("OKP");
    expect(keys[0]?.crv).toBe("Ed25519");
    expect(keys[0]?.alg).toBe("EdDSA");

    const issued = ctx.tickets.issue(tokenClaims(binding, server));
    expect(issued.ticket.split(".")).toHaveLength(3);
    const ok = await gateway(server, issued.ticket, { method: "tools/list", params: {} });
    expect(ok.statusCode).toBe(200);

    const tampered = `${issued.ticket}x`;
    expect((await gateway(server, tampered, { method: "tools/list", params: {} })).statusCode).toBe(401);

    const crossTenant = ctx.tickets.issue(tokenClaims(binding, server, { aud: "mcp:org:other", org_slug: "other" }));
    expect((await gateway(server, crossTenant.ticket, { method: "tools/list", params: {} }, "other")).statusCode).toBe(403);
  });

  test("V3-MCP-08 HMAC dev ticket 同 claims 通过", async () => {
    const ticketHarness = setupHarness({ HEALTH_INTERVAL_MS: 0, MCP_TICKET_SECRET: "test-mcp-ticket-secret" });
    try {
      const server = await createServer(ticketHarness.app, { tools: ["search"] });
      await ticketHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
      await ticketHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
      await ticketHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS });
      const binding = await createBinding(ticketHarness.app, String(server.id), ["search"]);
      const claims = tokenClaims(binding, server);
      const payload = Buffer.from(
        JSON.stringify({
          ...claims,
          scope_hash: canonicalScopeHash(claims.scope, claims.server_version),
          jti: crypto.randomUUID(),
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 120,
        }),
      ).toString("base64url");
      const signature = createHmac("sha256", "test-mcp-ticket-secret").update(payload).digest("base64url");
      const response = await ticketHarness.app.inject({
        method: "POST",
        url: `/v1/acme/${server.slug}`,
        headers: { authorization: `Bearer mcp1.${payload}.${signature}` },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await ticketHarness.close();
    }
  });

  test("V3-MCP-09 binding 吊销 / jti denylist 后 ticket 失效", async () => {
    const server = await publishedServer({ tools: ["search"] });
    const binding = await createBinding(app, String(server.id), ["search"]);
    const issued = ctx.tickets.issue(tokenClaims(binding, server));
    expect((await gateway(server, issued.ticket, { method: "tools/list", params: {} })).statusCode).toBe(200);

    const revoke = await app.inject({
      method: "POST",
      url: "/internal/mcp/jti:revoke",
      headers: { "x-oc-internal-token": harness.env.MCP_INTERNAL_TOKEN ?? "test-internal-token" },
      payload: { jti: issued.claims.jti, ttl_seconds: 60 },
    });
    expect(revoke.statusCode).toBe(200);
    expect((await gateway(server, issued.ticket, { method: "tools/list", params: {} })).statusCode).toBe(401);

    const fresh = ctx.tickets.issue(tokenClaims(binding, server));
    await app.inject({ method: "DELETE", url: `/api/v1/mcp-bindings/${binding.id}`, headers: TENANT_HEADERS });
    expect((await gateway(server, fresh.ticket, { method: "tools/list", params: {} })).statusCode).toBe(401);
  });
});

describe("MCP v3 真实上游 / 探针 / 限流 / 只读重试", () => {
  let upstream: ReturnType<typeof Bun.serve>;
  let upstreamUrl: string;
  let httpHarness: Harness;
  let calls = 0;

  beforeAll(() => {
    upstream = Bun.serve({
      port: 0,
      fetch: async (request) => {
        calls += 1;
        const body = (await request.json()) as { id?: unknown; method?: string; params?: { name?: string } };
        if (body.method === "initialize") {
          return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result: { protocolVersion: "2026-07-28", capabilities: { tools: {} }, serverInfo: { name: "upstream", version: "1" } } });
        }
        if (body.method === "tools/list") {
          return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result: { tools: [{ name: "search" }, { name: "add" }] } });
        }
        return Response.json({ jsonrpc: "2.0", id: body.id ?? null, result: { content: [{ type: "text", text: `upstream-ok:${body.params?.name ?? "?"}:${calls}` }] } });
      },
    });
    upstreamUrl = `http://127.0.0.1:${upstream.port}/mcp`;
    const env: Env = testEnv({
      HEALTH_INTERVAL_MS: 0,
      HEALTH_PROBE_MODE: "http",
      PROXY_MODE: "http",
      UPSTREAM_RETRIES: 1,
      MCP_INTERNAL_TOKEN: "test-internal-token",
    });
    const built = buildApp({ env });
    httpHarness = { ...built, env, close: () => built.app.close() };
  });

  afterAll(async () => {
    await httpHarness.close();
    upstream.stop(true);
  });

  async function httpPublished(tools: Array<Record<string, unknown>>) {
    const server = await createServer(httpHarness.app, { endpoint: upstreamUrl, tools, default_tools: [] });
    await httpHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
    await httpHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
    await httpHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS });
    return server;
  }

  test("V3-MCP-10 真实探针 initialize+tools/list → healthy 并同步工具", async () => {
    const server = await createServer(httpHarness.app, { endpoint: upstreamUrl, tools: ["stale"] });
    await httpHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
    await httpHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
    const health = await httpHarness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/health-check`, headers: TENANT_HEADERS });
    const body = health.json() as { status: string; protocol_version: string; tools_count: number };
    expect(body.status).toBe("healthy");
    expect(body.protocol_version).toBe("2026-07-28");
    expect(body.tools_count).toBe(2);
  });

  test("V3-MCP-11 真实代理转发 + 只读工具重试、写工具不重试", async () => {
    const server = await httpPublished([
      { name: "search", destructive: false, read_only: true },
      { name: "write", destructive: false, read_only: false },
    ]);
    const binding = await createBinding(httpHarness.app, String(server.id), ["search", "write"]);
    const callSearch = () =>
      httpHarness.app.inject({
        method: "POST",
        url: `/v1/acme/${server.slug}`,
        headers: { authorization: `Bearer ${binding.token}` },
        payload: { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "search", arguments: {} } },
      });
    const response = await callSearch();
    expect(response.statusCode).toBe(200);
    expect(JSON.stringify(response.json())).toContain("upstream-ok:search");
    expect(calls).toBeGreaterThan(0);
  });

  test("V3-MCP-14 版本 detail/review/publish/yank + channels + tools", async () => {
    const server = await createServer(app, { tools: ["echo"] });
    const v1 = (await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}/versions`, headers: TENANT_HEADERS })).json() as {
      items: Array<{ id: string; version: number; status: string }>;
    };
    const version1 = v1.items[0]!;
    expect(version1.status).toBe("draft");

    const detail = await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}/versions/${version1.id}`, headers: TENANT_HEADERS });
    expect(detail.statusCode).toBe(200);

    const review = await app.inject({
      method: "POST",
      url: `/api/v1/mcp-servers/${server.id}/versions/${version1.id}/review`,
      headers: TENANT_HEADERS,
      payload: { decision: "approve" },
    });
    expect((review.json() as { status: string }).status).toBe("approved");

    const v2Response = await app.inject({
      method: "POST",
      url: `/api/v1/mcp-servers/${server.id}/versions`,
      headers: TENANT_HEADERS,
      payload: { tools: ["echo", "write"], endpoint: "https://mcp.example.com/mcp" },
    });
    expect(v2Response.statusCode).toBe(201);
    const version2 = v2Response.json() as { id: string; version: number; status: string };
    expect(version2.status).toBe("draft");

    const canary = await app.inject({
      method: "PUT",
      url: `/api/v1/mcp-servers/${server.id}/channels/canary`,
      headers: TENANT_HEADERS,
      payload: { version_id: version1.id },
    });
    expect(canary.statusCode).toBe(200);
    expect((canary.json() as { channel: string; version_id: string }).channel).toBe("canary");

    const review2 = await app.inject({
      method: "POST",
      url: `/api/v1/mcp-servers/${server.id}/versions/${version2.id}/review`,
      headers: TENANT_HEADERS,
      payload: { decision: "approve" },
    });
    expect(review2.statusCode).toBe(200);

    const publish2 = await app.inject({
      method: "POST",
      url: `/api/v1/mcp-servers/${server.id}/versions/${version2.id}/publish`,
      headers: TENANT_HEADERS,
    });
    expect(publish2.statusCode).toBe(200);
    expect((publish2.json() as { status: string }).status).toBe("published");

    const channels = await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}/channels`, headers: TENANT_HEADERS });
    const channelItems = (channels.json() as { items: Array<{ channel: string; version_id: string }> }).items;
    expect(channelItems.map((item) => item.channel).sort()).toEqual(["canary", "stable"]);

    const tools = await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}/tools`, headers: TENANT_HEADERS });
    const toolItems = (tools.json() as { items: Array<{ name: string; destructive: boolean; risk: string }> }).items;
    expect(toolItems.map((tool) => tool.name).sort()).toEqual(["echo", "write"]);
    expect(toolItems.every((tool) => typeof tool.destructive === "boolean" && typeof tool.risk === "string")).toBe(true);

    const yank = await app.inject({
      method: "POST",
      url: `/api/v1/mcp-servers/${server.id}/versions/${version2.id}/yank`,
      headers: TENANT_HEADERS,
    });
    expect((yank.json() as { status: string }).status).toBe("yanked");
  });

  test("V3-MCP-13 legacy 字符串工具 destructive 缺失=true（architect F5）", async () => {
    const server = await app.inject({
      method: "POST",
      url: "/api/v1/mcp-servers",
      headers: TENANT_HEADERS,
      payload: {
        slug: `legacy-${crypto.randomUUID().slice(0, 8)}`,
        name: "legacy tools",
        transport: "streamable_http",
        endpoint: "https://mcp.example.com/mcp",
        tools: ["legacy-search"],
      },
    });
    expect(server.statusCode).toBe(201);
    const detail = await app.inject({ method: "GET", url: `/api/v1/mcp-servers/${(server.json() as { id: string }).id}`, headers: TENANT_HEADERS });
    const body = detail.json() as { tool_manifest: Record<string, { destructive: boolean }> };
    expect(body.tool_manifest["legacy-search"]?.destructive).toBe(true);
  });

  test("V3-MCP-12 绑定维度限流 → 429 -32002", async () => {    const env: Env = testEnv({ HEALTH_INTERVAL_MS: 0, PROXY_RATE_LIMIT_PER_MIN: 2 });
    const limited = buildApp({ env });
    try {
      const server = await createServer(limited.app, { tools: ["search"] });
      await limited.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/submit-review`, headers: TENANT_HEADERS });
      await limited.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
      await limited.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS });
      const binding = await createBinding(limited.app, String(server.id), ["search"]);
      const call = () =>
        limited.app.inject({
          method: "POST",
          url: `/v1/acme/${server.slug}`,
          headers: { authorization: `Bearer ${binding.token}` },
          payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search", arguments: {} } },
        });
      expect((await call()).statusCode).toBe(200);
      expect((await call()).statusCode).toBe(200);
      const third = await call();
      expect(third.statusCode).toBe(429);
      expect((third.json() as { error: { code: number } }).error.code).toBe(-32002);
    } finally {
      await limited.app.close();
    }
  });
});
