// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AppContext } from "../context";
import { decryptSecret, maskSecret, secretKeyFor } from "../lib/secret-box";
import { effectiveKind, packageForKind } from "./model-presets";

export interface OpencodeProviderConfig {
  name: string;
  package: string;
  settings: { baseURL: string; apiKey: string };
  models: Record<string, { name: string }>;
}

export interface OpencodeConfig {
  $schema: string;
  model: string;
  disabled_providers: string[];
  providers: Record<string, OpencodeProviderConfig>;
}

interface ProviderRow {
  id: string;
  org_id: string | null;
  name: string;
  kind: string;
  base_url: string;
  enabled: number;
  api_key_cipher: string | null;
  default_model_id: string | null;
  is_active: number;
  preset_id: string | null;
}

interface ModelRow {
  id: string;
  provider_id: string;
  provider_model_id: string;
  display_name: string;
  enabled: number;
}

const SCHEMA_URL = "https://opencode.ai/config.json";

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * providerKey 规则：优先 preset_id（安全且稳定），其次 ASCII name slug，最后 id 前 8 位。
 * 生成时保证同一配置内唯一（冲突追加序号）。
 */
export function providerKeyFor(provider: ProviderRow, used: Set<string> = new Set()): string {
  const presetID = provider.preset_id;
  const candidates = [
    presetID && /^[a-z0-9][a-z0-9-]{0,31}$/u.test(presetID) ? presetID : undefined,
    slug(provider.name) || undefined,
    `p_${provider.id.replace(/-/g, "").slice(0, 8)}`,
  ].filter((value): value is string => Boolean(value));
  const base = candidates[0] ?? `p_${provider.id.replace(/-/g, "").slice(0, 8)}`;
  let key = base;
  let index = 2;
  while (used.has(key)) {
    key = `${base}-${index}`;
    index += 1;
  }
  used.add(key);
  return key;
}

export interface GenerateOptions {
  /** 预览用：apiKey 以掩码形式返回，绝不回显明文（写盘仍用真实 key）。 */
  redactSecrets?: boolean;
  /** 桌面端：模型请求走控制面模型代理，本机不落 Provider API Key。 */
  desktop?: { apiUrl: string; token: string };
}

/** 生成 opencode v2 配置（不写文件）。 */
export function generateOpencodeConfig(ctx: AppContext, orgId: string, options: GenerateOptions = {}): OpencodeConfig {
  const providers = ctx.sqlite
    .query<ProviderRow, [string, string]>(
      `SELECT id, org_id, name, kind, base_url, enabled, api_key_cipher, default_model_id, is_active, preset_id
       FROM model_providers
       WHERE enabled = 1 AND (org_id IS NULL OR org_id = ?)
       ORDER BY CASE WHEN org_id = ? THEN 0 ELSE 1 END, is_active DESC, created_at`,
    )
    .all(orgId, orgId);
  const secret = secretKeyFor(ctx.env);
  const usedKeys = new Set<string>();
  const output: OpencodeConfig = {
    $schema: SCHEMA_URL,
    model: "",
    disabled_providers: ["opencode"],
    providers: {},
  };
  let firstResolution: { key: string; modelId: string } | undefined;
  let orgActiveResolution: { key: string; modelId: string } | undefined;
  let globalActiveResolution: { key: string; modelId: string } | undefined;

  for (const provider of providers) {
    const apiKey = decryptSecret(secret, provider.api_key_cipher);
    if (!apiKey) continue; // 历史 LiteLLM 等无加密凭证的 provider 不下发
    const models = ctx.sqlite
      .query<ModelRow, [string]>(
        "SELECT id, provider_id, provider_model_id, display_name, enabled FROM models WHERE provider_id = ? AND enabled = 1 ORDER BY display_name",
      )
      .all(provider.id);
    if (models.length === 0) continue;
    const key = providerKeyFor(provider, usedKeys);
    const modelEntries: Record<string, { name: string }> = {};
    for (const model of models) modelEntries[model.provider_model_id] = { name: model.display_name };
    output.providers[key] = {
      name: provider.name,
      package: packageForKind(effectiveKind(provider)),
      settings: {
        baseURL: options.desktop ? `${options.desktop.apiUrl.replace(/\/+$/u, "")}/api/v1/desktop/model-proxy/${provider.id}` : provider.base_url,
        apiKey: options.desktop ? options.desktop.token : options.redactSecrets ? (maskSecret(apiKey) ?? "****") : apiKey,
      },
      models: modelEntries,
    };
    const preferred = models.find((model) => model.id === provider.default_model_id) ?? models[0];
    if (preferred) {
      const resolution = { key, modelId: preferred.provider_model_id };
      if (!firstResolution) firstResolution = resolution;
      if (provider.is_active === 1) {
        if (provider.org_id === orgId) orgActiveResolution ??= resolution;
        else if (provider.org_id === null) globalActiveResolution ??= resolution;
      }
    }
  }

  const defaultResolution = orgActiveResolution ?? globalActiveResolution ?? firstResolution;
  if (defaultResolution) output.model = `${defaultResolution.key}/${defaultResolution.modelId}`;
  return output;
}

/** 供 GET /model-config/preview 使用：与写盘配置同构，但 apiKey 已脱敏。 */
export function previewOpencodeConfig(ctx: AppContext, orgId: string): OpencodeConfig {
  return generateOpencodeConfig(ctx, orgId, { redactSecrets: true });
}

/** 原子写入 OPENCODE_CONFIG_OUT；失败只记录日志，不阻塞请求。 */
export function writeOpencodeConfig(ctx: AppContext, orgId: string): { written: boolean; path: string; error?: string } {
  const path = resolve(ctx.env.OPENCODE_CONFIG_OUT);
  try {
    const config = generateOpencodeConfig(ctx, orgId);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8" });
    renameSync(tmp, path);
    return { written: true, path };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[opencode-config] write failed (${path}): ${message}`);
    return { written: false, path, error: message };
  }
}
