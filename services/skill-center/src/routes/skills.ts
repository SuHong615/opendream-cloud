// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { principalOf } from "../context";
import { conflict, notFound, pageOf } from "../lib/errors";
import { skillView } from "../serializers";
import { defaultPermissions } from "../store";
import type { SkillRecord } from "../types";

const permissionsSchema = z
  .object({
    tools: z.array(z.string()).optional(),
    mcp: z.array(z.string()).optional(),
    network: z.array(z.string()).optional(),
    fs: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
  })
  .optional();

const createBody = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: z.string().min(1).max(120),
  summary: z.string().max(500).optional(),
  category: z.string().max(64).optional(),
  visibility: z.enum(["private", "org", "public"]).default("org"),
  permissions: permissionsSchema,
});

const updateBody = z.object({
  name: z.string().min(1).max(120).optional(),
  summary: z.string().max(500).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  visibility: z.enum(["private", "org", "public"]).optional(),
});

const listQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  visibility: z.enum(["private", "org", "public"]).optional(),
  status: z.enum(["draft", "in_review", "published", "deprecated", "blocked"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function principalOrg(ctx: AppContext, request: Parameters<typeof principalOf>[0]) {
  const principal = principalOf(request, ctx.env);
  return principal;
}

function visibleTo(skill: SkillRecord, orgId: string): boolean {
  return skill.org_id === orgId || skill.visibility === "public";
}

export function registerSkillRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/skills", async (request) => {
    const principal = principalOrg(ctx, request);
    const query = listQuery.parse(request.query);
    const items = [...ctx.store.skills.values()]
      .filter((skill) => !skill.deleted && visibleTo(skill, principal.org_id))
      .filter((skill) => (query.q ? `${skill.name} ${skill.slug}`.toLowerCase().includes(query.q.toLowerCase()) : true))
      .filter((skill) => (query.category ? skill.category === query.category : true))
      .filter((skill) => (query.visibility ? skill.visibility === query.visibility : true))
      .filter((skill) => (query.status ? skill.status === query.status : true))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((skill) => skillView(skill, ctx.store.latestVersion(skill), ctx.store.installCount(skill.id)));
    return pageOf(items, query.cursor, query.limit, (item) => String(item.id));
  });

  app.post("/api/v1/skills", async (request, reply) => {
    const principal = principalOrg(ctx, request);
    const body = createBody.parse(request.body);
    if (ctx.store.findSkillBySlug(principal.org_id, body.slug)) {
      throw conflict("slug already exists", { slug: body.slug });
    }
    const now = ctx.now().toISOString();
    const record: SkillRecord = {
      id: ctx.newId(),
      org_id: principal.org_id,
      org_slug: principal.org_slug,
      slug: body.slug,
      name: body.name,
      summary: body.summary ?? null,
      category: body.category ?? null,
      visibility: body.visibility,
      status: "draft",
      permissions: defaultPermissions(body.permissions),
      owner_user_id: principal.user_id,
      latest_version_id: null,
      install_count: 0,
      avg_rating: null,
      rating_count: 0,
      created_at: now,
      updated_at: now,
      deleted: false,
    };
    ctx.store.skills.set(record.id, record);
    return reply.code(201).send(skillView(record, undefined, 0));
  });

  app.get("/api/v1/skills/by-slug/:orgSlug/:skillSlug", async (request) => {
    const params = z.object({ orgSlug: z.string(), skillSlug: z.string() }).parse(request.params);
    const skill = ctx.store.findSkillByOrgSlug(params.orgSlug, params.skillSlug);
    if (!skill) throw notFound("skill not found");
    return skillView(skill, ctx.store.latestVersion(skill), ctx.store.installCount(skill.id));
  });

  app.get("/api/v1/skills/:skillId", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const skill = ctx.store.skills.get(skillId);
    const principal = principalOrg(ctx, request);
    if (!skill || skill.deleted || !visibleTo(skill, principal.org_id)) throw notFound("skill not found");
    return skillView(skill, ctx.store.latestVersion(skill), ctx.store.installCount(skill.id));
  });

  app.patch("/api/v1/skills/:skillId", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const body = updateBody.parse(request.body);
    const skill = ctx.store.skills.get(skillId);
    const principal = principalOrg(ctx, request);
    if (!skill || skill.deleted || !visibleTo(skill, principal.org_id)) throw notFound("skill not found");
    if (skill.org_id !== principal.org_id) throw notFound("skill not found");
    if (body.name !== undefined) skill.name = body.name;
    if (body.summary !== undefined) skill.summary = body.summary;
    if (body.category !== undefined) skill.category = body.category;
    if (body.visibility !== undefined) skill.visibility = body.visibility;
    skill.updated_at = ctx.now().toISOString();
    return skillView(skill, ctx.store.latestVersion(skill), ctx.store.installCount(skill.id));
  });

  app.delete("/api/v1/skills/:skillId", async (request, reply) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const skill = ctx.store.skills.get(skillId);
    const principal = principalOrg(ctx, request);
    if (!skill || skill.deleted || skill.org_id !== principal.org_id) throw notFound("skill not found");
    skill.deleted = true;
    skill.status = "deprecated";
    skill.updated_at = ctx.now().toISOString();
    return reply.code(204).send();
  });
}
