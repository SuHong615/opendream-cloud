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
  const headers: Record<string, string> = {
    "x-oc-org-id": principal.orgId,
    "x-oc-user-id": principal.userId,
    "x-oc-roles": principal.role,
    "x-request-id": currentRequestId(request),
  };
  if (write) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${ctx.env.AGENT_WORKFORCE_URL.replace(/\/+$/u, "")}${url.pathname}${url.search}`, {
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
  for (const prefix of ["/api/v1/agent-employees", "/api/v1/agent-templates", "/api/v1/agent-squads", "/api/v1/agent-runs", "/api/v1/agent-schedules"]) {
    const handler = async (request: FastifyRequest, reply: ProxyReply) => proxyWorkforce(ctx, request, reply);
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
      app.route({ method, url: prefix, handler });
      app.route({ method, url: `${prefix}/*`, handler });
    }
  }
}
