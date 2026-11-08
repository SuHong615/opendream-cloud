// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { badRequest, notFound } from "../lib/errors";
import type { SourceTokenRecord } from "../types";

/** 内部/分发端点：不注册公开网关、不进 SDK（ROUTES 不含这些路径）。 */
export function registerInternalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/internal/skills/source-keys", async () => ({
    keys: [{ kid: "skill-src-dev-1", algorithm: "ed25519", public_key: "skeleton-public-key" }],
  }));

  app.post("/internal/skills/:skillId/source-token", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const body = z.object({ installation_id: z.string().optional() }).parse(request.body ?? {});
    const skill = ctx.store.skills.get(skillId);
    if (!skill || skill.deleted) throw notFound("skill not found");
    const installation = body.installation_id
      ? ctx.store.installations.get(body.installation_id)
      : [...ctx.store.installations.values()].find((item) => item.skill_id === skillId);
    if (!installation || installation.skill_id !== skillId) throw badRequest("installation required", { skill_id: skillId });
    const token = randomBytes(32).toString("base64url");
    const record: SourceTokenRecord = {
      token,
      installation_id: installation.id,
      org_id: installation.org_id,
      expires_at: new Date(ctx.now().getTime() + ctx.env.TOKEN_TTL_SECONDS * 1000).toISOString(),
      revoked_at: null,
    };
    ctx.store.sourceTokens.set(token, record);
    return {
      token,
      expires_at: record.expires_at,
      installation_id: installation.id,
      source_path: `/s/${skill.org_slug}/${skill.slug}/${installation.version_id}/${token}/`,
    };
  });

  app.get("/s/:orgSlug/:skillSlug/:version/:token/index.json", async (request) => {
    const params = z
      .object({ orgSlug: z.string(), skillSlug: z.string(), version: z.string(), token: z.string() })
      .parse(request.params);
    const skill = ctx.store.findSkillByOrgSlug(params.orgSlug, params.skillSlug);
    if (!skill) throw notFound("skill not found");
    const version = ctx.store.versionsOf(skill.id).find((item) => item.id === params.version || item.version === params.version);
    if (!version) throw notFound("version not found");
    const token = ctx.store.tokenByValue(params.token);
    if (!token || new Date(token.expires_at).getTime() < ctx.now().getTime()) throw notFound("source token invalid or expired");
    const installation = ctx.store.installations.get(token.installation_id);
    if (!installation || installation.version_id !== version.id || !installation.enabled) {
      throw notFound("installation not active for this version");
    }
    return {
      skills: [
        {
          name: skill.slug,
          version: `${version.version}+${version.archive_sha256.slice(0, 12) || "dev"}`,
          files: version.files.map((file) => file.path),
        },
      ],
    };
  });

  app.get("/s/:orgSlug/:skillSlug/:version/:token/:file", async (request, reply) => {
    const params = z
      .object({ orgSlug: z.string(), skillSlug: z.string(), version: z.string(), token: z.string(), file: z.string() })
      .parse(request.params);
    const skill = ctx.store.findSkillByOrgSlug(params.orgSlug, params.skillSlug);
    if (!skill) throw notFound("skill not found");
    const version = ctx.store.versionsOf(skill.id).find((item) => item.id === params.version || item.version === params.version);
    if (!version) throw notFound("version not found");
    const token = ctx.store.tokenByValue(params.token);
    if (!token || new Date(token.expires_at).getTime() < ctx.now().getTime()) throw notFound("source token invalid or expired");
    const allowed = version.files.some((file) => file.path === params.file);
    if (!allowed) throw notFound("file not found in package");
    reply.header("content-type", "text/plain; charset=utf-8");
    return params.file === "SKILL.md"
      ? `# ${skill.name}\n\nSkeleton skill content (G5).\n`
      : `# skeleton resource: ${params.file}\n`;
  });
}
