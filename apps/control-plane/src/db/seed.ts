// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Sqlite } from "./client";
import { randomId } from "../lib/crypto";
import { encryptSecret } from "../lib/secret-box";

const MOCK_PROVIDER_NAME = "企业模型（Mock）";
const MOCK_PROVIDER_PRESET = "enterprise";
const MOCK_BASE_URL = "http://mock-model:9100/v1";
const MOCK_API_KEY = "sk-mock-key";
const MOCK_MODELS = [
  { id: "gpt-4o-mini", display: "GPT-4o mini" },
  { id: "qwen2.5-coder-32b", display: "Qwen2.5 Coder 32B" },
];

/** 默认企业模型（Mock）provider；仅当库中还没有任何带加密凭证的 provider 时创建。 */
function seedMockProvider(sqlite: Sqlite, modelSecret: string): void {
  const existing = sqlite
    .query<{ id: string }, [string]>("SELECT id FROM model_providers WHERE preset_id = ? LIMIT 1")
    .get(MOCK_PROVIDER_PRESET);
  const encrypted = sqlite
    .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM model_providers WHERE api_key_cipher IS NOT NULL")
    .get();
  if (existing || (encrypted?.c ?? 0) > 0) {
    // 已存在则确保默认模型与 active 状态（用于升级旧库）
    if (existing) {
      const models = sqlite
        .query<{ id: string; provider_model_id: string }, [string]>(
          "SELECT id, provider_model_id FROM models WHERE provider_id = ? ORDER BY created_at",
        )
        .all(existing.id);
      const preferred = models.find((model) => model.provider_model_id === "gpt-4o-mini") ?? models[0];
      sqlite
        .query("UPDATE model_providers SET is_active = 1, default_model_id = COALESCE(default_model_id, ?), updated_at = ? WHERE id = ?")
        .run(preferred?.id ?? null, Date.now(), existing.id);
    }
    return;
  }

  const now = Date.now();
  const providerId = randomId();
  sqlite.transaction(() => {
    sqlite
      .query(
        `INSERT INTO model_providers (id, org_id, name, kind, base_url, region, credential_ref, enabled, health, settings,
          api_key_cipher, default_model_id, is_active, preset_id, models_synced_at, created_at, updated_at)
         VALUES (?, NULL, ?, 'openai_compatible', ?, NULL, NULL, 1, 'healthy', '{}', ?, NULL, 1, ?, NULL, ?, ?)`,
      )
      .run(providerId, MOCK_PROVIDER_NAME, MOCK_BASE_URL, encryptSecret(modelSecret, MOCK_API_KEY), MOCK_PROVIDER_PRESET, now, now);
    let defaultModelId: string | null = null;
    for (const model of MOCK_MODELS) {
      const modelId = randomId();
      if (model.id === "gpt-4o-mini") defaultModelId = modelId;
      sqlite
        .query(
          `INSERT INTO models (id, org_id, provider_id, provider_model_id, display_name, litellm_alias,
            context_window, max_output, capabilities, enabled, health, created_at)
           VALUES (?, NULL, ?, ?, ?, ?, 128000, 16384, '[]', 1, 'healthy', ?)`,
        )
        .run(modelId, providerId, model.id, model.display, `mock-enterprise/${model.id}`, now);
    }
    sqlite.query("UPDATE model_providers SET default_model_id = ? WHERE id = ?").run(defaultModelId, providerId);
  })();
}

/** dev seed：默认企业 Mock provider + 平台级 LiteLLM 供应商 + dev 策略幂等创建。 */
export function seedDev(sqlite: Sqlite, pepper: string, modelSecret: string = pepper, legacy = true): void {
  seedMockProvider(sqlite, modelSecret);
  // 本地演示模式只保留企业 Mock provider（不创建旧的 LiteLLM 占位 provider/models/policy）
  if (!legacy) return;
  const now = Date.now();
  const provider = sqlite
    .query<{ id: string }, [string]>("SELECT id FROM model_providers WHERE name = ? AND org_id IS NULL")
    .get("LiteLLM Gateway");
  const providerId = provider?.id ?? randomId();
  if (!provider) {
    sqlite
      .query(
        `INSERT INTO model_providers (id, org_id, name, kind, base_url, enabled, health, settings, created_at, updated_at)
         VALUES (?, NULL, ?, 'openai_compatible', ?, 1, 'healthy', '{}', ?, ?)`,
      )
      .run(providerId, "LiteLLM Gateway", "http://localhost:4000/internal/mock-litellm/v1", now, now);
  }

  const seedModels = [
    { model: "claude-sonnet-5", display: "Claude Sonnet 5", ctx: 200_000, max: 8_192, input: "3.00", output: "15.00" },
    { model: "gpt-5", display: "GPT-5", ctx: 128_000, max: 16_384, input: "2.50", output: "10.00" },
  ];
  for (const item of seedModels) {
    const alias = `litellm/${item.model}`;
    const exists = sqlite
      .query<{ id: string }, [string]>("SELECT id FROM models WHERE litellm_alias = ?")
      .get(alias);
    if (exists) continue;
    sqlite
      .query(
        `INSERT INTO models (id, org_id, provider_id, provider_model_id, display_name, litellm_alias,
          context_window, max_output, capabilities, input_price_per_1m, output_price_per_1m, enabled, health, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'healthy', ?)`,
      )
      .run(
        randomId(),
        providerId,
        item.model,
        item.display,
        alias,
        item.ctx,
        item.max,
        JSON.stringify(["tools", "reasoning", "caching"]),
        item.input,
        item.output,
        now,
      );
  }

  // 平台默认策略（org_id 使用 dev 组织；不存在则跳过，由 dev-login 首次创建后补）
  const dev = sqlite
    .query<{ id: string }, []>("SELECT id FROM orgs WHERE kind = 'personal' ORDER BY created_at LIMIT 1")
    .get();
  if (!dev) return;
  const policy = sqlite
    .query<{ id: string }, [string]>("SELECT id FROM model_policies WHERE org_id = ? AND is_default = 1")
    .get(dev.id);
  if (policy) return;
  const policyId = randomId();
  const defaultModel = sqlite
    .query<{ id: string }, [string]>("SELECT id FROM models WHERE litellm_alias = ?")
    .get("litellm/claude-sonnet-5");
  sqlite
    .query(
      `INSERT INTO model_policies (id, org_id, name, description, default_model_id, is_default, enforcement, version, created_at, updated_at)
       VALUES (?, ?, 'Default', 'Dev default policy', ?, 1, 'enforce', 1, ?, ?)`,
    )
    .run(policyId, dev.id, defaultModel?.id ?? null, now, now);
  sqlite
    .query(
      `INSERT INTO model_policy_rules (id, org_id, policy_id, effect, subject_type, subject_role, priority, created_at)
       VALUES (?, ?, ?, 'allow', 'role', 'member', 100, ?)`,
    )
    .run(randomId(), dev.id, policyId, now);
  void pepper;
}

if (import.meta.main) {
  const { openDatabase } = await import("./client");
  const { migrate } = await import("./migrate");
  const { loadEnv } = await import("../env");
  const env = loadEnv();
  const handle = openDatabase(env.DATABASE_PATH);
  migrate(handle.sqlite);
  seedDev(handle.sqlite, env.APIKEY_PEPPER, env.MODEL_SECRET_KEY ?? env.SESSION_SECRET);
  console.log(`[seed] ok (${handle.path})`);
}
