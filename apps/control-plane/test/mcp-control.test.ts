// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;
let hub: ReturnType<typeof Bun.serve>;
let lastHubHeaders: Record<string, string> = {};
let ticketPublicKeyPem = "";

const INTERNAL_TOKEN = "test-mcp-internal-token";

beforeAll(async () => {
  const keyPair = generateKeyPairSync("ed25519");
  ticketPublicKeyPem = keyPair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const privateKeyPem = keyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  hub = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      lastHubHeaders = {
        org: String(request.headers.get("x-oc-org-id") ?? ""),
        user: String(request.headers.get("x-oc-user-id") ?? ""),
        roles: String(request.headers.get("x-oc-roles") ?? ""),
      };
      if (url.pathname === "/api/v1/mcp-servers" && request.method === "GET") {
        return Response.json({ items: [{ id: "s1", org_id: lastHubHeaders.org, name: "crm" }], next_cursor: null });
      }
      if (url.pathname === "/api/v1/mcp-servers" && request.method === "POST") {
        const body = (await request.json()) as Record<string, unknown>;
        return Response.json({ id: "s-new", status: "draft", ...body }, { status: 201 });
      }
      if (url.pathname === "/api/v1/mcp-bindings" && request.method === "GET") {
        return Response.json({
          items: [{ id: "b1", mcp_server_id: "s1", server_version_id: "11111111-1111-4111-8111-111111111111", allowed_tools: ["search"] }],
          next_cursor: null,
        });
      }
      if (url.pathname === "/api/v1/mcp-servers/s1" && request.method === "GET") {
        return Response.json({ id: "s1", slug: "crm", org_slug: "acme", stable_version_id: "11111111-1111-4111-8111-111111111111" });
      }
      if (url.pathname.includes("/versions/") && request.method === "GET") {
        return Response.json({ id: "v1", server_id: "s1", version: 1, status: "draft" });
      }
      if (url.pathname.endsWith("/channels") && request.method === "GET") {
        return Response.json({ server_id: "s1", items: [{ channel: "stable", version_id: "v1", version: "1.1.0", effective_at: new Date().toISOString() }] });
      }
      if (url.pathname.endsWith("/tools") && request.method === "GET") {
        return Response.json({ items: [{ name: "echo", destructive: false, risk: "low" }] });
      }
      if (url.pathname.includes("/versions/") && request.method === "POST") {
        return Response.json({ id: "v1", status: "approved", path: url.pathname });
      }
      if (url.pathname.startsWith("/api/v1/mcp-bindings/") && request.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.includes("/fail")) return Response.json({ error: { code: "internal_error" } }, { status: 500 });
      return Response.json({ ok: true, path: url.pathname });
    },
  });
  harness = await setupHarness({
    MCP_HUB_URL: `http://127.0.0.1:${hub.port}`,
    MCP_INTERNAL_TOKEN: INTERNAL_TOKEN,
    MCP_TICKET_PRIVATE_KEY: Buffer.from(privateKeyPem, "utf8").toString("base64"),
    MCP_TICKET_KID: "test-kid-1",
    MCP_TICKET_TTL_SECONDS: "300",
  });
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
  hub.stop(true);
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function internalBatch(items: unknown[], token = INTERNAL_TOKEN) {
  return app.inject({
    method: "POST",
    url: "/internal/mcp/call-logs:batch",
    headers: { "x-oc-internal-token": token },
    payload: { items },
  });
}

function logItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    org_id: "org-1",
    server_id: "s1",
    binding_id: "b1",
    method: "tools/call",
    tool_name: "search",
    status: "ok",
    latency_ms: 12,
    args_hash: "abc",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("control-plane MCP registry/policy/audit", () => {
  test("MCP-CP-01 registry 转发 mcp-hub 并携带租户头", async () => {
    const session = await devLogin(app, email("mcp-cp-1"));
    const response = await app.inject({ method: "GET", url: "/api/v1/mcp-servers", headers: { cookie: session.cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; org_id: string }> };
    expect(body.items[0]?.id).toBe("s1");
    expect(lastHubHeaders.org).toBe(session.orgId);
    expect(lastHubHeaders.roles).toBe("owner");
  });

  test("MCP-CP-02 写操作必须 CSRF，成功后写审计", async () => {
    const session = await devLogin(app, email("mcp-cp-2"));
    const withoutCsrf = await app.inject({
      method: "POST",
      url: "/api/v1/mcp-servers",
      headers: { cookie: session.cookie },
      payload: { slug: "crm", name: "CRM", transport: "streamable_http" },
    });
    expect(withoutCsrf.statusCode).toBe(403);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mcp-servers",
      headers: headers(session),
      payload: { slug: "crm", name: "CRM", transport: "streamable_http" },
    });
    expect(response.statusCode).toBe(201);
    const audit = await app.inject({ method: "GET", url: "/api/v1/audit-logs?limit=20", headers: { cookie: session.cookie } });
    const items = (audit.json() as { items: Array<{ action: string }> }).items;
    expect(items.some((item) => item.action === "mcp.proxy.post")).toBe(true);
  });

  test("MCP-CP-03 hub 不可用返回 502 upstream_error", async () => {
    const broken = await setupHarness({ MCP_HUB_URL: "http://127.0.0.1:1", MCP_INTERNAL_TOKEN: INTERNAL_TOKEN });
    try {
      const session = await devLogin(broken.app, email("mcp-cp-3"));
      const response = await broken.app.inject({ method: "GET", url: "/api/v1/mcp-servers", headers: { cookie: session.cookie } });
      expect(response.statusCode).toBe(502);
      expect((response.json() as { error: { code: string } }).error.code).toBe("upstream_error");
    } finally {
      await broken.close();
    }
  });

  test("MCP-CP-04 工具策略 PUT/GET：destructive 默认 deny 口径", async () => {
    const session = await devLogin(app, email("mcp-cp-4"));
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/mcp-servers/s1/tool-policy",
      headers: headers(session),
      payload: {
        rules: [
          { tool_name: "search", effect: "allow", subject_type: "org", priority: 10 },
          { tool_name: "rm", effect: "deny", subject_type: "org", priority: 5 },
        ],
      },
    });
    expect(put.statusCode).toBe(200);
    const putBody = put.json() as { server_id: string; revision: number; destructive_default: boolean; rules: Array<{ tool_name: string; require_explicit_allow: boolean }> };
    expect(putBody.server_id).toBe("s1");
    expect(putBody.destructive_default).toBe(true);
    expect(typeof putBody.revision).toBe("number");
    expect(putBody.rules.every((rule) => rule.require_explicit_allow === true)).toBe(true);
    const get = await app.inject({ method: "GET", url: "/api/v1/mcp-servers/s1/tool-policies", headers: { cookie: session.cookie } });
    expect(get.statusCode).toBe(200);
    const body = get.json() as { rules: Array<{ tool_name: string; effect: string }>; destructive_default: boolean; revision: number };
    expect(body.destructive_default).toBe(true);
    expect(typeof body.revision).toBe("number");
    expect(body.rules.map((rule) => `${rule.tool_name}:${rule.effect}`)).toEqual(["rm:deny", "search:allow"]);
  });

  test("MCP-CP-05 call-logs 批量写入：token 校验 + 幂等 + 查询", async () => {    const anonymous = await internalBatch([logItem("log-1")], "wrong-token");
    expect(anonymous.statusCode).toBe(401);

    const first = await internalBatch([logItem("log-1"), logItem("log-2", { status: "denied", tool_name: "rm" })]);
    expect(first.statusCode).toBe(200);
    expect((first.json() as { accepted: number }).accepted).toBe(2);

    const duplicate = await internalBatch([logItem("log-1")]);
    expect((duplicate.json() as { accepted: number }).accepted).toBe(0);

    const session = await devLogin(app, email("mcp-cp-5"));
    // 审计查询按 org 隔离；用 hub 侧 org id 直接造数后，需要同一 org 才能看到
    const orgItem = logItem("log-3", { org_id: session.orgId });
    const own = await internalBatch([orgItem]);
    expect(own.statusCode).toBe(200);
    const query = await app.inject({
      method: "GET",
      url: `/api/v1/mcp-call-logs?status=ok&from=${encodeURIComponent(new Date(Date.now() - 86_400_000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
      headers: { cookie: session.cookie },
    });
    expect(query.statusCode).toBe(200);
    const body = query.json() as { items: Array<{ id: string; cache_hit: boolean; created_at: string }> };
    expect(body.items.some((item) => item.id === "log-3")).toBe(true);
    expect(typeof body.items[0]?.cache_hit).toBe("boolean");
  });

  test("MCP-CP-07 DELETE binding 代理 204（QA V3-MCP-011）", async () => {
    const session = await devLogin(app, email("mcp-cp-7"));
    const response = await app.inject({
      method: "DELETE",
      url: "/api/v1/mcp-bindings/b-delete-1",
      headers: headers(session),
    });
    if (response.statusCode !== 204) console.error("DELETE_DEBUG", response.statusCode, response.body);
    expect(response.statusCode).toBe(204);
  });

  test("MCP-CP-08 管理端点代理：version detail/review/channels/tools", async () => {
    const session = await devLogin(app, email("mcp-cp-8"));
    const detail = await app.inject({ method: "GET", url: "/api/v1/mcp-servers/s1/versions/v1", headers: { cookie: session.cookie } });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { id: string }).id).toBe("v1");

    const channels = await app.inject({ method: "GET", url: "/api/v1/mcp-servers/s1/channels", headers: { cookie: session.cookie } });
    expect(channels.statusCode).toBe(200);
    expect((channels.json() as { items: Array<{ channel: string }> }).items[0]?.channel).toBe("stable");

    const tools = await app.inject({ method: "GET", url: "/api/v1/mcp-servers/s1/tools", headers: { cookie: session.cookie } });
    expect(tools.statusCode).toBe(200);
    expect((tools.json() as { items: Array<{ name: string }> }).items[0]?.name).toBe("echo");

    const review = await app.inject({
      method: "POST",
      url: "/api/v1/mcp-servers/s1/versions/v1/review",
      headers: headers(session),
      payload: { decision: "approve" },
    });
    expect(review.statusCode).toBe(200);
  });

  test("MCP-CP-06 EdDSA binding ticket：claims/TTL/scope_hash/JWKS 兼容签名", async () => {
    const session = await devLogin(app, email("mcp-cp-6"));
    const org = harness.ctx.sqlite
      .query<{ slug: string }, [string]>("SELECT slug FROM orgs WHERE id = ?")
      .get(session.orgId);
    expect(org?.slug).toBeString();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/mcp-bindings/b1/ticket",
      headers: headers(session),
      payload: { workspace_id: "00000000-0000-4000-8000-0000000000aa" },
    });
    expect(response.statusCode).toBe(200);
    const issued = response.json() as { ticket: string; expires_in: number; jti: string; kid: string };
    expect(issued.expires_in).toBe(300);
    expect(issued.kid).toBe("test-kid-1");
    expect(issued.jti).toBeString();

    const [headerPart, payloadPart, signaturePart] = issued.ticket.split(".") as [string, string, string];
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as { alg: string; kid: string };
    expect(header.alg).toBe("EdDSA");
    expect(header.kid).toBe("test-kid-1");
    const valid = verify(null, Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey(ticketPublicKeyPem), Buffer.from(signaturePart, "base64url"));
    expect(valid).toBe(true);

    const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      iss: string;
      aud: string;
      org: string;
      org_slug: string;
      binding_id: string;
      server_id: string;
      server_version: string;
      scope: string[];
      scope_hash: string;
      ws?: string;
      jti: string;
      iat: number;
      exp: number;
    };
    expect(claims.iss).toBe("control-plane");
    expect(claims.aud).toBe(`mcp:org:${org?.slug}`);
    expect(claims.org).toBe(session.orgId);
    expect(claims.binding_id).toBe("b1");
    expect(claims.server_id).toBe("s1");
    expect(claims.server_version).toBe("11111111-1111-4111-8111-111111111111");
    expect(claims.scope).toEqual(["search"]);
    expect(claims.ws).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(claims.jti).toBe(issued.jti);
    expect(claims.exp - claims.iat).toBe(300);
    const expectedHash = `sha256:${createHash("sha256")
      .update(JSON.stringify({ scope: [...claims.scope].sort(), server_version: claims.server_version }))
      .digest("hex")}`;
    expect(claims.scope_hash).toBe(expectedHash);
  });
});
