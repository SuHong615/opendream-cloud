// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * Experiment Center（M10）：模型 / Prompt / Agent 版本的 A/B 对比实验。
 * MVP 内存 store；生产 PostgreSQL + eval-center 真实评测。
 */
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";

const VERSION = "0.1.0-m7";
const PORT = Number(process.env.PORT ?? 4108);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEFAULT_ORG = process.env.DEFAULT_ORG_ID ?? "00000000-0000-4000-8000-000000000001";

type Variant = { id: string; name: string; model: string; prompt_ref: string | null; weight: number };
type Metric = { variant_id: string; accuracy: number; avg_latency_ms: number; avg_cost_usd: number; samples: number };
type Status = "draft" | "running" | "completed" | "failed";

interface Experiment {
  id: string;
  org_id: string;
  name: string;
  description: string;
  dataset_id: string;
  evaluator_id: string | null;
  status: Status;
  variants: Variant[];
  metrics: Metric[];
  winner_variant_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const experiments = new Map<string, Experiment>();
const now = () => new Date().toISOString();
const rid = (p: string) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const variant = (name: string, model: string, promptRef: string | null = null, weight = 0.5): Variant => ({ id: rid("var"), name, model, prompt_ref: promptRef, weight });

function seed(org: string): Experiment[] {
  return [
    {
      id: rid("exp"), org_id: org, name: "发票助手：DeepSeek vs 通义", description: "对比两个模型在发票抽取数据集上的准确率/延迟/成本",
      dataset_id: "ds_invoice_gold", evaluator_id: "ev_correctness", status: "completed",
      variants: [variant("DeepSeek-V3", "deepseek-v3", "prompt-invoice-extract", 0.5), variant("Qwen-Max", "qwen-max", "prompt-invoice-extract", 0.5)],
      metrics: [
        { variant_id: "", accuracy: 0.94, avg_latency_ms: 820, avg_cost_usd: 0.0031, samples: 200 },
        { variant_id: "", accuracy: 0.89, avg_latency_ms: 640, avg_cost_usd: 0.0022, samples: 200 },
      ],
      winner_variant_id: null, created_at: "2026-11-08T00:00:00.000Z", started_at: "2026-11-08T00:00:00.000Z", completed_at: "2026-11-08T00:05:00.000Z",
    },
    {
      id: rid("exp"), org_id: org, name: "客服应答：长 prompt vs 短 prompt", description: "验证压缩后的系统提示是否损失质量",
      dataset_id: "ds_support_qa", evaluator_id: "ev_task_completion", status: "draft",
      variants: [variant("long-prompt", "deepseek-v3", "prompt-support-long", 0.5), variant("short-prompt", "deepseek-v3", "prompt-support-short", 0.5)],
      metrics: [], winner_variant_id: null, created_at: "2026-11-08T00:00:00.000Z", started_at: null, completed_at: null,
    },
  ];
}
const SEED = seed("system");
for (const experiment of SEED) {
  experiment.metrics.forEach((metric, index) => {
    const target = experiment.variants[index];
    if (target) metric.variant_id = target.id;
  });
  if (experiment.metrics.length > 0) {
    experiment.winner_variant_id = [...experiment.metrics].sort((a, b) => b.accuracy - a.accuracy)[0]?.variant_id ?? null;
  }
  experiments.set(experiment.id, experiment);
}

function visible(org: string): Experiment[] {
  return [...experiments.values()].filter((experiment) => experiment.org_id === "system" || experiment.org_id === org);
}
function required(org: string, id: string): Experiment {
  const experiment = experiments.get(id);
  if (!experiment || (experiment.org_id !== "system" && experiment.org_id !== org)) {
    throw Object.assign(new Error("experiment not found"), { status: 404 });
  }
  return experiment;
}
function principal(request: FastifyRequest) {
  const header = (name: string) => (typeof request.headers[name] === "string" ? (request.headers[name] as string) : undefined);
  return { org: header("x-oc-org-id") ?? DEFAULT_ORG, user: header("x-oc-user-id") ?? "system", roles: (header("x-oc-roles") ?? "owner").split(",") };
}
function compute(experiment: Experiment): void {
  if (experiment.status === "running") return;
  experiment.status = "running";
  experiment.started_at = now();
  const metrics = experiment.variants.map((item, index) => {
    const base = 0.82 + index * 0.03 + (item.name.length % 7) * 0.01;
    return {
      variant_id: item.id,
      accuracy: Number(Math.min(0.99, base).toFixed(3)),
      avg_latency_ms: 500 + ((item.model.length * 37) % 900),
      avg_cost_usd: Number((0.0015 + ((item.model.length * 13) % 30) / 10000).toFixed(4)),
      samples: 120 + index * 40,
    };
  });
  experiment.metrics = metrics;
  const best = [...metrics].sort((a, b) => b.accuracy - a.accuracy || a.avg_cost_usd - b.avg_cost_usd)[0];
  experiment.winner_variant_id = best?.variant_id ?? null;
  experiment.status = "completed";
  experiment.completed_at = now();
}

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
app.addHook("onRequest", async (request, reply) => {
  reply.header("x-request-id", typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : crypto.randomUUID());
});
app.setErrorHandler((error, request, reply) => {
  const status = (error as { status?: number }).status ?? 500;
  return reply.code(status).send({ error: { code: status === 404 ? "not_found" : "validation_failed", message: error.message, request_id: String(request.headers["x-request-id"] ?? "") } });
});

app.get("/healthz", async () => ({ status: "ok", service: "experiment-center", version: VERSION, experiments: experiments.size }));
app.get("/readyz", async () => ({ status: "ok" }));
app.get("/api/v1/experiments", async (request) => ({ items: visible(principal(request).org) }));
app.post("/api/v1/experiments", async (request, reply) => {
  const p = principal(request);
  const body = z.object({
    name: z.string().min(1).max(160),
    description: z.string().max(2000).default(""),
    dataset_id: z.string().min(1),
    evaluator_id: z.string().nullable().optional(),
    variants: z.array(z.object({ name: z.string().min(1), model: z.string().min(1), prompt_ref: z.string().nullable().optional(), weight: z.number().min(0).max(1).default(0.5) })).min(2).max(8),
  }).parse(request.body ?? {});
  const experiment: Experiment = {
    id: rid("exp"), org_id: p.org, name: body.name, description: body.description, dataset_id: body.dataset_id,
    evaluator_id: body.evaluator_id ?? null, status: "draft",
    variants: body.variants.map((item) => variant(item.name, item.model, item.prompt_ref ?? null, item.weight)),
    metrics: [], winner_variant_id: null, created_at: now(), started_at: null, completed_at: null,
  };
  experiments.set(experiment.id, experiment);
  return reply.code(201).send(experiment);
});
app.get("/api/v1/experiments/:experimentId", async (request) => {
  const { experimentId } = request.params as { experimentId: string };
  return required(principal(request).org, experimentId);
});
app.post("/api/v1/experiments/:experimentId/start", async (request) => {
  const { experimentId } = request.params as { experimentId: string };
  const experiment = required(principal(request).org, experimentId);
  compute(experiment);
  return experiment;
});
app.get("/api/v1/experiments/:experimentId/results", async (request) => {
  const { experimentId } = request.params as { experimentId: string };
  const experiment = required(principal(request).org, experimentId);
  return { experiment_id: experiment.id, status: experiment.status, winner_variant_id: experiment.winner_variant_id, metrics: experiment.metrics };
});
app.delete("/api/v1/experiments/:experimentId", async (request, reply) => {
  const { experimentId } = request.params as { experimentId: string };
  const experiment = required(principal(request).org, experimentId);
  experiments.delete(experiment.id);
  return reply.code(204).send();
});

await app.listen({ host: HOST, port: PORT });
console.log(`[experiment-center] listening on http://${HOST}:${PORT}`);
