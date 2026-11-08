// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { assertOwner } from "@opendream-cloud/contracts";
import { CommandStore } from "./store";

interface BuildOptions { store?: CommandStore; dbPath?: string; workforceUrl?: string; fetchImpl?: typeof fetch }
const eventBody = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  subject: z.string().min(1),
  data: z.record(z.unknown()).default({}),
  time: z.string().optional(),
});
const interventionBody = z.object({
  mission_id: z.string().min(1),
  target_run_id: z.string().min(1),
  action: z.enum(["pause", "resume", "send_back", "takeover", "reassign", "cancel"]),
  reason: z.string().max(2000).default(""),
});

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

async function liveFronts(orgId: string, userId: string, workforceUrl: string, fetchImpl: typeof fetch): Promise<Array<{ tenant_id: string; events: number; waiting_human: number; failed: number; last_event_at: string | null }> | null> {
  if (!workforceUrl) return null;
  const headers = { "x-oc-org-id": orgId, "x-oc-user-id": userId };
  try {
    const [runsResponse, approvalsResponse] = await Promise.all([
      fetchImpl(`${workforceUrl.replace(/\/+$/, "")}/api/v1/legion-runs`, { headers, signal: AbortSignal.timeout(2000) }),
      fetchImpl(`${workforceUrl.replace(/\/+$/, "")}/api/v1/approvals`, { headers, signal: AbortSignal.timeout(2000) }),
    ]);
    if (!runsResponse.ok || !approvalsResponse.ok) return null;
    const runs = (await runsResponse.json() as { items?: Array<{ status?: string; created_at?: string }> }).items ?? [];
    const approvals = (await approvalsResponse.json() as { items?: unknown[] }).items ?? [];
    return [{
      tenant_id: orgId,
      events: runs.length,
      waiting_human: approvals.length + runs.filter((run) => run.status === "waiting_human").length,
      failed: runs.filter((run) => run.status === "failed").length,
      last_event_at: runs.map((run) => run.created_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    }];
  } catch {
    return null;
  }
}

async function dispatchIntervention(input: { workforceUrl: string; orgId: string; userId: string; runId: string; action: "cancel" | "send_back"; reason: string; fetchImpl: typeof fetch }): Promise<"issued" | "dispatched" | "failed"> {
  if (!input.workforceUrl) return "issued";
  const path = input.action === "cancel" ? "cancel" : "send-back";
  try {
    const response = await input.fetchImpl(`${input.workforceUrl.replace(/\/+$/, "")}/api/v1/agent-runs/${encodeURIComponent(input.runId)}/${path}`, {
      method: "POST",
      headers: { "x-oc-org-id": input.orgId, "x-oc-user-id": input.userId, "content-type": "application/json" },
      body: JSON.stringify(input.action === "send_back" ? { reason: input.reason } : {}),
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? "dispatched" : "failed";
  } catch {
    return "failed";
  }
}

export function buildApp(options: BuildOptions = {}): FastifyInstance {
  const store = options.store ?? new CommandStore(options.dbPath ?? process.env.DATABASE_PATH ?? ":memory:");
  const workforceUrl = options.workforceUrl ?? process.env.AGENT_WORKFORCE_URL ?? "";
  const fetchImpl = options.fetchImpl ?? fetch;
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(status).send({ error: { code: (error as { code?: string }).code ?? (status === 404 ? "not_found" : "validation_failed"), message: error instanceof Error ? error.message : "unknown error", request_id: String(request.headers["x-request-id"] ?? "") } });
  });
  app.get("/healthz", async () => ({ status: "ok", service: "command-center" }));
  app.get("/readyz", async () => ({ status: "ok" }));

  app.post("/api/v1/command/events", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = eventBody.parse(request.body ?? {});
    const event = store.ingest({ orgId: user.orgId, eventId: body.id, type: body.type, subject: body.subject, data: body.data, time: body.time });
    store.setIdempotent(user.orgId, key, event);
    return reply.code(201).send(event);
  });

  app.get("/api/v1/command/fronts", async (request) => {
    const user = principal(request);
    const live = await liveFronts(user.orgId, user.userId, workforceUrl, fetchImpl);
    return { items: live ?? store.fronts(user.orgId), generated_at: new Date().toISOString(), source: live ? "agent-workforce" : "event-projection" };
  });

  app.post("/api/v1/command/interventions", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    assertOwner("intervention", "command");
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = interventionBody.parse(request.body ?? {});
    let status: "issued" | "dispatched" | "failed" = "issued";
    if (body.action === "cancel" || body.action === "send_back") {
      status = await dispatchIntervention({ workforceUrl, orgId: user.orgId, userId: user.userId, runId: body.target_run_id, action: body.action, reason: body.reason, fetchImpl });
    }
    const intervention = store.createIntervention({ orgId: user.orgId, missionId: body.mission_id, targetRunId: body.target_run_id, action: body.action, reason: body.reason, status });
    store.setIdempotent(user.orgId, key, intervention);
    return reply.code(202).send(intervention);
  });

  app.get("/api/v1/command/interventions", async (request) => ({ items: store.listInterventions(principal(request).orgId) }));

  app.get("/api/v1/command/reviews", async (request) => {
    const orgId = principal(request).orgId;
    const interventions = store.listInterventions(orgId);
    return { items: [{ tenant_id: orgId, interventions: interventions.length, completed: 0, updated_at: new Date().toISOString() }] };
  });

  app.addHook("onClose", async () => { store.close(); });
  return app;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4113);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = buildApp();
  await app.listen({ host, port });
  console.log(`[command-center] listening on http://${host}:${port}`);
}
