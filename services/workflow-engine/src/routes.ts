// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext, Principal } from "./context";
import { WorkflowEngine } from "./engine";
import { forbidden } from "./lib/errors";

const idempotentStarts = new Map<string, Record<string, unknown>>();

function principalOf(request: FastifyRequest, ctx: AppContext): Principal {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    org_id: header("x-oc-org-id") ?? ctx.env.DEFAULT_ORG_ID,
    user_id: header("x-oc-user-id") ?? ctx.env.DEFAULT_USER_ID,
    roles: (header("x-oc-roles") ?? ctx.env.DEFAULT_ROLES).split(",").map((role) => role.trim()).filter(Boolean),
  };
}

function requireWriter(principal: Principal): void {
  if (!principal.roles.some((role) => role === "owner" || role === "admin")) throw forbidden("owner or admin required");
}

function queryOf(request: FastifyRequest): Record<string, unknown> {
  return (request.query ?? {}) as Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function num(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

const createDefinitionBody = z.object({
  slug: z.string().min(3).max(63),
  name: z.string().min(1).max(120),
  category: z.enum(["sdlc", "general"]).default("general"),
  visibility: z.string().optional(),
  /** MVP 扩展：允许创建时带 DSL/模板并发布 1.0.0。 */
  dsl: z.unknown().optional(),
  template_id: z.string().optional(),
});

const aliasCreateBody = z.object({
  slug: z.string().min(3).max(63).optional(),
  name: z.string().min(1).max(120).optional(),
  display_name: z.string().min(1).max(120).optional(),
  category: z.enum(["sdlc", "general"]).optional(),
  visibility: z.string().optional(),
  template_id: z.string().optional(),
  dsl: z.unknown().optional(),
});

const createVersionBody = z.object({
  version: z.string().min(5).max(64),
  dsl: z.custom<Record<string, unknown>>((value) => typeof value === "object" && value !== null && !Array.isArray(value), { message: "dsl object is required" }),
  schema_version: z.string().optional(),
});

const updateDefinitionBody = z.object({
  name: z.string().min(1).max(120).optional(),
  display_name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  visibility: z.string().optional(),
});

const startInstanceBody = z.object({
  definition_id: z.string().min(1),
  dsl_version_id: z.string().nullable().optional(),
  version: z.union([z.number(), z.string()]).optional(),
  idempotency_key: z.string().min(1).max(200).optional(),
  input: z.record(z.unknown()).optional(),
  correlation: z.record(z.unknown()).nullable().optional(),
});

const aliasStartBody = z.object({
  inputs: z.record(z.unknown()).optional(),
  version: z.union([z.number(), z.string()]).optional(),
  correlation: z.record(z.unknown()).nullable().optional(),
});

const signalBody = z.object({ name: z.string().min(1), payload: z.record(z.unknown()).optional() });
const decisionBody = z.object({
  decision: z.enum(["approve", "reject", "request_changes"]),
  comment: z.string().nullable().optional(),
});
const advanceBody = z.object({ node_id: z.string().optional(), payload: z.record(z.unknown()).optional() });

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  const engine = new WorkflowEngine(ctx);

  app.get("/healthz", async () => ({ status: "ok", service: "workflow-engine", version: ctx.version }));
  app.get("/readyz", async () => ({ status: "ok" }));

  // ---------------- templates（MVP extension） ----------------
  app.get("/api/v1/workflow-templates", async (request) => {
    const category = str(queryOf(request).category);
    const items = engine.listTemplates().filter((template) => (category ? template.category === category : true));
    return { items, next_cursor: null };
  });

  // ---------------- canonical definitions ----------------
  app.get("/api/v1/workflow-definitions", async (request) => {
    const principal = principalOf(request, ctx);
    const query = queryOf(request);
    return engine.listDefinitions(principal, {
      status: str(query.status),
      category: str(query.category),
      cursor: str(query.cursor),
      limit: Math.min(100, num(query.limit, 20)),
    });
  });

  app.post("/api/v1/workflow-definitions", async (request) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const body = createDefinitionBody.parse(request.body ?? {});
    return engine.createDefinition(principal, body);
  });

  app.get("/api/v1/workflow-definitions/:definitionId", async (request) => {
    const principal = principalOf(request, ctx);
    const { definitionId } = z.object({ definitionId: z.string() }).parse(request.params);
    const definition = engine.getDefinition(principal, definitionId);
    const { definitionView } = await import("./core");
    return definitionView(definition);
  });

  app.patch("/api/v1/workflow-definitions/:definitionId", async (request) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const { definitionId } = z.object({ definitionId: z.string() }).parse(request.params);
    const body = updateDefinitionBody.parse(request.body ?? {});
    return engine.updateDefinition(principal, definitionId, { name: body.name ?? body.display_name, visibility: body.visibility, description: body.description });
  });

  app.get("/api/v1/workflow-definitions/:definitionId/versions", async (request) => {
    const principal = principalOf(request, ctx);
    const { definitionId } = z.object({ definitionId: z.string() }).parse(request.params);
    return { items: engine.listVersions(principal, definitionId), next_cursor: null };
  });

  app.post("/api/v1/workflow-definitions/:definitionId/versions", async (request) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const { definitionId } = z.object({ definitionId: z.string() }).parse(request.params);
    const body = createVersionBody.parse(request.body ?? {});
    return engine.createVersion(principal, definitionId, body);
  });

  app.get("/api/v1/workflow-versions/:versionId", async (request) => {
    const principal = principalOf(request, ctx);
    const { versionId } = z.object({ versionId: z.string() }).parse(request.params);
    return engine.getVersion(principal, versionId);
  });

  // ---------------- canonical instances ----------------
  app.get("/api/v1/workflow-instances", async (request) => {
    const principal = principalOf(request, ctx);
    const query = queryOf(request);
    return engine.listInstances(principal, {
      definition_id: str(query.definition_id),
      status: str(query.status),
      cursor: str(query.cursor),
      limit: Math.min(100, num(query.limit, 20)),
    });
  });

  app.post("/api/v1/workflow-instances", async (request) => {
    const principal = principalOf(request, ctx);
    const body = startInstanceBody.parse(request.body ?? {});
    const key = body.idempotency_key ? `${principal.org_id}:${body.idempotency_key}` : "";
    const cached = idempotentStarts.get(key);
    if (cached) return { ...cached, idempotency_key: body.idempotency_key };
    const result = await engine.startInstance(principal, {
      definition_id: body.definition_id,
      dsl_version_id: body.dsl_version_id ?? null,
      input: body.input,
      correlation: body.correlation ?? null,
    });
    const response = { ...(result as Record<string, unknown>), ...(body.idempotency_key ? { idempotency_key: body.idempotency_key } : {}) };
    if (key) idempotentStarts.set(key, response);
    return response;
  });

  app.get("/api/v1/workflow-instances/:instanceId", async (request) => {
    const principal = principalOf(request, ctx);
    const { instanceId } = z.object({ instanceId: z.string() }).parse(request.params);
    return engine.getInstance(principal, instanceId);
  });

  app.post("/api/v1/workflow-instances/:instanceId/cancel", async (request) => {
    const principal = principalOf(request, ctx);
    const { instanceId } = z.object({ instanceId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    return engine.cancel(principal, instanceId, body.reason);
  });

  app.post("/api/v1/workflow-instances/:instanceId/signal", async (request) => {
    const principal = principalOf(request, ctx);
    const { instanceId } = z.object({ instanceId: z.string() }).parse(request.params);
    const body = signalBody.parse(request.body ?? {});
    return engine.signal(principal, instanceId, body);
  });

  app.get("/api/v1/workflow-instances/:instanceId/events", async (request) => {
    const principal = principalOf(request, ctx);
    const { instanceId } = z.object({ instanceId: z.string() }).parse(request.params);
    const query = queryOf(request);
    return engine.events(principal, instanceId, {
      since_seq: query.since_seq !== undefined ? Number(query.since_seq) : undefined,
      cursor: str(query.cursor),
      limit: Math.min(200, num(query.limit, 100)),
    });
  });

  // ---------------- human tasks（共享契约） ----------------
  app.get("/api/v1/human-tasks", async (request) => {
    const principal = principalOf(request, ctx);
    const query = queryOf(request);
    return engine.listHumanTasks(principal, {
      scope: str(query.scope),
      status: str(query.status),
      run_id: str(query.run_id),
      assignee: str(query.assignee),
      cursor: str(query.cursor),
      limit: Math.min(100, num(query.limit, 20)),
    });
  });

  app.post("/api/v1/human-tasks/:taskId/decision", async (request) => {
    const principal = principalOf(request, ctx);
    const { taskId } = z.object({ taskId: z.string() }).parse(request.params);
    const body = decisionBody.parse(request.body ?? {});
    return engine.decideHumanTask(principal, taskId, { decision: body.decision, comment: body.comment ?? undefined });
  });

  // ---------------- MVP aliases（1.2 x-mvp-alias） ----------------
  app.get("/api/v1/workflows", async (request) => {
    const principal = principalOf(request, ctx);
    const query = queryOf(request);
    const { definitionView } = await import("./core");
    void definitionView;
    return engine.listDefinitions(principal, { status: str(query.status), category: str(query.category), cursor: str(query.cursor), limit: Math.min(100, num(query.limit, 20)) });
  });

  app.post("/api/v1/workflows", async (request) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const body = aliasCreateBody.parse(request.body ?? {});
    return engine.createDefinition(principal, {
      slug: body.slug,
      name: body.name ?? body.display_name,
      category: body.category,
      visibility: body.visibility,
      dsl: body.dsl,
      template_id: body.template_id,
    });
  });

  app.get("/api/v1/workflows/:id", async (request) => {
    const principal = principalOf(request, ctx);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const definition = engine.getDefinition(principal, id);
    const { definitionView } = await import("./core");
    return definitionView(definition);
  });

  app.patch("/api/v1/workflows/:id", async (request) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({ name: z.string().optional(), display_name: z.string().optional(), description: z.string().optional(), visibility: z.string().optional() })
      .parse(request.body ?? {});
    return engine.updateDefinition(principal, id, { name: body.name ?? body.display_name, visibility: body.visibility, description: body.description });
  });

  app.delete("/api/v1/workflows/:id", async (request, reply) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    engine.deleteDefinition(principal, id);
    return reply.code(204).send();
  });

  app.post("/api/v1/workflows/:id/publish", async (request) => {
    const principal = principalOf(request, ctx);
    requireWriter(principal);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ version: z.string().optional(), dsl: z.unknown().optional() }).parse(request.body ?? {});
    return engine.publishAlias(principal, id, body);
  });

  app.post("/api/v1/workflows/:id/runs", async (request) => {
    const principal = principalOf(request, ctx);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = aliasStartBody.parse(request.body ?? {});
    return engine.startAlias(principal, id, body);
  });

  app.get("/api/v1/workflow-runs", async (request) => {
    const principal = principalOf(request, ctx);
    const query = queryOf(request);
    return engine.listInstances(principal, { definition_id: str(query.workflow_id), status: str(query.status), cursor: str(query.cursor), limit: Math.min(100, num(query.limit, 20)) });
  });

  /** MVP alias：POST /workflow-runs {workflow_id|definition_id, version, inputs}（UI 回退路径）。 */
  app.post("/api/v1/workflow-runs", async (request) => {
    const principal = principalOf(request, ctx);
    const body = z
      .object({
        workflow_id: z.string().optional(),
        definition_id: z.string().optional(),
        version: z.union([z.number(), z.string()]).optional(),
        inputs: z.record(z.unknown()).optional(),
        correlation: z.record(z.unknown()).nullable().optional(),
      })
      .parse(request.body ?? {});
    const definitionId = body.workflow_id ?? body.definition_id;
    if (!definitionId) throw forbidden("workflow_id is required");
    return engine.startAlias(principal, definitionId, { version: body.version, inputs: body.inputs, correlation: body.correlation ?? null });
  });

  app.get("/api/v1/workflow-runs/:id", async (request) => {
    const principal = principalOf(request, ctx);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return engine.getInstance(principal, id);
  });

  app.post("/api/v1/workflow-runs/:id/cancel", async (request) => {
    const principal = principalOf(request, ctx);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().optional() }).parse(request.body ?? {});
    return engine.cancel(principal, id, body.reason);
  });

  app.get("/api/v1/workflow-runs/:id/events", async (request) => {
    const principal = principalOf(request, ctx);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return engine.events(principal, id, {});
  });

  // advance 仅内部可用（G-V4 A3）
  app.post("/internal/workflow-runs/:id/advance", async (request) => {
    const principal = principalOf(request, ctx);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = advanceBody.parse(request.body ?? {});
    return engine.advance(principal, id, body);
  });
}
