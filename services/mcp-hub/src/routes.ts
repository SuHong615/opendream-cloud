// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "./context";
import type {
  BindingRecord,
  CallLogRecord,
  CredentialRecord,
  McpAuthType,
  McpHealth,
  McpServerRecord,
  McpServerVersionRecord,
  McpSource,
  McpTransport,
  McpVisibility,
} from "./core";
import { principalOf } from "./core";
import { ApiError, badRequest, conflict, gateBlocked, notFound, pageOf, unauthorized } from "./lib/errors";
import { hashToken, signVersion } from "./store";
import { probeServer } from "./probe";
import { handleBindingProxy, handleGatewayRpc, authOfToken, resolveServerForGateway, type RpcRequest } from "./proxy";

export interface RouteSpec {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  operationId: string;
}

export const ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/api/v1/mcp-servers", operationId: "listMcpServers" },
  { method: "POST", path: "/api/v1/mcp-servers", operationId: "createMcpServer" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId", operationId: "getMcpServer" },
  { method: "PATCH", path: "/api/v1/mcp-servers/:serverId", operationId: "updateMcpServer" },
  { method: "DELETE", path: "/api/v1/mcp-servers/:serverId", operationId: "deleteMcpServer" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/health", operationId: "getMcpServerHealth" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/health-check", operationId: "checkMcpServerHealth" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/submit-review", operationId: "submitMcpServerReview" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/review", operationId: "reviewMcpServer" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/publish", operationId: "publishMcpServer" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/deprecate", operationId: "deprecateMcpServer" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/offline", operationId: "offlineMcpServer" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/versions", operationId: "listMcpServerVersions" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions", operationId: "createMcpServerVersion" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/versions/:versionId", operationId: "getMcpServerVersion" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions/:versionId/review", operationId: "reviewMcpServerVersion" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions/:versionId/publish", operationId: "publishMcpServerVersion" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions/:versionId/yank", operationId: "yankMcpServerVersion" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/channels", operationId: "listMcpServerChannels" },
  { method: "PUT", path: "/api/v1/mcp-servers/:serverId/channels/:channel", operationId: "setMcpServerChannel" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/tools", operationId: "listMcpServerTools" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/rollback", operationId: "rollbackMcpServer" },
  { method: "GET", path: "/api/v1/mcp-bindings", operationId: "listMcpBindings" },
  { method: "POST", path: "/api/v1/mcp-bindings", operationId: "createMcpBinding" },
  { method: "DELETE", path: "/api/v1/mcp-bindings/:bindingId", operationId: "deleteMcpBinding" },
  { method: "POST", path: "/api/v1/mcp-bindings/:bindingId/rotate-token", operationId: "rotateMcpBindingToken" },
  { method: "GET", path: "/api/v1/mcp-oauth/callback", operationId: "mcpOauthCallback" },
];

/** v3 网关入口（不进入 REST openapi；契约见 MCP-GATEWAY.md）。 */
export const GATEWAY_ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "POST", path: "/v1/:orgSlug/:serverSlug/mcp", operationId: "mcpGatewayRpcCanonical" },
  { method: "GET", path: "/v1/:orgSlug/:serverSlug/mcp", operationId: "mcpGatewaySseCanonical" },
  { method: "GET", path: "/v1/:orgSlug/:serverSlug/sse", operationId: "mcpGatewaySse" },
  { method: "POST", path: "/v1/:orgSlug/:serverSlug", operationId: "mcpGatewayRpcAlias" },
  { method: "GET", path: "/v1/:orgSlug/:serverSlug", operationId: "mcpGatewaySseAlias" },
];

export const OPERATIONAL_ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/healthz", operationId: "healthz" },
  { method: "GET", path: "/readyz", operationId: "readyz" },
  { method: "GET", path: "/api/v1/health", operationId: "serviceHealth" },
];

export const INTERNAL_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/internal/mcp/servers/:serverId/test-connection" },
  { method: "GET", path: "/internal/mcp/servers/:serverId/credentials" },
  { method: "POST", path: "/internal/mcp/servers/:serverId/credentials" },
  { method: "DELETE", path: "/internal/mcp/servers/:serverId/credentials" },
  { method: "GET", path: "/internal/mcp/servers/:serverId/tools" },
  { method: "GET", path: "/internal/mcp/calls" },
  { method: "POST", path: "/internal/mcp/proxy/:bindingId" },
  { method: "POST", path: "/internal/mcp/webhooks/health" },
  { method: "PUT", path: "/internal/mcp/servers/:serverId/tool-policy" },
  { method: "POST", path: "/internal/mcp/jti:revoke" },
];

function serverOf(ctx: AppContext, orgId: string, serverId: string): McpServerRecord {
  const server = ctx.store.servers.get(serverId);
  if (!server || server.org_id !== orgId) throw notFound("mcp server not found");
  return server;
}

