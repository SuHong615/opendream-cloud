// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ApiError } from "../lib/errors";
import type { AppContext } from "../context";
import { currentRequestId, requireCsrf, requireSession } from "./shared";

/**
 * v3 App Center 门面：/api/v1/apps* 统一转发 app-center，
 * 由 app-center 执行 App ACL（owner/admin/editor/operator/viewer × actions）。
 * control-plane 只做会话/CSRF/审计入口，不做业务判权（避免双源）。
 */
async function proxyApp(ctx: AppContext, request: FastifyRequest, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const principal = requireSession(ctx, request);
  const write = !["GET", "HEAD"].includes(request.method);
  if (write) requireCsrf(request, principal);
  const url = new URL(request.url, "http://control-plane.local");
  let response: Response;
  try {
    response = await fetch(`${ctx.env.APP_CENTER_URL.replace(/\/+$/u, "")}${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        "x-oc-org-id": principal.orgId,
        "x-oc-user-id": principal.userId,
        "x-oc-roles": principal.role,
        "x-request-id": currentRequestId(request),
      },
      body: write ? JSON.stringify(request.body ?? {}) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError({ code: "upstream_error", status: 502, message: "app-center unavailable" });
  }
  const body = await response.json().catch(() => null);
  return reply.code(response.status).send(body);
}

export function registerAppRoutes(app: FastifyInstance, ctx: AppContext): void {
  const handler = async (request: FastifyRequest, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) =>
    proxyApp(ctx, request, reply);
  app.get("/api/v1/apps", handler);
  app.post("/api/v1/apps", handler);
  app.get("/api/v1/apps/*", handler);
  app.post("/api/v1/apps/*", handler);
  app.patch("/api/v1/apps/*", handler);
  app.put("/api/v1/apps/*", handler);
  app.delete("/api/v1/apps/*", handler);
  // 公开分享入口：登录后可访问；未登录仍由 app-center/网关处理
  app.get("/api/v1/apps/public/:slug", handler);
}
