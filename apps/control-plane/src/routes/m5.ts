// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { randomId } from "../lib/crypto";
import { currentRequestId, parseInput, requireCsrf, requireRole, requireSession } from "./shared";
import { auditFromRequest } from "../services/audit";
import type { Principal } from "../types";

interface OrgQuota {
  workspaces: number;
  members: number;
  budget_usd: number;
  mcp_servers: number;
}

function requireOrgAccess(principal: Principal, orgId: string): void {
  if (principal.orgId !== orgId) throw new ApiError({ code: "not_found", status: 404, message: "organization not found" });
}

function quotaOf(ctx: AppContext, orgId: string): OrgQuota {
  const row = ctx.sqlite
    .query<{ workspaces: number; members: number; budget_usd: number; mcp_servers: number }, [string]>(
      "SELECT workspaces, members, budget_usd, mcp_servers FROM org_quotas WHERE org_id = ?",
    )
    .get(orgId);
  return row
    ? { workspaces: row.workspaces, members: row.members, budget_usd: row.budget_usd, mcp_servers: row.mcp_servers }
    : { workspaces: 10, members: 50, budget_usd: 100, mcp_servers: 20 };
}

function saveQuota(ctx: AppContext, orgId: string, quota: OrgQuota): void {
  ctx.sqlite
    .query(
      `INSERT INTO org_quotas (org_id, workspaces, members, budget_usd, mcp_servers, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(org_id) DO UPDATE SET workspaces = excluded.workspaces, members = excluded.members, budget_usd = excluded.budget_usd, mcp_servers = excluded.mcp_servers, updated_at = excluded.updated_at`,
    )
    .run(orgId, quota.workspaces, quota.members, quota.budget_usd, quota.mcp_servers, Date.now());
}

function maskText(text: string): string {
  return text.slice(0, 200);
}

