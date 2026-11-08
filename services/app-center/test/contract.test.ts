// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { INTERNAL_ROUTES, ROUTES } from "../src/routes";
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

describe("冻结契约（App）", () => {
  test("APP-CONTRACT-01 公开路由 ⊆ openapi 且 operationId 命中", () => {
    expect(ROUTES.filter((route) => !openapiPaths.has(toOpenApi(route.path)))).toEqual([]);
    expect(ROUTES.filter((route) => !openapiOperationIds.has(route.operationId))).toEqual([]);
    expect(ROUTES).toHaveLength(30);
  });

  test("APP-CONTRACT-02 P2 路由不存在", () => {
    const paths = new Set(ROUTES.map((route) => toOpenApi(route.path)));
    for (const p2 of ["/api/v1/apps/{appId}/certificates", "/api/v1/apps/{appId}/metrics", "/api/v1/apps/{appId}/permissions", "/api/v1/apps/by-slug/{slug}"]) {
      expect(paths.has(p2)).toBe(false);
    }
  });

  test("APP-CONTRACT-03 内部端点不进公开路由", () => {
    expect(ROUTES.filter((route) => route.path.startsWith("/internal/"))).toEqual([]);
    expect(INTERNAL_ROUTES).toHaveLength(2);
  });

  test("APP-CONTRACT-04 healthz 与未知路由", async () => {
    const health = await harness.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const missing = await harness.app.inject({ method: "GET", url: "/api/v1/apps/nope" });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: { code: string } }).error.code).toBe("not_found");
  });
});
