// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { FastifyInstance } from "fastify";
import { REGISTERED_ROUTES } from "../src/app";
import { API_ERROR_CODES } from "../src/lib/constants";
import { devLogin, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;
const openapiPath = new URL("../../../docs/02-architecture/openapi.yaml", import.meta.url);
const openapiText = readFileSync(openapiPath, "utf8");
const openapiPaths = new Set(
  [...openapiText.matchAll(/^ {2}(\/[^:\n]+):\s*$/gm)].map((match) => match[1]!),
);

beforeAll(async () => {
  harness = await setupHarness();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const OPERATIONAL_EXCEPTIONS = new Set([
  "/api/v1/auth/dev-login",
  "/healthz",
  "/readyz",
  // G4 模型中心新增端点：先不强制进 openapi（见 KNOWN_GAPS P2）
  "/api/v1/model-provider-presets",
  "/api/v1/model-providers/{providerId}/test",
  "/api/v1/model-providers/{providerId}/sync",
  "/api/v1/model-providers/{providerId}/activate",
  "/api/v1/model-config/preview",
  // v3 MCP MVP 新端点：ADR/openapi 1.1 前 allowlist（见 MCP-GATEWAY.md §6/§10）
  "/api/v1/mcp-servers/{serverId}/submit-review",
  "/api/v1/mcp-servers/{serverId}/deprecate",
  "/api/v1/mcp-servers/{serverId}/offline",
  "/api/v1/mcp-servers/{serverId}/versions",
  "/api/v1/mcp-servers/{serverId}/rollback",
  "/api/v1/mcp-servers/{serverId}/tool-policy",
  "/api/v1/mcp-call-logs",
  "/api/v1/mcp-bindings/{bindingId}/ticket",
  // v3 App Center 通配门面（具体路径由 openapi 覆盖，通配仅转发）
  "/api/v1/apps/*",
  // v3 workflow / digital-human 门面
  "/api/v1/workflows/*",
  "/api/v1/workflow-runs/*",
  "/api/v1/workflow-templates/*",
  "/api/v1/human-tasks/*",
  "/api/v1/workflow-definitions/*",
  "/api/v1/workflow-instances/*",
  "/api/v1/workflow-versions/*",
  "/api/v1/dh/*",
  // v3 评测中心门面（eval-* 通配；evaluator 为 MVP extension）
  "/api/v1/eval-datasets/*",
  "/api/v1/eval-runs/*",
  "/api/v1/eval-evaluators/*",
  "/api/v1/workflow-service/health",
  "/api/v1/digital-human/health",
  // M5 eval/observability/org（MVP extension；openapi 1.1 部分覆盖）
  "/api/v1/eval-datasets/*",
  "/api/v1/eval-runs/*",
  "/api/v1/eval-evaluators/*",
  "/api/v1/observability/overview",
  "/api/v1/observability/timeseries",
  "/api/v1/organizations/current",
  "/api/v1/organizations/current/members",
  "/api/v1/organizations/current/members/{memberId}",
  "/api/v1/organizations/current/quotas",
  "/api/v1/memories/*",
  "/api/v1/experiences/*",
  "/api/v1/memories",
  "/api/v1/experiences",
]);

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

describe("契约", () => {
  test("CONTRACT-01 已实现路由 ⊆ openapi（运维例外白名单）", () => {
    expect(openapiPaths.size).toBeGreaterThan(70);
    const missing: string[] = [];
    for (const route of REGISTERED_ROUTES) {
      const path = toOpenApiPath(route.path);
      if (OPERATIONAL_EXCEPTIONS.has(path)) continue;
      if (!openapiPaths.has(path)) missing.push(`${route.method} ${path}`);
    }
    expect(missing).toEqual([]);
  });

  test("CONTRACT-02 错误响应统一两层模型（code 在 16 枚举）", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/workspaces" });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string; message: string; request_id: string; reason?: string } };
    expect(API_ERROR_CODES as readonly string[]).toContain(body.error.code);
    expect(body.error.message).toBeString();
    expect(body.error.request_id).toBeString();
  });

  test("CONTRACT-03 分页参数默认与上限", async () => {
    const session = await devLogin(app, `contract-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces?limit=1&cursor=abc",
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: unknown[]; next_cursor: string | null };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.next_cursor === null || typeof body.next_cursor === "string").toBe(true);
  });

  test("CONTRACT-04 关键路径存在（防止误删）", () => {
    const paths = new Set(REGISTERED_ROUTES.map((route) => route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}")));
    for (const expected of [
      "/api/v1/workspaces/me/ensure",
      "/api/v1/workspaces/{workspaceId}/destroy",
      "/api/v1/workspaces/{workspaceId}/access-ticket",
      "/api/v1/model-policies/{policyId}/preview",
      "/api/v1/health",
    ]) {
      expect(paths.has(expected)).toBe(true);
    }
  });

  test("CONTRACT-05 跨租户资源 404（不返回 403）", async () => {
    const alice = await devLogin(app, `contract-a-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const bob = await devLogin(app, `contract-b-${crypto.randomUUID().slice(0, 6)}@example.com`);
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces/me/ensure",
      headers: { cookie: alice.cookie, "x-csrf-token": alice.csrf },
    });
    const workspaceId = (created.json() as { id: string }).id;
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: { cookie: bob.cookie },
    });
    expect(response.statusCode).toBe(404);
  });
});
