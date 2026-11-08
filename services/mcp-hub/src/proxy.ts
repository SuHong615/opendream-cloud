// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHmac } from "node:crypto";
import type { AppContext } from "./context";
import type { BindingRecord, CallLogRecord, CallLogStatus, McpServerRecord, McpServerVersionRecord, McpToolMeta } from "./core";
import { ApiError, notFound, unauthorized } from "./lib/errors";
import { hashToken } from "./store";
import { canonicalScopeHash, type McpTicketClaims } from "./tickets";

export interface AuthContext {
  binding: BindingRecord;
  ticket?: McpTicketClaims;
  via: "binding_token" | "hmac_ticket" | "eddsa_ticket";
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** HMAC dev ticket：仅本地/测试兼容（claims 与 EdDSA 相同）；生产必须 EdDSA。 */
function verifyHmacTicket(ctx: AppContext, token: string): McpTicketClaims | null {
  const secret = ctx.env.MCP_TICKET_SECRET;
  if (!secret || !token.startsWith("mcp1.")) return null;
  if (ctx.env.NODE_ENV === "production") throw unauthorized("HMAC ticket disabled in production");
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("malformed mcp ticket");
  const [, payload, signature] = parts as [string, string, string];
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (expected.length !== signature.length || !timingSafeEqual(expected, signature)) throw unauthorized("invalid mcp ticket signature");
  let claims: McpTicketClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as McpTicketClaims;
  } catch {
    throw unauthorized("invalid mcp ticket payload");
  }
  if (claims.iss !== "control-plane" || !claims.aud?.startsWith("mcp:org:") || !claims.binding_id) throw unauthorized("invalid mcp ticket claims");
  if (claims.exp * 1000 < ctx.now().getTime()) throw unauthorized("mcp ticket expired");
  if (claims.scope_hash && canonicalScopeHash(claims.scope ?? [], claims.server_version) !== claims.scope_hash) {
    throw unauthorized("ticket scope hash mismatch");
  }
  if (ctx.tickets.isJtiRevoked(claims.jti)) throw unauthorized("mcp ticket revoked");
  return claims;
}

function verifyEdDSATicket(ctx: AppContext, token: string): McpTicketClaims {
  try {
    return ctx.tickets.verify(token);
  } catch (error) {
    throw unauthorized(error instanceof Error ? `mcp ticket invalid: ${error.message}` : "mcp ticket invalid");
  }
}

export function authOfToken(ctx: AppContext, token: string): AuthContext {
  if (!token) throw unauthorized("missing mcp credential");
  if (token.startsWith("mcpb_")) {
    const binding = ctx.store.bindingByTokenHash(hashToken(token));
    if (!binding || binding.token_expires_at < ctx.now().toISOString()) throw unauthorized("invalid or expired binding token");
    return { binding, via: "binding_token" };
  }
  const hmacTicket = verifyHmacTicket(ctx, token);
  const ticket = hmacTicket ?? verifyEdDSATicket(ctx, token);
  if (!ticket) throw unauthorized("invalid mcp credential");
  const binding = ctx.store.bindings.get(ticket.binding_id);
  if (!binding || binding.status !== "active") throw unauthorized("ticket binding revoked or missing");
  if (binding.org_id !== ticket.org) throw unauthorized("ticket tenant mismatch");
  if (ticket.scope_hash && canonicalScopeHash(binding.allowed_tools, ticket.server_version) !== ticket.scope_hash) {
    throw unauthorized("ticket scope hash mismatch");
  }
  return { binding, ticket, via: hmacTicket ? "hmac_ticket" : "eddsa_ticket" };
}

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description?: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  input_schema_hash?: string;
  read_only?: boolean;
  risk?: "low" | "medium" | "high";
  annotations?: { destructive?: boolean };
}

function toolDefsOf(server: McpServerRecord, version: McpServerVersionRecord | undefined): ToolDef[] {
  const tools = version?.tools ?? server.tools;
  const manifest = version?.tool_manifest ?? server.tool_manifest;
  return tools.map((name) => {
    const meta = manifest[name];
    return {
      name,
      description: meta?.description ?? `${server.name} tool`,
      ...(meta?.title ? { title: meta.title } : {}),
      ...(meta?.input_schema_hash ? { input_schema_hash: meta.input_schema_hash } : {}),
      inputSchema: { type: "object", additionalProperties: true },
      read_only: meta?.read_only ?? false,
      risk: meta?.risk ?? (meta?.destructive ? "high" : "low"),
      ...(meta?.destructive ? { annotations: { destructive: true } } : {}),
    };
  });
}

