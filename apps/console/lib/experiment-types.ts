// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface ExperimentVariant {
  id: string;
  name: string;
  model: string;
  prompt_ref?: string | null;
  weight?: number;
}

export interface ExperimentMetric {
  variant_id: string;
  accuracy: number;
  avg_latency_ms: number;
  avg_cost_usd: number;
  samples: number;
}

export interface Experiment {
  id: string;
  org_id?: string;
  name: string;
  description?: string;
  dataset_id: string;
  evaluator_id?: string | null;
  status: "draft" | "running" | "completed" | "failed" | string;
  variants: ExperimentVariant[];
  metrics: ExperimentMetric[];
  winner_variant_id?: string | null;
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ExperimentResults {
  experiment_id: string;
  status: string;
  winner_variant_id?: string | null;
  metrics: ExperimentMetric[];
}

export const EXPERIMENT_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  running: "运行中",
  completed: "已完成",
  failed: "失败",
};
