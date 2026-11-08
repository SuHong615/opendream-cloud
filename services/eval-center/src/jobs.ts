// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash } from "node:crypto";
import type { EvalCaseResult, EvalDatasetVersion, EvalRun, Evaluator, EvaluatorSummary, RunMetrics } from "./core";

export interface SubmitRunInput {
  run: EvalRun;
  datasetVersion: EvalDatasetVersion;
  runnerImageDigest: string;
  evaluators?: Evaluator[];
}

export interface SubmitRunOutput {
  status: EvalRun["status"];
  metrics: RunMetrics;
  results: EvalCaseResult[];
  evaluatorSummary: EvaluatorSummary[];
  finishedAt: string;
}

/** Job 调度接口：G5 集成时提供 K8s Job 实现（RuntimeClass=sandbox-runtime、禁网）。 */
export interface JobScheduler {
  submit(input: SubmitRunInput): Promise<SubmitRunOutput>;
  cancel(runId: string): void;
}

/** Mock：同步完成，确定性 pass/fail；env_fingerprint 由数据+镜像 digest 计算。 */
export class MockJobScheduler implements JobScheduler {
  readonly canceled = new Set<string>();

  constructor(private readonly now: () => Date) {}

  cancel(runId: string): void {
    this.canceled.add(runId);
  }

  async submit(input: SubmitRunInput): Promise<SubmitRunOutput> {
    const total = input.datasetVersion.cases_count;
    const failed = Math.max(1, Math.floor(total / 20));
    const passed = Math.max(0, total - failed);
    const evaluators = input.evaluators ?? [];
    const results: EvalCaseResult[] = [];
    for (let index = 0; index < total; index += 1) {
      const isPass = index < passed;
      const evaluatorScores: EvalCaseResult["evaluator_scores"] = {};
      for (const evaluator of evaluators) {
        const score =
          evaluator.metric === "correctness"
            ? isPass
              ? 1
              : 0
            : evaluator.metric === "faithfulness"
              ? isPass
                ? 0.95
                : 0.4
              : evaluator.metric === "task_completion"
                ? isPass
                  ? 0.92
                  : 0.35
                : evaluator.metric === "tool_usage"
                  ? isPass
                    ? 0.9
                    : 0.5
                  : isPass
                    ? 0.85
                    : 0.45;
        evaluatorScores[evaluator.name] = { score: Number(score.toFixed(4)), status: "ok" };
      }
      results.push({
        id: `${input.run.id}-case-${index + 1}`,
        run_id: input.run.id,
        org_id: input.run.org_id,
        case_id: `case-${String(index + 1).padStart(3, "0")}`,
        status: isPass ? "pass" : "fail",
        score: isPass ? 1 : 0,
        evaluator_scores: evaluatorScores,
        latency_ms: 1000 + index * 10,
        tokens: { input: 1000, output: 200 },
        cost_usd: 0.001,
        created_at: this.now().toISOString(),
      });
    }
    const evaluatorSummary: EvaluatorSummary[] = evaluators.map((evaluator) => {
      const scores = results.map((result) => result.evaluator_scores[evaluator.name]?.score ?? 0);
      const threshold = typeof evaluator.config.threshold === "number" ? evaluator.config.threshold : 0.8;
      const average = scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return {
        evaluator_id: evaluator.id,
        name: evaluator.name,
        kind: evaluator.kind,
        pass_rate: total === 0 ? 0 : Number((scores.filter((score) => score >= threshold).length / total).toFixed(4)),
        avg_score: Number(average.toFixed(4)),
        status: "ok",
      };
    });
    const metrics: RunMetrics = {
      total,
      passed,
      failed,
      pass_rate: total === 0 ? 0 : Number((passed / total).toFixed(4)),
      p50_latency_ms: 1050,
      cost_usd: Number((total * 0.001).toFixed(6)),
      tokens_total: total * 1200,
    };
    return { status: "completed", metrics, results, evaluatorSummary, finishedAt: this.now().toISOString() };
  }
}

export function envFingerprint(parts: { datasetHash: string; runnerImageDigest: string; specDigest?: string }): string {
  return `sha256:${createHash("sha256")
    .update([parts.datasetHash, parts.runnerImageDigest, parts.specDigest ?? ""].join("|"))
    .digest("hex")}`;
}