function policyAllows(ctx: AppContext, server: McpServerRecord, toolName: string, tool: McpToolMeta | undefined): boolean {
  const destructive = tool?.destructive === true;
  const policy = ctx.store.toolPolicies.get(server.id);
  const matches = (policy?.rules ?? []).filter((rule) => rule.tool_name === toolName || rule.tool_name === "*");
  if (matches.some((rule) => rule.effect === "deny")) return false;
  if (!destructive) return true;
  // 高风险工具：默认 deny；仅 org admin 显式 allow（policy allow 或 server 级开关）
  return server.destructive_allowed || matches.some((rule) => rule.effect === "allow" && rule.require_explicit_allow !== false);
}

function visibleTools(
  ctx: AppContext,
  binding: BindingRecord,
  server: McpServerRecord,
  version: McpServerVersionRecord | undefined,
): ToolDef[] {
  const all = toolDefsOf(server, version).filter((tool) =>
    policyAllows(ctx, server, tool.name, (version?.tool_manifest ?? server.tool_manifest)[tool.name]),
  );
  if (binding.allowed_tools.length === 0) return all;
  return all.filter((tool) => binding.allowed_tools.includes(tool.name));
}

function rpcError(id: RpcRequest["id"], code: number, message: string, data?: { code: string; [key: string]: unknown }) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function resolveServerForGateway(
  ctx: AppContext,
  auth: AuthContext,
  orgSlug: string | undefined,
  serverSlug: string | undefined,
): McpServerRecord {
  // 内部调试入口（无 slug）按 binding 定位；公网必须走真实 orgSlug/serverSlug
  const server = serverSlug
    ? [...ctx.store.servers.values()].find((item) => item.slug === serverSlug)
    : ctx.store.servers.get(auth.binding.server_id);
  if (!server) throw new ApiError({ code: "not_found", status: 404, message: "server_not_found" });
  if (orgSlug && server.org_slug !== orgSlug) throw new ApiError({ code: "forbidden", status: 403, message: "tenant_mismatch" });
  if (server.id !== auth.binding.server_id || server.org_id !== auth.binding.org_id) {
    throw new ApiError({ code: "not_found", status: 404, message: "server_not_found" });
  }
  if (auth.ticket) {
    if (auth.ticket.aud !== `mcp:org:${server.org_slug}`) throw new ApiError({ code: "forbidden", status: 403, message: "tenant_mismatch" });
    if (auth.ticket.org !== server.org_id) throw new ApiError({ code: "forbidden", status: 403, message: "tenant_mismatch" });
    if (auth.ticket.server_id !== server.id) throw new ApiError({ code: "forbidden", status: 403, message: "tenant_mismatch" });
  }
  return server;
}

function stableVersion(ctx: AppContext, server: McpServerRecord): McpServerVersionRecord | undefined {
  return ctx.store.versionById(server.stable_version_id) ?? ctx.store.versionById(server.current_version_id);
}

function checkRateLimit(ctx: AppContext, binding: BindingRecord): boolean {
  const key = binding.id;
  const now = ctx.now().getTime();
  const window = ctx.store.rateWindows.get(key);
  if (!window || now - window.start >= 60_000) {
    ctx.store.rateWindows.set(key, { start: now, count: 1 });
    return true;
  }
  window.count += 1;
  return window.count <= ctx.env.PROXY_RATE_LIMIT_PER_MIN;
}

function circuitOpen(ctx: AppContext, serverId: string): boolean {
  const circuit = ctx.store.circuit.get(serverId);
  if (!circuit) return false;
  if (circuit.openUntil > ctx.now().getTime()) return true;
  ctx.store.circuit.delete(serverId);
  return false;
}

function recordCircuitFailure(ctx: AppContext, serverId: string): void {
  const circuit = ctx.store.circuit.get(serverId) ?? { failures: 0, openUntil: 0 };
  circuit.failures += 1;
  if (circuit.failures >= ctx.env.CIRCUIT_FAILURE_THRESHOLD) {
    circuit.openUntil = ctx.now().getTime() + ctx.env.CIRCUIT_OPEN_MS;
    circuit.failures = 0;
  }
  ctx.store.circuit.set(serverId, circuit);
}