function issueBindingToken(ctx: AppContext): { token: string; tokenHash: string; expiresAt: string } {
  const token = `mcpb_${randomBytes(24).toString("base64url")}`;
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(ctx.now().getTime() + ctx.env.BINDING_TOKEN_TTL_SECONDS * 1000).toISOString(),
  };
}

function versionRecord(
  ctx: AppContext,
  server: McpServerRecord,
  input: {
    version: number;
    transport: McpTransport;
    endpoint: string | null;
    authType: McpAuthType;
    tools: string[];
    toolManifest: Record<string, import("./core").McpToolMeta>;
    defaultTools: string[];
    createdBy: string;
  },
): McpServerVersionRecord {
  const signature = signVersion({
    serverId: server.id,
    version: input.version,
    transport: input.transport,
    endpoint: input.endpoint,
    tools: input.tools,
  });
  const record: McpServerVersionRecord = {
    id: ctx.newId(),
    server_id: server.id,
    org_id: server.org_id,
    version: input.version,
    transport: input.transport,
    endpoint: input.endpoint,
    auth_type: input.authType,
    tools: input.tools,
    tool_manifest: input.toolManifest,
    default_tools: input.defaultTools,
    signature,
    semver: `1.${input.version}.0`,
    status: "draft",
    tool_manifest_hash: `sha256:${signature}`,
    tool_count: input.tools.length,
    scan_status: "passed",
    signing_key_id: "local-mvp",
    published_at: null,
    created_by: input.createdBy,
    created_at: ctx.now().toISOString(),
    tool_schema_hash: signature,
    channel: "stable",
  };
  ctx.store.versions.set(record.id, record);
  return record;
}

interface ToolInput {
  name: string;
  destructive?: boolean;
  read_only?: boolean;
  risk?: "low" | "medium" | "high";
  title?: string;
  description?: string;
  input_schema_hash?: string;
}

function normalizeTools(input: Array<string | ToolInput> | undefined): { tools: string[]; manifest: Record<string, { destructive: boolean; read_only: boolean; risk: "low" | "medium" | "high"; description?: string; title?: string; input_schema_hash?: string }> } {
  const tools: string[] = [];
  const manifest: Record<string, { destructive: boolean; read_only: boolean; risk: "low" | "medium" | "high"; description?: string; title?: string; input_schema_hash?: string }> = {};
  for (const item of input ?? []) {
    const tool = typeof item === "string" ? { name: item } : item;
    if (!tool.name) continue;
    tools.push(tool.name);
    // 契约 fail-safe：McpTool.destructive 缺失/未标注 = true（含 legacy 字符串工具，无 metadata 按 true）
    const destructive = typeof item === "string" ? true : tool.destructive !== false;
    manifest[tool.name] = {
      destructive,
      read_only: typeof item === "string" ? false : tool.read_only === true,
      risk: tool.risk ?? (destructive ? "high" : "low"),
      ...(tool.description ? { description: tool.description } : {}),
      ...(tool.title ? { title: tool.title } : {}),
      ...(tool.input_schema_hash ? { input_schema_hash: tool.input_schema_hash } : {}),
    };
  }
  return { tools, manifest };
}

