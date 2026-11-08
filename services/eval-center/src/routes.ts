// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "./context";
import type {
  EvalBaseline,
  EvalCaseResult,
  EvalDataset,
  EvalDatasetVersion,
  EvalRun,
  EvalSpec,
  Evaluator,
} from "./core";
import { principalOf } from "./core";
import { envFingerprint, type SubmitRunOutput } from "./jobs";
import { badRequest, conflict, forbidden, notFound, pageOf } from "./lib/errors";

export interface RouteSpec {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  operationId: string;
}

export const ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/api/v1/eval-datasets", operationId: "listEvalDatasets" },
  { method: "POST", path: "/api/v1/eval-datasets", operationId: "createEvalDataset" },
  { method: "GET", path: "/api/v1/eval-datasets/:datasetId", operationId: "getEvalDataset" },
  { method: "GET", path: "/api/v1/eval-datasets/:datasetId/versions", operationId: "listEvalDatasetVersions" },
  { method: "GET", path: "/api/v1/eval-runs", operationId: "listEvalRuns" },
  { method: "POST", path: "/api/v1/eval-runs", operationId: "createEvalRun" },
  { method: "GET", path: "/api/v1/eval-runs/:runId", operationId: "getEvalRun" },
  { method: "GET", path: "/api/v1/eval-runs/:runId/results", operationId: "listEvalResults" },
  { method: "POST", path: "/api/v1/eval-runs/:runId/cancel", operationId: "cancelEvalRun" },
  { method: "GET", path: "/api/v1/eval-runs/:runId/report", operationId: "getEvalRunReport" },
  { method: "GET", path: "/api/v1/eval-runs/:runId/baselines", operationId: "listEvalBaselines" },
  { method: "POST", path: "/api/v1/eval-runs/:runId/baselines", operationId: "createEvalBaseline" },
  // MVP extension（M5-1；openapi 1.1.0 未定义 evaluator 资源）
  { method: "GET", path: "/api/v1/eval-evaluators", operationId: "listEvalEvaluators" },
  { method: "POST", path: "/api/v1/eval-evaluators", operationId: "createEvalEvaluator" },
  { method: "GET", path: "/api/v1/eval-evaluators/:evaluatorId", operationId: "getEvalEvaluator" },
  { method: "PATCH", path: "/api/v1/eval-evaluators/:evaluatorId", operationId: "updateEvalEvaluator" },
  { method: "DELETE", path: "/api/v1/eval-evaluators/:evaluatorId", operationId: "deleteEvalEvaluator" },
];

export const OPERATIONAL_ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/healthz", operationId: "healthz" },
  { method: "GET", path: "/readyz", operationId: "readyz" },
  { method: "GET", path: "/api/v1/health", operationId: "serviceHealth" },
];

const pageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });

function datasetOf(ctx: AppContext, orgId: string, datasetId: string): EvalDataset {
  const dataset = ctx.store.datasets.get(datasetId);
  if (!dataset || dataset.org_id !== orgId) throw notFound("dataset not found");
  return dataset;
}

function runOf(ctx: AppContext, orgId: string, runId: string): EvalRun {
  const run = ctx.store.runs.get(runId);
  if (!run || run.org_id !== orgId) throw notFound("run not found");
  return run;
}

