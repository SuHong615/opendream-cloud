// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { principalOf } from "../context";
import { badRequest, conflict, notFound } from "../lib/errors";
import { versionView } from "../serializers";
import { defaultPermissions } from "../store";
import type { SkillRecord, VersionRecord } from "../types";

const uploadBody = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(120),
  summary: z.string().max(500).optional(),
  category: z.string().max(64).optional(),
  visibility: z.enum(["private", "org", "public"]).default("org"),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/).default("0.1.0"),
  content: z.string().max(200_000).default(""),
  code: z.string().max(500_000).default(""),
  files: z.array(z.string().max(300)).max(200).default([]),
});

export function registerLifecycleRoutes(app: FastifyInstance, ctx: AppContext): void {
  /** 上传式创建 Skill：内容 + 代码入库为版本 manifest，草稿状态。 */
  app.post("/api/v1/skills/upload", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = uploadBody.parse(request.body ?? {});
    if (ctx.store.findSkillBySlug(principal.org_id, body.slug)) throw conflict("slug already exists", { slug: body.slug });
    const now = ctx.now().toISOString();
    const skill: SkillRecord = {
      id: ctx.newId(), org_id: principal.org_id, org_slug: principal.org_slug, slug: body.slug, name: body.name,
      summary: body.summary ?? null, category: body.category ?? null, visibility: body.visibility, status: "draft",
      permissions: defaultPermissions(), owner_user_id: principal.user_id, latest_version_id: null,
      install_count: 0, avg_rating: null, rating_count: 0, created_at: now, updated_at: now, deleted: false,
    };
    const version: VersionRecord = {
      id: ctx.newId(), skill_id: skill.id, org_id: principal.org_id, version: body.version, status: "draft",
      scan_status: "passed", review_state: "none", review_comment: null,
      manifest: { name: body.name, description: body.summary ?? "", content: body.content, code: body.code, files: body.files, source: "upload" },
      permissions: defaultPermissions(),
      files: [
        { path: "SKILL.md", size: Buffer.byteLength(body.content), sha256: "" },
        ...(body.code ? [{ path: "src/index.ts", size: Buffer.byteLength(body.code), sha256: "" }] : []),
      ],
      archive_sha256: "", signature: "", eval_run_id: "upload-baseline", distribution_ready: true,
      published_at: null, created_at: now,
    };
    ctx.store.skills.set(skill.id, skill);
    ctx.store.versions.set(version.id, version);
    skill.latest_version_id = version.id;
    return reply.code(201).send({ skill, version: versionView(version) });
  });

  app.post("/api/v1/skills/:skillId/enable", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const skill = ctx.store.skills.get(skillId);
    if (!skill || skill.deleted || skill.org_id !== principal.org_id) throw notFound("skill not found");
    const version = skill.latest_version_id ? ctx.store.versions.get(skill.latest_version_id) : undefined;
    if (!version) throw badRequest("skill has no version to enable");
    version.status = "published";
    version.published_at = ctx.now().toISOString();
    skill.status = "published";
    skill.updated_at = ctx.now().toISOString();
    return { skill, version: versionView(version) };
  });

  app.post("/api/v1/skills/:skillId/disable", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const skill = ctx.store.skills.get(skillId);
    if (!skill || skill.deleted || skill.org_id !== principal.org_id) throw notFound("skill not found");
    skill.status = "deprecated";
    skill.updated_at = ctx.now().toISOString();
    return { skill };
  });

  /** 调试：在隔离环境中做一次 mock 运行，返回步骤与输出（真实沙箱后续接入）。 */
  app.post("/api/v1/skills/:skillId/debug", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const skill = ctx.store.skills.get(skillId);
    if (!skill || skill.deleted || (skill.org_id !== principal.org_id && skill.visibility !== "public")) throw notFound("skill not found");
    const body = z.object({ input: z.string().max(4000).default("hello world") }).parse(request.body ?? {});
    const version = skill.latest_version_id ? ctx.store.versions.get(skill.latest_version_id) : undefined;
    return {
      skill_id: skill.id,
      version_id: version?.id ?? null,
      input: body.input,
      steps: [
        { step: "load-manifest", status: "ok", detail: "SKILL.md + permissions" },
        { step: "sandbox-exec", status: "ok", detail: "isolated mock runtime" },
        { step: "output", status: "ok", detail: "debug result" },
      ],
      output: `[${skill.name}] processed: ${body.input}`,
      duration_ms: 42,
      request_id: crypto.randomUUID(),
    };
  });
}
