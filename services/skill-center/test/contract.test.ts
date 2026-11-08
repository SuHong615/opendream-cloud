// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ROUTES } from "../src/routes/index";
import { createSkill, createVersion, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

const openapiText = readFileSync(new URL("../../../docs/02-architecture/openapi.yaml", import.meta.url), "utf8");
const openapiPaths = new Set([...openapiText.matchAll(/^ {2}(\/api\/v1\/[^:\n]+):\s*$/gm)].map((match) => match[1]!));
const openapiOperationIds = new Set([...openapiText.matchAll(/operationId:\s*([A-Za-z0-9_]+)/g)].map((match) => match[1]!));

const P2_DEFERRED = [
  "/api/v1/apps/{appId}/certificates",
  "/api/v1/apps/{appId}/metrics",
  "/api/v1/apps/{appId}/permissions",
  "/api/v1/apps/by-slug/{slug}",
  "/api/v1/mcp-servers/{serverId}/versions",
  "/api/v1/skill-installations/{installationId}/rollback",
  "/api/v1/skills/{skillId}/block",
  "/api/v1/skills/{skillId}/reviews",
];

let harness: Harness;

beforeAll(() => {
  harness = setupHarness();
});

afterAll(async () => {
  await harness.close();
});

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

describe("冻结契约（FROZEN openapi.yaml）", () => {
  test("CONTRACT-01 公开路由 ⊆ openapi", () => {
    const missing = ROUTES.filter((route) => !openapiPaths.has(toOpenApiPath(route.path))).map((route) => `${route.method} ${route.path}`);
    expect(missing).toEqual([]);
  });

  test("CONTRACT-02 operationId 全部命中冻结契约且唯一", () => {
    const ids = ROUTES.map((route) => route.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    const missing = ids.filter((id) => !openapiOperationIds.has(id));
    expect(missing).toEqual([]);
    expect(ROUTES).toHaveLength(19);
  });

  test("CONTRACT-03 x-p2-deferred 不出现在公开路由", () => {
    const paths = new Set(ROUTES.map((route) => toOpenApiPath(route.path)));
    for (const deferred of P2_DEFERRED) expect(paths.has(deferred)).toBe(false);
  });

  test("CONTRACT-04 /internal/* 与 /s/* 不进入公开路由", () => {
    const offenders = ROUTES.filter((route) => route.path.startsWith("/internal/") || route.path.startsWith("/s/"));
    expect(offenders).toEqual([]);
  });

  test("CONTRACT-05 健康检查", async () => {
    const response = await harness.app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  test("CONTRACT-06 未知路由为两层错误且 code ∈ 通用枚举", async () => {
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/skills/does-not-exist" });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { error: { code: string; request_id: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.request_id).toBeString();
  });

  test("CONTRACT-07 门禁错误为 409 + precondition_failed + gate_blocked", async () => {
    const skill = await createSkill(harness.app);
    const version = await createVersion(harness.app, String(skill.id));
    const response = await harness.app.inject({
      method: "POST",
      url: `/api/v1/skills/${skill.id}/versions/${version.id}/publish`,
      headers: TENANT_HEADERS,
    });
    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: { code: string; reason: string; details: { gate_kind: string } } };
    expect(body.error.code).toBe("precondition_failed");
    expect(body.error.reason).toBe("gate_blocked");
    expect(body.error.details.gate_kind).toBe("scan");
  });

  test("CONTRACT-08 列表响应为 cursor 分页结构", async () => {
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/skills?limit=1", headers: TENANT_HEADERS });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: unknown[]; next_cursor: string | null };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.next_cursor === null || typeof body.next_cursor === "string").toBe(true);
  });
});
