// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "../lib/errors";
import type { AppContext } from "../context";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, requireCsrf, requireSession } from "./shared";

type ProxyReply = { code: (status: number) => { send: (body?: unknown) => unknown } };

const BLOCKED_SEGMENTS = new Set(["internal", "_debug", "metrics", "admin"]);

function isBlockedPath(pathname: string): boolean {
  return pathname
    .split("/")
    .filter(Boolean)
    .some((segment) => BLOCKED_SEGMENTS.has(segment.toLowerCase()));
}

async function proxyEval(ctx: AppContext, request: FastifyRequest, reply: ProxyReply): Promise<unknown> {
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
    response = await fetch(`${ctx.env.EVAL_CENTER_URL.replace(/\/+$/u, "")}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: write ? JSON.stringify(request.body ?? {}) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError({ code: "upstream_error", status: 502, message: "eval-center service unavailable" });
  }
  if (write) {
    try {
      auditFromRequest(ctx.sqlite, {
        request,
        principal,
        action: `eval.proxy.${request.method.toLowerCase()}`,
        resourceType: "eval",
        resourceId: null,
        outcome: response.status < 400 ? "success" : "error",
        detail: { path: request.url, status: response.status, upstream_service: "eval-center" },
      });
    } catch (error) {
      console.error("eval proxy audit failed", error);
    }
  }
  if (response.status === 204) return reply.code(204).send();
  const body = await response.json().catch(() => null);
  return reply.code(response.status).send(body);
}

function registerPrefix(app: FastifyInstance, ctx: AppContext, prefix: string): void {
  const handler = async (request: FastifyRequest, reply: ProxyReply) => proxyEval(ctx, request, reply);
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

/** 评测中心门面：session + CSRF + 审计 + 502；不暴露 /internal/*。 */
export function registerEvalRoutes(app: FastifyInstance, ctx: AppContext): void {
  for (const prefix of ["/api/v1/eval-datasets", "/api/v1/eval-runs", "/api/v1/eval-evaluators"]) {
    registerPrefix(app, ctx, prefix);
  }
}
