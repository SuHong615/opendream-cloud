// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Experiment } from "@/lib/experiment-types";

const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const mockExperiments: Experiment[] = [
  {
    id: "exp_invoice_compare",
    name: "发票助手：DeepSeek vs 通义",
    description: "对比两个模型在发票抽取数据集上的准确率、延迟与成本",
    dataset_id: "ds_invoice_gold",
    evaluator_id: "ev_correctness",
    status: "completed",
    variants: [
      { id: "var_ds", name: "DeepSeek-V3", model: "deepseek-v3", prompt_ref: "prompt-invoice-extract", weight: 0.5 },
      { id: "var_qwen", name: "Qwen-Max", model: "qwen-max", prompt_ref: "prompt-invoice-extract", weight: 0.5 },
    ],
    metrics: [
      { variant_id: "var_ds", accuracy: 0.94, avg_latency_ms: 820, avg_cost_usd: 0.0031, samples: 200 },
      { variant_id: "var_qwen", accuracy: 0.89, avg_latency_ms: 640, avg_cost_usd: 0.0022, samples: 200 },
    ],
    winner_variant_id: "var_ds",
    created_at: iso(60 * 8),
    started_at: iso(60 * 8),
    completed_at: iso(60 * 7.9),
  },
  {
    id: "exp_support_prompt",
    name: "客服应答：长 prompt vs 短 prompt",
    description: "验证压缩后的系统提示是否损失质量",
    dataset_id: "ds_support_qa",
    evaluator_id: "ev_task_completion",
    status: "draft",
    variants: [
      { id: "var_long", name: "long-prompt", model: "deepseek-v3", prompt_ref: "prompt-support-long", weight: 0.5 },
      { id: "var_short", name: "short-prompt", model: "deepseek-v3", prompt_ref: "prompt-support-short", weight: 0.5 },
    ],
    metrics: [],
    winner_variant_id: null,
    created_at: iso(60 * 30),
    started_at: null,
    completed_at: null,
  },
];

export const mockExperimentResults: Record<string, {
  experiment_id: string;
  status: string;
  winner_variant_id: string | null;
  metrics: Experiment["metrics"];
}> = {
  exp_invoice_compare: {
    experiment_id: "exp_invoice_compare",
    status: "completed",
    winner_variant_id: "var_ds",
    metrics: mockExperiments[0].metrics,
  },
  exp_support_prompt: {
    experiment_id: "exp_support_prompt",
    status: "completed",
    winner_variant_id: "var_short",
    metrics: [
      { variant_id: "var_long", accuracy: 0.86, avg_latency_ms: 930, avg_cost_usd: 0.0042, samples: 120 },
      { variant_id: "var_short", accuracy: 0.9, avg_latency_ms: 610, avg_cost_usd: 0.0021, samples: 120 },
    ],
  },
};
