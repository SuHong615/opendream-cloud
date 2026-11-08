// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema（MVP，sqlite-core）。
 * 与 db/migrations/0001_init.sql 一一对应；PG 权威 DDL 见 docs/02-architecture/DATA-MODEL.md。
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("zh-CN"),
  status: text("status").notNull().default("active"),
  lastLoginAt: integer("last_login_at"),
  createdAt: integer("created_at").notNull(),
});

export const orgs = sqliteTable("orgs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("personal"),
  plan: text("plan").notNull().default("free"),
  settings: text("settings"),
  dataRegion: text("data_region").notNull().default("cn-hangzhou"),
  status: text("status").notNull().default("active"),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    invitedBy: text("invited_by"),
    invitedAt: integer("invited_at"),
    joinedAt: integer("joined_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [uniqueIndex("uq_membership_org_user").on(table.orgId, table.userId)],
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull().unique(),
    keyHash: text("key_hash").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    scopes: text("scopes").notNull().default("[]"),
    lastUsedAt: integer("last_used_at"),
    expiresAt: integer("expires_at"),
    revokedAt: integer("revoked_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_api_keys_org").on(table.orgId)],
);

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    ownerUserId: text("owner_user_id").notNull(),
    displayName: text("display_name").notNull(),
    slug: text("slug").notNull(),
    state: text("state").notNull(),
    stateReason: text("state_reason"),
    host: text("host").notNull().unique(),
    image: text("image").notNull(),
    imageDigest: text("image_digest").notNull(),
    cpuRequest: text("cpu_request").notNull().default("4"),
    memRequest: text("mem_request").notNull().default("8Gi"),
    pvcSize: text("pvc_size").notNull().default("20Gi"),
    pvcName: text("pvc_name"),
    configRevision: integer("config_revision").notNull().default(1),
    modelDefault: text("model_default"),
    lastActivityAt: integer("last_activity_at"),
    idleSince: integer("idle_since"),
    destroyRequestedAt: integer("destroy_requested_at"),
    destroyScheduledAt: integer("destroy_scheduled_at"),
    deletedAt: integer("deleted_at"),
    snapshotId: text("snapshot_id"),
    version: integer("version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uq_ws_owner_alive").on(table.orgId, table.ownerUserId),
    index("idx_ws_owner_state").on(table.ownerUserId, table.state),
    index("idx_ws_org_state").on(table.orgId, table.state),
  ],
);

