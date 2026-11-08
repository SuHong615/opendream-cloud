// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import type { Principal } from "../types";
import { randomId } from "../lib/crypto";
import { parseJson } from "../lib/http";
import { ApiError, conflict, notFound } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import {
  createMockVirtualKey,
  ensureOwnedWorkspace,
  findWorkspace,
  requireOwnedWorkspace,
  serializeWorkspace,
  transition,
  workspaceEvents,
  workspaceMaxReached,
  type CreateWorkspaceInput,
  type WorkspaceRow,
} from "../services/workspaces";
import { issueWorkspaceTicket } from "../services/tickets";
import { currentRequestId, parseInput, requireCsrf, requireSession } from "./shared";

const createWorkspaceSchema = z.object({
  display_name: z.string().min(1).max(64),
  model_default: z.string().max(160).optional(),
  storage_size: z.string().max(16).optional(),
  template: z.string().max(64).optional(),
});

const updateWorkspaceSchema = z.object({
  display_name: z.string().min(1).max(64).optional(),
  model_default: z.string().max(160).nullish(),
});

const destroySchema = z.object({
  confirm_name: z.string().min(1).max(64),
  acknowledge_data_loss: z.literal(true),
  keep_snapshot: z.boolean().optional().default(true),
});

function cooldownMs(ctx: AppContext): number {
  return ctx.env.DESTROY_COOLDOWN_MS ?? ctx.env.DESTROY_COOLDOWN_MIN * 60_000;
}

