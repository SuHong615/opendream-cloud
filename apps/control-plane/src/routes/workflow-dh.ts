// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "../lib/errors";
import type { AppContext } from "../context";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, requireCsrf, requireSession } from "./shared";

type ProxyReply = { code: (status: number) => { send: (body?: unknown) => unknown } };

/** 非用户动作/内部路径白名单：即使上游新增也不得被门面公开。 */
const BLOCKED_SEGMENTS = new Set(["advance", "internal", "_debug", "metrics", "admin"]);
const auditFailures: Record<string, number> = { workflow: 0, "digital-human": 0 };

export function proxyAuditFailures(): Record<string, number> {
  return { ...auditFailures };
}

function isBlockedPath(pathname: string): boolean {
  return pathname
    .split("/")
    .filter(Boolean)
    .some((segment) => BLOCKED_SEGMENTS.has(segment.toLowerCase()));
}

async function proxyService(
  ctx: AppContext,
  request: FastifyRequest,
  reply: ProxyReply,
  upstreamBase: string,
  service: "workflow" | "digital-human",
): Promise<unknown> {
  const principal = requireSession(ctx, request);
  const write = !["GET", "HEAD"].includes(request.method);
  if (write) requireCsrf(request, principal);
  const url = new URL(request.url, "http://control-plane.local");
  if (isBlockedPath(url.pathname)) {
    throw new ApiError({ code: "not_found", status: 404, message: "route not exposed by control-plane facade" });
  }
  const headers: Record<string, string> = {
    "x-oc-org-id": principal.orgId,
    "x-oc-user-id": principal.userId,
    "x-oc-roles": principal.role,
    "x-request-id": currentRequestId(request),
  };
  if (write) headers["content-type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${upstreamBase.replace(/\/+$/u, "")}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: write ? JSON.stringify(request.body ?? {}) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError({ code: "upstream_error", status: 502, message: `${service} service unavailable` });
  }

  if (write) {
    try {
      auditFromRequest(ctx.sqlite, {
        request,
        principal,
        action: `${service}.proxy.${request.method.toLowerCase()}`,
        resourceType: service,
        resourceId: null,
        outcome: response.status < 400 ? "success" : "error",
        detail: { path: request.url, status: response.status, upstream_service: service },
      });
    } catch (error) {
      auditFailures[service] = (auditFailures[service] ?? 0) + 1;
      console.error(`${service} proxy audit failed`, error);
    }
  }

  if (response.status === 204) return reply.code(204).send();
  const body = await response.json().catch(() => null);
  return reply.code(response.status).send(body);
}

function registerPrefix(
  app: FastifyInstance,
  ctx: AppContext,
  prefix: string,
  upstreamBase: string,
  service: "workflow" | "digital-human",
): void {
  const handler = async (request: FastifyRequest, reply: ProxyReply) =>
    proxyService(ctx, request, reply, upstreamBase, service);
  app.get(prefix, handler);
  app.get(`${prefix}/*`, handler);
  app.post(prefix, handler);
  app.post(`${prefix}/*`, handler);
  app.patch(prefix, handler);
  app.patch(`${prefix}/*`, handler);
  app.put(prefix, handler);
  app.put(`${prefix}/*`, handler);
  app.delete(prefix, handler);
  app.delete(`${prefix}/*`, handler);
}

/**
 * M3：workflow-engine / digital-human 控制面门面。
 * 统一 session+CSRF+租户头+审计；RBAC 由上游按 x-oc-roles 执行（避免双源）。
 */
export function registerWorkflowDigitalHumanRoutes(app: FastifyInstance, ctx: AppContext): void {
  for (const prefix of [
    "/api/v1/workflows",
    "/api/v1/workflow-runs",
    "/api/v1/workflow-templates",
    "/api/v1/human-tasks",
    // openapi 1.1 canonical 命名（workflow-engine 两种前缀都兼容）
    "/api/v1/workflow-definitions",
    "/api/v1/workflow-instances",
    "/api/v1/workflow-versions",
  ]) {
    registerPrefix(app, ctx, prefix, ctx.env.WORKFLOW_URL, "workflow");
  }
  for (const prefix of ["/api/v1/dh"]) {
    registerPrefix(app, ctx, prefix, ctx.env.DIGITAL_HUMAN_URL, "digital-human");
  }

  // 上游健康探测（控制面聚合；不代理到业务路径，避免与 /dh/sessions 冲突）
  app.get("/api/v1/workflow-service/health", async (request) => {
    requireSession(ctx, request);
    return { ...(await probe(`${ctx.env.WORKFLOW_URL.replace(/\/+$/u, "")}/healthz`, "workflow")), audit_failures: auditFailures.workflow ?? 0 };
  });
  app.get("/api/v1/digital-human/health", async (request) => {
    requireSession(ctx, request);
    return { ...(await probe(`${ctx.env.DIGITAL_HUMAN_URL.replace(/\/+$/u, "")}/healthz`, "digital-human")), audit_failures: auditFailures["digital-human"] ?? 0 };
  });
}

async function probe(url: string, service: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return { service, status: response.ok ? "ok" : "degraded", upstream_status: response.status };
  } catch {
    return { service, status: "down", upstream_status: null };
  }
}
