// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { assertOwner } from "@opendream-cloud/contracts";
import { MockRuntimeProvider, RuntimeStore, type Run, type Session, type RuntimeProvider } from "./store";

interface BuildOptions {
  store?: RuntimeStore;
  provider?: RuntimeProvider;
  dbPath?: string;
}

const sessionBody = z.object({
  workspace: z.object({ mode: z.enum(["cloud", "local"]).default("cloud"), repo: z.string().optional() }).default({ mode: "cloud" }),
  agent: z.record(z.unknown()).default({}),
});
const runBody = z.object({ input: z.string().min(1).max(20000) });

function tenant(request: FastifyRequest): { orgId: string; userId: string } {
  const orgId = String(request.headers["x-oc-org-id"] ?? "");
  const userId = String(request.headers["x-oc-user-id"] ?? "");
  if (!orgId || !userId) throw Object.assign(new Error("missing principal"), { statusCode: 401, code: "unauthorized" });
  return { orgId, userId };
}

function idempotencyKey(request: FastifyRequest): string {
  const key = String(request.headers["idempotency-key"] ?? "");
  if (!key) throw Object.assign(new Error("Idempotency-Key required"), { statusCode: 400, code: "validation_failed" });
  return key;
}

async function execute(store: RuntimeStore, provider: RuntimeProvider, session: Session, run: Run): Promise<Run> {
  run.state = "running";
  store.saveRun(run);
  try {
    const result = await provider.execute(session, run);
    finish(store, run, result);
  } catch (error) {
    run.state = "failed";
    run.completed_at = new Date().toISOString();
    store.saveRun(run);
    throw error;
  }
  return run;
}

function finish(store: RuntimeStore, run: Run, result: { steps: Array<{ type: string; output: string }>; usage: { tokens: number; cost_usd: number } }): void {
  const started = new Date().toISOString();
  run.steps = result.steps.map((step, index) => ({
    id: `step_${index + 1}`,
    run_id: run.id,
    seq: index + 1,
    type: step.type,
    status: "completed",
    output: step.output,
    started_at: started,
    ended_at: new Date().toISOString(),
  }));
  run.usage = result.usage;
  run.state = "succeeded";
  run.completed_at = new Date().toISOString();
  store.saveRun(run);
}

