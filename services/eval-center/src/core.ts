// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyRequest } from "fastify";
import type { Env } from "./env";

export interface Principal {
  org_id: string;
  user_id: string;
}

export function principalOf(request: FastifyRequest, env: Env): Principal {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    org_id: header("x-oc-org-id") ?? env.DEFAULT_ORG_ID,
    user_id: header("x-oc-user-id") ?? env.DEFAULT_USER_ID,
  };
}

export type EvalRunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "collecting"
  | "grading"
  | "completed"
  | "failed"
  | "canceled"
  | "timed_out";

export type EvalResultStatus = "pass" | "fail" | "error" | "skipped";

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface EvalDataset {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  visibility: "org" | "public";
  created_at: string;
}

export interface EvalDatasetVersion {
  id: string;
  dataset_id: string;
  org_id: string;
  version: string;
  content_hash: string;
  cases_count: number;
  immutable: boolean;
  created_at: string;
}

export interface RunMetrics {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  p50_latency_ms: number;
  cost_usd: number;
  tokens_total: number;
}

export interface EvalRun {
  id: string;
  org_id: string;
  dataset_id: string;
  dataset_version_id: string;
  name: string;
  status: EvalRunStatus;
  trigger: "manual" | "ci" | "publish_gate";
  target_type: "skill" | "model" | "app" | "agent";
  target_ref: Record<string, unknown>;
  env_fingerprint: string;
  metrics: RunMetrics | null;
  evaluator_ids: string[];
  evaluator_summary: EvaluatorSummary[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface Evaluator {
  id: string;
  /** 预置评估器 org_id 为 null（全租户只读）。 */
  org_id: string | null;
  name: string;
  display_name: string;
  description: string;
  kind: "preset" | "custom";
  metric: "correctness" | "faithfulness" | "task_completion" | "tool_usage" | "custom";
  prompt: string;
  rubric: string | null;
  model_ref: string | null;
  config: Record<string, unknown>;
  is_preset: boolean;
  created_at: string;
  updated_at: string;
}

export interface EvaluatorSummary {
  evaluator_id: string;
  name: string;
  kind: "preset" | "custom";
  pass_rate: number;
  avg_score: number;
  status: "ok" | "error";
}

export interface EvalCaseResult {
  id: string;
  run_id: string;
  org_id: string;
  case_id: string;
  status: EvalResultStatus;
  score: number | null;
  evaluator_scores: Record<string, { score: number; status: "ok" | "error" }>;
  latency_ms: number | null;
  tokens: { input: number; output: number };
  cost_usd: number;
  created_at: string;
}

export interface EvalBaseline {
  id: string;
  org_id: string;
  run_id: string;
  dataset_id: string;
  name: string | null;
  created_at: string;
}

export interface EvalSpec {
  id: string;
  org_id: string;
  name: string;
  spec: Record<string, unknown>;
  created_at: string;
}