async function createWorkspace(ctx: AppContext, principal: Principal, input: CreateWorkspaceInput): Promise<WorkspaceRow> {
  if (await workspaceMaxReached(ctx.dbPort, principal)) {
    throw conflict("workspace limit reached", "ws_quota_exceeded");
  }
  const now = Date.now();
  const id = randomId();
  const host = ctx.env.LOCAL_WORKSPACE_HOST || `w-${id.slice(0, 8)}.${ctx.env.WORKSPACE_HOST_SUFFIX}`;
  const image = "registry.opencode.local/opencode-workspace";
  const imageDigest = "sha256:dev-mock";
  try {
    await ctx.dbPort.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO workspaces (id, org_id, owner_user_id, display_name, slug, state, host, image, image_digest,
          cpu_request, mem_request, pvc_size, config_revision, model_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'provisioning', ?, ?, ?, '4', '8Gi', ?, 1, ?, ?, ?)`,
        [id, principal.orgId, principal.userId, input.display_name, id.slice(0, 8), host, image, imageDigest, input.storage_size ?? "20Gi", input.model_default ?? null, now, now],
      );
      await tx.run(
        `INSERT INTO workspace_events (id, org_id, workspace_id, type, to_state, actor_type, actor_id, metadata, created_at)
         VALUES (?, ?, ?, 'state_changed', 'provisioning', 'user', ?, '{}', ?)`,
        [randomId(), principal.orgId, id, principal.userId, now],
      );
    });
  } catch (error) {
    // 并发 ensure/创建：唯一索引冲突时返回已存在的工作区，保证幂等。
    const existing = await ensureOwnedWorkspace(ctx.dbPort, principal);
    if (existing) return existing;
    throw error;
  }
  // 兼容旧 LiteLLM Mock Key：仍在 sqlite 连接写，后续随 model 路由一起迁移。
  createMockVirtualKey(ctx.sqlite, id, principal.orgId, principal);
  ctx.provisioner.ensure(id);
  const row = await findWorkspace(ctx.dbPort, id);
  if (!row) throw notFound("workspace not found");
  return row;
}

export function registerWorkspaceRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/workspaces", async (request) => {
    const principal = requireSession(ctx, request);
    const query = parseInput(
      z.object({ state: z.string().optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }),
      request.query ?? {},
      "query",
    );
    const states = query.state ? query.state.split(",").filter(Boolean) : [];
    const rows = (await ctx.dbPort.all<WorkspaceRow>("SELECT * FROM workspaces WHERE org_id = ? AND owner_user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", [principal.orgId, principal.userId]))
      .filter((row) => states.length === 0 || states.includes(row.state));
    return { items: rows.map((row) => serializeWorkspace(ctx.env, row)), next_cursor: null, request_id: currentRequestId(request) };
  });

  app.post("/api/v1/workspaces", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const body = parseInput(createWorkspaceSchema, request.body ?? {});
    const row = await createWorkspace(ctx, principal, body);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "workspace.create",
      resourceType: "workspace",
      resourceId: row.id,
      outcome: "success",
      detail: { display_name: row.display_name },
    });
    return reply.code(202).send(serializeWorkspace(ctx.env, row));
  });

  app.post("/api/v1/workspaces/me/ensure", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const existing = await ensureOwnedWorkspace(ctx.dbPort, principal);
    if (!existing) {
      const row = await createWorkspace(ctx, principal, { display_name: "我的工作区" });
      auditFromRequest(ctx.sqlite, {
        request,
        principal,
        action: "workspace.ensure",
        resourceType: "workspace",
        resourceId: row.id,
        outcome: "success",
        detail: { created: true },
      });
      return reply.code(202).send(serializeWorkspace(ctx.env, row));
    }
    if (existing.state === "stopped") {
      ctx.provisioner.start(existing.id);
      const row = await findWorkspace(ctx.dbPort, existing.id) ?? existing;
      return reply.code(202).send(serializeWorkspace(ctx.env, row));
    }
    if (existing.state === "provisioning" || existing.state === "starting") {
      return reply.code(202).send(serializeWorkspace(ctx.env, existing));
    }
    if (existing.state === "deleting" || existing.state === "deleted") {
      throw conflict("workspace is being deleted", "workspace_not_ready");
    }
    return reply.code(200).send(serializeWorkspace(ctx.env, existing));
  });

  app.get("/api/v1/workspaces/:workspaceId", async (request) => {
    const principal = requireSession(ctx, request);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    return serializeWorkspace(ctx.env, await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId));
  });

  app.patch("/api/v1/workspaces/:workspaceId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    const body = parseInput(updateWorkspaceSchema, request.body ?? {});
    await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    const now = Date.now();
    await ctx.dbPort.run("UPDATE workspaces SET display_name = COALESCE(?, display_name), model_default = COALESCE(?, model_default), updated_at = ?, version = version + 1 WHERE id = ?", [body.display_name ?? null, body.model_default ?? null, now, params.workspaceId]);
    const row = await findWorkspace(ctx.dbPort, params.workspaceId);
    if (!row) throw notFound("workspace not found");
    return serializeWorkspace(ctx.env, row);
  });

  app.post("/api/v1/workspaces/:workspaceId/start", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    const workspace = await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    if (workspace.state === "stopped" || workspace.state === "error") {
      ctx.provisioner.start(workspace.id);
    } else if (workspace.state !== "starting" && workspace.state !== "ready" && workspace.state !== "idle") {
      throw conflict(`cannot start from ${workspace.state}`, "workspace_not_ready");
    }
    const row = await findWorkspace(ctx.dbPort, workspace.id) ?? workspace;
    return reply.code(202).send(serializeWorkspace(ctx.env, row));
  });

  app.post("/api/v1/workspaces/:workspaceId/stop", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    const workspace = await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    if (workspace.state === "ready" || workspace.state === "idle") {
      ctx.provisioner.stop(workspace.id);
    } else if (workspace.state !== "stopping" && workspace.state !== "stopped") {
      throw conflict(`cannot stop from ${workspace.state}`, "workspace_not_ready");
    }
    const row = await findWorkspace(ctx.dbPort, workspace.id) ?? workspace;
    return reply.code(202).send(serializeWorkspace(ctx.env, row));
  });

  app.post("/api/v1/workspaces/:workspaceId/destroy", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    const body = parseInput(destroySchema, request.body ?? {});
    const workspace = await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    if (workspace.display_name !== body.confirm_name.trim()) {
      throw new ApiError({
        code: "validation_failed",
        message: "confirm_name does not match workspace display_name",
        details: { field: "confirm_name" },
      });
    }
    if (workspace.state === "deleting" || workspace.state === "deleted") {
      throw conflict("workspace already deleting", "workspace_destroy_cooldown");
    }
    const now = Date.now();
    const scheduledAt = workspace.destroy_scheduled_at ?? now + cooldownMs(ctx);
    await ctx.dbPort.run("UPDATE workspaces SET destroy_requested_at = COALESCE(destroy_requested_at, ?), destroy_scheduled_at = ?, updated_at = ?, version = version + 1 WHERE id = ?", [now, scheduledAt, now, workspace.id]);
    await ctx.dbPort.run(
      `INSERT INTO workspace_events (id, org_id, workspace_id, type, from_state, to_state, actor_type, actor_id, metadata, created_at)
       VALUES (?, ?, ?, 'destroy_requested', ?, ?, 'user', ?, ?, ?)`,
      [randomId(), workspace.org_id, workspace.id, workspace.state, workspace.state, principal.userId, JSON.stringify({ scheduled_at: scheduledAt }), now],
    );
    ctx.provisioner.destroy(workspace.id, scheduledAt);
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "workspace.destroy.request",
      resourceType: "workspace",
      resourceId: workspace.id,
      outcome: "success",
      detail: { scheduled_at: new Date(scheduledAt).toISOString(), keep_snapshot: body.keep_snapshot },
    });
    const row = await findWorkspace(ctx.dbPort, workspace.id) ?? workspace;
    return reply.code(202).send(serializeWorkspace(ctx.env, row));
  });

  app.post("/api/v1/workspaces/:workspaceId/destroy/cancel", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    const workspace = await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    if (workspace.destroy_scheduled_at === null || workspace.state === "deleting" || workspace.state === "deleted") {
      throw conflict("no active destroy request", "workspace_destroy_cooldown");
    }
    ctx.provisioner.cancelDestroy(workspace.id);
    const now = Date.now();
    await ctx.dbPort.run("UPDATE workspaces SET destroy_requested_at = NULL, destroy_scheduled_at = NULL, updated_at = ?, version = version + 1 WHERE id = ?", [now, workspace.id]);
    await ctx.dbPort.run(
      `INSERT INTO workspace_events (id, org_id, workspace_id, type, actor_type, actor_id, metadata, created_at)
       VALUES (?, ?, ?, 'destroy_canceled', 'user', ?, '{}', ?)`,
      [randomId(), workspace.org_id, workspace.id, principal.userId, now],
    );
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "workspace.destroy.cancel",
      resourceType: "workspace",
      resourceId: workspace.id,
      outcome: "success",
      detail: {},
    });
    const row = await findWorkspace(ctx.dbPort, workspace.id) ?? workspace;
    return serializeWorkspace(ctx.env, row);
  });

  app.post("/api/v1/workspaces/:workspaceId/access-ticket", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    const workspace = await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    if (workspace.state !== "ready" && workspace.state !== "idle") {
      throw conflict("workspace is not ready", "workspace_not_ready");
    }
    const ticket = issueWorkspaceTicket(ctx.env, principal, workspace.id);
    const baseUrl = `${ctx.env.WORKSPACE_URL_SCHEME}://${workspace.host}/`;
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "workspace.access_ticket.issue",
      resourceType: "workspace",
      resourceId: workspace.id,
      outcome: "success",
      detail: { jti: ticket.claims.jti, expires_in: ticket.expiresIn },
    });
    return {
      workspace_id: workspace.id,
      url: `${baseUrl}?__ticket=${encodeURIComponent(ticket.token)}`,
      base_url: baseUrl,
      ticket: ticket.token,
      expires_in: ticket.expiresIn,
      mode: "redirect" as const,
    };
  });

  app.get("/api/v1/workspaces/:workspaceId/events", async (request) => {
    const principal = requireSession(ctx, request);
    const params = parseInput(z.object({ workspaceId: z.string().uuid() }), request.params, "params");
    await requireOwnedWorkspace(ctx.dbPort, principal, params.workspaceId);
    return { items: await workspaceEvents(ctx.dbPort, params.workspaceId), next_cursor: null };
  });

  // MVP：显式确保有工作区但未调用 ensure 时返回 404（openapi `/workspaces/me`）
  app.get("/api/v1/workspaces/me", async (request) => {
    const principal = requireSession(ctx, request);
    const workspace = await ensureOwnedWorkspace(ctx.dbPort, principal);
    if (!workspace) throw notFound("workspace not found", "workspace_not_found");
    return serializeWorkspace(ctx.env, workspace);
  });
}

/** 供 app.ts 的 MockProvisioner hooks 使用（从列表状态迁移到目标态）。 */
export async function mockHookTransition(
  ctx: AppContext,
  workspaceId: string,
  from: Parameters<typeof transition>[2],
  to: Parameters<typeof transition>[3],
  opts?: { reason?: string; type?: string },
): Promise<void> {
  try {
    await transition(ctx.dbPort, workspaceId, from, to, { actorType: "system", reason: opts?.reason, type: opts?.type });
  } catch {
    // 并发/重试导致的非法迁移：Mock 忽略，真实 Operator 会 reconcile
  }
}

export function workspaceSnapshot(ctx: AppContext, workspace: WorkspaceRow) {
  return serializeWorkspace(ctx.env, workspace);
}
