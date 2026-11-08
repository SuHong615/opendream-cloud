// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyRequest } from "fastify";
import type { Env } from "./env";

export interface Principal {
  org_id: string;
  org_slug: string;
  user_id: string;
  roles: string[];
}

export function principalOf(request: FastifyRequest, env: Env): Principal {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    org_id: header("x-oc-org-id") ?? env.DEFAULT_ORG_ID,
    org_slug: header("x-oc-org-slug") ?? env.DEFAULT_ORG_SLUG,
    user_id: header("x-oc-user-id") ?? env.DEFAULT_USER_ID,
    roles: (header("x-oc-roles") ?? "owner,admin,member").split(",").map((role) => role.trim()),
  };
}

export type McpTransport = "stdio" | "sse" | "streamable_http";
export type McpAuthType = "none" | "api_key" | "header" | "oauth2";
/** v3 生命周期：draft → review → published → deprecated → offline（reject → draft） */
export type McpServerStatus = "draft" | "review" | "published" | "deprecated" | "offline";
export type McpHealth = "pending" | "healthy" | "degraded" | "down";
export type McpBindingStatus = "active" | "disabled" | "revoked";
export type McpSource = "internal" | "third_party" | "market";
export type McpVisibility = "org" | "team" | "public";

export interface McpToolMeta {
  destructive: boolean;
  read_only: boolean;
  risk: "low" | "medium" | "high";
  description?: string;
  title?: string;
  input_schema_hash?: string;
}

export interface McpServerRecord {
  id: string;
  org_id: string;
  /** 组织 slug（网关路径 /v1/{orgSlug}/{serverSlug} 的租户段；不是 org UUID） */
  org_slug: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  transport: McpTransport;
  endpoint: string | null;
  auth_type: McpAuthType;
  source: McpSource;
  visibility: McpVisibility;
  status: McpServerStatus;
  health: McpHealth;
  tools: string[];
  tool_manifest: Record<string, McpToolMeta>;
  /** 高风险工具（destructive=true）默认 deny；org admin 显式开启后才可绑定/调用。 */
  destructive_allowed: boolean;
  default_tools: string[];
  version: number;
  current_version_id: string | null;
  stable_version_id: string | null;
  signature: string | null;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_comment: string | null;
  deprecated_at: string | null;
  offline_at: string | null;
  consecutive_failures: number;
  consecutive_successes: number;
  last_health_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** 不可变版本快照：发布后不允许修改。 */
export interface McpServerVersionRecord {
  id: string;
  server_id: string;
  org_id: string;
  version: number;
  transport: McpTransport;
  endpoint: string | null;
  auth_type: McpAuthType;
  tools: string[];
  tool_manifest: Record<string, McpToolMeta>;
  default_tools: string[];
  signature: string;
  /** 契约 canonical 字段（MCP-GATEWAY §3 / openapi 1.1） */
  semver: string;
  status: "draft" | "in_review" | "approved" | "published" | "yanked";
  tool_manifest_hash: string;
  tool_count: number;
  scan_status: "pending" | "passed" | "failed";
  signing_key_id: string | null;
  published_at: string | null;
  created_by: string;
  created_at: string;
  /** 契约别名：tool_manifest 的 schema hash / stable channel */
  tool_schema_hash: string;
  channel: "stable";
}

export interface HealthCheckRecord {
  id: string;
  server_id: string;
  org_id: string;
  status: McpHealth;
  latency_ms: number;
  tools_count: number;
  protocol_version: string | null;
  error_code: string | null;
  checked_at: string;
}

export interface BindingRecord {
  id: string;
  org_id: string;
  server_id: string;
  server_version_id: string | null;
  /** 契约别名（MCP-GATEWAY.md §3） */
  version_id: string | null;
  channel: "stable";
  subject_type: "user" | "workspace" | "app" | "org";
  subject_id: string;
  allowed_tools: string[];
  status: McpBindingStatus;
  token_hash: string;
  token_expires_at: string;
  created_by: string;
  created_at: string;
}

export type CallLogStatus = "ok" | "denied" | "error" | "timeout" | "rate_limited" | "upstream_unavailable";

export interface CallLogRecord {
  id: string;
  org_id: string;
  server_id: string;
  server_version_id: string | null;
  version_id: string | null;
  channel: "stable";
  binding_id: string;
  workspace_id: string | null;
  app_id: string | null;
  user_id: string;
  method: string;
  tool_name: string;
  status: CallLogStatus;
  error_code: string | null;
  latency_ms: number;
  args_hash: string;
  cache_hit: boolean;
  trace_id: string | null;
  created_at: string;
}

export interface CredentialRecord {
  id: string;
  org_id: string;
  server_id: string;
  kind: string;
  credential_ref: string;
  created_at: string;
  revoked_at: string | null;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