function serverView(server: McpServerRecord, ctx: AppContext): Record<string, unknown> {
  const stable = ctx.store.versionById(server.stable_version_id);
  return { ...server, upstream_url: server.endpoint, stable_version: stable?.version ?? null };
}

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/healthz", async () => ({ status: "ok", version: ctx.version }));
  app.get("/readyz", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({ status: "ok", service: "mcp-hub", version: ctx.version }));
  // EdDSA/JWKS：MCP ticket 与 workspace ticket 共用同一 JWKS 形态（kid 可轮换）
  app.get("/.well-known/mcp-jwks.json", async () => ctx.tickets.jwks());
  app.get("/.well-known/workspace-jwks.json", async () => ctx.tickets.jwks());

  app.get("/api/v1/mcp-servers", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = z
      .object({
        q: z.string().optional(),
        category: z.string().optional(),
        visibility: z.enum(["org", "team", "public"]).optional(),
        status: z.enum(["draft", "review", "published", "deprecated", "offline"]).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);
    const items = [...ctx.store.servers.values()]
      .filter((server) => server.org_id === principal.org_id || server.visibility === "public")
      .filter((server) => (query.q ? `${server.name} ${server.slug}`.toLowerCase().includes(query.q.toLowerCase()) : true))
      .filter((server) => (query.category ? server.category === query.category : true))
      .filter((server) => (query.visibility ? server.visibility === query.visibility : true))
      .filter((server) => (query.status ? server.status === query.status : true))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return pageOf(items, query.cursor, query.limit, (item) => item.id);
  });

  app.post("/api/v1/mcp-servers", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = z
      .object({
        slug: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        category: z.string().default("other"),
        transport: z.enum(["stdio", "sse", "streamable_http"]),
        endpoint: z.string().url().nullable().optional(),
        upstream_url: z.string().url().nullable().optional(),
        auth_type: z.enum(["none", "api_key", "header", "oauth2"]).default("none"),
        source: z.enum(["internal", "third_party", "market"]).default("internal"),
        visibility: z.enum(["org", "team", "public"]).default("org"),
        tools: z
          .union([
            z.array(z.string()),
            z.array(z.object({ name: z.string(), destructive: z.boolean().optional(), description: z.string().optional() })),
          ])
          .optional(),
        default_tools: z.array(z.string()).default([]),
      })
      .parse(request.body);
    if (ctx.store.serverBySlug(principal.org_id, body.slug)) throw conflict("server slug already exists", { slug: body.slug });
    if (body.transport === "stdio" && body.auth_type !== "none") {
      throw badRequest("credential-bearing stdio MCP is deferred to M5.2 (security approval required)", {
        transport: body.transport,
        auth_type: body.auth_type,
      });
    }
    if (body.transport !== "stdio" && !(body.endpoint ?? body.upstream_url)) throw badRequest("endpoint/upstream_url required for remote transports");
    const now = ctx.now().toISOString();
    const id = ctx.newId();
    const normalizedTools = normalizeTools(body.tools ?? body.default_tools);
    const tools = normalizedTools.tools;
    const endpoint = body.endpoint ?? body.upstream_url ?? null;
    const record: McpServerRecord = {
      id,
      org_id: principal.org_id,
      org_slug: principal.org_slug,
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      category: body.category,
      transport: body.transport as McpTransport,
      endpoint,
      auth_type: body.auth_type as McpAuthType,
      source: body.source as McpSource,
      visibility: body.visibility as McpVisibility,
      status: "draft",
      health: "pending",
      tools,
      tool_manifest: normalizedTools.manifest,
      destructive_allowed: false,
      default_tools: body.default_tools,
      version: 1,
      current_version_id: null,
      stable_version_id: null,
      signature: null,
      reviewed: false,
      reviewed_by: null,
      reviewed_at: null,
      review_comment: null,
      deprecated_at: null,
      offline_at: null,
      consecutive_failures: 0,
      consecutive_successes: 0,
      last_health_at: null,
      created_by: principal.user_id,
      created_at: now,
      updated_at: now,
    };
    const version = versionRecord(ctx, record, {
      version: 1,
      transport: record.transport,
      endpoint: record.endpoint,
      authType: record.auth_type,
      tools: record.tools,
      toolManifest: record.tool_manifest,
      defaultTools: record.default_tools,
      createdBy: principal.user_id,
    });
    record.current_version_id = version.id;
    record.signature = version.signature;
    ctx.store.servers.set(record.id, record);
    return reply.code(201).send(serverView(record, ctx));
  });

  app.get("/api/v1/mcp-servers/:serverId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    return serverView(serverOf(ctx, principal.org_id, serverId), ctx);
  });

  app.patch("/api/v1/mcp-servers/:serverId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    if (server.status === "offline") throw conflict("offline server cannot be edited; create a new version", { server_id: server.id });
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        endpoint: z.string().url().nullable().optional(),
        upstream_url: z.string().url().nullable().optional(),
        visibility: z.enum(["org", "team", "public"]).optional(),
        category: z.string().max(64).optional(),
        destructive_allowed: z.boolean().optional(),
      })
      .parse(request.body);
    if (body.destructive_allowed !== undefined) {
      if (!principal.roles.includes("owner") && !principal.roles.includes("admin")) {
        throw unauthorized("org admin required to allow destructive tools");
      }
      server.destructive_allowed = body.destructive_allowed;
    }
    if (body.name !== undefined) server.name = body.name;
    if (body.description !== undefined) server.description = body.description;
    if (body.endpoint !== undefined || body.upstream_url !== undefined) server.endpoint = body.endpoint ?? body.upstream_url ?? null;
    if (body.visibility !== undefined) server.visibility = body.visibility;
    if (body.category !== undefined) server.category = body.category;
    server.updated_at = ctx.now().toISOString();
    return serverView(server, ctx);
  });

  app.delete("/api/v1/mcp-servers/:serverId", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    for (const binding of ctx.store.bindings.values()) {
      if (binding.server_id === server.id) binding.status = "revoked";
    }
    for (const version of ctx.store.versionsOf(server.id)) ctx.store.versions.delete(version.id);
    ctx.store.servers.delete(server.id);
    return reply.code(204).send();
  });

  app.get("/api/v1/mcp-servers/:serverId/health", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    return { server_id: server.id, status: server.health, consecutive_failures: server.consecutive_failures, checks: ctx.store.healthOf(server.id).slice(-100) };
  });

  app.post("/api/v1/mcp-servers/:serverId/health-check", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    return probeServer(ctx, server);
  });

  app.post("/api/v1/mcp-servers/:serverId/submit-review", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    if (server.status !== "draft") throw conflict(`cannot submit from ${server.status}`, { status: server.status });
    server.status = "review";
    server.updated_at = ctx.now().toISOString();
    return serverView(server, ctx);
  });

  app.post("/api/v1/mcp-servers/:serverId/review", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const body = z.object({ decision: z.enum(["approve", "reject"]), comment: z.string().max(2000).optional() }).parse(request.body);
    if (server.status !== "draft" && server.status !== "review") throw conflict(`cannot review from ${server.status}`, { status: server.status });
    server.reviewed_by = principal.user_id;
    server.reviewed_at = ctx.now().toISOString();
    server.review_comment = body.comment ?? null;
    if (body.decision === "reject") {
      server.reviewed = false;
      server.status = "draft";
    } else {
      server.reviewed = true;
      server.status = "review";
    }
    server.updated_at = ctx.now().toISOString();
    return serverView(server, ctx);
  });

  app.post("/api/v1/mcp-servers/:serverId/publish", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    if (!server.reviewed) throw gateBlocked({ reason: "review_required" });
    if (server.health === "down") throw gateBlocked({ reason: "mcp_health_down", server_id: server.id });
    if (server.status === "offline") throw conflict("offline server cannot be published", { status: server.status });
    const current = ctx.store.versionById(server.current_version_id);
    if (!current) throw gateBlocked({ reason: "version_missing" });
    current.status = "published";
    current.published_at = ctx.now().toISOString();
    server.status = "published";
    server.stable_version_id = current.id;
    server.signature = current.signature;
    server.updated_at = ctx.now().toISOString();
    return serverView(server, ctx);
  });

  app.post("/api/v1/mcp-servers/:serverId/deprecate", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    if (server.status !== "published") throw conflict(`cannot deprecate from ${server.status}`, { status: server.status });
    server.status = "deprecated";
    server.deprecated_at = ctx.now().toISOString();
    server.updated_at = server.deprecated_at;
    return serverView(server, ctx);
  });

  app.post("/api/v1/mcp-servers/:serverId/offline", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const now = ctx.now().toISOString();
    server.status = "offline";
    server.offline_at = now;
    server.updated_at = now;
    for (const binding of ctx.store.bindings.values()) {
      if (binding.server_id === server.id) binding.status = "revoked";
    }
    for (const credential of ctx.store.credentials.values()) {
      if (credential.server_id === server.id && !credential.revoked_at) credential.revoked_at = now;
    }
    return serverView(server, ctx);
  });

  app.get("/api/v1/mcp-servers/:serverId/versions", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    return {
      items: ctx.store.versionsOf(server.id).map((version) => ({ ...version, stable: version.id === server.stable_version_id })),
      next_cursor: null,
    };
  });

  app.post("/api/v1/mcp-servers/:serverId/versions", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    if (server.status === "offline") throw conflict("offline server cannot create version", { status: server.status });
    const body = z
      .object({
        endpoint: z.string().url().nullable().optional(),
        transport: z.enum(["stdio", "sse", "streamable_http"]).optional(),
        auth_type: z.enum(["none", "api_key", "header", "oauth2"]).optional(),
        tools: z.union([
          z.array(z.string()).min(1),
          z.array(z.object({ name: z.string(), destructive: z.boolean().optional(), description: z.string().optional() })).min(1),
        ]),
        default_tools: z.array(z.string()).optional(),
      })
      .parse(request.body);
    if ((body.transport ?? server.transport) === "stdio" && (body.auth_type ?? server.auth_type) !== "none") {
      throw badRequest("credential-bearing stdio MCP is deferred to M5.2");
    }
    const normalizedTools = normalizeTools(body.tools);
    const version = versionRecord(ctx, server, {
      version: server.version + 1,
      transport: (body.transport ?? server.transport) as McpTransport,
      endpoint: body.endpoint ?? server.endpoint,
      authType: (body.auth_type ?? server.auth_type) as McpAuthType,
      tools: normalizedTools.tools,
      toolManifest: normalizedTools.manifest,
      defaultTools: body.default_tools ?? server.default_tools,
      createdBy: principal.user_id,
    });
    server.version = version.version;
    server.current_version_id = version.id;
    server.transport = version.transport;
    server.endpoint = version.endpoint;
    server.auth_type = version.auth_type;
    server.tools = version.tools;
    server.tool_manifest = version.tool_manifest;
    server.default_tools = version.default_tools;
    server.signature = version.signature;
    server.updated_at = ctx.now().toISOString();
    if (server.status === "published") {
      version.status = "published";
      version.published_at = ctx.now().toISOString();
      server.stable_version_id = version.id;
    }
    return reply.code(201).send({ ...version, stable: server.stable_version_id === version.id });
  });

  const versionOf = (serverId: string, versionId: string): McpServerVersionRecord => {
    const version = ctx.store.versions.get(versionId);
    if (!version || version.server_id !== serverId) throw notFound("mcp version not found");
    return version;
  };

  app.get("/api/v1/mcp-servers/:serverId/versions/:versionId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId, versionId } = z.object({ serverId: z.string(), versionId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    return versionOf(server.id, versionId);
  });

  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/submit-review", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId, versionId } = z.object({ serverId: z.string(), versionId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const version = versionOf(server.id, versionId);
    if (version.status !== "draft") throw conflict(`cannot submit-review version in ${version.status}`, { status: version.status });
    version.status = "in_review";
    server.updated_at = ctx.now().toISOString();
    return version;
  });

  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/review", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId, versionId } = z.object({ serverId: z.string(), versionId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const version = versionOf(server.id, versionId);
    const body = z.object({ decision: z.enum(["approve", "reject"]), comment: z.string().max(2000).optional() }).parse(request.body);
    if (!["draft", "in_review"].includes(version.status)) throw conflict(`cannot review version in ${version.status}`, { status: version.status });
    version.status = body.decision === "approve" ? "approved" : "draft";
    if (body.decision === "approve") {
      server.reviewed = true;
      server.reviewed_by = principal.user_id;
      server.reviewed_at = ctx.now().toISOString();
      server.review_comment = body.comment ?? null;
      if (server.status === "draft") server.status = "review";
    }
    server.updated_at = ctx.now().toISOString();
    return version;
  });

  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/publish", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId, versionId } = z.object({ serverId: z.string(), versionId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const version = versionOf(server.id, versionId);
    if (!server.reviewed && version.status !== "approved") throw gateBlocked({ reason: "review_required" });
    if (version.status !== "approved") throw conflict(`version is ${version.status}; approve it before publish`, { status: version.status });
    if (server.health === "down") throw gateBlocked({ reason: "mcp_health_down", server_id: server.id });
    version.status = "published";
    version.published_at = ctx.now().toISOString();
    server.status = "published";
    server.current_version_id = version.id;
    server.stable_version_id = version.id;
    server.version = version.version;
    server.transport = version.transport;
    server.endpoint = version.endpoint;
    server.auth_type = version.auth_type;
    server.tools = version.tools;
    server.tool_manifest = version.tool_manifest;
    server.default_tools = version.default_tools;
    server.signature = version.signature;
    server.updated_at = ctx.now().toISOString();
    ctx.store.channels.set(server.id, { ...(ctx.store.channels.get(server.id) ?? {}), stable: version.id });
    return version;
  });

  app.post("/api/v1/mcp-servers/:serverId/versions/:versionId/yank", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId, versionId } = z.object({ serverId: z.string(), versionId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const version = versionOf(server.id, versionId);
    version.status = "yanked";
    if (server.stable_version_id === version.id) server.stable_version_id = null;
    if (server.current_version_id === version.id) server.current_version_id = null;
    server.updated_at = ctx.now().toISOString();
    const channels = ctx.store.channels.get(server.id);
    if (channels?.stable === version.id) channels.stable = undefined;
    return version;
  });

  const channelViews = (serverId: string) => {
    const server = ctx.store.servers.get(serverId);
    if (!server) throw notFound("mcp server not found");
    const channels = ctx.store.channels.get(serverId) ?? {};
    const items = [];
    const stableId = channels.stable ?? server.stable_version_id;
    if (stableId) {
      const version = ctx.store.versions.get(stableId);
      items.push({ channel: "stable", version_id: stableId, version: version?.semver ?? null, effective_at: ctx.now().toISOString() });
    }
    if (channels.canary) {
      const version = ctx.store.versions.get(channels.canary);
      items.push({ channel: "canary", version_id: channels.canary, version: version?.semver ?? null, effective_at: ctx.now().toISOString() });
    }
    return items;
  };

  app.get("/api/v1/mcp-servers/:serverId/channels", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    return { server_id: server.id, items: channelViews(server.id) };
  });

  app.put("/api/v1/mcp-servers/:serverId/channels/:channel", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId, channel } = z.object({ serverId: z.string(), channel: z.enum(["stable", "canary"]) }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const body = z.object({ version_id: z.string().min(1) }).parse(request.body);
    const version = versionOf(server.id, body.version_id);
    if (channel === "stable") {
      server.stable_version_id = version.id;
      server.status = "published";
      server.tools = version.tools;
      server.tool_manifest = version.tool_manifest;
      server.default_tools = version.default_tools;
    }
    ctx.store.channels.set(server.id, { ...(ctx.store.channels.get(server.id) ?? {}), [channel]: version.id });
    // 不触发网关 reload：PEP 在运行时解析 channel/ticket
    return { channel, version_id: version.id, version: version.semver, effective_at: ctx.now().toISOString() };
  });

  app.get("/api/v1/mcp-servers/:serverId/tools", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const version = ctx.store.versionById(server.stable_version_id) ?? ctx.store.versionById(server.current_version_id);
    const tools = version?.tools ?? server.tools;
    const manifest = version?.tool_manifest ?? server.tool_manifest;
    return {
      server_id: server.id,
      version_id: version?.id ?? null,
      items: tools.map((name) => {
        const meta = manifest[name];
        return {
          name,
          description: meta?.description ?? null,
          risk: meta?.risk ?? "unknown",
          read_only: meta?.read_only ?? false,
          destructive: meta?.destructive ?? true,
          input_schema: null,
          input_schema_hash: meta?.input_schema_hash ?? null,
        };
      }),
    };
  });

  app.post("/api/v1/mcp-servers/:serverId/rollback", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const body = z.object({ version: z.number().int().min(1) }).parse(request.body);
    const server = serverOf(ctx, principal.org_id, serverId);
    if (server.status === "offline") throw conflict("offline server cannot rollback", { status: server.status });
    const target = ctx.store.versionsOf(server.id).find((version) => version.version === body.version);
    if (!target) throw notFound(`version ${body.version} not found`);
    server.current_version_id = target.id;
    server.stable_version_id = target.id;
    server.version = target.version;
    server.transport = target.transport;
    server.endpoint = target.endpoint;
    server.auth_type = target.auth_type;
    server.tools = target.tools;
    server.tool_manifest = target.tool_manifest;
    server.default_tools = target.default_tools;
    server.signature = target.signature;
    server.status = "published";
    server.updated_at = ctx.now().toISOString();
    return serverView(server, ctx);
  });

  app.get("/api/v1/mcp-bindings", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = z
      .object({ server_id: z.string().optional(), subject_type: z.string().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) })
      .parse(request.query);
    const items = [...ctx.store.bindings.values()]
      .filter((binding) => binding.org_id === principal.org_id)
      .filter((binding) => (query.server_id ? binding.server_id === query.server_id : true))
      .filter((binding) => (query.subject_type ? binding.subject_type === query.subject_type : true))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(publicBinding);
    return pageOf(items, query.cursor, query.limit, (item) => String(item.id));
  });

  app.post("/api/v1/mcp-bindings", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = z
      .object({
        mcp_server_id: z.string(),
        subject_type: z.enum(["user", "workspace", "app", "org"]),
        subject_id: z.string(),
        allowed_tools: z.array(z.string()).optional(),
        expires_at: z.string().datetime({ offset: true }).optional(),
      })
      .parse(request.body);
    const server = serverOf(ctx, principal.org_id, body.mcp_server_id);
    if (server.status !== "published") throw badRequest("server is not published", { status: server.status });
    const allowed = body.allowed_tools ?? server.default_tools;
    const unknownTools = allowed.filter((tool) => !server.tools.includes(tool));
    if (unknownTools.length > 0) throw badRequest("tools not in catalog", { unknown_tools: unknownTools });
    const duplicate = [...ctx.store.bindings.values()].find(
      (binding) =>
        binding.server_id === server.id && binding.subject_type === body.subject_type && binding.subject_id === body.subject_id && binding.status === "active",
    );
    if (duplicate) throw conflict("binding already exists", { binding_id: duplicate.id });
    const issued = issueBindingToken(ctx);
    const record: BindingRecord = {
      id: ctx.newId(),
      org_id: principal.org_id,
      server_id: server.id,
      server_version_id: server.stable_version_id,
      version_id: server.stable_version_id,
      channel: "stable",
      subject_type: body.subject_type,
      subject_id: body.subject_id,
      allowed_tools: allowed,
      status: "active",
      token_hash: issued.tokenHash,
      token_expires_at: issued.expiresAt,
      created_by: principal.user_id,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.bindings.set(record.id, record);
    return reply.code(201).send({ ...publicBinding(record), token: issued.token, expires_in: ctx.env.BINDING_TOKEN_TTL_SECONDS });
  });

  app.delete("/api/v1/mcp-bindings/:bindingId", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { bindingId } = z.object({ bindingId: z.string() }).parse(request.params);
    const binding = ctx.store.bindings.get(bindingId);
    if (!binding || binding.org_id !== principal.org_id) throw notFound("binding not found");
    binding.status = "revoked";
    return reply.code(204).send();
  });

  app.post("/api/v1/mcp-bindings/:bindingId/rotate-token", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { bindingId } = z.object({ bindingId: z.string() }).parse(request.params);
    const binding = ctx.store.bindings.get(bindingId);
    if (!binding || binding.org_id !== principal.org_id || binding.status !== "active") throw notFound("binding not found");
    const issued = issueBindingToken(ctx);
    binding.token_hash = issued.tokenHash;
    binding.token_expires_at = issued.expiresAt;
    return { binding_id: binding.id, token: issued.token, expires_in: ctx.env.BINDING_TOKEN_TTL_SECONDS };
  });

  app.get("/api/v1/mcp-oauth/callback", async (request) => {
    const query = z.object({ state: z.string(), code: z.string().optional() }).parse(request.query);
    const state = ctx.store.oauthStates.get(query.state);
    if (!state) throw badRequest("invalid or expired oauth state");
    ctx.store.oauthStates.delete(query.state);
    return { ok: true, server_id: state.serverId, code_present: Boolean(query.code) };
  });

  // ---------------- v3 Gateway（数据面入口；canonical + alias 同一处理器）
  const gatewayHandler = async (request: { headers: Record<string, unknown>; body: unknown; params: unknown }) => {
    const { orgSlug, serverSlug } = z.object({ orgSlug: z.string(), serverSlug: z.string() }).parse(request.params);
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const body = z
      .object({
        jsonrpc: z.string().optional(),
        id: z.union([z.string(), z.number(), z.null()]).optional(),
        method: z.string(),
        params: z.record(z.unknown()).optional(),
      })
      .parse(request.body);
    return handleGatewayRpc(ctx, { token, body: body as RpcRequest, orgSlug, serverSlug });
  };

  const sendGateway = async (request: never, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    try {
      const result = await gatewayHandler(request);
      return reply.code(result.status).send(result.body);
    } catch (error) {
      if (error instanceof ApiError) {
        const code =
          error.code === "unauthorized"
            ? "unauthenticated"
            : error.code === "not_found"
              ? "server_not_found"
              : error.message === "tenant_mismatch"
                ? "tenant_mismatch"
                : error.code;
        return reply.code(error.status).send({ error: { code, message: error.message } });
      }
      throw error;
    }
  };

  const sseHandler = async (request: { headers: Record<string, unknown>; params: unknown }, reply: { header: (name: string, value: string) => unknown; send: (body: string) => unknown }) => {
    const { orgSlug, serverSlug } = z.object({ orgSlug: z.string(), serverSlug: z.string() }).parse(request.params);
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const auth = authOfToken(ctx, token);
    const server = resolveServerForGateway(ctx, auth, orgSlug, serverSlug);
    if (server.status === "offline" || server.status === "draft" || server.status === "review") {
      throw notFound("server_not_found");
    }
    reply.header("content-type", "text/event-stream");
    reply.header("cache-control", "no-cache");
    return reply.send(`event: endpoint\ndata: ${JSON.stringify({ server: server.slug, version: server.version })}\n\n`);
  };

  // canonical（ARCH-V3 §4.7 / MCP-GATEWAY §6.0）
  app.post("/v1/:orgSlug/:serverSlug/mcp", async (request, reply) => sendGateway(request as never, reply));
  app.get("/v1/:orgSlug/:serverSlug/mcp", async (request, reply) => sseHandler(request as never, reply));
  app.get("/v1/:orgSlug/:serverSlug/sse", async (request, reply) => sseHandler(request as never, reply));
  // alias（必须保留，等价同栈）
  app.post("/v1/:orgSlug/:serverSlug", async (request, reply) => sendGateway(request as never, reply));
  app.get("/v1/:orgSlug/:serverSlug", async (request, reply) => sseHandler(request as never, reply));
}

