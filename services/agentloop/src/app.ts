// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { assertOwner } from "@opendream-cloud/contracts";
import { AgentLoopStore } from "./store";

interface BuildOptions { store?: AgentLoopStore; dbPath?: string }

const traceBody = z.object({
  trace_id: z.string().min(1),
  run_id: z.string().min(1),
  status: z.enum(["ok", "error"]).default("ok"),
  spans: z.array(z.object({ name: z.string(), status: z.enum(["ok", "error"]).default("ok"), duration_ms: z.number().optional(), attributes: z.record(z.unknown()).optional() })).default([]),
});
const evalBody = z.object({
  name: z.string().min(1).max(200),
  cases: z.array(z.object({ trace_id: z.string(), expected_status: z.enum(["ok", "error"]).optional() })).min(1),
});
const gateBody = z.object({ name: z.string().min(1).max(200), min_score: z.number().min(0).max(1).default(0.9) });

function principal(request: FastifyRequest): { orgId: string; userId: string } {
  const orgId = String(request.headers["x-oc-org-id"] ?? "");
  const userId = String(request.headers["x-oc-user-id"] ?? "");
  if (!orgId || !userId) throw Object.assign(new Error("missing principal"), { statusCode: 401, code: "unauthorized" });
  return { orgId, userId };
}
function idempotency(request: FastifyRequest): string {
  const key = String(request.headers["idempotency-key"] ?? "");
  if (!key) throw Object.assign(new Error("Idempotency-Key required"), { statusCode: 400, code: "validation_failed" });
  return key;
}

export function buildApp(options: BuildOptions = {}): FastifyInstance {
  const store = options.store ?? new AgentLoopStore(options.dbPath ?? process.env.DATABASE_PATH ?? ":memory:");
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: { code: (error as { code?: string }).code ?? (status === 404 ? "not_found" : "validation_failed"), message: error instanceof Error ? error.message : "unknown error", request_id: String(request.headers["x-request-id"] ?? "") } });
  });
  app.get("/healthz", async () => ({ status: "ok", service: "agentloop" }));
  app.get("/readyz", async () => ({ status: "ok" }));

  app.post("/api/v1/quality/traces", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    assertOwner("trace", "agentloop");
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = traceBody.parse(request.body ?? {});
    const trace = store.upsertTrace({ orgId: user.orgId, traceId: body.trace_id, runId: body.run_id, status: body.status, spans: body.spans });
    store.setIdempotent(user.orgId, key, trace);
    return reply.code(201).send(trace);
  });

  app.get("/api/v1/quality/traces/:traceId", async (request) => {
    const user = principal(request);
    const { traceId } = z.object({ traceId: z.string() }).parse(request.params);
    const trace = store.getTrace(user.orgId, traceId);
    if (!trace) throw Object.assign(new Error("trace not found"), { statusCode: 404 });
    return trace;
  });

  app.get("/api/v1/quality/traces", async (request) => ({ items: store.listTraces(principal(request).orgId) }));

  app.post("/api/v1/quality/eval-runs", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    assertOwner("eval_run", "agentloop");
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = evalBody.parse(request.body ?? {});
    const evalRun = store.createEvalRun({ orgId: user.orgId, name: body.name, cases: body.cases });
    store.setIdempotent(user.orgId, key, evalRun);
    return reply.code(201).send(evalRun);
  });

  app.get("/api/v1/quality/eval-runs", async (request) => ({ items: store.listEvalRuns(principal(request).orgId) }));

  app.post("/api/v1/quality/backtests", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = evalBody.parse(request.body ?? {});
    const result = store.createEvalRun({ orgId: user.orgId, name: `backtest:${body.name}`, cases: body.cases });
    store.setIdempotent(user.orgId, key, result);
    return reply.code(201).send({ ...result, kind: "backtest" });
  });

  app.post("/api/v1/quality/gates", async (request, reply) => {
    const user = principal(request);
    assertOwner("quality_gate", "agentloop");
    const body = gateBody.parse(request.body ?? {});
    return reply.code(201).send(store.createGate({ orgId: user.orgId, name: body.name, minScore: body.min_score }));
  });
  app.get("/api/v1/quality/gates", async (request) => ({ items: store.listGates(principal(request).orgId) }));

  app.get("/api/v1/quality/summary", async (request) => {
    const orgId = principal(request).orgId;
    return { traces: store.listTraces(orgId).length, eval_runs: store.listEvalRuns(orgId).length, gates: store.listGates(orgId).length };
  });

  app.addHook("onClose", async () => { store.close(); });
  return app;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4112);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = buildApp();
  await app.listen({ host, port });
  console.log(`[agentloop] listening on http://${host}:${port}`);
}
