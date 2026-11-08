// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { principalOf } from "../context";
import { badRequest, conflict, gateBlocked, notFound, pageOf } from "../lib/errors";
import { versionSummary, versionView } from "../serializers";
import { defaultPermissions } from "../store";
import type { VersionRecord } from "../types";

const fileSchema = z.object({ path: z.string(), size: z.number().int().nonnegative().default(0), sha256: z.string().default("") });

const createBody = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/),
  manifest: z.record(z.unknown()).optional(),
  permissions: z
    .object({
      tools: z.array(z.string()).optional(),
      mcp: z.array(z.string()).optional(),
      network: z.array(z.string()).optional(),
      fs: z.array(z.string()).optional(),
      secrets: z.array(z.string()).optional(),
    })
    .optional(),
  files: z.array(fileSchema).optional(),
  archive_sha256: z.string().optional(),
  signature: z.string().optional(),
  scan_status: z.enum(["pending", "passed", "failed"]).optional(),
  eval_run_id: z.string().uuid().optional(),
});

const listQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });

function ownedSkill(ctx: AppContext, orgId: string, skillId: string) {
  const skill = ctx.store.skills.get(skillId);
  if (!skill || skill.deleted || skill.org_id !== orgId) throw notFound("skill not found");
  return skill;
}

export function registerVersionRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/skills/:skillId/versions", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const skill = ownedSkill(ctx, principal.org_id, skillId);
    const query = listQuery.parse(request.query);
    const items = ctx.store.versionsOf(skill.id).map(versionSummary);
    return pageOf(items, query.cursor, query.limit, (item) => String(item.id));
  });

  app.post("/api/v1/skills/:skillId/versions", async (request, reply) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const skill = ownedSkill(ctx, principal.org_id, skillId);
    const body = createBody.parse(request.body);
    if (ctx.store.versionBySkillAndSemver(skill.id, body.version)) {
      throw conflict("version already exists", { version: body.version });
    }
    const files = body.files ?? [{ path: "SKILL.md", size: 0, sha256: "" }];
    if (!files.some((file) => file.path === "SKILL.md" || file.path === `${skill.slug}.md`)) {
      throw badRequest("package must contain SKILL.md", { files: files.map((file) => file.path) });
    }
    const record: VersionRecord = {
      id: ctx.newId(),
      skill_id: skill.id,
      org_id: skill.org_id,
      version: body.version,
      status: "draft",
      scan_status: body.scan_status ?? "pending",
      review_state: "none",
      review_comment: null,
      manifest: body.manifest ?? {},
      permissions: defaultPermissions(body.permissions),
      files,
      archive_sha256: body.archive_sha256 ?? "",
      signature: body.signature ?? "",
      eval_run_id: body.eval_run_id ?? null,
      distribution_ready: true,
      published_at: null,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.versions.set(record.id, record);
    return reply.code(201).send(versionView(record));
  });

  app.get("/api/v1/skills/:skillId/versions/:versionId", async (request) => {
    const { skillId, versionId } = z.object({ skillId: z.string(), versionId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    ownedSkill(ctx, principal.org_id, skillId);
    const version = ctx.store.versions.get(versionId);
    if (!version || version.skill_id !== skillId) throw notFound("version not found");
    return versionView(version);
  });

  app.post("/api/v1/skills/:skillId/versions/:versionId/publish", async (request) => {
    const { skillId, versionId } = z.object({ skillId: z.string(), versionId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const skill = ownedSkill(ctx, principal.org_id, skillId);
    const version = ctx.store.versions.get(versionId);
    if (!version || version.skill_id !== skill.id) throw notFound("version not found");
    if (version.status === "yanked") throw gateBlocked({ gateKind: "permission", message: "version yanked" });
    if (version.scan_status !== "passed") {
      throw gateBlocked({ gateKind: "scan", message: "security scan must pass before publish", details: { scan_status: version.scan_status } });
    }
    if (!version.eval_run_id) {
      throw gateBlocked({ gateKind: "eval", message: "baseline eval must pass before publish", details: { required: "eval_run_id" } });
    }
    version.status = "published";
    version.published_at = ctx.now().toISOString();
    skill.latest_version_id = version.id;
    skill.status = "published";
    skill.updated_at = ctx.now().toISOString();
    return versionView(version);
  });
}