function publicBinding(binding: BindingRecord): Record<string, unknown> {
  return {
    id: binding.id,
    org_id: binding.org_id,
    mcp_server_id: binding.server_id,
    server_version_id: binding.server_version_id,
    version_id: binding.version_id,
    channel: binding.channel,
    subject_type: binding.subject_type,
    subject_id: binding.subject_id,
    allowed_tools: binding.allowed_tools,
    status: binding.status,
    expires_at: binding.token_expires_at,
    created_at: binding.created_at,
  };
}

export function registerInternalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/internal/mcp/servers/:serverId/test-connection", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    return probeServer(ctx, server);
  });

  app.get("/internal/mcp/servers/:serverId/credentials", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const credentials = [...ctx.store.credentials.values()].filter((item) => item.server_id === server.id && !item.revoked_at);
    return { items: credentials.map((item) => ({ id: item.id, kind: item.kind, configured: true, created_at: item.created_at })), next_cursor: null };
  });

  app.post("/internal/mcp/servers/:serverId/credentials", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const body = z.object({ kind: z.enum(["api_key", "oauth2", "header"]), secret_ref: z.string().min(1) }).parse(request.body);
    const record: CredentialRecord = {
      id: ctx.newId(),
      org_id: principal.org_id,
      server_id: server.id,
      kind: body.kind,
      credential_ref: body.secret_ref,
      created_at: ctx.now().toISOString(),
      revoked_at: null,
    };
    ctx.store.credentials.set(record.id, record);
    return reply.code(201).send({ id: record.id, kind: record.kind, configured: true });
  });

  app.delete("/internal/mcp/servers/:serverId/credentials", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    for (const credential of ctx.store.credentials.values()) {
      if (credential.server_id === server.id && !credential.revoked_at) credential.revoked_at = ctx.now().toISOString();
    }
    for (const binding of ctx.store.bindings.values()) {
      if (binding.server_id === server.id) binding.status = "disabled";
    }
    return reply.code(204).send();
  });

  app.get("/internal/mcp/servers/:serverId/tools", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const version = ctx.store.versionById(server.stable_version_id);
    return { server_id: server.id, version: version?.version ?? null, tools: (version?.tools ?? server.tools).map((tool) => ({ name: tool, risk: "unknown" })) };
  });

  app.get("/internal/mcp/calls", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = z
      .object({ server_id: z.string().optional(), binding_id: z.string().optional(), status: z.string().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) })
      .parse(request.query);
    const items = ctx.store
      .logsOf(principal.org_id, query.server_id)
      .filter((log) => (query.binding_id ? log.binding_id === query.binding_id : true))
      .filter((log) => (query.status ? log.status === query.status : true));
    return pageOf(items, query.cursor, query.limit, (item) => item.id);
  });

  app.post("/internal/mcp/proxy/:bindingId", async (request, reply) => {
    const { bindingId } = z.object({ bindingId: z.string() }).parse(request.params);
    const authorization = typeof request.headers.authorization === "string" ? request.headers.authorization : "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const body = z
      .object({ method: z.string().default("tools/call"), tool: z.string(), arguments: z.record(z.unknown()).default({}) })
      .parse(request.body);
    const result = await handleBindingProxy(ctx, { bindingId, token, body });
    return reply.code(result.status).send(result.body);
  });

  app.post("/internal/mcp/webhooks/health", async (request) => {
    const body = z.object({ server_id: z.string(), status: z.enum(["healthy", "degraded", "down"]) }).parse(request.body);
    const server = ctx.store.servers.get(body.server_id);
    if (!server) throw notFound("mcp server not found");
    server.health = body.status as McpHealth;
    return { accepted: true, server_id: server.id, status: server.health };
  });

  // 控制面工具策略快照推送（MVP：每次 PUT 全量替换；生产 pub/sub）
  app.put("/internal/mcp/servers/:serverId/tool-policy", async (request) => {
    const token = request.headers["x-oc-internal-token"];
    if (typeof token !== "string" || !ctx.env.MCP_INTERNAL_TOKEN || token !== ctx.env.MCP_INTERNAL_TOKEN) {
      throw unauthorized("invalid internal token");
    }
    const principal = principalOf(request, ctx.env);
    const { serverId } = z.object({ serverId: z.string() }).parse(request.params);
    const server = serverOf(ctx, principal.org_id, serverId);
    const body = z
      .object({
        revision: z.number().int().optional(),
        rules: z.array(
          z.object({
            tool_name: z.string(),
            effect: z.enum(["allow", "deny"]),
            require_explicit_allow: z.boolean().default(true),
          }),
        ),
      })
      .parse(request.body);
    const revision = body.revision ?? ctx.now().getTime();
    ctx.store.toolPolicies.set(server.id, { revision, rules: body.rules });
    return { server_id: server.id, revision, rules: body.rules };
  });

  // ticket jti denylist（吊销传播 ≤30s 本地内存；生产 Redis ≤5s）
  app.post("/internal/mcp/jti:revoke", async (request, reply) => {
    const token = request.headers["x-oc-internal-token"];
    if (typeof token !== "string" || !ctx.env.MCP_INTERNAL_TOKEN || token !== ctx.env.MCP_INTERNAL_TOKEN) {
      throw unauthorized("invalid internal token");
    }
    const body = z.object({ jti: z.string().min(1), ttl_seconds: z.number().int().min(1).max(3600).default(300) }).parse(request.body);
    ctx.tickets.revokeJti(body.jti, body.ttl_seconds);
    return reply.send({ revoked: true, jti: body.jti, ttl_seconds: body.ttl_seconds });
  });
}

/** 周期探针：published server 每 HEALTH_INTERVAL_MS 一次；返回 stop。 */
export function startHealthScheduler(ctx: AppContext): () => void {
  if (ctx.env.HEALTH_INTERVAL_MS <= 0) return () => {};
  const timer = setInterval(() => {
    for (const server of ctx.store.servers.values()) {
      if (server.status !== "published") continue;
      void probeServer(ctx, server).catch(() => {});
    }
  }, ctx.env.HEALTH_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
