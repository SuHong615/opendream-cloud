// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, requireCsrf, requireSession } from "./shared";

type ProxyReply = { code: (status: number) => { send: (body?: unknown) => unknown } };

async function proxyWorkforce(ctx: AppContext, request: FastifyRequest, reply: ProxyReply): Promise<unknown> {
  const principal = requireSession(ctx, request);
  const write = !["GET", "HEAD"].includes(request.method);
  if (write) requireCsrf(request, principal);
  const url = new URL(request.url, "http://control-plane.local");
  if (url.pathname.split("/").filter(Boolean).some((segment) => ["internal", "_debug", "metrics", "admin"].includes(segment.toLowerCase()))) {
    throw new ApiError({ code: "not_found", status: 404, message: "route not exposed by control-plane facade" });
  }
  // M2b 灰度读：由 AGENTCORE_LEGACY_READ 控制。只覆盖 Run 读，写仍走旧服务；
  // 任何异常都返回 502，避免静默读错源。回滚只需关闭 flag。
  const legacyDetail = /^\/api\/v1\/agent-runs\/([^/]+)$/u.exec(url.pathname);
  const legacyList = url.pathname === "/api/v1/agent-runs";
  if (ctx.env.AGENTCORE_LEGACY_READ && request.method === "GET" && (legacyList || legacyDetail)) {
    try {
      if (legacyList) {
        const upstream = await fetch(`${ctx.env.AGENTCORE_URL.replace(/\/+$/u, "")}/api/v1/runtime/legacy-runs${url.search}`, {
          headers: { "x-oc-org-id": principal.orgId, "x-oc-user-id": principal.userId, "x-oc-roles": principal.role, "x-request-id": currentRequestId(request) },
          signal: AbortSignal.timeout(3000),
        });
        if (!upstream.ok) return reply.code(upstream.status).send(await upstream.json().catch(() => null));
        const body = await upstream.json() as { items?: Array<{ data?: unknown }> };
        return reply.code(200).send({ items: (body.items ?? []).map((item) => item.data ?? item), next_cursor: null, source: "agentcore" });
      }
      const legacyId = decodeURIComponent(legacyDetail?.[1] ?? "");
      const upstream = await fetch(`${ctx.env.AGENTCORE_URL.replace(/\/+$/u, "")}/api/v1/runtime/legacy-runs/${encodeURIComponent(legacyId)}`, {
        headers: { "x-oc-org-id": principal.orgId, "x-oc-user-id": principal.userId, "x-oc-roles": principal.role, "x-request-id": currentRequestId(request) },
        signal: AbortSignal.timeout(3000),
      });
      if (!upstream.ok) return reply.code(upstream.status).send(await upstream.json().catch(() => null));
      const body = await upstream.json() as { data?: unknown };
      return reply.code(200).send(body.data ?? body);
    } catch {
      throw new ApiError({ code: "upstream_error", status: 502, message: "agentcore legacy read unavailable" });
    }
  }
  // M4a transitional namespace: /api/v1/orchestration/* → legacy workforce routes.
  // 不是最终 ownership；M4b 迁移到独立 orchestration 服务后删除。
  const upstreamPath = url.pathname
    .replace(/^\/api\/v1\/orchestration\/roles/, "/api/v1/roles")
    .replace(/^\/api\/v1\/orchestration\/legions/, "/api/v1/legions")
    .replace(/^\/api\/v1\/orchestration\/legion-runs/, "/api/v1/legion-runs")
    .replace(/^\/api\/v1\/orchestration\/requirements/, "/api/v1/requirements")
    .replace(/^\/api\/v1\/orchestration\/approvals/, "/api/v1/approvals");
  const headers: Record<string, string> = {
    "x-oc-org-id": principal.orgId,
    "x-oc-user-id": principal.userId,
    "x-oc-roles": principal.role,
    "x-request-id": currentRequestId(request),
  };
  if (write) headers["content-type"] = "application/json";
  const idempotencyKey = request.headers["idempotency-key"];
  if (typeof idempotencyKey === "string" && idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  let response: Response;
  try {
    response = await fetch(`${ctx.env.AGENT_WORKFORCE_URL.replace(/\/+$/u, "")}${upstreamPath}${url.search}`, {
      method: request.method,
      headers,
      body: write ? JSON.stringify(request.body ?? {}) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError({ code: "upstream_error", status: 502, message: "agent workforce service unavailable" });
  }
  if (write) {
    try {
      auditFromRequest(ctx.sqlite, {
        request,
        principal,
        action: `agent-workforce.proxy.${request.method.toLowerCase()}`,
        resourceType: "agent-workforce",
        resourceId: null,
        outcome: response.status < 400 ? "success" : "error",
        detail: { path: request.url, status: response.status, upstream_service: "agent-workforce" },
      });
    } catch (error) {
      console.error("agent-workforce proxy audit failed", error);
    }
  }
  if (response.status === 204) return reply.code(204).send();
  return reply.code(response.status).send(await response.json().catch(() => null));
}

export function registerAgentWorkforceRoutes(app: FastifyInstance, ctx: AppContext): void {
  for (const prefix of ["/api/v1/agent-employees", "/api/v1/agent-templates", "/api/v1/agent-squads", "/api/v1/agent-runs", "/api/v1/agent-schedules", "/api/v1/executors", "/api/v1/roles", "/api/v1/legions", "/api/v1/legion-runs", "/api/v1/requirements", "/api/v1/approvals", "/api/v1/orchestration"]) {
    const handler = async (request: FastifyRequest, reply: ProxyReply) => proxyWorkforce(ctx, request, reply);
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
      app.route({ method, url: prefix, handler });
      app.route({ method, url: `${prefix}/*`, handler });
    }
  }
}
