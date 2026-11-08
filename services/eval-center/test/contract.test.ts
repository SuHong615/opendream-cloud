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

// M5-1 evaluator 为 MVP extension（openapi 1.1.0 未定义，已记 CONTRACT-DIFF / 1.2 backlog）。
const MVP_EXTENSION_PATHS = new Set([
  "/api/v1/eval-evaluators",
  "/api/v1/eval-evaluators/{evaluatorId}",
]);
const MVP_EXTENSION_IDS = new Set(["listEvalEvaluators", "createEvalEvaluator", "getEvalEvaluator", "updateEvalEvaluator", "deleteEvalEvaluator"]);

describe("冻结契约（Eval）", () => {
  test("EVAL-CONTRACT-01 公开路由 ⊆ openapi 且 operationId 命中（evaluator 为 MVP extension）", () => {
    const missingPaths = ROUTES.filter((route) => !openapiPaths.has(toOpenApi(route.path)) && !MVP_EXTENSION_PATHS.has(toOpenApi(route.path))).map((route) => route.path);
    expect(missingPaths).toEqual([]);
    const missingIds = ROUTES.filter((route) => !openapiOperationIds.has(route.operationId) && !MVP_EXTENSION_IDS.has(route.operationId)).map((route) => route.operationId);
    expect(missingIds).toEqual([]);
    expect(ROUTES).toHaveLength(17);
  });

  test("EVAL-CONTRACT-02 内部端点不进入公开路由", () => {
    expect(ROUTES.filter((route) => route.path.startsWith("/internal/"))).toEqual([]);
    expect(INTERNAL_ROUTES).toHaveLength(6);
    for (const route of INTERNAL_ROUTES) expect(route.path.startsWith("/internal/")).toBe(true);
  });

  test("EVAL-CONTRACT-03 P2/未授权路径不出现", () => {
    const paths = new Set(ROUTES.map((route) => toOpenApi(route.path)));
    for (const p2 of [
      "/api/v1/apps/{appId}/certificates",
      "/api/v1/mcp-servers/{serverId}/versions",
      "/api/v1/skills/{skillId}/block",
    ]) {
      expect(paths.has(p2)).toBe(false);
    }
  });

  test("EVAL-CONTRACT-04 9 态枚举与两层错误", async () => {
    const health = await harness.app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const missing = await harness.app.inject({ method: "GET", url: "/api/v1/eval-runs/nope" });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: { code: string } }).error.code).toBe("not_found");
    expect([
      "queued",
      "preparing",
      "running",
      "collecting",
      "grading",
      "completed",
      "failed",
      "canceled",
      "timed_out",
    ]).toHaveLength(9);
  });
});
