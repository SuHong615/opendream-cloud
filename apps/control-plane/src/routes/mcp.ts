// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { randomId } from "../lib/crypto";
import { ApiError, badRequest, forbidden } from "../lib/errors";
import type { AppContext } from "../context";
import type { Principal } from "../types";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, parseInput, requireCsrf, requireRole, requireSession } from "./shared";
import { McpTicketSigner } from "../lib/mcp-ticket";

interface HubResponse {
  status: number;
  body: unknown;
}

/**
 * v3 MCP 控制面：Registry/Lifecycle/Bindings �?mcp-hub 为数据面实现�? * control-plane 作为统一 REST 门面（cookie/CSRF/RBAC/审计）；
 * 工具级策略与 mcp_call_logs �?control-plane 权威�? */
async function hubFetch(ctx: AppContext, request: FastifyRequest, principal: Principal, pathOverride?: string, methodOverride?: string): Promise<HubResponse> {
  const url = new URL(pathOverride ?? request.url, "http://control-plane.local");
  const method = methodOverride ?? request.method;
  const target = `${ctx.env.MCP_HUB_URL.replace(/\/+$/u, "")}${url.pathname}${url.search}`;
  const headers: Record<string, string> = {
    "x-oc-org-id": principal.orgId,
    "x-oc-org-slug": (await ctx.dbPort.get<{ slug: string }>("SELECT slug FROM orgs WHERE id = ?", [principal.orgId]))?.slug ?? principal.orgId,
    "x-oc-user-id": principal.userId,
    "x-oc-roles": principal.role,
    "x-request-id": currentRequestId(request),
  };
  const sendBody = !["GET", "HEAD", "DELETE"].includes(method) && request.body !== undefined;
  if (sendBody && request.headers["content-type"] !== undefined) headers["content-type"] = String(request.headers["content-type"]);
  let response: Response;
  try {
    response = await fetch(target, {
      method,
      headers,
      body: sendBody ? JSON.stringify(request.body) : undefined,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new ApiError({ code: "upstream_error", status: 502, message: "mcp-hub unavailable" });
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body };
}

async function proxy(
  ctx: AppContext,
  request: FastifyRequest,
  reply: { code: (status: number) => { send: (body?: unknown) => unknown } },
  options: { write?: boolean } = {},
): Promise<unknown> {
  const principal = requireSession(ctx, request);
  if (options.write) {
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
  }
  const result = await hubFetch(ctx, request, principal);
  if (options.write) {
    // 审计 best-effort：SQLITE_BUSY 短暂重试；失败不阻断 MCP 控制面写操作
    let audited = false;
    for (let attempt = 0; attempt < 3 && !audited; attempt += 1) {
      try {
        auditFromRequest(ctx.sqlite, {
          request,
          principal,
          action: `mcp.proxy.${request.method.toLowerCase()}`,
          resourceType: "mcp_server",
          resourceId: null,
          outcome: result.status < 400 ? "success" : "error",
          detail: { path: request.url, status: result.status },
        });
        audited = true;
      } catch (error) {
        if (attempt === 2) console.error("mcp proxy audit failed", error);
      }
    }
  }
  // 204 不能带 body（Fastify 对 204+body 会抛错，QA V3-MCP-011）
  if (result.status === 204) return reply.code(204).send();
  return reply.code(result.status).send(result.body);
}

const policyRuleSchema = z.object({
  tool_name: z.string().min(1).max(128),
  effect: z.enum(["allow", "deny"]),
  subject_type: z.enum(["org", "role", "user", "team", "workspace", "app"]).nullable().optional(),
  subject_id: z.string().nullable().optional(),
  subject_role: z.enum(["owner", "admin", "member", "viewer"]).nullable().optional(),
  constraints: z
    .object({
      rpm: z.number().int().positive().optional(),
      tpm: z.number().int().positive().optional(),
      concurrency: z.number().int().positive().optional(),
      timeout_ms: z.number().int().positive().optional(),
      cache_ttl_sec: z.number().int().nonnegative().optional(),
      max_response_bytes: z.number().int().positive().optional(),
    })
    .nullable()
    .optional(),
  priority: z.number().int().min(0).max(1000).default(100),
  require_explicit_allow: z.boolean().default(true),
});

const replacePolicySchema = z.object({
  rules: z.array(policyRuleSchema).max(500),
});

const callLogSchema = z.object({
  id: z.string().min(1),
  org_id: z.string().min(1),
  server_id: z.string().min(1),
  version_id: z.string().nullable().optional(),
  binding_id: z.string().min(1),
  workspace_id: z.string().nullable().optional(),
  app_id: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  method: z.string(),
  tool_name: z.string(),
  status: z.enum(["ok", "denied", "error", "timeout", "rate_limited", "upstream_unavailable"]),
  error_code: z.string().nullable().optional(),
  latency_ms: z.number().int().nonnegative().default(0),
  args_hash: z.string(),
  cache_hit: z.boolean().optional(),
  trace_id: z.string().nullable().optional(),
  created_at: z.string(),
});

const batchSchema = z.object({ items: z.array(callLogSchema).max(500) });

interface PolicyRow {
  id: string;
  tool_name: string;
  effect: string;
  subject_type: string;
  subject_id: string | null;
  subject_role: string | null;
  constraints: string | null;
  require_explicit_allow: number;
  priority: number;
  updated_at: number;
}

export function registerMcpRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------- Registry / Lifecycle / Bindings（转�?mcp-hub�?
  app.get("/api/v1/mcp-servers", async (request, reply) => proxy(ctx, request, reply));
  app.post("/api/v1/mcp-servers", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-servers/:serverId", async (request, reply) => proxy(ctx, request, reply));
  app.patch("/api/v1/mcp-servers/:serverId", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.delete("/api/v1/mcp-servers/:serverId", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-servers/:serverId/health", async (request, reply) => proxy(ctx, request, reply));
  app.post("/api/v1/mcp-servers/:serverId/health-check", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/submit-review", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/review", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/publish", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/deprecate", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/offline", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-servers/:serverId/versions", async (request, reply) => proxy(ctx, request, reply));
  app.post("/api/v1/mcp-servers/:serverId/versions", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-servers/:serverId/versions/:versionId", async (request, reply) => proxy(ctx, request, reply));
  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/review", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/submit-review", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/publish", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/yank", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-servers/:serverId/channels", async (request, reply) => proxy(ctx, request, reply));
  app.put("/api/v1/mcp-servers/:serverId/channels/:channel", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-servers/:serverId/tools", async (request, reply) => proxy(ctx, request, reply));
  app.get("/api/v1/mcp-versions/:versionId", async (request, reply) => proxy(ctx, request, reply));
  app.post("/api/v1/mcp-versions/:versionId/review", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-versions/:versionId/publish", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-versions/:versionId/yank", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-servers/:serverId/rollback", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.get("/api/v1/mcp-bindings", async (request, reply) => proxy(ctx, request, reply));
  app.post("/api/v1/mcp-bindings", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.delete("/api/v1/mcp-bindings/:bindingId", async (request, reply) => proxy(ctx, request, reply, { write: true }));
  app.post("/api/v1/mcp-bindings/:bindingId/rotate-token", async (request, reply) => proxy(ctx, request, reply, { write: true }));

  /** EdDSA/Ed25519 binding ticket（生产唯一形态）；HMAC �?hub 本地 dev 兼容�?*/
  app.post("/api/v1/mcp-bindings/:bindingId/ticket", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    if (!ctx.env.MCP_TICKET_PRIVATE_KEY) {
      throw new ApiError({ code: "orchestrator_unavailable", status: 503, message: "mcp ticket signing key unavailable" });
    }
    const params = parseInput(z.object({ bindingId: z.string().min(1) }), request.params, "params");
    const body = parseInput(
      z.object({
        workspace_id: z.string().optional(),
        app_id: z.string().optional(),
        ttl_seconds: z.number().int().min(30).max(300).optional(),
      }),
      request.body ?? {},
    );
    const bindings = await hubFetch(ctx, request, principal, "/api/v1/mcp-bindings?limit=100", "GET");
    if (bindings.status >= 400) throw new ApiError({ code: "upstream_error", status: 502, message: "mcp-hub bindings unavailable" });
    const items = (bindings.body as { items?: Array<Record<string, unknown>> } | null)?.items ?? [];
    const binding = items.find((item) => String(item.id) === params.bindingId);
    if (!binding) throw new ApiError({ code: "not_found", status: 404, message: "binding not found" });
    const serverId = String(binding.mcp_server_id ?? binding.server_id ?? "");
    const server = await hubFetch(ctx, request, principal, `/api/v1/mcp-servers/${serverId}`, "GET");
    if (server.status >= 400) throw new ApiError({ code: "upstream_error", status: 502, message: "mcp-hub server unavailable" });
    const serverBody = server.body as Record<string, unknown> | null;
    const org = await ctx.dbPort.get<{ slug: string }>("SELECT slug FROM orgs WHERE id = ?", [principal.orgId]);
    if (!org) throw new ApiError({ code: "not_found", status: 404, message: "organization not found" });
    const serverVersion = String(binding.server_version_id ?? serverBody?.stable_version_id ?? "");
    if (!serverId || !serverVersion) throw new ApiError({ code: "precondition_failed", status: 409, message: "binding/server version missing" });
    const signer = new McpTicketSigner(ctx.env);
    const issued = signer.issue({
      sub: principal.userId,
      org: principal.orgId,
      org_slug: org.slug,
      binding_id: params.bindingId,
      server_id: serverId,
      server_version: serverVersion,
      scope: Array.isArray(binding.allowed_tools) ? binding.allowed_tools.map(String) : [],
      ...(body.workspace_id ? { ws: body.workspace_id } : {}),
      ...(body.app_id ? { app: body.app_id } : {}),
      ...(body.ttl_seconds ? { ttl_seconds: body.ttl_seconds } : {}),
    });
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "mcp.binding.ticket.issue",
      resourceType: "mcp_binding",
      resourceId: params.bindingId,
      outcome: "success",
      detail: { jti: issued.jti, expires_in: issued.expires_in },
    });
    return { ticket: issued.ticket, token_type: "Bearer", expires_in: issued.expires_in, jti: issued.jti, kid: issued.kid };
  });
  app.get("/api/v1/mcp-oauth/callback", async (request, reply) => proxy(ctx, request, reply));

  // ---------------- 工具级策略（control-plane 权威；hub 快照同步 P2�?
  const toolPolicyGet = async (request: FastifyRequest) => {
    const principal = requireSession(ctx, request);
    const params = parseInput(z.object({ serverId: z.string().min(1) }), request.params, "params");
    const rows = await ctx.dbPort.all<PolicyRow>(
      "SELECT id, tool_name, effect, subject_type, subject_id, subject_role, constraints, require_explicit_allow, priority, updated_at FROM mcp_tool_policies WHERE org_id = ? AND server_id = ? ORDER BY tool_name, priority",
      [principal.orgId, params.serverId],
    );
    const updatedAt = rows.reduce((max, row) => Math.max(max, row.updated_at), Date.now());
    return {
      server_id: params.serverId,
      revision: updatedAt,
      updated_at: new Date(updatedAt).toISOString(),
      destructive_default: true,
      rules: rows.map((row) => ({
        tool_name: row.tool_name,
        effect: row.effect,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        constraints: row.constraints ? (JSON.parse(row.constraints) as Record<string, number>) : {},
        priority: row.priority,
        require_explicit_allow: row.require_explicit_allow === 1,
      })),
      request_id: currentRequestId(request),
    };
  };

  const toolPolicyPut = async (request: FastifyRequest) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ serverId: z.string().min(1) }), request.params, "params");
    const body = parseInput(replacePolicySchema, request.body ?? {});
    const now = Date.now();
    await ctx.dbPort.transaction(async (tx) => {
      await tx.run("DELETE FROM mcp_tool_policies WHERE org_id = ? AND server_id = ?", [principal.orgId, params.serverId]);
      for (const rule of body.rules) {
        await tx.run(
          `INSERT INTO mcp_tool_policies (id, org_id, server_id, tool_name, effect, subject_type, subject_id, subject_role, constraints, require_explicit_allow, priority, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            randomId(),
            principal.orgId,
            params.serverId,
            rule.tool_name,
            rule.effect,
            rule.subject_type ?? "org",
            rule.subject_id ?? null,
            rule.subject_role ?? null,
            rule.constraints ? JSON.stringify(rule.constraints) : null,
            rule.require_explicit_allow === false ? 0 : 1,
            rule.priority ?? 100,
            principal.userId,
            now,
            now,
          ],
        );
      }
    });
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "mcp.tool_policy.update",
      resourceType: "mcp_server",
      resourceId: params.serverId,
      outcome: "success",
      detail: { rules: body.rules.length },
    });
    // P1：策略在网关侧生效（MVP 全量推送；失败不回滚本地，下轮重试/pull �?P2�?
    if (ctx.env.MCP_INTERNAL_TOKEN) {
      void fetch(`${ctx.env.MCP_HUB_URL.replace(/\/+$/u, "")}/internal/mcp/servers/${params.serverId}/tool-policy`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-oc-internal-token": ctx.env.MCP_INTERNAL_TOKEN,
          "x-oc-org-id": principal.orgId,
          "x-oc-user-id": principal.userId,
        },
        body: JSON.stringify({ revision: now, rules: body.rules.map((rule) => ({ tool_name: rule.tool_name, effect: rule.effect, require_explicit_allow: rule.require_explicit_allow !== false })) }),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
    return {
      server_id: params.serverId,
      revision: now,
      updated_at: new Date(now).toISOString(),
      destructive_default: true,
      rules: body.rules.map((rule) => ({
        tool_name: rule.tool_name,
        effect: rule.effect,
        subject_type: rule.subject_type ?? "org",
        subject_id: rule.subject_id ?? null,
        constraints: rule.constraints ?? {},
        priority: rule.priority ?? 100,
        require_explicit_allow: rule.require_explicit_allow !== false,
      })),
      request_id: currentRequestId(request),
    };
  };

  // 1.1 canonical 为复数；单数�?x-mvp-alias，两者同 handler
  app.get("/api/v1/mcp-servers/:serverId/tool-policies", toolPolicyGet);
  app.put("/api/v1/mcp-servers/:serverId/tool-policies", toolPolicyPut);
  app.get("/api/v1/mcp-servers/:serverId/tool-policy", toolPolicyGet);
  app.put("/api/v1/mcp-servers/:serverId/tool-policy", toolPolicyPut);

  // ---------------- MCP 调用审计（control-plane 唯一写入方）
  app.get("/api/v1/mcp-call-logs", async (request) => {
    const principal = requireSession(ctx, request);
    if (principal.role === "member" || principal.role === "viewer") {
      throw forbidden("audit.read.org required");
    }
    const query = parseInput(
      z.object({
        server_id: z.string().optional(),
        binding_id: z.string().optional(),
        status: z.string().optional(),
        from: z.string().datetime({ offset: true }),
        to: z.string().datetime({ offset: true }),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      request.query ?? {},
      "query",
    );
    const toMs = query.to ? Date.parse(query.to) : Date.now();
    const fromMs = query.from ? Date.parse(query.from) : toMs - 86_400_000;
    if (toMs - fromMs > 90 * 86_400_000) {
      throw badRequest("from/to span exceeds 90 days");
    }
    const rows = (await ctx.dbPort.all<{
      id: string;
      org_id: string;
      server_id: string;
      version_id: string | null;
      binding_id: string;
      workspace_id: string | null;
      app_id: string | null;
      user_id: string | null;
      method: string;
      tool_name: string;
      status: string;
      error_code: string | null;
      latency_ms: number;
      args_hash: string;
      cache_hit: number;
      trace_id: string | null;
      created_at: number;
    }>("SELECT * FROM mcp_call_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT 500", [principal.orgId]))
      .filter((row) => (query.server_id ? row.server_id === query.server_id : true))
      .filter((row) => (query.binding_id ? row.binding_id === query.binding_id : true))
      .filter((row) => (query.status ? row.status === query.status : true))
      .filter((row) => row.created_at >= fromMs && row.created_at <= toMs)
      .slice(0, query.limit);
    return {
      items: rows.map((row) => ({
        ...row,
        // openapi 1.1 canonical aliases
        tool: row.tool_name,
        request_hash: row.args_hash,
        server_version_id: row.version_id,
        cache_hit: row.cache_hit === 1,
        created_at: new Date(row.created_at).toISOString(),
      })),
      next_cursor: null,
      request_id: currentRequestId(request),
    };
  });

  app.post("/internal/mcp/call-logs:batch", async (request, reply) => {
    const token = request.headers["x-oc-internal-token"];
    if (typeof token !== "string" || !ctx.env.MCP_INTERNAL_TOKEN || token !== ctx.env.MCP_INTERNAL_TOKEN) {
      throw new ApiError({ code: "unauthorized", status: 401, message: "invalid internal token" });
    }
    const body = parseInput(batchSchema, request.body ?? {});
    let accepted = 0;
    await ctx.dbPort.transaction(async (tx) => {
      for (const item of body.items) {
        if (!item.org_id) throw badRequest("org_id required");
        const result = await tx.run(
          `INSERT INTO mcp_call_logs (id, org_id, server_id, version_id, binding_id, workspace_id, app_id, user_id, method, tool_name, status, error_code, latency_ms, args_hash, cache_hit, trace_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO NOTHING`,
          [
            item.id,
            item.org_id,
            item.server_id,
            item.version_id ?? null,
            item.binding_id,
            item.workspace_id ?? null,
            item.app_id ?? null,
            item.user_id ?? null,
            item.method,
            item.tool_name,
            item.status,
            item.error_code ?? null,
            item.latency_ms ?? 0,
            item.args_hash ?? "",
            item.cache_hit ? 1 : 0,
            item.trace_id ?? null,
            Number.isFinite(Date.parse(item.created_at)) ? Date.parse(item.created_at) : Date.now(),
          ],
        );
        accepted += result.changes;
      }
    });
    return reply.send({ accepted, received: body.items.length });
  });
}
