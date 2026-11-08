// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
  BindingRecord,
  CallLogRecord,
  CredentialRecord,
  HealthCheckRecord,
  McpServerRecord,
  McpServerVersionRecord,
} from "./core";

export class Store {
  readonly servers = new Map<string, McpServerRecord>();
  readonly versions = new Map<string, McpServerVersionRecord>();
  readonly bindings = new Map<string, BindingRecord>();
  readonly healthChecks = new Map<string, HealthCheckRecord>();
  readonly callLogs = new Map<string, CallLogRecord>();
  readonly credentials = new Map<string, CredentialRecord>();
  readonly oauthStates = new Map<string, { serverId: string; createdAt: string }>();
  /** 灰度通道：MVP 只维护 stable；canary 预留 */
  readonly channels = new Map<string, { stable?: string; canary?: string }>();
  /** 熔断状态：连续失败计数与打开到期时间 */
  readonly circuit = new Map<string, { failures: number; openUntil: number }>();
  /** 绑定维度限流窗口 */
  readonly rateWindows = new Map<string, { start: number; count: number }>();
  /** 工具级策略（MVP：控制面推送的扁平行，revision 用于并发控制） */
  readonly toolPolicies = new Map<string, { revision: number; rules: Array<{ tool_name: string; effect: "allow" | "deny"; require_explicit_allow: boolean }> }>();

  newId(): string {
    return randomUUID();
  }

  serverBySlug(orgId: string, slug: string): McpServerRecord | undefined {
    for (const server of this.servers.values()) {
      if (server.org_id === orgId && server.slug === slug) return server;
    }
    return undefined;
  }

  versionsOf(serverId: string): McpServerVersionRecord[] {
    return [...this.versions.values()]
      .filter((version) => version.server_id === serverId)
      .sort((a, b) => a.version - b.version);
  }

  versionById(id: string | null): McpServerVersionRecord | undefined {
    return id ? this.versions.get(id) : undefined;
  }

  bindingByTokenHash(hash: string): BindingRecord | undefined {
    for (const binding of this.bindings.values()) {
      if (binding.token_hash === hash && binding.status === "active") return binding;
    }
    return undefined;
  }

  healthOf(serverId: string): HealthCheckRecord[] {
    return [...this.healthChecks.values()]
      .filter((check) => check.server_id === serverId)
      .sort((a, b) => a.checked_at.localeCompare(b.checked_at));
  }

  logsOf(orgId: string, serverId?: string): CallLogRecord[] {
    return [...this.callLogs.values()]
      .filter((log) => log.org_id === orgId)
      .filter((log) => (serverId ? log.server_id === serverId : true))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = `mcpb_${randomBytes(24).toString("base64url")}`;
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
  };
}

/** 版本签名（MVP：sha256 内容哈希；生产换 ed25519 签名）。 */
export function signVersion(input: {
  serverId: string;
  version: number;
  transport: string;
  endpoint: string | null;
  tools: string[];
}): string {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