export const workspaceEvents = sqliteTable(
  "workspace_events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    id: text("id").notNull().unique(),
    orgId: text("org_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    type: text("type").notNull(),
    fromState: text("from_state"),
    toState: text("to_state"),
    reason: text("reason"),
    message: text("message"),
    actorType: text("actor_type").notNull().default("user"),
    actorId: text("actor_id"),
    metadata: text("metadata"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_wse_ws_seq").on(table.workspaceId, table.seq)],
);

export const modelProviders = sqliteTable(
  "model_providers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    baseUrl: text("base_url").notNull(),
    region: text("region"),
    credentialRef: text("credential_ref"),
    enabled: integer("enabled").notNull().default(1),
    health: text("health").notNull().default("unknown"),
    lastCheckAt: integer("last_check_at"),
    settings: text("settings"),
    apiKeyCipher: text("api_key_cipher"),
    defaultModelId: text("default_model_id"),
    isActive: integer("is_active").notNull().default(0),
    presetId: text("preset_id"),
    modelsSyncedAt: integer("models_synced_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uq_provider_org_name").on(table.orgId, table.name)],
);

export const models = sqliteTable(
  "models",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    providerId: text("provider_id").notNull(),
    providerModelId: text("provider_model_id").notNull(),
    displayName: text("display_name").notNull(),
    litellmAlias: text("litellm_alias").notNull().unique(),
    contextWindow: integer("context_window").notNull().default(0),
    maxOutput: integer("max_output").notNull().default(0),
    capabilities: text("capabilities").notNull().default("[]"),
    inputPricePer1m: text("input_price_per_1m"),
    outputPricePer1m: text("output_price_per_1m"),
    enabled: integer("enabled").notNull().default(1),
    health: text("health").notNull().default("unknown"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("idx_models_provider").on(table.providerId)],
);

export const modelPolicies = sqliteTable("model_policies", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  defaultModelId: text("default_model_id"),
  isDefault: integer("is_default").notNull().default(0),
  enforcement: text("enforcement").notNull().default("enforce"),
  costBudgetUsd: text("cost_budget_usd"),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const modelPolicyRules = sqliteTable("model_policy_rules", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  policyId: text("policy_id").notNull(),
  effect: text("effect").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  subjectRole: text("subject_role"),
  modelId: text("model_id"),
  providerId: text("provider_id"),
  limits: text("limits"),
  priority: integer("priority").notNull().default(100),
  createdAt: integer("created_at").notNull(),
});

export const litellmKeys = sqliteTable("litellm_keys", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  keyFingerprint: text("key_fingerprint").notNull().unique(),
  keyAlias: text("key_alias").notNull(),
  budgetUsd: text("budget_usd"),
  rpmLimit: integer("rpm_limit"),
  tpmLimit: integer("tpm_limit"),
  models: text("models").notNull().default("[]"),
  status: text("status").notNull().default("active"),
  rotatedFrom: text("rotated_from"),
  expiresAt: integer("expires_at"),
  createdAt: integer("created_at").notNull(),
  revokedAt: integer("revoked_at"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  orgId: text("org_id"),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  actorIp: text("actor_ip"),
  userAgent: text("user_agent"),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  outcome: text("outcome").notNull(),
  detail: text("detail"),
  requestId: text("request_id"),
  createdAt: integer("created_at").notNull(),
});

export const usageRecords = sqliteTable("usage_records", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id"),
  workspaceId: text("workspace_id"),
  apiKeyId: text("api_key_id"),
  providerId: text("provider_id"),
  modelId: text("model_id"),
  litellmAlias: text("litellm_alias"),
  requestId: text("request_id").notNull().unique(),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  tokensReasoning: integer("tokens_reasoning").notNull().default(0),
  tokensCacheRead: integer("tokens_cache_read").notNull().default(0),
  tokensCacheWrite: integer("tokens_cache_write").notNull().default(0),
  costUsd: text("cost_usd").notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull().default("success"),
  errorCode: text("error_code"),
  occurredAt: integer("occurred_at").notNull(),
  ingestedAt: integer("ingested_at").notNull(),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code").notNull(),
  response: text("response"),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const schemaMigrations = sqliteTable("schema_migrations", {
  version: text("version").primaryKey(),
  appliedAt: integer("applied_at").notNull(),
});

/** v3 MCP 工具级策略（control-plane 权威；hub 读取快照执行 PEP）。 */
export const mcpToolPolicies = sqliteTable("mcp_tool_policies", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  serverId: text("server_id").notNull(),
  toolName: text("tool_name").notNull(),
  effect: text("effect").notNull(),
  subjectType: text("subject_type").notNull().default("org"),
  subjectId: text("subject_id"),
  subjectRole: text("subject_role"),
  constraints: text("constraints"),
  requireExplicitAllow: integer("require_explicit_allow").notNull().default(1),
  priority: integer("priority").notNull().default(100),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** v3 MCP 调用审计（control-plane 唯一写入方；hub 批量投递）。 */
/** M5：组织配额（owner 可改；默认值在服务层兜底）。 */
export const orgQuotas = sqliteTable("org_quotas", {
  orgId: text("org_id").primaryKey(),
  workspaces: integer("workspaces").notNull().default(10),
  members: integer("members").notNull().default(50),
  budgetUsd: real("budget_usd").notNull().default(100),
  mcpServers: integer("mcp_servers").notNull().default(20),
  updatedAt: integer("updated_at").notNull().default(0),
});

export const mcpCallLogs = sqliteTable("mcp_call_logs", {  id: text("id").primaryKey(),
  orgId: text("org_id").notNull(),
  serverId: text("server_id").notNull(),
  versionId: text("version_id"),
  bindingId: text("binding_id").notNull(),
  workspaceId: text("workspace_id"),
  appId: text("app_id"),
  userId: text("user_id"),
  method: text("method").notNull(),
  toolName: text("tool_name").notNull(),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  latencyMs: integer("latency_ms").notNull().default(0),
  argsHash: text("args_hash").notNull(),
  cacheHit: integer("cache_hit").notNull().default(0),
  traceId: text("trace_id"),
  createdAt: integer("created_at").notNull(),
});