export function buildApp(options: BuildOptions = {}): FastifyInstance {
  const store = options.store ?? new RuntimeStore(options.dbPath ?? process.env.DATABASE_PATH ?? ":memory:");
  const provider: RuntimeProvider = options.provider ?? new MockRuntimeProvider();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({
      error: {
        code: (error as { code?: string }).code ?? (status === 404 ? "not_found" : "validation_failed"),
        message: error instanceof Error ? error.message : "unknown error",
        request_id: String(request.headers["x-request-id"] ?? ""),
      },
    });
  });

  app.get("/healthz", async () => ({ status: "ok", service: "agentcore", provider: provider.id }));
  app.get("/readyz", async () => ({ status: "ok" }));

  app.post("/api/v1/runtime/sessions", async (request, reply) => {
    const principal = tenant(request);
    const key = idempotencyKey(request);
    assertOwner("session", "agentcore");
    const cached = store.getIdempotent(principal.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = sessionBody.parse(request.body ?? {});
    const session = store.createSession({ orgId: principal.orgId, userId: principal.userId, workspaceMode: body.workspace.mode, agent: body.agent });
    store.setIdempotent(principal.orgId, key, session);
    return reply.code(201).send(session);
  });

  app.get("/api/v1/runtime/sessions/:sessionId", async (request) => {
    const principal = tenant(request);
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const session = store.getSession(principal.orgId, sessionId);
    if (!session) throw Object.assign(new Error("session not found"), { statusCode: 404 });
    return session;
  });

  app.post("/api/v1/runtime/sessions/:sessionId/runs", async (request, reply) => {
    const principal = tenant(request);
    const key = idempotencyKey(request);
    assertOwner("run", "agentcore");
    const cached = store.getIdempotent(principal.orgId, key);
    if (cached) return reply.code(202).send(cached);
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const session = store.getSession(principal.orgId, sessionId);
    if (!session) throw Object.assign(new Error("session not found"), { statusCode: 404 });
    const body = runBody.parse(request.body ?? {});
    const run = store.createRun(principal.orgId, session, body.input);
    await execute(store, provider, session, run);
    const current = store.getRun(principal.orgId, run.id) ?? run;
    store.setIdempotent(principal.orgId, key, current);
    return reply.code(202).send(current);
  });

  app.get("/api/v1/runtime/runs/:runId", async (request) => {
    const principal = tenant(request);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = store.getRun(principal.orgId, runId);
    if (!run) throw Object.assign(new Error("run not found"), { statusCode: 404 });
    return run;
  });

  // M2b: one-time legacy import from agent-workforce。只允许迁移，不允许持续双写。
  app.post("/api/v1/runtime/import/legacy-run", async (request, reply) => {
    const principal = tenant(request);
    const key = idempotencyKey(request);
    const cached = store.getIdempotent(principal.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = z.object({
      source: z.string().default("agent-workforce"),
      legacy_run_id: z.string().min(1),
      session_id: z.string().optional(),
      goal: z.string().min(1),
      status: z.string().default("completed"),
      tasks: z.array(z.object({ title: z.string().optional(), employee_name: z.string().optional(), status: z.string().optional(), output: z.string().nullable().optional() })).default([]),
      legacy_data: z.unknown().optional(),
    }).parse(request.body ?? {});
    let session = body.session_id ? store.getSession(principal.orgId, body.session_id) : null;
    const existing = store.findRunByLegacyId(principal.orgId, body.legacy_run_id);
    if (!session && existing) session = store.getSession(principal.orgId, existing.session_id);
    session ??= store.createSession({ orgId: principal.orgId, userId: principal.userId, workspaceMode: "cloud", agent: {}, workspaceId: `legacy_${body.legacy_run_id}` });
    const run = store.importLegacyRun({ orgId: principal.orgId, sessionId: session.id, legacyRunId: body.legacy_run_id, source: body.source, goal: body.goal, status: body.status, tasks: body.tasks, legacyData: body.legacy_data });
    store.setIdempotent(principal.orgId, key, run);
    return reply.code(201).send(run);
  });

  // M2b 灰度读：只暴露 legacy 原始数据，字段与 agent-workforce 保持一致，回滚只需关 flag。
  app.get("/api/v1/runtime/legacy-runs", async (request) => {
    const principal = tenant(request);
    const query = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) }).parse(request.query ?? {});
    assertOwner("run", "agentcore");
    const items = store.listLegacyRuns(principal.orgId, query.limit, query.offset);
    return { items, next_cursor: null, source: "agentcore" };
  });

  app.get("/api/v1/runtime/legacy-runs/:legacyId", async (request) => {
    const principal = tenant(request);
    const { legacyId } = z.object({ legacyId: z.string().min(1) }).parse(request.params);
    assertOwner("run", "agentcore");
    const run = store.getLegacyRun(principal.orgId, legacyId);
    if (!run) throw Object.assign(new Error("legacy run not found"), { statusCode: 404 });
    return run;
  });

  app.post("/api/v1/runtime/runs/:runId/cancel", async (request, reply) => {
    const principal = tenant(request);
    const key = idempotencyKey(request);
    const cached = store.getIdempotent(principal.orgId, key);
    if (cached) return reply.code(202).send(cached);
    const { runId } = z.object({ runId: z.string() }).parse(request.params);
    const run = store.getRun(principal.orgId, runId);
    if (!run) throw Object.assign(new Error("run not found"), { statusCode: 404 });
    if (["succeeded", "failed", "canceled"].includes(run.state)) throw Object.assign(new Error("run is terminal"), { statusCode: 409 });
    run.state = "canceled";
    run.completed_at = new Date().toISOString();
    store.saveRun(run);
    if (provider.cancel) await provider.cancel(run);
    store.setIdempotent(principal.orgId, key, run);
    return reply.code(202).send(run);
  });

  app.addHook("onClose", async () => { store.close(); });
  return app;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4110);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = buildApp();
  await app.listen({ host, port });
  console.log(`[agentcore] listening on http://${host}:${port}`);
}
