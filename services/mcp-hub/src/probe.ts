// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { AppContext } from "./context";
import type { McpHealth, McpServerRecord } from "./core";
import { randomUUID } from "node:crypto";

export interface ProbeResult {
  server_id: string;
  status: McpHealth;
  latency_ms: number;
  tools_count: number;
  protocol_version: string | null;
  error_code: string | null;
  checked_at: string;
}

function credentialHeaderOf(ctx: AppContext, serverId: string): Record<string, string> {
  const credential = [...ctx.store.credentials.values()].find(
    (item) => item.server_id === serverId && item.revoked_at === null,
  );
  // MVP：credential_ref 视为 Secret 引用；生产由 KMS/Secret 解析，不在日志/响应回显
  if (!credential) return {};
  return { authorization: `Bearer ${credential.credential_ref}` };
}

/** 真实 MCP 探针：initialize + tools/list（streamable HTTP）。 */
async function probeHttp(ctx: AppContext, server: McpServerRecord): Promise<ProbeResult> {
  const started = Date.now();
  const checkedAt = ctx.now().toISOString();
  if (!server.endpoint) {
    return record(ctx, server, {
      status: "down",
      latency_ms: 0,
      tools_count: 0,
      protocol_version: null,
      error_code: "endpoint_missing",
      checked_at: checkedAt,
    });
  }
  try {
    const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", ...credentialHeaderOf(ctx, server.id) };
    const initResponse = await fetch(server.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "initialize",
        params: { protocolVersion: "2026-07-28", capabilities: {}, clientInfo: { name: "oc-mcp-hub", version: ctx.version } },
      }),
      signal: AbortSignal.timeout(ctx.env.HEALTH_TIMEOUT_MS),
    });
    if (!initResponse.ok) {
      return record(ctx, server, {
        status: "down",
        latency_ms: Date.now() - started,
        tools_count: 0,
        protocol_version: null,
        error_code: `http_${initResponse.status}`,
        checked_at: checkedAt,
      });
    }
    const initPayload = (await initResponse.json().catch(() => null)) as
      | { result?: { protocolVersion?: string }; error?: unknown }
      | null;
    if (!initPayload || initPayload.error) {
      return record(ctx, server, {
        status: "down",
        latency_ms: Date.now() - started,
        tools_count: 0,
        protocol_version: null,
        error_code: "initialize_failed",
        checked_at: checkedAt,
      });
    }
    const protocolVersion = initPayload.result?.protocolVersion ?? null;
    const listResponse = await fetch(server.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: "tools/list", params: {} }),
      signal: AbortSignal.timeout(ctx.env.HEALTH_TIMEOUT_MS),
    });
    const listPayload = (await listResponse.json().catch(() => null)) as
      | { result?: { tools?: Array<{ name?: string }> } }
      | null;
    const tools = listPayload?.result?.tools?.map((tool) => tool.name).filter((name): name is string => Boolean(name)) ?? [];
    if (tools.length > 0) server.tools = tools;
    return record(ctx, server, {
      status: listResponse.ok ? "healthy" : "degraded",
      latency_ms: Date.now() - started,
      tools_count: tools.length || server.tools.length,
      protocol_version: protocolVersion,
      error_code: listResponse.ok ? null : `http_${listResponse.status}`,
      checked_at: checkedAt,
    });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return record(ctx, server, {
      status: "down",
      latency_ms: Date.now() - started,
      tools_count: 0,
      protocol_version: null,
      error_code: isTimeout ? "timeout" : "network_error",
      checked_at: checkedAt,
    });
  }
}

function record(
  ctx: AppContext,
  server: McpServerRecord,
  input: Omit<ProbeResult, "server_id">,
): ProbeResult {
  const check = {
    id: ctx.newId(),
    server_id: server.id,
    org_id: server.org_id,
    ...input,
  };
  ctx.store.healthChecks.set(check.id, check);
  if (input.status === "healthy") {
    server.consecutive_successes += 1;
    server.consecutive_failures = 0;
  } else {
    server.consecutive_failures += 1;
    server.consecutive_successes = 0;
  }
  server.health =
    server.consecutive_failures >= ctx.env.HEALTH_FAILURE_THRESHOLD
      ? "down"
      : input.status === "healthy"
        ? "healthy"
        : input.status;
  server.last_health_at = input.checked_at;
  server.updated_at = input.checked_at;
  return { server_id: server.id, ...input };
}

export async function probeServer(ctx: AppContext, server: McpServerRecord): Promise<ProbeResult> {
  if (ctx.env.MOCK_PROBE_MS > 0) await Bun.sleep(ctx.env.MOCK_PROBE_MS);
  if (ctx.env.HEALTH_PROBE_MODE === "http") return probeHttp(ctx, server);
  const healthy = server.transport === "stdio" || server.endpoint !== null;
  return record(ctx, server, {
    status: healthy ? "healthy" : "down",
    latency_ms: healthy ? 12 : 0,
    tools_count: server.tools.length,
    protocol_version: "synthetic",
    error_code: healthy ? null : "endpoint_missing",
    checked_at: ctx.now().toISOString(),
  });
}
