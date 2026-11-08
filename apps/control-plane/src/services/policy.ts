// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Sqlite } from "../db/client";
import type { Principal } from "../types";
import { parseJson } from "../lib/http";

export interface ModelRow {
  id: string;
  org_id: string | null;
  provider_id: string;
  provider_model_id: string;
  display_name: string;
  litellm_alias: string;
  context_window: number;
  max_output: number;
  capabilities: string;
  input_price_per_1m: string | null;
  output_price_per_1m: string | null;
  enabled: number;
  health: string;
}

interface RuleRow {
  effect: "allow" | "deny";
  subject_type: "user" | "team" | "role" | "org";
  subject_id: string | null;
  subject_role: string | null;
  model_id: string | null;
  provider_id: string | null;
  priority: number;
}

export interface ResolvedPolicy {
  policyId: string | null;
  defaultModelId: string | null;
  allowedModelIds: Set<string>;
  enforcement: string;
}

function specificity(rule: RuleRow): number {
  switch (rule.subject_type) {
    case "org":
      return 1;
    case "role":
      return 2;
    case "team":
      return 3;
    case "user":
      return 3;
    default:
      return 0;
  }
}

function ruleMatches(rule: RuleRow, principal: Principal): boolean {
  switch (rule.subject_type) {
    case "org":
      return true;
    case "role":
      return rule.subject_role === principal.role;
    case "user":
      return rule.subject_id === principal.userId;
    case "team":
      return false; // teams 不在 MVP 范围
    default:
      return false;
  }
}

export function listEnabledModels(sqlite: Sqlite, orgId: string): ModelRow[] {
  return sqlite
    .query<ModelRow, [string]>(
      `SELECT id, org_id, provider_id, provider_model_id, display_name, litellm_alias, context_window, max_output,
        capabilities, input_price_per_1m, output_price_per_1m, enabled, health
       FROM models WHERE enabled = 1 AND (org_id IS NULL OR org_id = ?)
       ORDER BY display_name`,
    )
    .all(orgId);
}

export function resolvePolicy(sqlite: Sqlite, principal: Principal): ResolvedPolicy {
  const models = listEnabledModels(sqlite, principal.orgId);
  const policy = sqlite
    .query<{ id: string; default_model_id: string | null; enforcement: string }, [string]>(
      "SELECT id, default_model_id, enforcement FROM model_policies WHERE org_id = ? AND is_default = 1 AND enforcement != 'off' LIMIT 1",
    )
    .get(principal.orgId);
  const rules = policy
    ? sqlite
        .query<RuleRow, [string]>(
          `SELECT effect, subject_type, subject_id, subject_role, model_id, provider_id, priority
           FROM model_policy_rules WHERE policy_id = ? AND subject_type IN ('org','role','user','team')`,
        )
        .all(policy.id)
    : [];
  const allowedModelIds = new Set<string>();
  for (const model of models) {
    const matching = rules
      .filter((rule) => {
        if (!ruleMatches(rule, principal)) return false;
        if (rule.model_id !== null && rule.model_id !== model.id) return false;
        if (rule.provider_id !== null && rule.provider_id !== model.provider_id) return false;
        return true;
      })
      .sort((a, b) => specificity(a) - specificity(b) || a.priority - b.priority);
    const decision = matching.at(-1)?.effect ?? "allow";
    if (decision === "allow") allowedModelIds.add(model.id);
  }
  return {
    policyId: policy?.id ?? null,
    defaultModelId: policy?.default_model_id ?? models.find((m) => allowedModelIds.has(m.id))?.id ?? null,
    allowedModelIds,
    enforcement: policy?.enforcement ?? "enforce",
  };
}

export function serializeModel(model: ModelRow, allowed: boolean) {
  return {
    id: model.id,
    org_id: model.org_id,
    provider_id: model.provider_id,
    provider_model_id: model.provider_model_id,
    display_name: model.display_name,
    litellm_alias: model.litellm_alias,
    context_window: model.context_window,
    max_output: model.max_output,
    capabilities: parseJson<string[]>(model.capabilities, []),
    input_price_per_1m: model.input_price_per_1m,
    output_price_per_1m: model.output_price_per_1m,
    enabled: model.enabled === 1,
    health: model.health,
    allowed,
  };
}

export interface PolicyRuleInput {
  effect: "allow" | "deny";
  subject_type: "user" | "team" | "role" | "org";
  subject_id?: string | null;
  subject_role?: string | null;
  model_id?: string | null;
  provider_id?: string | null;
  limits?: Record<string, unknown>;
  priority?: number;
}

export function serializePolicy(
  sqlite: Sqlite,
  row: {
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
  },
) {
  const rules = sqlite
    .query<
      {
        effect: string;
        subject_type: string;
        subject_id: string | null;
        subject_role: string | null;
        model_id: string | null;
        provider_id: string | null;
        limits: string | null;
        priority: number;
      },
      [string]
    >(
      `SELECT effect, subject_type, subject_id, subject_role, model_id, provider_id, limits, priority
       FROM model_policy_rules WHERE policy_id = ? ORDER BY priority, created_at`,
    )
    .all(row.id)
    .map((rule) => ({
      effect: rule.effect,
      subject_type: rule.subject_type,
      subject_id: rule.subject_id,
      subject_role: rule.subject_role,
      model_id: rule.model_id,
      provider_id: rule.provider_id,
      limits: parseJson<Record<string, unknown> | null>(rule.limits, null),
      priority: rule.priority,
    }));
  return {
    id: row.id,
    org_id: row.org_id,
    name: row.name,
    description: row.description,
    default_model_id: row.default_model_id,
    is_default: row.is_default === 1,
    enforcement: row.enforcement,
    cost_budget_usd: row.cost_budget_usd,
    rules,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}