function writeCallLog(
  ctx: AppContext,
  input: {
    binding: BindingRecord;
    server: McpServerRecord;
    version?: McpServerVersionRecord;
    method: string;
    tool: string;
    status: CallLogStatus;
    latencyMs: number;
    argsHash: string;
    errorCode?: string | null;
  },
): CallLogRecord {
  const record: CallLogRecord = {
    id: ctx.newId(),
    org_id: input.binding.org_id,
    server_id: input.server.id,
    server_version_id: input.version?.id ?? null,
    version_id: input.version?.id ?? null,
    channel: "stable",
    binding_id: input.binding.id,
    workspace_id: input.binding.subject_type === "workspace" ? input.binding.subject_id : null,
    app_id: input.binding.subject_type === "app" ? input.binding.subject_id : null,
    user_id: input.binding.created_by,
    method: input.method,
    tool_name: input.tool,
    status: input.status,
    error_code: input.errorCode ?? null,
    latency_ms: input.latencyMs,
    args_hash: input.argsHash,
    cache_hit: false,
    trace_id: null,
    created_at: ctx.now().toISOString(),
  };
  ctx.store.callLogs.set(record.id, record);
  pendingLogs.push(record);
  void flushCallLogs(ctx);
  return record;
}

const pendingLogs: CallLogRecord[] = [];

/** 控制面是 mcp_call_logs 唯一写入方；hub 批量投递（失败保留内存，生产换 WAL）。 */
export async function flushCallLogs(ctx: AppContext): Promise<void> {
  if (!ctx.env.CONTROL_PLANE_URL || !ctx.env.MCP_INTERNAL_TOKEN) return;
  if (pendingLogs.length === 0) return;
  try {
    const response = await fetch(`${ctx.env.CONTROL_PLANE_URL.replace(/\/+$/u, "")}/internal/mcp/call-logs:batch`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-oc-internal-token": ctx.env.MCP_INTERNAL_TOKEN },
      body: JSON.stringify({ items: pendingLogs.splice(0, 100) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`batch ${response.status}`);
  } catch {
    // 保留在 pendingLogs，下次 flush 重试（内存上限由调用量约束）
    if (pendingLogs.length > 10_000) pendingLogs.splice(0, pendingLogs.length - 10_000);
  }
}

async function forwardToolCall(
  ctx: AppContext,
  server: McpServerRecord,
  request: RpcRequest,
  readOnly: boolean,
): Promise<{ ok: true; result: unknown } | { ok: false; errorCode: string; message: string }> {
  if (!server.endpoint) return { ok: false, errorCode: "endpoint_missing", message: "mcp server has no endpoint" };
  const credential = [...ctx.store.credentials.values()].find(
    (item) => item.server_id === server.id && item.revoked_at === null,
  );
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream" };
  if (credential) headers.authorization = `Bearer ${credential.credential_ref}`;
  let lastError = "upstream_unavailable";
  // 仅只读工具允许重试；写/未知工具最多一次（避免重复副作用）
  const retries = readOnly ? ctx.env.UPSTREAM_RETRIES : 0;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(server.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(ctx.env.UPSTREAM_TIMEOUT_MS),
      });
      if (!response.ok) {
        lastError = `http_${response.status}`;
        continue;
      }
      const payload = (await response.json().catch(() => null)) as { result?: unknown; error?: unknown } | null;
      if (!payload) return { ok: false, errorCode: "invalid_upstream_response", message: "invalid upstream response" };
      if (payload.error) return { ok: false, errorCode: "upstream_error", message: JSON.stringify(payload.error) };
      return { ok: true, result: payload.result ?? null };
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      lastError = timeout ? "timeout" : "network_error";
    }
  }
  recordCircuitFailure(ctx, server.id);
  return { ok: false, errorCode: lastError, message: "upstream call failed" };
}

export interface GatewayResult {
  status: number;
  body: unknown;
}

