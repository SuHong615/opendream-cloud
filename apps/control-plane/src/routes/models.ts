// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import type { Principal } from "../types";
import { randomId } from "../lib/crypto";
import { decryptSecret, encryptSecret, maskSecret, secretKeyFor } from "../lib/secret-box";
import { parseJson } from "../lib/http";
import { badRequest, conflict, notFound } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import { listEnabledModels, resolvePolicy, serializeModel, serializePolicy, type PolicyRuleInput } from "../services/policy";
import { MODEL_PROVIDER_PRESETS, dbKind, effectiveKind, findPreset } from "../services/model-presets";
import { writeOpencodeConfig, previewOpencodeConfig } from "../services/opencode-config";
import { currentRequestId, parseInput, requireCsrf, requireRole, requireSession } from "./shared";

const providerKind = z.string().min(1).max(32);

const createProviderSchema = z
  .object({
    name: z.string().min(1).max(120),
    kind: providerKind,
    base_url: z.string().url(),
    region: z.string().max(64).optional(),
    api_key: z.string().min(1).max(4096).optional(),
    credentials: z.object({ api_key: z.string().min(1), extra: z.record(z.string()).optional() }).optional(),
    models: z.array(z.string().min(1).max(200)).max(500).optional(),
    default_model: z.string().min(1).max(200).optional(),
    preset_id: z.string().min(1).max(64).optional(),
    enabled: z.boolean().optional(),
  });

const updateProviderSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  base_url: z.string().url().optional(),
  region: z.string().max(64).nullish(),
  api_key: z.string().max(4096).optional(),
  models: z.array(z.string().min(1).max(200)).max(500).optional(),
  default_model: z.string().min(1).max(200).nullish(),
  preset_id: z.string().min(1).max(64).nullish(),
  enabled: z.boolean().optional(),
});

const ruleSchema = z.object({
  effect: z.enum(["allow", "deny"]),
  subject_type: z.enum(["user", "team", "role", "org"]),
  subject_id: z.string().uuid().nullish(),
  subject_role: z.enum(["owner", "admin", "member", "viewer"]).nullish(),
  model_id: z.string().uuid().nullish(),
  provider_id: z.string().uuid().nullish(),
  limits: z.record(z.unknown()).nullish(),
  priority: z.number().int().min(0).max(1000).optional(),
});

const createPolicySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  default_model_id: z.string().uuid().nullish(),
  is_default: z.boolean().optional(),
  enforcement: z.enum(["enforce", "warn", "off"]).optional(),
  cost_budget_usd: z.string().optional(),
  rules: z.array(ruleSchema).max(200),
});

const replacePolicySchema = createPolicySchema.partial().extend({
  rules: z.array(ruleSchema).max(200).optional(),
});

interface ProviderRow {
  id: string;
  org_id: string | null;
  name: string;
  kind: string;
  base_url: string;
  region: string | null;
  credential_ref: string | null;
  enabled: number;
  health: string;
  last_check_at: number | null;
  settings: string | null;
  api_key_cipher: string | null;
  default_model_id: string | null;
  is_active: number;
  preset_id: string | null;
  models_synced_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ProviderModelRow {
  id: string;
  org_id: string | null;
  provider_id: string;
  provider_model_id: string;
  display_name: string;
  enabled: number;
  health: string;
}

interface PolicyRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  default_model_id: string | null;
  is_default: number;
  enforcement: string;
  cost_budget_usd: string | null;
  created_at: number;
  updated_at: number;
}

function modelsOfProvider(ctx: AppContext, providerId: string): ProviderModelRow[] {
  return ctx.sqlite
    .query<ProviderModelRow, [string]>(
      "SELECT id, org_id, provider_id, provider_model_id, display_name, enabled, health FROM models WHERE provider_id = ? ORDER BY display_name",
    )
    .all(providerId);
}

function providerRow(ctx: AppContext, providerId: string): ProviderRow | undefined {
  return ctx.sqlite
    .query<ProviderRow, [string]>("SELECT * FROM model_providers WHERE id = ?")
    .get(providerId) ?? undefined;
}

