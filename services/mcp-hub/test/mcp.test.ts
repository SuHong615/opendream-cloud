// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createBinding, createServer, publishServer, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
beforeAll(() => {
  harness = setupHarness();
});
afterAll(async () => {
  await harness.close();
});

const otherOrgHeaders = { "x-oc-org-id": "00000000-0000-4000-8000-000000000099", "x-oc-user-id": "00000000-0000-4000-8000-000000000098" };

describe("MCP Hub 生命周期", () => {
  test("MCP-01 注册 → 审核 → 发布 → 健康检查", async () => {
    const server = await createServer(harness.app);
    expect(server.status).toBe("draft");

    const blocked = await harness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/publish`, headers: TENANT_HEADERS });
    expect(blocked.statusCode).toBe(409);
    expect((blocked.json() as { error: { reason: string } }).error.reason).toBe("gate_blocked");

    const published = await publishServer(harness.app, String(server.id));
    expect(published.status).toBe("published");

    const health = await harness.app.inject({ method: "POST", url: `/api/v1/mcp-servers/${server.id}/health-check`, headers: TENANT_HEADERS });
    expect(health.statusCode).toBe(200);
    expect((health.json() as { status: string }).status).toBe("healthy");
    const history = await harness.app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}/health`, headers: TENANT_HEADERS });
    expect((history.json() as { checks: unknown[] }).checks.length).toBeGreaterThan(0);
  });

  test("MCP-02 stdio 带凭证在 MVP 被拒绝", async () => {
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/v1/mcp-servers",
      headers: TENANT_HEADERS,
      payload: { slug: "stdio-cred", name: "stdio", transport: "stdio", auth_type: "api_key", default_tools: [] },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe("validation_failed");
  });

  test("MCP-03 绑定 token 仅一次 + 代理调用 + 审计 + 轮换后旧 token 失效", async () => {
    const server = await createServer(harness.app);
    await publishServer(harness.app, String(server.id));
    const binding = await createBinding(harness.app, String(server.id), ["search"]);
    expect(binding.token).toBeString();
    const token = String(binding.token);

    const call = await harness.app.inject({
      method: "POST",
      url: `/internal/mcp/proxy/${binding.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tool: "search", arguments: { q: "hello" } },
    });
    expect(call.statusCode).toBe(200);
    expect(JSON.stringify(call.json())).toContain("[skeleton]");

    const denied = await harness.app.inject({
      method: "POST",
      url: `/internal/mcp/proxy/${binding.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tool: "fetch", arguments: {} },
    });
    expect((denied.json() as { error: { code: number } }).error.code).toBe(-32001);

    const calls = await harness.app.inject({ method: "GET", url: "/internal/mcp/calls", headers: TENANT_HEADERS });
    const items = (calls.json() as { items: Array<{ status: string; args_hash: string }> }).items;
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.status).sort()).toEqual(["denied", "ok"]);
    expect(JSON.stringify(items)).not.toContain("hello");

    const rotated = await harness.app.inject({ method: "POST", url: `/api/v1/mcp-bindings/${binding.id}/rotate-token`, headers: TENANT_HEADERS });
    expect((rotated.json() as { token: string; expires_in: number }).expires_in).toBe(86400);
    const oldToken = await harness.app.inject({
      method: "POST",
      url: `/internal/mcp/proxy/${binding.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { tool: "search", arguments: {} },
    });
    expect(oldToken.statusCode).toBe(401);
  });

  test("MCP-04 跨租户 404 + 未绑定 token 401", async () => {
    const server = await createServer(harness.app);
    const other = await harness.app.inject({ method: "GET", url: `/api/v1/mcp-servers/${server.id}`, headers: otherOrgHeaders });
    expect(other.statusCode).toBe(404);

    const noToken = await harness.app.inject({ method: "POST", url: `/internal/mcp/proxy/fake-binding`, payload: { tool: "search", arguments: {} } });
    expect(noToken.statusCode).toBe(401);
  });

  test("MCP-05 凭证端点只返回配置状态（不回显密文）+ oauth state 校验", async () => {
    const server = await createServer(harness.app, { auth_type: "api_key" });
    const created = await harness.app.inject({
      method: "POST",
      url: `/internal/mcp/servers/${server.id}/credentials`,
      headers: TENANT_HEADERS,
      payload: { kind: "api_key", secret_ref: "kms://demo/ref" },
    });
    expect(created.statusCode).toBe(201);
    const list = await harness.app.inject({ method: "GET", url: `/internal/mcp/servers/${server.id}/credentials`, headers: TENANT_HEADERS });
    expect(JSON.stringify(list.json())).not.toContain("kms://demo/ref");

    const badState = await harness.app.inject({ method: "GET", url: "/api/v1/mcp-oauth/callback?state=missing" });
    expect(badState.statusCode).toBe(400);
  });
});
