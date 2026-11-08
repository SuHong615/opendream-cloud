// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { assertOwner } from "@opendream-cloud/contracts";
import { HarnessStore, type HarnessSession } from "./store";

interface BuildOptions {
  store?: HarnessStore;
  dbPath?: string;
  agentcoreUrl?: string;
  fetchImpl?: typeof fetch;
}

const sessionBody = z.object({
  mode: z.enum(["cloud", "local"]).default("local"),
  workspace_ref: z.string().optional(),
  runtime_session_id: z.string().optional(),
});
const permissionBody = z.object({ tool: z.string().min(1), reason: z.string().max(2000).default("") });
const decideBody = z.object({ decision: z.enum(["allow_once", "allow_always", "deny"]) });
const snapshotBody = z.object({ commit: z.string().max(200), hash: z.string().max(200) });

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

async function createRuntimeSession(agentcoreUrl: string, fetchImpl: typeof fetch, orgId: string, userId: string, body: z.infer<typeof sessionBody>, key: string): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${agentcoreUrl.replace(/\/+$/, "")}/api/v1/runtime/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-oc-org-id": orgId,
        "x-oc-user-id": userId,
        "idempotency-key": `harness-${key}`,
      },
      body: JSON.stringify({ workspace: { mode: "cloud" }, agent: {} }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw Object.assign(new Error("agentcore unavailable"), { statusCode: 502, code: "upstream_error" });
  }
  if (!response.ok) throw Object.assign(new Error("agentcore session failed"), { statusCode: 502, code: "upstream_error" });
  const result = await response.json() as { id?: string };
  if (!result.id) throw Object.assign(new Error("agentcore session missing id"), { statusCode: 502, code: "upstream_error" });
  return result.id;
}

export function buildApp(options: BuildOptions = {}): FastifyInstance {
  const store = options.store ?? new HarnessStore(options.dbPath ?? process.env.DATABASE_PATH ?? ":memory:");
  const agentcoreUrl = options.agentcoreUrl ?? process.env.AGENTCORE_URL ?? "http://agentcore:4110";
  const fetchImpl = options.fetchImpl ?? fetch;
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

  app.get("/healthz", async () => ({ status: "ok", service: "harness", mode: "cloud+local" }));
  app.get("/readyz", async () => ({ status: "ok" }));

  app.post("/api/v1/harness/sessions", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    assertOwner("harness_session", "harness");
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const body = sessionBody.parse(request.body ?? {});
    let runtimeSessionId = body.runtime_session_id ?? null;
    if (body.mode === "cloud" && !runtimeSessionId) {
      runtimeSessionId = await createRuntimeSession(agentcoreUrl, fetchImpl, user.orgId, user.userId, body, key);
    }
    const session = store.createSession({ orgId: user.orgId, userId: user.userId, mode: body.mode, runtimeSessionId, workspaceRef: body.workspace_ref ?? null });
    store.appendEvent(user.orgId, session.id, "harness.session.created", { mode: session.mode, runtime_session_id: runtimeSessionId });
    store.setIdempotent(user.orgId, key, session);
    return reply.code(201).send(session);
  });

  app.get("/api/v1/harness/sessions/:sessionId", async (request) => {
    const user = principal(request);
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const session = store.getSession(user.orgId, sessionId);
    if (!session) throw Object.assign(new Error("harness session not found"), { statusCode: 404 });
    return session;
  });

  app.post("/api/v1/harness/sessions/:sessionId/permissions", async (request, reply) => {
    const user = principal(request);
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const session = store.getSession(user.orgId, sessionId);
    if (!session) throw Object.assign(new Error("harness session not found"), { statusCode: 404 });
    const body = permissionBody.parse(request.body ?? {});
    const permission = store.createPermission({ orgId: user.orgId, sessionId, tool: body.tool, reason: body.reason });
    store.appendEvent(user.orgId, sessionId, "harness.permission.asked", { permission_id: permission.id, tool: permission.tool });
    return reply.code(201).send(permission);
  });

  app.post("/api/v1/harness/permissions/:permissionId/decide", async (request, reply) => {
    const user = principal(request);
    const key = idempotency(request);
    const cached = store.getIdempotent(user.orgId, key);
    if (cached) return reply.code(200).send(cached);
    const { permissionId } = z.object({ permissionId: z.string() }).parse(request.params);
    const permission = store.getPermission(user.orgId, permissionId);
    if (!permission) throw Object.assign(new Error("permission not found"), { statusCode: 404 });
    if (permission.status !== "pending") throw Object.assign(new Error("permission already decided"), { statusCode: 409 });
    const body = decideBody.parse(request.body ?? {});
    permission.status = body.decision === "deny" ? "denied" : "allowed";
    permission.decision = body.decision;
    permission.decided_at = new Date().toISOString();
    store.savePermission(permission);
    store.appendEvent(user.orgId, permission.session_id, "harness.permission.decided", { permission_id: permission.id, decision: permission.decision, tool: permission.tool });
    store.setIdempotent(user.orgId, key, permission);
    return reply.code(200).send(permission);
  });

  app.get("/api/v1/harness/sessions/:sessionId/events", async (request, reply) => {
    const user = principal(request);
    const { sessionId } = z.object({ sessionId: z.string() }).parse(request.params);
    const session = store.getSession(user.orgId, sessionId);
    if (!session) throw Object.assign(new Error("harness session not found"), { statusCode: 404 });
    const events = store.listEvents(user.orgId, sessionId);
    if (String(request.headers.accept ?? "").includes("text/event-stream") || (request.query as { stream?: string }).stream === "1") {
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      for (const event of events) reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
      const heartbeat = setInterval(() => reply.raw.write(": keepalive\n\n"), 15000);
      request.raw.on("close", () => { clearInterval(heartbeat); reply.raw.end(); });
      return reply;
    }
    return { items: events };
  });

  app.post("/api/v1/harness/workspaces/:workspaceId/snapshot", async (request, reply) => {
    const user = principal(request);
    const { workspaceId } = z.object({ workspaceId: z.string() }).parse(request.params);
    const body = snapshotBody.parse(request.body ?? {});
    const snapshot = store.createSnapshot({ orgId: user.orgId, workspaceId, commit: body.commit, hash: body.hash });
    return reply.code(201).send(snapshot);
  });

  app.addHook("onClose", async () => { store.close(); });
  return app;
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 4111);
  const host = process.env.HOST ?? "0.0.0.0";
  const app = buildApp();
  await app.listen({ host, port });
  console.log(`[harness] listening on http://${host}:${port}`);
}
