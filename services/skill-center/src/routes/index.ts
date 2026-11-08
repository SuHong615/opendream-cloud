// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context";
import { registerHealthRoutes } from "./health";
import { registerInternalRoutes } from "./internal";
import { registerInstallationRoutes } from "./installations";
import { registerLifecycleRoutes } from "./lifecycle";
import { registerReviewRoutes } from "./reviews";
import { registerSkillRoutes } from "./skills";
import { registerStatsRoutes } from "./stats";
import { registerVersionRoutes } from "./versions";

export interface RouteSpec {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  operationId: string;
}

/** 公开路由：与冻结 openapi/Routes 一一对应；不含 /internal/* 与 /s/* 分发端点。 */
export const ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/api/v1/skills", operationId: "listSkills" },
  { method: "POST", path: "/api/v1/skills", operationId: "createSkill" },
  { method: "GET", path: "/api/v1/skills/by-slug/:orgSlug/:skillSlug", operationId: "resolveSkillBySlug" },
  { method: "GET", path: "/api/v1/skills/:skillId", operationId: "getSkill" },
  { method: "PATCH", path: "/api/v1/skills/:skillId", operationId: "updateSkill" },
  { method: "DELETE", path: "/api/v1/skills/:skillId", operationId: "deleteSkill" },
  { method: "GET", path: "/api/v1/skills/:skillId/versions", operationId: "listSkillVersions" },
  { method: "POST", path: "/api/v1/skills/:skillId/versions", operationId: "createSkillVersion" },
  { method: "GET", path: "/api/v1/skills/:skillId/versions/:versionId", operationId: "getSkillVersion" },
  { method: "POST", path: "/api/v1/skills/:skillId/versions/:versionId/publish", operationId: "publishSkillVersion" },
  { method: "POST", path: "/api/v1/skills/:skillId/versions/:versionId/submit-review", operationId: "submitSkillVersionReview" },
  { method: "POST", path: "/api/v1/skills/:skillId/versions/:versionId/review", operationId: "reviewSkillVersion" },
  { method: "POST", path: "/api/v1/skills/:skillId/versions/:versionId/yank", operationId: "yankSkillVersion" },
  { method: "POST", path: "/api/v1/skills/:skillId/versions/:versionId/rollback", operationId: "rollbackSkillVersion" },
  { method: "GET", path: "/api/v1/skills/:skillId/stats", operationId: "getSkillStats" },
  { method: "POST", path: "/api/v1/skills/:skillId/install", operationId: "installSkill" },
  { method: "GET", path: "/api/v1/skill-installations", operationId: "listSkillInstallations" },
  { method: "PATCH", path: "/api/v1/skill-installations/:installationId", operationId: "updateSkillInstallation" },
  { method: "DELETE", path: "/api/v1/skill-installations/:installationId", operationId: "uninstallSkill" },
];

/** 运维端点：不在公开契约内（契约测试白名单）。 */
export const OPERATIONAL_ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/healthz", operationId: "healthz" },
  { method: "GET", path: "/readyz", operationId: "readyz" },
  { method: "GET", path: "/api/v1/health", operationId: "serviceHealth" },
];

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  registerHealthRoutes(app, ctx);
  registerSkillRoutes(app, ctx);
  registerVersionRoutes(app, ctx);
  registerLifecycleRoutes(app, ctx);
  registerReviewRoutes(app, ctx);
  registerStatsRoutes(app, ctx);
  registerInstallationRoutes(app, ctx);
}

export function registerNonPublicRoutes(app: FastifyInstance, ctx: AppContext): void {
  registerInternalRoutes(app, ctx);
}
