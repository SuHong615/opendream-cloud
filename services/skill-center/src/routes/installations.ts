// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { principalOf } from "../context";
import { badRequest, conflict, notFound, pageOf } from "../lib/errors";
import { installationView } from "../serializers";
import type { InstallationRecord } from "../types";

const installBody = z.object({
  workspace_id: z.string().uuid().nullable().optional(),
  version_id: z.string().uuid().optional(),
  auto_update: z.boolean().default(false),
});

const listQuery = z.object({
  workspace_id: z.string().uuid().optional(),
  skill_id: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function viewOf(ctx: AppContext, installation: InstallationRecord): Record<string, unknown> {
  const skill = ctx.store.skills.get(installation.skill_id);
  const version = ctx.store.versions.get(installation.version_id);
  if (!skill || !version) throw notFound("installation target missing");
  return installationView(installation, skill, version);
}

export function registerInstallationRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/v1/skills/:skillId/install", async (request, reply) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const body = installBody.parse(request.body ?? {});
    const principal = principalOf(request, ctx.env);
    const skill = ctx.store.skills.get(skillId);
    if (!skill || skill.deleted || (skill.org_id !== principal.org_id && skill.visibility !== "public")) {
      throw notFound("skill not found");
    }
    if (skill.status === "blocked") throw badRequest("skill is blocked", { reason: "skill_permission_denied" });
    const version = body.version_id ? ctx.store.versions.get(body.version_id) : ctx.store.latestVersion(skill);
    if (!version || version.skill_id !== skill.id) throw notFound("version not found");
    if (version.status !== "published") throw badRequest("version is not published", { version_id: version.id });
    const workspaceId = body.workspace_id ?? null;
    const existing = ctx.store.installationsOf(principal.org_id, { skillId: skill.id }).find((item) => item.workspace_id === workspaceId);
    if (existing) throw conflict("skill already installed for this scope", { installation_id: existing.id });
    const record: InstallationRecord = {
      id: ctx.newId(),
      org_id: principal.org_id,
      user_id: principal.user_id,
      workspace_id: workspaceId,
      skill_id: skill.id,
      version_id: version.id,
      enabled: true,
      auto_update: body.auto_update,
      installed_at: ctx.now().toISOString(),
      last_synced_at: null,
      last_error: null,
      source: "user",
    };
    ctx.store.installations.set(record.id, record);
    return reply.code(201).send(viewOf(ctx, record));
  });

  app.get("/api/v1/skill-installations", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = listQuery.parse(request.query);
    const records = ctx.store.installationsOf(principal.org_id, { workspaceId: query.workspace_id, skillId: query.skill_id });
    const items = records.map((record) => viewOf(ctx, record));
    return pageOf(items, query.cursor, query.limit, (item) => String(item.id));
  });

  app.patch("/api/v1/skill-installations/:installationId", async (request) => {
    const { installationId } = z.object({ installationId: z.string() }).parse(request.params);
    const body = z.object({ enabled: z.boolean().optional(), auto_update: z.boolean().optional() }).parse(request.body);
    const principal = principalOf(request, ctx.env);
    const record = ctx.store.installations.get(installationId);
    if (!record || record.org_id !== principal.org_id) throw notFound("installation not found");
    if (body.enabled !== undefined) record.enabled = body.enabled;
    if (body.auto_update !== undefined) record.auto_update = body.auto_update;
    return viewOf(ctx, record);
  });

  app.delete("/api/v1/skill-installations/:installationId", async (request, reply) => {
    const { installationId } = z.object({ installationId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const record = ctx.store.installations.get(installationId);
    if (!record || record.org_id !== principal.org_id) throw notFound("installation not found");
    ctx.store.revokeTokensOf(record.id, ctx.now());
    ctx.store.installations.delete(record.id);
    return reply.code(204).send();
  });
}