function requireAccessibleProvider(ctx: AppContext, principal: Principal, providerId: string): ProviderRow {
  const row = providerRow(ctx, providerId);
  if (!row || (row.org_id !== null && row.org_id !== principal.orgId)) {
    throw notFound("Model provider not found");
  }
  return row;
}

function healthOut(health: string): string {
  return health === "down" ? "unhealthy" : health;
}

function serializeProvider(ctx: AppContext, row: ProviderRow, isActive = row.is_active === 1): Record<string, unknown> {
  const secret = secretKeyFor(ctx.env);
  const plaintext = decryptSecret(secret, row.api_key_cipher);
  const models = modelsOfProvider(ctx, row.id);
  const defaultModel = row.default_model_id ? models.find((model) => model.id === row.default_model_id) : undefined;
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    kind: effectiveKind(row),
    base_url: row.base_url,
    region: row.region,
    enabled: row.enabled === 1,
    is_active: isActive,
    health: healthOut(row.health),
    last_check_at: row.last_check_at ? new Date(row.last_check_at).toISOString() : null,
    models_count: models.length,
    default_model_id: row.default_model_id,
    default_model: defaultModel?.provider_model_id ?? null,
    api_key_masked: maskSecret(plaintext),
    preset_id: row.preset_id,
    models_synced_at: row.models_synced_at ? new Date(row.models_synced_at).toISOString() : null,
    has_credential: row.api_key_cipher !== null || row.credential_ref !== null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

function policyRow(ctx: AppContext, orgId: string, policyId: string): PolicyRow {
  const row = ctx.sqlite
    .query<PolicyRow, [string, string]>("SELECT * FROM model_policies WHERE id = ? AND org_id = ?")
    .get(policyId, orgId);
  if (!row) throw notFound("Model policy not found");
  return row;
}

function replacePolicyRules(ctx: AppContext, policyId: string, orgId: string, rules: PolicyRuleInput[]): void {
  const now = Date.now();
  ctx.sqlite.query("DELETE FROM model_policy_rules WHERE policy_id = ?").run(policyId);
  for (const rule of rules) {
    ctx.sqlite
      .query(
        `INSERT INTO model_policy_rules (id, org_id, policy_id, effect, subject_type, subject_id, subject_role,
          model_id, provider_id, limits, priority, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomId(),
        orgId,
        policyId,
        rule.effect,
        rule.subject_type,
        rule.subject_id ?? null,
        rule.subject_role ?? null,
        rule.model_id ?? null,
        rule.provider_id ?? null,
        rule.limits ? JSON.stringify(rule.limits) : null,
        rule.priority ?? 100,
        now,
      );
  }
}

function refreshConfig(ctx: AppContext, orgId: string): void {
  writeOpencodeConfig(ctx, orgId);
}

function aliasFor(providerId: string, modelId: string): string {
  return `${providerId.replace(/-/g, "").slice(0, 8)}/${modelId}`;
}

/** 按 model id 列表 upsert（保留已有 display_name；新模型 display 用 id）。 */
function upsertProviderModels(
  ctx: AppContext,
  provider: ProviderRow,
  modelIds: string[],
  orgId: string,
): ProviderModelRow[] {
  const now = Date.now();
  for (const modelId of modelIds) {
    const existing = ctx.sqlite
      .query<ProviderModelRow, [string, string]>(
        "SELECT id, org_id, provider_id, provider_model_id, display_name, enabled, health FROM models WHERE provider_id = ? AND provider_model_id = ?",
      )
      .get(provider.id, modelId);
    if (existing) {
      ctx.sqlite.query("UPDATE models SET enabled = 1, health = 'healthy' WHERE id = ?").run(existing.id);
      continue;
    }
    ctx.sqlite
      .query(
        `INSERT INTO models (id, org_id, provider_id, provider_model_id, display_name, litellm_alias,
          context_window, max_output, capabilities, enabled, health, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 0, '[]', 1, 'healthy', ?)`,
      )
      .run(randomId(), provider.org_id ?? null, provider.id, modelId, modelId, aliasFor(provider.id, modelId), now);
  }
  void orgId;
  return modelsOfProvider(ctx, provider.id);
}

function setDefaultModel(
  ctx: AppContext,
  provider: ProviderRow,
  modelRef: string | null | undefined,
  orgId: string,
): void {
  if (modelRef === undefined) return;
  if (modelRef === null || modelRef.trim() === "") {
    ctx.sqlite.query("UPDATE model_providers SET default_model_id = NULL, updated_at = ? WHERE id = ?").run(Date.now(), provider.id);
    return;
  }
  const models = modelsOfProvider(ctx, provider.id);
  const model = models.find((item) => item.id === modelRef || item.provider_model_id === modelRef);
  if (!model) throw badRequest("default_model not found in provider models", { default_model: modelRef });
  ctx.sqlite.query("UPDATE model_providers SET default_model_id = ?, updated_at = ? WHERE id = ?").run(model.id, Date.now(), provider.id);
  void orgId;
}

function updateDefaultPolicy(ctx: AppContext, principal: Principal, defaultModelRowId: string | null): void {
  if (!defaultModelRowId) return;
  const now = Date.now();
  const policy = ctx.sqlite
    .query<{ id: string }, [string]>(
      "SELECT id FROM model_policies WHERE org_id = ? AND is_default = 1 AND enforcement != 'off' LIMIT 1",
    )
    .get(principal.orgId);
  if (policy) {
    ctx.sqlite
      .query("UPDATE model_policies SET default_model_id = ?, version = version + 1, updated_at = ? WHERE id = ?")
      .run(defaultModelRowId, now, policy.id);
    return;
  }
  ctx.sqlite
    .query(
      `INSERT INTO model_policies (id, org_id, name, description, default_model_id, is_default, enforcement, version, created_by, created_at, updated_at)
       VALUES (?, ?, 'Default', 'Auto-created by model provider activation', ?, 1, 'enforce', 1, ?, ?, ?)`,
    )
    .run(randomId(), principal.orgId, defaultModelRowId, principal.userId, now, now);
}

interface TestResult {
  ok: boolean;
  latency_ms: number;
  models: Array<{ id: string; name: string }>;
  request_id: string;
  error_code?: string;
  message?: string;
}

async function testProvider(
  ctx: AppContext,
  request: FastifyRequest,
  provider: ProviderRow,
  mode: "test" | "sync",
  requestedOrgId: string,
): Promise<TestResult> {
  const requestId = currentRequestId(request);
  const secret = secretKeyFor(ctx.env);
  const apiKey = decryptSecret(secret, provider.api_key_cipher);
  const started = Date.now();
  if (!apiKey) {
    ctx.sqlite.query("UPDATE model_providers SET health = 'down', last_check_at = ? WHERE id = ?").run(Date.now(), provider.id);
    return { ok: false, latency_ms: 0, models: [], request_id: requestId, error_code: "missing_api_key", message: "provider has no stored api key" };
  }
  const url = `${provider.base_url.replace(/\/+$/u, "")}/models`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
      signal: AbortSignal.timeout(ctx.env.MODEL_PROVIDER_TEST_TIMEOUT_MS),
    });
    const latency = Date.now() - started;
    if (!response.ok) {
      ctx.sqlite.query("UPDATE model_providers SET health = 'down', last_check_at = ? WHERE id = ?").run(Date.now(), provider.id);
      return {
        ok: false,
        latency_ms: latency,
        models: [],
        request_id: requestId,
        error_code: `http_${response.status}`,
        message: `provider returned HTTP ${response.status}`,
      };
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    const rawList = Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
        ? ((payload as { data: unknown[] }).data)
        : null;
    if (!rawList) {
      ctx.sqlite.query("UPDATE model_providers SET health = 'down', last_check_at = ? WHERE id = ?").run(Date.now(), provider.id);
      return { ok: false, latency_ms: latency, models: [], request_id: requestId, error_code: "invalid_response", message: "expected OpenAI-compatible {data:[...]}" };
    }
    const models = rawList
      .map((item) => {
        if (typeof item === "string") return { id: item, name: item };
        if (item && typeof item === "object") {
          const record = item as { id?: unknown; name?: unknown };
          if (typeof record.id === "string" && record.id.length > 0) {
            return { id: record.id, name: typeof record.name === "string" ? record.name : record.id };
          }
        }
        return undefined;
      })
      .filter((item): item is { id: string; name: string } => item !== undefined);
    if (models.length === 0) {
      ctx.sqlite.query("UPDATE model_providers SET health = 'down', last_check_at = ? WHERE id = ?").run(Date.now(), provider.id);
      return { ok: false, latency_ms: latency, models: [], request_id: requestId, error_code: "no_models", message: "provider returned no models" };
    }
    const now = Date.now();
    upsertProviderModels(ctx, provider, models.map((model) => model.id), requestedOrgId);
    ctx.sqlite
      .query("UPDATE model_providers SET health = 'healthy', last_check_at = ?, models_synced_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, now, provider.id);
    const refreshed = providerRow(ctx, provider.id);
    if (refreshed && !refreshed.default_model_id) {
      const first = modelsOfProvider(ctx, provider.id)[0];
      if (first) setDefaultModel(ctx, refreshed, first.id, requestedOrgId);
    }
    refreshConfig(ctx, requestedOrgId);
    void mode;
    return { ok: true, latency_ms: latency, models, request_id: requestId };
  } catch (error) {
    const latency = Date.now() - started;
    ctx.sqlite.query("UPDATE model_providers SET health = 'down', last_check_at = ? WHERE id = ?").run(Date.now(), provider.id);
    const isTimeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      latency_ms: latency,
      models: [],
      request_id: requestId,
      error_code: isTimeout ? "timeout" : "network_error",
      message: isTimeout ? "provider request timed out" : error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeKind(kind: string, presetId: string | undefined): { kind: string; presetId: string | null } {
  const preset = findPreset(presetId) ?? findPreset(kind);
  return {
    kind: dbKind(preset?.kind ?? kind),
    presetId: presetId ?? preset?.id ?? null,
  };
}

export function registerModelRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------- presets（G4 model-center）
  app.get("/api/v1/model-provider-presets", async (request) => {
    requireSession(ctx, request);
    return { items: MODEL_PROVIDER_PRESETS, request_id: currentRequestId(request) };
  });

  // ---------------- providers
  app.get("/api/v1/model-providers", async (request) => {
    const principal = requireSession(ctx, request);
    const rows = ctx.sqlite
      .query<ProviderRow, [string]>(
        "SELECT * FROM model_providers WHERE (org_id IS NULL OR org_id = ?) ORDER BY is_active DESC, created_at",
      )
      .all(principal.orgId);
    // 组织内已有激活 provider 时，全局 seed provider 不再展示为 active（保持"列表内唯一 active"）
    const hasOrgActive = rows.some((row) => row.org_id !== null && row.is_active === 1);
    const items = rows.map((row) =>
      serializeProvider(ctx, row, row.is_active === 1 && (row.org_id !== null || !hasOrgActive)),
    );
    return { items, next_cursor: null, request_id: currentRequestId(request) };
  });

  app.post("/api/v1/model-providers", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const body = parseInput(createProviderSchema, request.body ?? {});
    const apiKey = body.api_key ?? body.credentials?.api_key;
    const existing = ctx.sqlite
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM model_providers WHERE ifnull(org_id,'') = ? AND name = ?",
      )
      .get(principal.orgId, body.name);
    if (existing) throw conflict("provider already exists", "ws_quota_exceeded");
    const now = Date.now();
    const id = randomId();
    const secret = secretKeyFor(ctx.env);
    const normalized = normalizeKind(body.kind, body.preset_id);
    ctx.sqlite
      .query(
        `INSERT INTO model_providers (id, org_id, name, kind, base_url, region, credential_ref, enabled, health, settings,
          api_key_cipher, default_model_id, is_active, preset_id, models_synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'unknown', '{}', ?, NULL, 0, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        principal.orgId,
        body.name,
        normalized.kind,
        body.base_url,
        body.region ?? null,
        body.enabled === false ? 0 : 1,
        apiKey ? encryptSecret(secret, apiKey) : null,
        normalized.presetId,
        now,
        now,
      );
    let created = providerRow(ctx, id);
    if (!created) throw notFound("provider not found");
    if (body.models && body.models.length > 0) {
      upsertProviderModels(ctx, created, body.models, principal.orgId);
      created = providerRow(ctx, id) ?? created;
    }
    if (body.default_model) {
      setDefaultModel(ctx, created, body.default_model, principal.orgId);
      created = providerRow(ctx, id) ?? created;
    }
    refreshConfig(ctx, principal.orgId);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.provider.create",
      resourceType: "model_provider",
      resourceId: id,
      outcome: "success",
      detail: { name: body.name, kind: normalized.kind, preset_id: normalized.presetId },
    });
    return reply.code(201).send(serializeProvider(ctx, created));
  });

  app.patch("/api/v1/model-providers/:providerId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ providerId: z.string().uuid() }), request.params, "params");
    const body = parseInput(updateProviderSchema, request.body ?? {});
    let provider = requireAccessibleProvider(ctx, principal, params.providerId);
    const now = Date.now();
    try {
      ctx.sqlite
        .query(
          `UPDATE model_providers SET
            name = COALESCE(?, name), base_url = COALESCE(?, base_url), region = COALESCE(?, region),
            enabled = COALESCE(?, enabled), preset_id = COALESCE(?, preset_id), updated_at = ?
           WHERE id = ?`,
        )
        .run(
          body.name ?? null,
          body.base_url ?? null,
          body.region === undefined ? null : body.region,
          body.enabled === undefined ? null : body.enabled ? 1 : 0,
          body.preset_id === undefined ? null : body.preset_id,
          now,
          provider.id,
        );
    } catch {
      throw conflict("provider name already exists", "ws_quota_exceeded");
    }
    if (body.api_key && body.api_key.length > 0) {
      ctx.sqlite
        .query("UPDATE model_providers SET api_key_cipher = ?, credential_ref = NULL, updated_at = ? WHERE id = ?")
        .run(encryptSecret(secretKeyFor(ctx.env), body.api_key), now, provider.id);
    }
    provider = providerRow(ctx, provider.id) ?? provider;
    if (body.models) {
      ctx.sqlite.query("DELETE FROM models WHERE provider_id = ?").run(provider.id);
      upsertProviderModels(ctx, provider, body.models, principal.orgId);
      provider = providerRow(ctx, provider.id) ?? provider;
    }
    if (body.default_model !== undefined) setDefaultModel(ctx, provider, body.default_model, principal.orgId);
    refreshConfig(ctx, principal.orgId);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.provider.update",
      resourceType: "model_provider",
      resourceId: provider.id,
      outcome: "success",
      detail: { fields: Object.keys(body) },
    });
    return serializeProvider(ctx, providerRow(ctx, provider.id) ?? provider);
  });

  app.delete("/api/v1/model-providers/:providerId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ providerId: z.string().uuid() }), request.params, "params");
    const provider = requireAccessibleProvider(ctx, principal, params.providerId);
    const models = modelsOfProvider(ctx, provider.id);
    const aliases = new Set(models.flatMap((model) => [model.provider_model_id, aliasFor(provider.id, model.provider_model_id)]));
    const referenced = ctx.sqlite
      .query<{ id: string; model_default: string | null }, [string]>(
        "SELECT id, model_default FROM workspaces WHERE org_id = ? AND deleted_at IS NULL AND model_default IS NOT NULL",
      )
      .all(principal.orgId)
      .filter((row) => row.model_default !== null && aliases.has(row.model_default));
    if (referenced.length > 0) {
      throw conflict("provider is referenced by workspaces");
    }
    ctx.sqlite.transaction(() => {
      ctx.sqlite.query("DELETE FROM models WHERE provider_id = ?").run(provider.id);
      ctx.sqlite.query("DELETE FROM model_providers WHERE id = ?").run(provider.id);
    })();
    refreshConfig(ctx, principal.orgId);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.provider.delete",
      resourceType: "model_provider",
      resourceId: provider.id,
      outcome: "success",
      detail: { name: provider.name },
    });
    return reply.code(204).send();
  });

  app.post("/api/v1/model-providers/:providerId/test", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ providerId: z.string().uuid() }), request.params, "params");
    const provider = requireAccessibleProvider(ctx, principal, params.providerId);
    const result = await testProvider(ctx, request, provider, "test", principal.orgId);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.provider.test",
      resourceType: "model_provider",
      resourceId: provider.id,
      outcome: result.ok ? "success" : "error",
      detail: { ok: result.ok, models: result.models.length, error_code: result.error_code },
    });
    return result;
  });

  app.post("/api/v1/model-providers/:providerId/sync", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ providerId: z.string().uuid() }), request.params, "params");
    const provider = requireAccessibleProvider(ctx, principal, params.providerId);
    const result = await testProvider(ctx, request, provider, "sync", principal.orgId);
    return result;
  });

  app.post("/api/v1/model-providers/:providerId/activate", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ providerId: z.string().uuid() }), request.params, "params");
    let provider = requireAccessibleProvider(ctx, principal, params.providerId);
    const now = Date.now();
    ctx.sqlite.transaction(() => {
      // 不做跨租户写：org provider 只清本 org；global provider 只清 global。
      // 列表/配置按「org 优先，global 仅在 org 无 active 时视为 active」计算（见 GET /model-providers）。
      if (provider.org_id === null) {
        ctx.sqlite.query("UPDATE model_providers SET is_active = 0 WHERE is_active = 1 AND org_id IS NULL").run();
      } else {
        ctx.sqlite.query("UPDATE model_providers SET is_active = 0 WHERE is_active = 1 AND org_id = ?").run(principal.orgId);
      }
      ctx.sqlite.query("UPDATE model_providers SET is_active = 1, updated_at = ? WHERE id = ?").run(now, provider.id);
    })();
    provider = providerRow(ctx, provider.id) ?? provider;
    let first = modelsOfProvider(ctx, provider.id)[0];
    if (!provider.default_model_id && first) {
      setDefaultModel(ctx, provider, first.id, principal.orgId);
      provider = providerRow(ctx, provider.id) ?? provider;
      first = modelsOfProvider(ctx, provider.id)[0];
    }
    updateDefaultPolicy(ctx, principal, provider.default_model_id ?? first?.id ?? null);
    refreshConfig(ctx, principal.orgId);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.provider.activate",
      resourceType: "model_provider",
      resourceId: provider.id,
      outcome: "success",
      detail: { default_model_id: provider.default_model_id },
    });
    return serializeProvider(ctx, providerRow(ctx, provider.id) ?? provider);
  });

  // ---------------- config preview（G4 model-center）
  app.get("/api/v1/model-config/preview", async (request) => {
    const principal = requireSession(ctx, request);
    requireRole(principal, ["owner", "admin"]);
    // 与下发文件同构；apiKey 已脱敏（明文仅存在于 OPENCODE_CONFIG_OUT 写盘文件）
    return previewOpencodeConfig(ctx, principal.orgId);
  });

  // ---------------- models
  app.get("/api/v1/models", async (request) => {
    const principal = requireSession(ctx, request);
    const resolved = resolvePolicy(ctx.sqlite, principal);
    const isAdmin = principal.role === "owner" || principal.role === "admin";
    const query = parseInput(
      z.object({ capability: z.string().optional(), enabled: z.enum(["true", "false"]).optional() }),
      request.query ?? {},
      "query",
    );
    let models = listEnabledModels(ctx.sqlite, principal.orgId);
    if (query.capability) {
      models = models.filter((model) => parseJson<string[]>(model.capabilities, []).includes(query.capability!));
    }
    const items = models
      .filter((model) => isAdmin || resolved.allowedModelIds.has(model.id))
      .map((model) => serializeModel(model, isAdmin || resolved.allowedModelIds.has(model.id)));
    return { items, next_cursor: null, request_id: currentRequestId(request) };
  });

  app.get("/api/v1/models/:modelId", async (request) => {
    const principal = requireSession(ctx, request);
    const params = parseInput(z.object({ modelId: z.string().uuid() }), request.params, "params");
    const model = listEnabledModels(ctx.sqlite, principal.orgId).find((item) => item.id === params.modelId);
    if (!model) throw notFound("Model not found");
    const resolved = resolvePolicy(ctx.sqlite, principal);
    const isAdmin = principal.role === "owner" || principal.role === "admin";
    if (!isAdmin && !resolved.allowedModelIds.has(model.id)) throw notFound("Model not found");
    return serializeModel(model, true);
  });

  // ---------------- policies
  app.get("/api/v1/model-policies", async (request) => {
    const principal = requireSession(ctx, request);
    const rows = ctx.sqlite
      .query<PolicyRow, [string]>("SELECT * FROM model_policies WHERE org_id = ? ORDER BY is_default DESC, created_at")
      .all(principal.orgId);
    return { items: rows.map((row) => serializePolicy(ctx.sqlite, row)), next_cursor: null, request_id: currentRequestId(request) };
  });

  app.post("/api/v1/model-policies", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const body = parseInput(createPolicySchema, request.body ?? {});
    const now = Date.now();
    const id = randomId();
    ctx.sqlite.transaction(() => {
      if (body.is_default !== false) {
        ctx.sqlite.query("UPDATE model_policies SET is_default = 0 WHERE org_id = ?").run(principal.orgId);
      }
      ctx.sqlite
        .query(
          `INSERT INTO model_policies (id, org_id, name, description, default_model_id, is_default, enforcement,
            cost_budget_usd, version, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          id,
          principal.orgId,
          body.name,
          body.description ?? null,
          body.default_model_id ?? null,
          body.is_default === false ? 0 : 1,
          body.enforcement ?? "enforce",
          body.cost_budget_usd ?? null,
          principal.userId,
          now,
          now,
        );
      replacePolicyRules(ctx, id, principal.orgId, body.rules as PolicyRuleInput[]);
    })();
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.policy.create",
      resourceType: "model_policy",
      resourceId: id,
      outcome: "success",
      detail: { name: body.name, rules: body.rules.length },
    });
    return reply.code(201).send(serializePolicy(ctx.sqlite, policyRow(ctx, principal.orgId, id)));
  });

  app.get("/api/v1/model-policies/:policyId", async (request) => {
    const principal = requireSession(ctx, request);
    const params = parseInput(z.object({ policyId: z.string().uuid() }), request.params, "params");
    return serializePolicy(ctx.sqlite, policyRow(ctx, principal.orgId, params.policyId));
  });

  app.put("/api/v1/model-policies/:policyId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ policyId: z.string().uuid() }), request.params, "params");
    const body = parseInput(replacePolicySchema, request.body ?? {});
    const row = policyRow(ctx, principal.orgId, params.policyId);
    const now = Date.now();
    ctx.sqlite.transaction(() => {
      if (body.is_default === true) {
        ctx.sqlite.query("UPDATE model_policies SET is_default = 0 WHERE org_id = ?").run(principal.orgId);
      }
      ctx.sqlite
        .query(
          `UPDATE model_policies SET name = ?, description = ?, default_model_id = ?, is_default = ?, enforcement = ?,
            cost_budget_usd = ?, version = version + 1, updated_at = ? WHERE id = ?`,
        )
        .run(
          body.name ?? row.name,
          body.description ?? row.description,
          body.default_model_id ?? row.default_model_id,
          body.is_default === undefined ? row.is_default : body.is_default ? 1 : 0,
          body.enforcement ?? row.enforcement,
          body.cost_budget_usd ?? row.cost_budget_usd,
          now,
          row.id,
        );
      if (body.rules) replacePolicyRules(ctx, row.id, principal.orgId, body.rules as PolicyRuleInput[]);
    })();
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "model.policy.update",
      resourceType: "model_policy",
      resourceId: row.id,
      outcome: "success",
      detail: { rules: body.rules?.length ?? null },
    });
    return serializePolicy(ctx.sqlite, policyRow(ctx, principal.orgId, row.id));
  });

  app.post("/api/v1/model-policies/:policyId/preview", async (request) => {
    const principal = requireSession(ctx, request);
    requireRole(principal, ["owner", "admin"]);
    const params = parseInput(z.object({ policyId: z.string().uuid() }), request.params, "params");
    policyRow(ctx, principal.orgId, params.policyId);
    const resolved = resolvePolicy(ctx.sqlite, principal);
    const users = ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM memberships WHERE org_id = ? AND status = 'active'")
      .get(principal.orgId);
    const workspaces = ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM workspaces WHERE org_id = ? AND deleted_at IS NULL")
      .get(principal.orgId);
    return {
      affected_users: users?.c ?? 0,
      affected_workspaces: workspaces?.c ?? 0,
      newly_allowed: [],
      newly_denied: [],
      default_model_changed: false,
      warnings: [],
    };
  });
}