export function registerM5Routes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------- memory / experience 门面（代理 memory-service，不在本地存数据）
  // 公开路径：/api/v1/memories*、/api/v1/experiences*；上游 mem0 数据面 /v1/memories* 不对外暴露。
  const proxyMemory = async (request: FastifyRequest, reply: { code: (n: number) => { send: (b?: unknown) => unknown } }, upstreamPath: string) => {
    let principal: Principal;
    try {
      principal = requireSession(ctx, request);
    } catch {
      const auth = typeof request.headers.authorization === "string" ? request.headers.authorization : "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token || token !== ctx.env.MEMORY_API_KEY) throw new ApiError({ code: "unauthorized", status: 401, message: "authentication required" });
      principal = {
        orgId: typeof request.headers["x-oc-org-id"] === "string" ? request.headers["x-oc-org-id"] : "local-memory-org",
        userId: "memory-api-key",
        role: "viewer",
      } as Principal;
    }
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
    if (ctx.env.MEMORY_API_KEY) headers.authorization = `Bearer ${ctx.env.MEMORY_API_KEY}`;
    if (write) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await fetch(`${ctx.env.MEMORY_URL.replace(/\/+$/u, "")}${upstreamPath}${url.search}`, {
        method: request.method,
        headers,
        body: write ? JSON.stringify(request.body ?? {}) : undefined,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ApiError({ code: "upstream_error", status: 502, message: "memory service unavailable" });
    }
    if (write) {
      try {
        auditFromRequest(ctx.sqlite, {
          request,
          principal,
          action: `memory.proxy.${request.method.toLowerCase()}`,
          resourceType: "memory",
          resourceId: null,
          outcome: response.status < 400 ? "success" : "error",
          detail: { path: request.url, status: response.status, upstream_service: "memory-service" },
        });
      } catch (error) {
        console.error("memory proxy audit failed", error);
      }
    }
    if (response.status === 204) return reply.code(204).send();
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && Array.isArray(body.results) && request.method === "POST" && !url.pathname.endsWith("/search")) {
      const first = body.results[0] as Record<string, unknown> | undefined;
      if (first?.id !== undefined) {
        body.id ??= first.id;
        body.memory_id ??= first.id;
      }
    }
    return reply.code(response.status).send(body);
  };

  const memoryProxyRoutes = (prefix: string, upstreamBase: string) => {
    const handler = async (request: FastifyRequest, reply: { code: (n: number) => { send: (b?: unknown) => unknown } }) => {
      const url = new URL(request.url, "http://control-plane.local");
      const suffix = url.pathname.slice(prefix.length);
      return proxyMemory(request, reply, `${upstreamBase}${suffix}`);
    };
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
      app.route({ method, url: prefix, handler });
      app.route({ method, url: `${prefix}/*`, handler });
    }
  };
  memoryProxyRoutes("/api/v1/memories", "/v1/memories");
  memoryProxyRoutes("/api/v1/experiences", "/api/v1/experiences");


  const probeService = async (name: string, url: string | undefined) => {
    if (!url) return { name, status: "degraded" as const };
    try {
      const response = await fetch(`${url.replace(/\/+$/u, "")}/healthz`, { signal: AbortSignal.timeout(1000) });
      return { name, status: response.ok ? ("ok" as const) : ("degraded" as const) };
    } catch {
      return { name, status: "degraded" as const };
    }
  };

  const overview = async (request: FastifyRequest) => {
    const principal = requireSession(ctx, request);
    const range = String((request.query as { range?: string }).range ?? "24h");
    if (!["1h", "6h", "24h", "7d"].includes(range)) throw new ApiError({ code: "validation_failed", status: 400, message: "invalid range" });
    const windowMs = range === "1h" ? 3_600_000 : range === "6h" ? 21_600_000 : range === "7d" ? 604_800_000 : 86_400_000;
    const since = Date.now() - windowMs;
    const workspaces = ctx.sqlite
      .query<{ total: number; ready: number }, [string]>(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN state = 'ready' THEN 1 ELSE 0 END) AS ready FROM workspaces WHERE org_id = ? AND deleted_at IS NULL",
      )
      .get(principal.orgId);
    const usage = ctx.sqlite
      .query<{ tokens: number; cost: number; errors: number; requests: number }, [string, number]>(
        `SELECT COALESCE(SUM(tokens_input + tokens_output), 0) AS tokens,
                COALESCE(SUM(CAST(cost_usd AS REAL)), 0) AS cost,
                COALESCE(SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END), 0) AS errors,
                COUNT(*) AS requests
         FROM usage_records WHERE org_id = ? AND occurred_at >= ?`,
      )
      .get(principal.orgId, since);
    const mcpCalls = ctx.sqlite
      .query<{ total: number; denied: number }, [string, number]>(
        "SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END), 0) AS denied FROM mcp_call_logs WHERE org_id = ? AND created_at >= ?",
      )
      .get(principal.orgId, since);
    const evalRuns = ctx.sqlite
      .query<{ total: number }, [string, number]>(
        "SELECT COUNT(*) AS total FROM audit_logs WHERE org_id = ? AND action LIKE 'eval.%' AND created_at >= ?",
      )
      .get(principal.orgId, since);
    const services = await Promise.all([
      Promise.resolve({ name: "control-plane", status: "ok" as const }),
      probeService("mcp-hub", ctx.env.MCP_HUB_URL),
      probeService("workflow-engine", ctx.env.WORKFLOW_URL),
      probeService("digital-human", ctx.env.DIGITAL_HUMAN_URL),
      probeService("eval-center", ctx.env.EVAL_CENTER_URL),
      probeService("app-center", ctx.env.APP_CENTER_URL),
    ]);
    return {
      range,
      qps: 0,
      workspaces: { total: workspaces?.total ?? 0, ready: workspaces?.ready ?? 0 },
      usage: { tokens: usage?.tokens ?? 0, cost_usd: usage?.cost ?? 0, errors: usage?.errors ?? 0, requests: usage?.requests ?? 0 },
      mcp: { calls: mcpCalls?.total ?? 0, denied: mcpCalls?.denied ?? 0 },
      eval: { runs: evalRuns?.total ?? 0 },
      services,
      degraded: services.some((service) => service.status !== "ok"),
      request_id: currentRequestId(request),
    };
  };
  app.get("/api/v1/observability/overview", overview);
  app.get("/api/v1/observability/timeseries", async (request) => {
    const principal = requireSession(ctx, request);
    const query = request.query as { metric?: string; window?: string; range?: string; step?: string };
    const metric = query.metric ?? "tokens";
    if (!["requests", "tokens", "cost", "runs"].includes(metric)) throw new ApiError({ code: "validation_failed", status: 400, message: "invalid metric" });
    const window = query.window ?? query.range ?? "24h";
    if (!["1h", "6h", "24h", "7d"].includes(window)) throw new ApiError({ code: "validation_failed", status: 400, message: "invalid window" });
    const hours = window === "1h" ? 1 : window === "6h" ? 6 : window === "7d" ? 168 : 24;
    const now = Math.floor(Date.now() / 1000);
    const since = (now - hours * 3600) * 1000;
    const bucketSeconds = 3600;
    const rows =
      metric === "runs"
        ? ctx.sqlite
            .query<{ bucket: number; value: number }, [string, number]>(
              "SELECT CAST(created_at / 3600000 AS INTEGER) * 3600 AS bucket, COUNT(*) AS value FROM audit_logs WHERE org_id = ? AND action LIKE 'eval.%' AND created_at >= ? GROUP BY bucket ORDER BY bucket",
            )
            .all(principal.orgId, since)
        : ctx.sqlite
            .query<{ bucket: number; value: number }, [string, number]>(
              metric === "cost"
                ? "SELECT CAST(occurred_at / 3600000 AS INTEGER) * 3600 AS bucket, COALESCE(SUM(CAST(cost_usd AS REAL)), 0) AS value FROM usage_records WHERE org_id = ? AND occurred_at >= ? GROUP BY bucket ORDER BY bucket"
                : metric === "requests"
                  ? "SELECT CAST(occurred_at / 3600000 AS INTEGER) * 3600 AS bucket, COUNT(*) AS value FROM usage_records WHERE org_id = ? AND occurred_at >= ? GROUP BY bucket ORDER BY bucket"
                  : "SELECT CAST(occurred_at / 3600000 AS INTEGER) * 3600 AS bucket, COALESCE(SUM(tokens_input + tokens_output), 0) AS value FROM usage_records WHERE org_id = ? AND occurred_at >= ? GROUP BY bucket ORDER BY bucket",
            )
            .all(principal.orgId, since);
    const byBucket = new Map(rows.map((row) => [Number(row.bucket), Number(row.value)]));
    const points = Array.from({ length: hours }, (_, index) => {
      const timestamp = now - (hours - 1 - index) * bucketSeconds;
      return { timestamp, value: byBucket.get(timestamp) ?? 0 };
    });
    return { metric, window, step: bucketSeconds, points, items: points, request_id: currentRequestId(request) };
  });

  // ---------------- org members / quotas
  const orgRoutes = (base: string) => {
    app.get(`${base}/:orgId/members`, async (request) => {
      const principal = requireSession(ctx, request);
      const { orgId } = request.params as { orgId: string };
      requireOrgAccess(principal, orgId);
      const items = ctx.sqlite
        .query<{ id: string; user_id: string; role: string; status: string; email: string; display_name: string }, [string]>(
          "SELECT m.id, m.user_id, m.role, m.status, u.email, u.display_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at",
        )
        .all(orgId)
        .map((row) => ({ ...row, member_id: row.id }));
      return { items, members: items };
    });
    app.post(`${base}/:orgId/members`, async (request, reply) => {
      const principal = requireSession(ctx, request);
      requireCsrf(request, principal);
      requireRole(principal, ["owner", "admin"]);
      const { orgId } = request.params as { orgId: string };
      requireOrgAccess(principal, orgId);
      const body = parseInput(z.object({ email: z.string().email(), role: z.enum(["owner", "admin", "member", "viewer"]).default("member") }), request.body ?? {}, "body");
      const now = Date.now();
      const existing = ctx.sqlite.query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?").get(body.email);
      const userId = existing?.id ?? randomId();
      if (!existing) {
        ctx.sqlite
          .query("INSERT INTO users (id, email, display_name, locale, status, created_at) VALUES (?, ?, ?, 'zh-CN', 'active', ?)")
          .run(userId, body.email, body.email.split("@")[0]!, now);
      }
      const membership = ctx.sqlite.query<{ id: string }, [string, string]>("SELECT id FROM memberships WHERE org_id = ? AND user_id = ?").get(orgId, userId);
      if (membership) throw new ApiError({ code: "conflict", status: 409, message: "member already exists" });
      const memberId = randomId();
      ctx.sqlite
        .query("INSERT INTO memberships (id, org_id, user_id, role, status, invited_by, invited_at, joined_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)")
        .run(memberId, orgId, userId, body.role ?? "member", principal.userId, now, now, now);
      return reply.code(201).send({ id: memberId, member_id: memberId, user_id: userId, email: body.email, role: body.role });
    });
    app.patch(`${base}/:orgId/members/:memberId`, async (request) => {
      const principal = requireSession(ctx, request);
      requireCsrf(request, principal);
      requireRole(principal, ["owner", "admin"]);
      const { orgId, memberId } = request.params as { orgId: string; memberId: string };
      requireOrgAccess(principal, orgId);
      const body = parseInput(z.object({ role: z.enum(["owner", "admin", "member", "viewer"]) }), request.body ?? {}, "body");
      const member = ctx.sqlite.query<{ user_id: string; role: string }, [string, string]>("SELECT user_id, role FROM memberships WHERE id = ? AND org_id = ?").get(memberId, orgId);
      if (!member) throw new ApiError({ code: "not_found", status: 404, message: "member not found" });
      if (member.role === "owner" && body.role !== "owner") {
        const owners = ctx.sqlite.query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND role = 'owner' AND status = 'active'").get(orgId);
        if ((owners?.c ?? 0) <= 1) throw new ApiError({ code: "conflict", status: 409, message: "cannot demote last owner" });
      }
      ctx.sqlite.query("UPDATE memberships SET role = ? WHERE id = ?").run(body.role, memberId);
      return { id: memberId, member_id: memberId, user_id: member.user_id, role: body.role };
    });
    app.delete(`${base}/:orgId/members/:memberId`, async (request, reply) => {
      const principal = requireSession(ctx, request);
      requireCsrf(request, principal);
      requireRole(principal, ["owner", "admin"]);
      const { orgId, memberId } = request.params as { orgId: string; memberId: string };
      requireOrgAccess(principal, orgId);
      const member = ctx.sqlite.query<{ user_id: string; role: string }, [string, string]>("SELECT user_id, role FROM memberships WHERE id = ? AND org_id = ?").get(memberId, orgId);
      if (!member) throw new ApiError({ code: "not_found", status: 404, message: "member not found" });
      if (member.role === "owner" || memberId === principal.userId) {
        const owners = ctx.sqlite.query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND role = 'owner' AND status = 'active'").get(orgId);
        if ((owners?.c ?? 0) <= 1) throw new ApiError({ code: "conflict", status: 409, message: "cannot remove last owner" });
      }
      ctx.sqlite.query("DELETE FROM memberships WHERE id = ?").run(memberId);
      return reply.code(204).send();
    });
    app.get(`${base}/:orgId/quotas`, async (request) => {
      const principal = requireSession(ctx, request);
      const { orgId } = request.params as { orgId: string };
      requireOrgAccess(principal, orgId);
      return quotaOf(ctx, orgId);
    });
    app.put(`${base}/:orgId/quotas`, async (request) => {
      const principal = requireSession(ctx, request);
      requireCsrf(request, principal);
      requireRole(principal, ["owner"]);
      const { orgId } = request.params as { orgId: string };
      requireOrgAccess(principal, orgId);
      const body = parseInput(
        z.object({
          workspaces: z.number().int().min(0).optional(),
          members: z.number().int().min(0).optional(),
          budget_usd: z.number().min(0).optional(),
          mcp_servers: z.number().int().min(0).optional(),
        }),
        request.body ?? {},
        "body",
      );
      const next = { ...quotaOf(ctx, orgId), ...body };
      saveQuota(ctx, orgId, next);
      return next;
    });
  };
  orgRoutes("/api/v1/orgs");
  orgRoutes("/api/v1/organizations");

  const currentOrgId = (request: FastifyRequest): string => requireSession(ctx, request).orgId;

  const currentMembers = (orgId: string) =>
    ctx.sqlite
      .query<{ id: string; user_id: string; role: string; status: string; email: string; display_name: string }, [string]>(
        "SELECT m.id, m.user_id, m.role, m.status, u.email, u.display_name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? ORDER BY m.created_at",
      )
      .all(orgId)
      .map((row) => ({ ...row, member_id: row.id }));

  app.get("/api/v1/organizations/current/members", async (request) => {
    const principal = requireSession(ctx, request);
    return { items: currentMembers(principal.orgId), members: currentMembers(principal.orgId) };
  });

  app.post("/api/v1/organizations/current/members", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const body = parseInput(z.object({ email: z.string().email(), role: z.enum(["owner", "admin", "member", "viewer"]).default("member") }), request.body ?? {}, "body");
    const orgId = principal.orgId;
    const now = Date.now();
    const existing = ctx.sqlite.query<{ id: string }, [string]>("SELECT id FROM users WHERE email = ?").get(body.email);
    const userId = existing?.id ?? randomId();
    if (!existing) {
      ctx.sqlite
        .query("INSERT INTO users (id, email, display_name, locale, status, created_at) VALUES (?, ?, ?, 'zh-CN', 'active', ?)")
        .run(userId, body.email, body.email.split("@")[0]!, now);
    }
    const membership = ctx.sqlite.query<{ id: string }, [string, string]>("SELECT id FROM memberships WHERE org_id = ? AND user_id = ?").get(orgId, userId);
    if (membership) throw new ApiError({ code: "conflict", status: 409, message: "member already exists" });
    const memberId = randomId();
    ctx.sqlite
      .query("INSERT INTO memberships (id, org_id, user_id, role, status, invited_by, invited_at, joined_at, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)")
      .run(memberId, orgId, userId, body.role ?? "member", principal.userId, now, now, now);
    auditFromRequest(ctx.sqlite, { request, principal, action: "org.member.add", resourceType: "org_member", resourceId: memberId, outcome: "success", detail: { email: body.email, role: body.role } });
    return reply.code(201).send({ id: memberId, member_id: memberId, user_id: userId, email: body.email, role: body.role });
  });

  app.patch("/api/v1/organizations/current/members/:memberId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { memberId } = request.params as { memberId: string };
    const body = parseInput(z.object({ role: z.enum(["owner", "admin", "member", "viewer"]) }), request.body ?? {}, "body");
    const member = ctx.sqlite.query<{ user_id: string; role: string }, [string, string]>("SELECT user_id, role FROM memberships WHERE id = ? AND org_id = ?").get(memberId, principal.orgId);
    if (!member) throw new ApiError({ code: "not_found", status: 404, message: "member not found" });
    if (member.role === "owner" && body.role !== "owner") {
      const owners = ctx.sqlite.query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND role = 'owner' AND status = 'active'").get(principal.orgId);
      if ((owners?.c ?? 0) <= 1) throw new ApiError({ code: "conflict", status: 409, message: "cannot demote last owner" });
    }
    ctx.sqlite.query("UPDATE memberships SET role = ? WHERE id = ?").run(body.role, memberId);
    auditFromRequest(ctx.sqlite, { request, principal, action: "org.member.update", resourceType: "org_member", resourceId: memberId, outcome: "success", detail: { role: body.role } });
    return { id: memberId, member_id: memberId, user_id: member.user_id, role: body.role };
  });

  app.delete("/api/v1/organizations/current/members/:memberId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { memberId } = request.params as { memberId: string };
    const member = ctx.sqlite.query<{ user_id: string; role: string }, [string, string]>("SELECT user_id, role FROM memberships WHERE id = ? AND org_id = ?").get(memberId, principal.orgId);
    if (!member) throw new ApiError({ code: "not_found", status: 404, message: "member not found" });
    if (member.role === "owner" || member.user_id === principal.userId) {
      const owners = ctx.sqlite.query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND role = 'owner' AND status = 'active'").get(principal.orgId);
      if ((owners?.c ?? 0) <= 1) throw new ApiError({ code: "conflict", status: 409, message: "cannot remove last owner" });
    }
    ctx.sqlite.query("DELETE FROM memberships WHERE id = ?").run(memberId);
    auditFromRequest(ctx.sqlite, { request, principal, action: "org.member.remove", resourceType: "org_member", resourceId: memberId, outcome: "success" });
    return reply.code(204).send();
  });

  app.get("/api/v1/organizations/current/quotas", async (request) => {
    const principal = requireSession(ctx, request);
    return quotaOf(ctx, principal.orgId);
  });

  app.put("/api/v1/organizations/current/quotas", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner"]);
    const body = parseInput(
      z.object({
        workspaces: z.number().int().min(0).optional(),
        members: z.number().int().min(0).optional(),
        budget_usd: z.number().min(0).optional(),
        mcp_servers: z.number().int().min(0).optional(),
      }),
      request.body ?? {},
      "body",
    );
    const next = { ...quotaOf(ctx, principal.orgId), ...body };
    saveQuota(ctx, principal.orgId, next);
    auditFromRequest(ctx.sqlite, { request, principal, action: "org.quotas.update", resourceType: "org_quotas", resourceId: principal.orgId, outcome: "success", detail: next });
    return next;
  });

  app.get("/api/v1/organizations/current", async (request) => {
    const principal = requireSession(ctx, request);
    const org = ctx.sqlite.query<{ id: string; slug: string; name: string }, [string]>("SELECT id, slug, name FROM orgs WHERE id = ?").get(principal.orgId);
    const quotas = quotaOf(ctx, principal.orgId);
    const workspaceCount = ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM workspaces WHERE org_id = ? AND deleted_at IS NULL")
      .get(principal.orgId);
    const memberCount = ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND status = 'active'")
      .get(principal.orgId);
    const mcpCount = ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COUNT(DISTINCT server_id) AS c FROM mcp_call_logs WHERE org_id = ?")
      .get(principal.orgId);
    const spend = ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COALESCE(SUM(CAST(cost_usd AS REAL)), 0) AS c FROM usage_records WHERE org_id = ?")
      .get(principal.orgId);
    return {
      organization: org ?? { id: principal.orgId, slug: principal.orgId, name: "Organization" },
      quotas,
      usage: {
        workspaces: workspaceCount?.c ?? 0,
        members: memberCount?.c ?? 0,
        mcp_servers: mcpCount?.c ?? 0,
        model_spend_usd: spend?.c ?? 0,
      },
    };
  });
}