function reportView(ctx: AppContext, run: EvalRun, compareTo?: EvalRun): Record<string, unknown> {
  const metrics = run.metrics;
  const failedTop5 = (ctx.store.results.get(run.id) ?? [])
    .filter((result) => result.status !== "pass")
    .slice(0, 5)
    .map((result) => ({ case_id: result.case_id, status: result.status }));
  const deltas = compareTo && metrics && compareTo.metrics
    ? {
        pass_rate: Number((metrics.pass_rate - compareTo.metrics.pass_rate).toFixed(4)),
        p50_latency_ms: metrics.p50_latency_ms - compareTo.metrics.p50_latency_ms,
        cost_usd: Number((metrics.cost_usd - compareTo.metrics.cost_usd).toFixed(6)),
      }
    : null;
  return {
    run_id: run.id,
    dataset_id: run.dataset_id,
    dataset_version_id: run.dataset_version_id,
    status: run.status,
    env_fingerprint: run.env_fingerprint,
    metrics,
    evaluators: run.evaluator_summary,
    failed_top5: failedTop5,
    compare_to: compareTo?.id ?? null,
    deltas,
    created_at: run.created_at,
  };
}

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/healthz", async () => ({ status: "ok", version: ctx.version }));
  app.get("/readyz", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({ status: "ok", service: "eval-center", version: ctx.version }));

  // ---------------- Evaluators（M5-1，MVP extension） ----------------
  const evaluatorCreate = z.object({
    name: z.string().min(2).max(64),
    display_name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    type: z.enum(["llm_judge", "human", "exact_match", "regex", "custom"]).optional(),
    metric: z.enum(["correctness", "faithfulness", "task_completion", "tool_usage", "custom"]).default("custom"),
    prompt: z.string().min(1).max(8000).optional(),
    rubric: z.string().max(8000).nullable().optional(),
    model_ref: z.string().max(120).nullable().optional(),
    config: z.record(z.unknown()).optional(),
  });
  const evaluatorUpdate = z.object({
    display_name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    prompt: z.string().min(1).max(8000).optional(),
    rubric: z.string().max(8000).nullable().optional(),
    model_ref: z.string().max(120).nullable().optional(),
    config: z.record(z.unknown()).optional(),
  });

  app.get("/api/v1/eval-evaluators", async (request) => {
    const principal = principalOf(request, ctx.env);
    return { items: ctx.store.visibleEvaluators(principal.org_id), next_cursor: null };
  });

  app.get("/api/v1/eval-evaluators/:evaluatorId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { evaluatorId } = z.object({ evaluatorId: z.string() }).parse(request.params);
    const evaluator = ctx.store.evaluatorOf(principal.org_id, evaluatorId);
    if (!evaluator) throw notFound("evaluator not found");
    return evaluator;
  });

  app.post("/api/v1/eval-evaluators", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = evaluatorCreate.parse(request.body ?? {});
    if ([...ctx.store.evaluators.values()].some((item) => item.org_id === principal.org_id && item.name === body.name)) {
      throw conflict("evaluator name already exists", { name: body.name });
    }
    const now = ctx.now().toISOString();
    const evaluator: Evaluator = {
      id: ctx.newId(),
      org_id: principal.org_id,
      name: body.name,
      display_name: body.display_name ?? body.name,
      description: body.description ?? "",
      kind: "custom",
      metric: body.metric,
      prompt: body.prompt ?? String((body.config?.prompt as string | undefined) ?? "score the output"),
      rubric: body.rubric ?? null,
      model_ref: body.model_ref ?? "default-judge",
      config: body.config ?? {},
      is_preset: false,
      created_at: now,
      updated_at: now,
    };
    ctx.store.evaluators.set(evaluator.id, evaluator);
    return reply.code(201).send(evaluator);
  });

  app.patch("/api/v1/eval-evaluators/:evaluatorId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { evaluatorId } = z.object({ evaluatorId: z.string() }).parse(request.params);
    const evaluator = ctx.store.evaluatorOf(principal.org_id, evaluatorId);
    if (!evaluator) throw notFound("evaluator not found");
    if (evaluator.is_preset) throw forbidden("preset evaluators are read-only");
    const body = evaluatorUpdate.parse(request.body ?? {});
    Object.assign(evaluator, body, { updated_at: ctx.now().toISOString() });
    return evaluator;
  });

  app.delete("/api/v1/eval-evaluators/:evaluatorId", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { evaluatorId } = z.object({ evaluatorId: z.string() }).parse(request.params);
    const evaluator = ctx.store.evaluatorOf(principal.org_id, evaluatorId);
    if (!evaluator) throw notFound("evaluator not found");
    if (evaluator.is_preset) throw forbidden("preset evaluators are read-only");
    ctx.store.evaluators.delete(evaluator.id);
    return reply.code(204).send();
  });

  app.get("/api/v1/eval-datasets", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = pageQuery.parse(request.query);
    const items = [...ctx.store.datasets.values()]
      .filter((dataset) => dataset.org_id === principal.org_id || dataset.visibility === "public")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return pageOf(items, query.cursor, query.limit, (item) => item.id);
  });

  app.post("/api/v1/eval-datasets", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = z
      .object({
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/).optional(),
        name: z.string().min(1).max(120),
        description: z.string().max(1000).optional(),
        visibility: z.enum(["org", "public"]).default("org"),
        version: z.string().default("1.0.0"),
        cases_count: z.coerce.number().int().min(0).max(100000).optional(),
        samples: z.array(z.record(z.unknown())).max(10000).optional(),
      })
      .parse(request.body);
    const slug = body.slug ?? `qa-${Date.now().toString(36)}`;
    const casesCount = body.samples?.length ?? body.cases_count ?? 10;
    if (ctx.store.datasetBySlug(principal.org_id, slug)) throw conflict("dataset slug already exists", { slug });
    const now = ctx.now().toISOString();
    const dataset: EvalDataset = {
      id: ctx.newId(),
      org_id: principal.org_id,
      slug,
      name: body.name,
      description: body.description ?? null,
      visibility: body.visibility,
      created_at: now,
    };
    ctx.store.datasets.set(dataset.id, dataset);
    const version: EvalDatasetVersion = {
      id: ctx.newId(),
      dataset_id: dataset.id,
      org_id: dataset.org_id,
      version: body.version,
      content_hash: `sha256:${createHash("sha256").update(`${dataset.id}:${body.version}:${casesCount}`).digest("hex")}`,
      cases_count: casesCount,
      immutable: true,
      created_at: now,
    };
    ctx.store.datasetVersions.set(version.id, version);
    return reply.code(201).send(dataset);
  });

  app.get("/api/v1/eval-datasets/:datasetId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { datasetId } = z.object({ datasetId: z.string() }).parse(request.params);
    return datasetOf(ctx, principal.org_id, datasetId);
  });

  app.get("/api/v1/eval-datasets/:datasetId/versions", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { datasetId } = z.object({ datasetId: z.string() }).parse(request.params);
    const dataset = datasetOf(ctx, principal.org_id, datasetId);
    const query = pageQuery.parse(request.query);
    const items = ctx.store.versionsOf(dataset.id);
    return pageOf(items, query.cursor, query.limit, (item) => item.id);
  });

  app.get("/api/v1/eval-runs", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = z
      .object({
        status: z.string().optional(),
        target_type: z.string().optional(),
        dataset_id: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(request.query);
    const items = [...ctx.store.runs.values()]
      .filter((run) => run.org_id === principal.org_id)
      .filter((run) => (query.status ? run.status === query.status : true))
      .filter((run) => (query.target_type ? run.target_type === query.target_type : true))
      .filter((run) => (query.dataset_id ? run.dataset_id === query.dataset_id : true))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return pageOf(items, query.cursor, query.limit, (item) => item.id);
  });

  app.post("/api/v1/eval-runs", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = z
      .object({
        dataset_version_id: z.string().uuid().optional(),
        dataset_id: z.string().uuid().optional(),
        name: z.string().max(120).optional(),
        model: z.string().max(200).optional(),
        target_type: z.enum(["skill", "model", "app", "agent"]).default("skill"),
        target_ref: z.record(z.unknown()).default({}),
        trigger: z.enum(["manual", "ci", "publish_gate"]).default("manual"),
        evaluator_ids: z.array(z.string()).max(20).optional(),
      })
      .parse(request.body);
    const datasetVersion = body.dataset_version_id
      ? ctx.store.datasetVersions.get(body.dataset_version_id)
      : body.dataset_id
        ? ctx.store.versionsOf(body.dataset_id).at(-1)
        : undefined;
    if (!datasetVersion || datasetVersion.org_id !== principal.org_id) throw notFound("dataset version not found");
    const allEvaluators = ctx.store.visibleEvaluators(principal.org_id);
    const selectedEvaluators = (body.evaluator_ids?.length ? body.evaluator_ids : allEvaluators.map((item) => item.id)).map((id) => {
      const evaluator = ctx.store.evaluatorOf(principal.org_id, id);
      if (!evaluator) throw notFound(`evaluator not found: ${id}`);
      return evaluator;
    });
    const now = ctx.now();
    const run: EvalRun = {
      id: ctx.newId(),
      org_id: principal.org_id,
      dataset_id: datasetVersion.dataset_id,
      dataset_version_id: datasetVersion.id,
      name: body.name ?? `eval-${ctx.newId().slice(0, 8)}`,
      status: "queued",
      trigger: body.trigger,
      target_type: body.target_type,
      target_ref: body.target_ref,
      env_fingerprint: envFingerprint({ datasetHash: datasetVersion.content_hash, runnerImageDigest: ctx.env.RUNNER_IMAGE_DIGEST }),
      metrics: null,
      evaluator_ids: selectedEvaluators.map((item) => item.id),
      evaluator_summary: [],
      error: null,
      created_at: now.toISOString(),
      started_at: null,
      finished_at: null,
    };
    ctx.store.runs.set(run.id, run);
    run.status = "running";
    run.started_at = ctx.now().toISOString();
    const output: SubmitRunOutput = await ctx.scheduler.submit({ run, datasetVersion, runnerImageDigest: ctx.env.RUNNER_IMAGE_DIGEST, evaluators: selectedEvaluators });
    run.status = output.status;
    run.metrics = output.metrics;
    run.evaluator_summary = output.evaluatorSummary;
    run.finished_at = output.finishedAt;
    ctx.store.results.set(run.id, output.results);
    return reply.code(202).send(run);
  });

  app.get("/api/v1/eval-runs/:runId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    return runOf(ctx, principal.org_id, runId);
  });

  app.get("/api/v1/eval-runs/:runId/results", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = runOf(ctx, principal.org_id, runId);
    const query = pageQuery.parse(request.query);
    const items = ctx.store.results.get(run.id) ?? [];
    return pageOf(items, query.cursor, query.limit, (item) => item.case_id);
  });

  app.post("/api/v1/eval-runs/:runId/cancel", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = runOf(ctx, principal.org_id, runId);
    if (["completed", "failed", "canceled", "timed_out"].includes(run.status)) {
      throw conflict("run already finished", { status: run.status });
    }
    ctx.scheduler.cancel(run.id);
    run.status = "canceled";
    run.finished_at = ctx.now().toISOString();
    return run;
  });

  app.get("/api/v1/eval-runs/:runId/report", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const query = z.object({ compare_to: z.string().optional() }).parse(request.query);
    const run = runOf(ctx, principal.org_id, runId);
    const compareTo = query.compare_to ? runOf(ctx, principal.org_id, query.compare_to) : undefined;
    if (compareTo && compareTo.dataset_version_id !== run.dataset_version_id) {
      throw badRequest("compare runs must share dataset version", { run: run.id, compare_to: compareTo.id });
    }
    return reportView(ctx, run, compareTo);
  });

  app.get("/api/v1/eval-runs/:runId/baselines", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = runOf(ctx, principal.org_id, runId);
    return {
      items: [...ctx.store.baselines.values()].filter((baseline) => baseline.run_id === run.id),
      next_cursor: null,
    };
  });

  app.post("/api/v1/eval-runs/:runId/baselines", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const body = z.object({ name: z.string().max(120).optional() }).parse(request.body ?? {});
    const run = runOf(ctx, principal.org_id, runId);
    if (run.status !== "completed" || !run.metrics) throw badRequest("baseline requires a completed run", { status: run.status });
    const baseline: EvalBaseline = {
      id: ctx.newId(),
      org_id: principal.org_id,
      run_id: run.id,
      dataset_id: run.dataset_id,
      name: body.name ?? null,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.baselines.set(baseline.id, baseline);
    return reply.code(201).send(baseline);
  });
}

