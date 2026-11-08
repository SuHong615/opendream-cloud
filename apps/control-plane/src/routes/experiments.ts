// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, requireCsrf, requireSession } from "./shared";

type ProxyReply = { code: (status: number) => { send: (body?: unknown) => unknown } };

async function proxyExperiment(ctx: AppContext, request: FastifyRequest, reply: ProxyReply): Promise<unknown> {
  const principal = requireSession(ctx, request);
  const write = !["GET", "HEAD"].includes(request.method);
  if (write) requireCsrf(request, principal);
  const url = new URL(request.url, "http://control-plane.local");
  const headers: Record<string, string> = {
    "x-oc-org-id": principal.orgId,
    "x-oc-user-id": principal.userId,
    "x-oc-roles": principal.role,
    "x-request-id": currentRequestId(request),
  };
  if (write) headers["content-type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(`${ctx.env.EXPERIMENT_CENTER_URL.replace(/\/+$/u, "")}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: write ? JSON.stringify(request.body ?? {}) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError({ code: "upstream_error", status: 502, message: "experiment center unavailable" });
  }
  if (write) {
    try {
      auditFromRequest(ctx.sqlite, {
        request,
        principal,
        action: `experiment.proxy.${request.method.toLowerCase()}`,
        resourceType: "experiment",
        resourceId: null,
        outcome: response.status < 400 ? "success" : "error",
        detail: { path: request.url, status: response.status, upstream_service: "experiment-center" },
      });
    } catch (error) {
      console.error("experiment proxy audit failed", error);
    }
  }
  if (response.status === 204) return reply.code(204).send();
  return reply.code(response.status).send(await response.json().catch(() => null));
}

export function registerExperimentRoutes(app: FastifyInstance, ctx: AppContext): void {
  const handler = async (request: FastifyRequest, reply: ProxyReply) => proxyExperiment(ctx, request, reply);
  for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
    app.route({ method, url: "/api/v1/experiments", handler });
    app.route({ method, url: "/api/v1/experiments/*", handler });
  }
}