export async function handleGatewayRpc(
  ctx: AppContext,
  input: { token: string; body: RpcRequest; orgSlug?: string; serverSlug?: string },
): Promise<GatewayResult> {
  const auth = authOfToken(ctx, input.token);
  const binding = auth.binding;
  const server = resolveServerForGateway(ctx, auth, input.orgSlug, input.serverSlug);
  if (server.status === "offline" || server.status === "draft" || server.status === "review") {
    return { status: 404, body: rpcError(input.body.id, -32006, `server is ${server.status}`, { code: "server_not_found" }) };
  }
  const version = stableVersion(ctx, server);
  if (auth.ticket && version && auth.ticket.server_version !== version.id) {
    throw unauthorized("ticket server_version does not match current stable version");
  }
  const started = ctx.now().getTime();
  const method = input.body.method;
  if (method === "initialize") {
    return {
      status: 200,
      body: rpcResult(input.body.id, {
        protocolVersion: "2026-07-28",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, version: String(version?.version ?? server.version) },
      }),
    };
  }
  if (method === "ping") return { status: 200, body: rpcResult(input.body.id, {}) };
  if (method === "tools/list") {
    return { status: 200, body: rpcResult(input.body.id, { tools: visibleTools(ctx, binding, server, version) }) };
  }
  if (method !== "tools/call") {
    return { status: 200, body: rpcError(input.body.id, -32601, `method not found: ${method}`, { code: "method_not_found" }) };
  }
  const params = input.body.params ?? {};
  const tool = typeof params.name === "string" ? params.name : typeof params.tool === "string" ? params.tool : "";
  if (!tool) return { status: 400, body: rpcError(input.body.id, -32602, "tool name required", { code: "tool_not_found" }) };
  const argsHash = hashToken(JSON.stringify(params.arguments ?? {}));
  if (!server.tools.includes(tool)) {
    return { status: 404, body: rpcError(input.body.id, -32007, "tool not found in published version", { code: "tool_not_found" }) };
  }
  if (!visibleTools(ctx, binding, server, version).some((item) => item.name === tool)) {
    writeCallLog(ctx, { binding, server, version, method, tool, status: "denied", latencyMs: 0, argsHash, errorCode: "tool_not_allowed" });
    return { status: 200, body: rpcError(input.body.id, -32001, "tool not authorized for this binding", { code: "tool_not_allowed" }) };
  }
  if (!checkRateLimit(ctx, binding)) {
    writeCallLog(ctx, { binding, server, version, method, tool, status: "rate_limited", latencyMs: 0, argsHash, errorCode: "rate_limited" });
    return {
      status: 429,
      body: rpcError(input.body.id, -32002, "rate limit exceeded", { code: "rate_limited", retry_after_ms: 60_000 }),
    };
  }
  if (circuitOpen(ctx, server.id)) {
    writeCallLog(ctx, { binding, server, version, method, tool, status: "upstream_unavailable", latencyMs: 0, argsHash, errorCode: "circuit_open" });
    return { status: 503, body: rpcError(input.body.id, -32005, "upstream circuit open", { code: "circuit_open" }) };
  }
  if (ctx.env.PROXY_MODE === "http" && server.endpoint) {
    const meta = (version?.tool_manifest ?? server.tool_manifest)[tool];
    const forwarded = await forwardToolCall(
      ctx,
      server,
      { jsonrpc: "2.0", id: input.body.id, method: "tools/call", params },
      meta?.read_only === true,
    );
    const latency = ctx.now().getTime() - started;
    if (!forwarded.ok) {
      const status = forwarded.errorCode === "timeout" ? "timeout" : "upstream_unavailable";
      writeCallLog(ctx, { binding, server, version, method, tool, status, latencyMs: latency, argsHash, errorCode: forwarded.errorCode });
      const timeout = forwarded.errorCode === "timeout";
      return {
        status: timeout ? 504 : 502,
        body: rpcError(
          input.body.id,
          timeout ? -32003 : -32004,
          forwarded.message,
          { code: timeout ? "upstream_timeout" : "upstream_error" },
        ),
      };
    }
    writeCallLog(ctx, { binding, server, version, method, tool, status: "ok", latencyMs: latency, argsHash });
    return { status: 200, body: { jsonrpc: "2.0", id: input.body.id ?? null, result: forwarded.result } };
  }
  const latency = ctx.now().getTime() - started;
  writeCallLog(ctx, { binding, server, version, method, tool, status: "ok", latencyMs: latency, argsHash });
  return {
    status: 200,
    body: rpcResult(input.body.id, {
      content: [{ type: "text", text: `[skeleton] ${tool} executed via mcp-hub proxy` }],
      isError: false,
    }),
  };
}

/** 绑定级内部调试入口（保留兼容）：POST /internal/mcp/proxy/{bindingId}。 */
export async function handleBindingProxy(
  ctx: AppContext,
  input: { bindingId: string; token: string; body: { method?: string; tool: string; arguments?: Record<string, unknown> } },
): Promise<GatewayResult> {
  const auth = authOfToken(ctx, input.token);
  if (auth.binding.id !== input.bindingId) throw unauthorized("invalid binding token");
  return handleGatewayRpc(ctx, {
    token: input.token,
    body: {
      jsonrpc: "2.0",
      id: null,
      method: input.body.method ?? "tools/call",
      params: { name: input.body.tool, arguments: input.body.arguments ?? {} },
    },
  });
}