export function registerInternalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/internal/eval/specs", async (request) => {
    const principal = principalOf(request, ctx.env);
    return { items: [...ctx.store.specs.values()].filter((spec) => spec.org_id === principal.org_id), next_cursor: null };
  });

  app.post("/internal/eval/specs", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = z.object({ name: z.string().min(1), spec: z.record(z.unknown()) }).parse(request.body);
    const spec: EvalSpec = {
      id: ctx.newId(),
      org_id: principal.org_id,
      name: body.name,
      spec: body.spec,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.specs.set(spec.id, spec);
    return reply.code(201).send(spec);
  });

  app.get("/internal/eval/compare", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = z.object({ base: z.string(), candidate: z.string() }).parse(request.query);
    const base = runOf(ctx, principal.org_id, query.base);
    const candidate = runOf(ctx, principal.org_id, query.candidate);
    if (base.dataset_version_id !== candidate.dataset_version_id) throw badRequest("runs share no dataset version");
    const baseMetrics = base.metrics;
    const candidateMetrics = candidate.metrics;
    if (!baseMetrics || !candidateMetrics) throw badRequest("compare requires completed runs");
    return {
      base_run_id: base.id,
      candidate_run_id: candidate.id,
      pass_rate_delta: Number((candidateMetrics.pass_rate - baseMetrics.pass_rate).toFixed(4)),
      p50_latency_delta: candidateMetrics.p50_latency_ms - baseMetrics.p50_latency_ms,
      cost_delta: Number((candidateMetrics.cost_usd - baseMetrics.cost_usd).toFixed(6)),
    };
  });

  app.post("/internal/eval/gates/skill", async (request) => {
    const principal = principalOf(request, ctx.env);
    const body = z.object({ version_id: z.string(), run_id: z.string().optional(), min_pass_rate: z.coerce.number().min(0).max(1).default(0.9) }).parse(request.body);
    const runs = [...ctx.store.runs.values()]
      .filter((run) => run.org_id === principal.org_id && run.status === "completed")
      .filter((run) => (body.run_id ? run.id === body.run_id : true))
      .filter((run) => run.target_ref.version_id === body.version_id || !run.target_ref.version_id);
    const run = runs.at(-1);
    if (!run || !run.metrics) return { passed: false, run_id: null, reasons: ["no completed eval run found"] };
    const reasons: string[] = [];
    if (run.metrics.pass_rate < body.min_pass_rate) reasons.push(`pass_rate_below_${body.min_pass_rate}`);
    if (run.metrics.failed > 0 && run.metrics.pass_rate < body.min_pass_rate) reasons.push("has_failed_cases");
    return { passed: reasons.length === 0, run_id: run.id, reasons, pass_rate: run.metrics.pass_rate };
  });

  app.get("/internal/eval/runs/:runId/reproduce", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = runOf(ctx, principal.org_id, runId);
    return { run_id: run.id, env_fingerprint: run.env_fingerprint, dataset_version_id: run.dataset_version_id, reproduce_yaml: `run_id: ${run.id}\n` };
  });

  app.post("/internal/eval/webhooks/ci", async (request) => {
    const body = z.object({ provider: z.string().default("manual"), repo: z.string().optional(), pr_number: z.number().optional(), run_id: z.string().optional() }).parse(request.body ?? {});
    return { accepted: true, provider: body.provider, run_id: body.run_id ?? null };
  });
}

export const INTERNAL_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/internal/eval/specs" },
  { method: "GET", path: "/internal/eval/specs" },
  { method: "GET", path: "/internal/eval/compare" },
  { method: "POST", path: "/internal/eval/gates/skill" },
  { method: "GET", path: "/internal/eval/runs/:runId/reproduce" },
  { method: "POST", path: "/internal/eval/webhooks/ci" },
];

export function randomCaseId(): string {
  return `case-${randomUUID().slice(0, 8)}`;
}
