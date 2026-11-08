// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { principalOf } from "../context";
import { badRequest, notFound } from "../lib/errors";
import { versionSummary, versionView } from "../serializers";
import type { VersionRecord } from "../types";

function findOwnedVersion(ctx: AppContext, orgId: string, skillId: string, versionId: string): VersionRecord {
  const version = ctx.store.versions.get(versionId);
  if (!version || version.skill_id !== skillId || version.org_id !== orgId) throw notFound("version not found");
  return version;
}

export function registerReviewRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.post("/api/v1/skills/:skillId/versions/:versionId/submit-review", async (request) => {
    const { skillId, versionId } = z.object({ skillId: z.string(), versionId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const version = findOwnedVersion(ctx, principal.org_id, skillId, versionId);
    if (version.status === "yanked") throw badRequest("version is yanked", { version_id: version.id });
    version.review_state = "pending_review";
    version.review_comment = null;
    return versionSummary(version);
  });

  app.post("/api/v1/skills/:skillId/versions/:versionId/review", async (request) => {
    const { skillId, versionId } = z.object({ skillId: z.string(), versionId: z.string() }).parse(request.params);
    const body = z.object({ decision: z.enum(["approve", "reject"]), comment: z.string().max(2000).optional() }).parse(request.body);
    const principal = principalOf(request, ctx.env);
    const version = findOwnedVersion(ctx, principal.org_id, skillId, versionId);
    version.review_state = body.decision === "approve" ? "approved" : "rejected";
    version.review_comment = body.comment ?? null;
    return versionView(version);
  });

  app.post("/api/v1/skills/:skillId/versions/:versionId/yank", async (request) => {
    const { skillId, versionId } = z.object({ skillId: z.string(), versionId: z.string() }).parse(request.params);
    z.object({ reason: z.string().min(1).max(500) }).parse(request.body ?? {});
    const principal = principalOf(request, ctx.env);
    const version = findOwnedVersion(ctx, principal.org_id, skillId, versionId);
    version.status = "yanked";
    version.published_at = null;
    const skill = ctx.store.skills.get(skillId);
    if (skill?.latest_version_id === version.id) {
      const fallback = ctx.store
        .versionsOf(skillId)
        .filter((candidate) => candidate.status === "published" && candidate.id !== version.id)
        .at(-1);
      skill.latest_version_id = fallback?.id ?? null;
      if (!fallback) skill.status = "deprecated";
    }
    return versionView(version);
  });

  app.post("/api/v1/skills/:skillId/versions/:versionId/rollback", async (request) => {
    const { skillId, versionId } = z.object({ skillId: z.string(), versionId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const version = findOwnedVersion(ctx, principal.org_id, skillId, versionId);
    if (version.status === "yanked") throw badRequest("cannot rollback to a yanked version", { version_id: version.id });
    const skill = ctx.store.skills.get(skillId);
    if (!skill) throw notFound("skill not found");
    version.status = "published";
    version.published_at = ctx.now().toISOString();
    skill.latest_version_id = version.id;
    skill.status = "published";
    skill.updated_at = ctx.now().toISOString();
    return versionView(version);
  });
}
