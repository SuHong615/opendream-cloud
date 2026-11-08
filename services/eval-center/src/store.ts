// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { randomUUID } from "node:crypto";
import type {
  EvalBaseline,
  EvalCaseResult,
  EvalDataset,
  EvalDatasetVersion,
  EvalRun,
  EvalSpec,
  Evaluator,
} from "./core";

export const PRESET_EVALUATORS: ReadonlyArray<Omit<Evaluator, "id" | "created_at" | "updated_at">> = [
  {
    org_id: null,
    name: "correctness",
    display_name: "正确性",
    description: "答案与期望结果/参考答案的一致程度",
    kind: "preset",
    metric: "correctness",
    prompt: "Compare the answer against the reference answer and score correctness from 0 to 1.",
    rubric: "1.0 exact/equally correct; 0.5 partially correct; 0.0 incorrect or unsafe.",
    model_ref: "default-judge",
    config: { threshold: 0.8 },
    is_preset: true,
  },
  {
    org_id: null,
    name: "faithfulness",
    display_name: "忠实度",
    description: "回答是否只依据给定上下文，避免幻觉",
    kind: "preset",
    metric: "faithfulness",
    prompt: "Check whether every claim in the answer is supported by the provided context.",
    rubric: "Penalize unsupported claims; 0 = hallucination, 1 = fully grounded.",
    model_ref: "default-judge",
    config: { threshold: 0.85 },
    is_preset: true,
  },
  {
    org_id: null,
    name: "task-completion",
    display_name: "任务完成度",
    description: "是否完成用户任务与验收标准",
    kind: "preset",
    metric: "task_completion",
    prompt: "Judge whether the answer satisfies the user task and acceptance criteria.",
    rubric: "1.0 all criteria met; 0.5 partial; 0.0 none.",
    model_ref: "default-judge",
    config: { threshold: 0.8 },
    is_preset: true,
  },
  {
    org_id: null,
    name: "tool-usage",
    display_name: "工具使用",
    description: "工具选择、参数与调用顺序是否合理",
    kind: "preset",
    metric: "tool_usage",
    prompt: "Evaluate tool selection, argument correctness and call ordering.",
    rubric: "Penalize unnecessary/unsafe calls and wrong arguments.",
    model_ref: "default-judge",
    config: { threshold: 0.8 },
    is_preset: true,
  },
];

export class Store {
  readonly datasets = new Map<string, EvalDataset>();
  readonly datasetVersions = new Map<string, EvalDatasetVersion>();
  readonly runs = new Map<string, EvalRun>();
  readonly results = new Map<string, EvalCaseResult[]>();
  readonly baselines = new Map<string, EvalBaseline>();
  readonly specs = new Map<string, EvalSpec>();
  readonly evaluators = new Map<string, Evaluator>();

  constructor(now: () => Date = () => new Date(), newId: () => string = () => randomUUID()) {
    const created = now().toISOString();
    for (const preset of PRESET_EVALUATORS) {
      const id = newId();
      this.evaluators.set(id, { ...preset, id, created_at: created, updated_at: created });
    }
  }

  newId(): string {
    return randomUUID();
  }

  datasetBySlug(orgId: string, slug: string): EvalDataset | undefined {
    for (const dataset of this.datasets.values()) {
      if (dataset.org_id === orgId && dataset.slug === slug) return dataset;
    }
    return undefined;
  }

  versionsOf(datasetId: string): EvalDatasetVersion[] {
    return [...this.datasetVersions.values()]
      .filter((version) => version.dataset_id === datasetId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  visibleEvaluators(orgId: string): Evaluator[] {
    return [...this.evaluators.values()].filter((evaluator) => evaluator.org_id === null || evaluator.org_id === orgId).sort((left, right) => left.name.localeCompare(right.name));
  }

  evaluatorOf(orgId: string, id: string): Evaluator | undefined {
    const evaluator = this.evaluators.get(id);
    if (!evaluator) return undefined;
    if (evaluator.org_id !== null && evaluator.org_id !== orgId) return undefined;
    return evaluator;
  }
}
