// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GATEWAY_ROUTES, INTERNAL_ROUTES, ROUTES } from "../src/routes";
import { setupHarness, type Harness } from "./helpers";

const openapiText = readFileSync(new URL("../../../docs/02-architecture/openapi.yaml", import.meta.url), "utf8");
const openapiPaths = new Set([...openapiText.matchAll(/^ {2}(\/api\/v1\/[^:\n]+):\s*$/gm)].map((match) => match[1]!));
const openapiOperationIds = new Set([...openapiText.matchAll(/operationId:\s*([A-Za-z0-9_]+)/g)].map((match) => match[1]!));

let harness: Harness;
beforeAll(() => {
  harness = setupHarness();
});
afterAll(async () => {
  await harness.close();
});

const toOpenApi = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

/** v3 MVP 新端点：先不修改 v2 FROZEN openapi，契约由 MCP-GATEWAY.md v0.2 + ADR 落地后进 1.1。 */
const V3_CONTRACT_EXCEPTIONS = new Set([
  "/api/v1/mcp-servers/{serverId}/submit-review",
  "/api/v1/mcp-servers/{serverId}/deprecate",
  "/api/v1/mcp-servers/{serverId}/offline",
  "/api/v1/mcp-servers/{serverId}/versions",
  "/api/v1/mcp-servers/{serverId}/rollback",
]);

describe("MCP 契约（v2 FROZEN + v3 MVP allowlist）", () => {
  test("MCP-CONTRACT-01 公开路由 ⊆ openapi ∪ v3 allowlist", () => {
    const missing = ROUTES.filter((route) => {
      const path = toOpenApi(route.path);
      if (V3_CONTRACT_EXCEPTIONS.has(path)) return false;
      return !openapiPaths.has(path) || !openapiOperationIds.has(route.operationId);
    });
    expect(missing).toEqual([]);
    expect(ROUTES).toHaveLength(27);
  });

  test("MCP-CONTRACT-02 v3 网关入口独立注册且不影响 REST 契约", () => {
    expect(GATEWAY_ROUTES).toHaveLength(5);
    expect(GATEWAY_ROUTES.every((route) => route.path.startsWith("/v1/"))).toBe(true);
    expect(ROUTES.filter((route) => route.path.startsWith("/v1/"))).toEqual([]);
  });

  test("MCP-CONTRACT-03 内部端点不进入公开路由", () => {
    expect(ROUTES.filter((route) => route.path.startsWith("/internal/"))).toEqual([]);
    expect(INTERNAL_ROUTES).toHaveLength(10);
    for (const route of INTERNAL_ROUTES) expect(route.path.startsWith("/internal/")).toBe(true);
  });

  test("MCP-CONTRACT-04 healthz 与两层错误", async () => {
    const health = await harness.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const missing = await harness.app.inject({ method: "GET", url: "/api/v1/mcp-servers/nope" });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: { code: string } }).error.code).toBe("not_found");
  });
});
