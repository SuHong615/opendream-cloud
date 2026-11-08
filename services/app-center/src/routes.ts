// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "./context";
import { principalOf, type Principal } from "./core";
import { badRequest, conflict, forbidden, notFound, pageOf, ApiError } from "./lib/errors";
import type {
  AccessRequestRecord,
  AppAction,
  AppMemberRecord,
  AppMemberRole,
  AppRecord,
  AppVersionRecord,
  BuildRecord,
  CollabJobRecord,
  CollabMessageRecord,
  CollabSessionRecord,
  DeploymentRecord,
  DomainRecord,
  ProposalFile,
  ProposalRecord,
  ShareRecord,
  ShareRole,
  ShareScope,
  TicketRecord,
} from "./core";

export interface RouteSpec {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  operationId: string;
}

export const APP_SPEC = {
  cpu: "1",
  memory: "2Gi",
  port: 8080,
} as const;

export const ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/api/v1/apps", operationId: "listApps" },
  { method: "POST", path: "/api/v1/apps", operationId: "createApp" },
  { method: "GET", path: "/api/v1/apps/public/:slug", operationId: "getPublicAppBySlug" },
  { method: "GET", path: "/api/v1/apps/:appId", operationId: "getApp" },
  { method: "PATCH", path: "/api/v1/apps/:appId", operationId: "updateApp" },
  { method: "DELETE", path: "/api/v1/apps/:appId", operationId: "deleteApp" },
  { method: "POST", path: "/api/v1/apps/:appId/preflight", operationId: "preflightApp" },
  { method: "GET", path: "/api/v1/apps/:appId/builds", operationId: "listAppBuilds" },
  { method: "POST", path: "/api/v1/apps/:appId/builds", operationId: "createAppBuild" },
  { method: "GET", path: "/api/v1/apps/:appId/builds/:buildId", operationId: "getAppBuild" },
  { method: "POST", path: "/api/v1/apps/:appId/builds/:buildId/retry", operationId: "retryAppBuild" },
  { method: "GET", path: "/api/v1/apps/:appId/deployments", operationId: "listAppDeployments" },
  { method: "POST", path: "/api/v1/apps/:appId/deployments", operationId: "createAppDeployment" },
  { method: "GET", path: "/api/v1/apps/:appId/deployments/:deploymentId", operationId: "getAppDeployment" },
  { method: "POST", path: "/api/v1/apps/:appId/rollback", operationId: "rollbackApp" },
  { method: "POST", path: "/api/v1/apps/:appId/deployments/:deploymentId/rollback", operationId: "rollbackAppDeployment" },
  { method: "GET", path: "/api/v1/apps/:appId/logs", operationId: "getAppLogs" },
  { method: "GET", path: "/api/v1/apps/:appId/shares", operationId: "listAppShares" },
  { method: "POST", path: "/api/v1/apps/:appId/shares", operationId: "createAppShare" },
  { method: "POST", path: "/api/v1/apps/:appId/shares/preview", operationId: "previewAppShares" },
  { method: "PATCH", path: "/api/v1/apps/:appId/shares/:shareId", operationId: "updateAppShare" },
  { method: "DELETE", path: "/api/v1/apps/:appId/shares/:shareId", operationId: "deleteAppShare" },
  { method: "POST", path: "/api/v1/apps/:appId/access-ticket", operationId: "createAppAccessTicket" },
  { method: "POST", path: "/api/v1/apps/:appId/access-requests", operationId: "createAppAccessRequest" },
  { method: "POST", path: "/api/v1/apps/:appId/suspend", operationId: "suspendApp" },
  { method: "POST", path: "/api/v1/apps/:appId/sleep", operationId: "sleepApp" },
  { method: "POST", path: "/api/v1/apps/:appId/wake", operationId: "wakeApp" },
  { method: "GET", path: "/api/v1/apps/:appId/domains", operationId: "listAppDomains" },
  { method: "POST", path: "/api/v1/apps/:appId/domains", operationId: "createAppDomain" },
  { method: "POST", path: "/api/v1/apps/:appId/domains/:domainId/verify", operationId: "verifyAppDomain" },
];

export const OPERATIONAL_ROUTES: ReadonlyArray<RouteSpec> = [
  { method: "GET", path: "/healthz", operationId: "healthz" },
  { method: "GET", path: "/readyz", operationId: "readyz" },
  { method: "GET", path: "/api/v1/health", operationId: "serviceHealth" },
];

export const INTERNAL_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/internal/apps/:appId/authz" },
  { method: "POST", path: "/internal/app-runtime/llm/chat" },
];

const ROLE_RANK: Record<ShareRole, number> = { view: 1, use: 2, edit: 3 };

function appOf(ctx: AppContext, orgId: string, appId: string): AppRecord {
  const app = ctx.store.apps.get(appId);
  if (!app || app.deleted || app.org_id !== orgId) throw notFound("app not found");
  return app;
}

export function effectiveRole(ctx: AppContext, app: AppRecord, principal: Principal): ShareRole | null {
  if (app.created_by === principal.user_id) return "edit";
  if (principal.roles.some((role) => role === "owner" || role === "admin")) return "edit";
  let best: ShareRole | null = null;
  const now = ctx.now().toISOString();
  for (const share of ctx.store.sharesOf(app.id)) {
    if (share.expires_at && share.expires_at < now) continue;
    const applies =
      share.scope === "public" ||
      (share.scope === "org" && app.org_id === principal.org_id) ||
      (share.scope === "team" && share.subject_id !== null && principal.teams.includes(share.subject_id)) ||
      (share.scope === "users" &&
        ((share.subject_type === "user" && share.subject_id === principal.user_id) ||
          (share.subject_type === "team" && share.subject_id !== null && principal.teams.includes(share.subject_id))));
    if (!applies) continue;
    if (!best || ROLE_RANK[share.role] > ROLE_RANK[best]) best = share.role;
  }
  return best;
}

function requireRole(ctx: AppContext, app: AppRecord, principal: Principal, min: ShareRole): ShareRole {
  const role = effectiveRole(ctx, app, principal);
  if (!role) throw notFound("app not found");
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw forbidden(`requires ${min} role`);
  return role;
}

const pageQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/healthz", async () => ({ status: "ok", version: ctx.version }));
  app.get("/readyz", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({ status: "ok", service: "app-center", version: ctx.version }));

  app.get("/api/v1/apps", async (request) => {
    const principal = principalOf(request, ctx.env);
    const query = pageQuery.parse(request.query);
    const items = [...ctx.store.apps.values()]
      .filter((item) => !item.deleted)
      .filter((item) => item.org_id === principal.org_id || item.visibility === "public")
      .filter((item) => effectiveRole(ctx, item, principal) !== null)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return pageOf(items, query.cursor, query.limit, (item) => item.id);
  });

  app.post("/api/v1/apps", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const body = z
      .object({
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        template: z.enum(["node", "python", "static", "custom"]).default("node"),
        entry: z.string().default("npm start"),
        context_subdir: z.string().default("."),
        visibility: z.enum(["private", "org", "public"]).default("private"),
      })
      .parse(request.body);
    if (ctx.store.appBySlug(principal.org_id, body.slug)) throw conflict("app slug already exists", { slug: body.slug });
    const host = `${body.slug}.${ctx.env.APP_HOST_SUFFIX}`;
    if (ctx.store.hostTaken(host)) throw conflict("host already taken", { host });
    const now = ctx.now().toISOString();
    const record: AppRecord = {
      id: ctx.newId(),
      org_id: principal.org_id,
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      state: "draft",
      template: body.template,
      entry: body.entry,
      context_subdir: body.context_subdir,
      visibility: body.visibility,
      host,
      custom_domain: null,
      current_build_id: null,
      current_deployment_id: null,
      version: 1,
      created_by: principal.user_id,
      created_at: now,
      updated_at: now,
      deleted: false,
    };
    ctx.store.apps.set(record.id, record);
    const version: AppVersionRecord = {
      id: ctx.newId(),
      app_id: record.id,
      org_id: record.org_id,
      version: 1,
      content_hash: `sha256:${createHash("sha256").update("").digest("hex")}`,
      status: "draft",
      deployment_id: null,
      summary: "initial version",
      files: [],
      created_by: principal.user_id,
      created_at: now,
    };
    ctx.store.versions.set(version.id, version);
    return reply.code(201).send(record);
  });

  app.get("/api/v1/apps/public/:slug", async (request) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const app = [...ctx.store.apps.values()].find((item) => item.slug === slug && !item.deleted && item.visibility === "public");
    if (!app) throw notFound("app not found");
    const role = effectiveRole(ctx, app, principal);
    return { ...app, effective_role: role };
  });

  app.get("/api/v1/apps/:appId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    const role = requireRole(ctx, app, principal, "view");
    return { ...app, effective_role: role };
  });

  app.patch("/api/v1/apps/:appId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const body = z
      .object({ name: z.string().min(1).max(120).optional(), description: z.string().max(500).nullable().optional(), visibility: z.enum(["private", "org", "public"]).optional() })
      .parse(request.body);
    if (body.name !== undefined) app.name = body.name;
    if (body.description !== undefined) app.description = body.description;
    if (body.visibility !== undefined) app.visibility = body.visibility;
    app.updated_at = ctx.now().toISOString();
    return app;
  });

  app.delete("/api/v1/apps/:appId", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    app.deleted = true;
    app.state = "deleted";
    app.updated_at = ctx.now().toISOString();
    return reply.code(204).send();
  });

  app.post("/api/v1/apps/:appId/preflight", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    return {
      app_id: app.id,
      template: app.template,
      entry: app.entry,
      build_context: app.context_subdir,
      port: APP_SPEC.port,
      checks: [
        { id: "entry", status: "pass", hint: `entry: ${app.entry}` },
        { id: "context", status: app.context_subdir === "." ? "pass" : "warn", hint: "monorepo 子目录需确认 .dockerignore" },
        { id: "secrets", status: "pass", hint: "未检测到硬编码密钥" },
      ],
    };
  });

  app.get("/api/v1/apps/:appId/builds", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    const query = pageQuery.parse(request.query);
    return pageOf(ctx.store.buildsOf(app.id), query.cursor, query.limit, (item) => item.id);
  });

  app.post("/api/v1/apps/:appId/builds", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const input = z
      .object({ template: z.enum(["node", "python", "static", "custom"]).optional(), build_context: z.string().optional(), entry: z.string().optional() })
      .parse(request.body ?? {});
    if (input.template) app.template = input.template;
    if (input.entry) app.entry = input.entry;
    const build = await createBuild(ctx, app, principal.user_id);
    return reply.code(202).send(build);
  });

  app.get("/api/v1/apps/:appId/builds/:buildId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId, buildId } = z.object({ appId: z.string(), buildId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    const build = ctx.store.builds.get(buildId);
    if (!build || build.app_id !== app.id) throw notFound("build not found");
    return build;
  });

  app.post("/api/v1/apps/:appId/builds/:buildId/retry", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId, buildId } = z.object({ appId: z.string(), buildId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const previous = ctx.store.builds.get(buildId);
    if (!previous || previous.app_id !== app.id) throw notFound("build not found");
    const build = await createBuild(ctx, app, principal.user_id);
    return reply.code(202).send(build);
  });

  app.get("/api/v1/apps/:appId/deployments", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    const query = pageQuery.parse(request.query);
    return pageOf(ctx.store.deploymentsOf(app.id), query.cursor, query.limit, (item) => item.id);
  });

  app.post("/api/v1/apps/:appId/deployments", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const body = z.object({ build_id: z.string().optional(), revision_id: z.string().optional() }).parse(request.body ?? {});
    const buildId = body.build_id ?? body.revision_id ?? app.current_build_id ?? undefined;
    if (!buildId) throw badRequest("build_id required");
    const build = ctx.store.builds.get(buildId);
    if (!build || build.app_id !== app.id || build.status !== "succeeded" || !build.image_digest) {
      throw badRequest("build is not deployable", { build_id: buildId });
    }
    const deployment = await createDeployment(ctx, app, build, principal.user_id);
    return reply.code(202).send(deployment);
  });

  app.get("/api/v1/apps/:appId/deployments/:deploymentId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId, deploymentId } = z.object({ appId: z.string(), deploymentId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    const deployment = ctx.store.deployments.get(deploymentId);
    if (!deployment || deployment.app_id !== app.id) throw notFound("deployment not found");
    return deployment;
  });

  app.post("/api/v1/apps/:appId/rollback", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const body = z.object({ deployment_id: z.string().optional(), revision_id: z.string().optional() }).parse(request.body ?? {});
    const targetId = body.deployment_id ?? body.revision_id ?? app.current_deployment_id;
    if (!targetId) throw badRequest("deployment_id required");
    const deployment = ctx.store.deployments.get(targetId);
    if (!deployment || deployment.app_id !== app.id) throw notFound("deployment not found");
    deployment.status = "running";
    deployment.finished_at = ctx.now().toISOString();
    app.current_deployment_id = deployment.id;
    app.state = "ready";
    return deployment;
  });

  app.post("/api/v1/apps/:appId/deployments/:deploymentId/rollback", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId, deploymentId } = z.object({ appId: z.string(), deploymentId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const deployment = ctx.store.deployments.get(deploymentId);
    if (!deployment || deployment.app_id !== app.id) throw notFound("deployment not found");
    deployment.status = "running";
    deployment.finished_at = ctx.now().toISOString();
    app.current_deployment_id = deployment.id;
    app.state = "ready";
    return deployment;
  });

  app.get("/api/v1/apps/:appId/logs", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    const query = z.object({ limit: z.coerce.number().int().min(1).max(1000).default(100), q: z.string().optional() }).parse(request.query);
    const lines = Array.from({ length: Math.min(query.limit, 5) }, (_, index) => ({
      timestamp: new Date(ctx.now().getTime() - index * 1000).toISOString(),
      stream: "stdout",
      message: `[skeleton] app=${app.slug} line=${index + 1}`,
    }));
    return { items: lines, next_cursor: null };
  });

  app.get("/api/v1/apps/:appId/shares", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    return { items: ctx.store.sharesOf(app.id), next_cursor: null };
  });

  app.post("/api/v1/apps/:appId/shares", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const body = z
      .object({
        scope: z.enum(["public", "org", "team", "users"]),
        role: z.enum(["view", "use", "edit"]),
        subject_type: z.enum(["user", "team", "org"]).nullable().optional(),
        subject_id: z.string().nullable().optional(),
        expires_at: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(request.body);
    if ((body.scope === "users" || body.scope === "team") && (!body.subject_type || !body.subject_id)) {
      throw badRequest("subject required for team/users scope");
    }
    const duplicate = ctx.store.sharesOf(app.id).find(
      (share) => share.scope === body.scope && share.subject_type === (body.subject_type ?? null) && share.subject_id === (body.subject_id ?? null),
    );
    if (duplicate) throw conflict("share already exists", { share_id: duplicate.id });
    const record: ShareRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      scope: body.scope as ShareScope,
      subject_type: body.subject_type ?? null,
      subject_id: body.subject_id ?? null,
      role: body.role,
      expires_at: body.expires_at ?? null,
      created_by: principal.user_id,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.shares.set(record.id, record);
    return reply.code(201).send(record);
  });

  app.post("/api/v1/apps/:appId/shares/preview", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const body = z
      .object({
        shares: z.array(
          z.object({
            scope: z.enum(["public", "org", "users"]),
            role: z.enum(["view", "use", "edit"]),
            subject_type: z.enum(["user", "team", "org"]).nullable().optional(),
            subject_id: z.string().nullable().optional(),
          }),
        ),
      })
      .parse(request.body);
    const visibleUsers = new Set<string>();
    const invalidSubjects: string[] = [];
    const conflicts: string[] = [];
    const resulting: Array<Record<string, unknown>> = [];
    for (const share of body.shares) {
      if (share.scope === "users") {
        if (!share.subject_type || !share.subject_id) {
          invalidSubjects.push(`missing subject for role=${share.role}`);
          continue;
        }
        if (share.subject_type === "user") visibleUsers.add(share.subject_id);
      }
      if (body.shares.filter((candidate) => candidate.scope === share.scope && candidate.subject_id === share.subject_id).length > 1) {
        conflicts.push(`${share.scope}:${share.subject_id ?? "*"}:duplicate`);
      }
      resulting.push({ ...share, expires_at: null });
    }
    return {
      app_id: app.id,
      resulting_shares: resulting,
      visible_users: [...visibleUsers],
      invalid_subjects: invalidSubjects,
      conflicts,
    };
  });

  app.patch("/api/v1/apps/:appId/shares/:shareId", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId, shareId } = z.object({ appId: z.string(), shareId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const share = ctx.store.shares.get(shareId);
    if (!share || share.app_id !== app.id) throw notFound("share not found");
    const body = z.object({ role: z.enum(["view", "use", "edit"]).optional(), expires_at: z.string().datetime({ offset: true }).nullable().optional() }).parse(request.body);
    if (body.role) share.role = body.role;
    if (body.expires_at !== undefined) share.expires_at = body.expires_at;
    return share;
  });

  app.delete("/api/v1/apps/:appId/shares/:shareId", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId, shareId } = z.object({ appId: z.string(), shareId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const share = ctx.store.shares.get(shareId);
    if (!share || share.app_id !== app.id) throw notFound("share not found");
    ctx.store.shares.delete(share.id);
    return reply.code(204).send();
  });

  app.post("/api/v1/apps/:appId/access-ticket", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    const role = requireRole(ctx, app, principal, "use");
    const jti = ctx.newId();
    const expiresAt = new Date(ctx.now().getTime() + ctx.env.TICKET_TTL_SECONDS * 1000).toISOString();
    const ticket = ctx.signer.sign({ sub: principal.user_id, org: principal.org_id, app: app.id, role, jti, exp: expiresAt, aud: `app:${app.id}` });
    const record: TicketRecord = { jti, app_id: app.id, user_id: principal.user_id, role, expires_at: expiresAt, used: false };
    ctx.store.tickets.set(jti, record);
    return { ticket, expires_at: expiresAt, expires_in: ctx.env.TICKET_TTL_SECONDS, jti };
  });

  app.post("/api/v1/apps/:appId/access-requests", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    const existing = [...ctx.store.accessRequests.values()].find((item) => item.app_id === app.id && item.user_id === principal.user_id);
    if (existing) throw conflict("access request already exists", { access_request_id: existing.id });
    const record: AccessRequestRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      user_id: principal.user_id,
      status: "pending",
      created_at: ctx.now().toISOString(),
    };
    ctx.store.accessRequests.set(record.id, record);
    return reply.code(202).send(record);
  });

  app.post("/api/v1/apps/:appId/suspend", async (request) => setLifecycle(ctx, request, "sleeping"));
  app.post("/api/v1/apps/:appId/sleep", async (request) => setLifecycle(ctx, request, "sleeping"));
  app.post("/api/v1/apps/:appId/wake", async (request) => setLifecycle(ctx, request, "running"));

  app.get("/api/v1/apps/:appId/domains", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "view");
    return { items: ctx.store.domainsOf(app.id), next_cursor: null };
  });

  app.post("/api/v1/apps/:appId/domains", async (request, reply) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const body = z.object({ hostname: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,252}$/) }).parse(request.body);
    if (ctx.store.hostTaken(body.hostname)) throw conflict("hostname already taken", { hostname: body.hostname });
    const record: DomainRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      hostname: body.hostname,
      status: "pending_verification",
      verify_token: ctx.newId(),
      cert_ref: null,
      verified_at: null,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.domains.set(record.id, record);
    return reply.code(201).send(record);
  });

  app.post("/api/v1/apps/:appId/domains/:domainId/verify", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId, domainId } = z.object({ appId: z.string(), domainId: z.string() }).parse(request.params);
    const app = appOf(ctx, principal.org_id, appId);
    requireRole(ctx, app, principal, "edit");
    const domain = ctx.store.domains.get(domainId);
    if (!domain || domain.app_id !== app.id) throw notFound("domain not found");
    if (domain.status === "pending_verification") {
      domain.status = "issuing";
    } else if (domain.status === "issuing") {
      domain.status = "active";
      domain.cert_ref = `cert/${domain.id}`;
      domain.verified_at = ctx.now().toISOString();
    } else if (domain.status === "failed") {
      throw conflict("domain verification failed", { domain_id: domain.id });
    }
    return domain;
  });
}

async function setLifecycle(ctx: AppContext, request: Parameters<typeof principalOf>[0], target: "sleeping" | "running") {
  const principal = principalOf(request, ctx.env);
  const { appId } = z.object({ appId: z.string() }).parse(request.params);
  const app = appOf(ctx, principal.org_id, appId);
  requireRole(ctx, app, principal, "edit");
  const deployment = app.current_deployment_id ? ctx.store.deployments.get(app.current_deployment_id) : undefined;
  if (!deployment) throw conflict("app has no deployment", { app_id: app.id });
  if (target === "sleeping") {
    deployment.status = "sleeping";
    deployment.replicas = 0;
    app.state = "stopped";
    await ctx.deployer.scale(app.id, 0);
  } else {
    deployment.status = "running";
    deployment.replicas = 1;
    app.state = "ready";
    await ctx.deployer.scale(app.id, 1);
  }
  return { app_id: app.id, deployment_id: deployment.id, status: deployment.status, replicas: deployment.replicas, app_state: app.state };
}

async function createBuild(ctx: AppContext, app: AppRecord, userId: string): Promise<BuildRecord> {
  const buildNo = ctx.store.buildsOf(app.id).length + 1;
  const record: BuildRecord = {
    id: ctx.newId(),
    app_id: app.id,
    org_id: app.org_id,
    build_no: buildNo,
    status: "running",
    image_digest: null,
    sbom_key: null,
    log_ref: null,
    scan_report: null,
    failure_reason: null,
    created_at: ctx.now().toISOString(),
    started_at: ctx.now().toISOString(),
    finished_at: null,
  };
  ctx.store.builds.set(record.id, record);
  const result = await ctx.buildkit.build({ app_id: app.id, template: app.template, context_subdir: app.context_subdir, build_no: buildNo });
  record.status = "succeeded";
  record.image_digest = result.image_digest;
  record.sbom_key = result.sbom_key;
  record.log_ref = result.log_ref;
  record.scan_report = result.scan_report;
  record.finished_at = ctx.now().toISOString();
  app.current_build_id = record.id;
  app.updated_at = ctx.now().toISOString();
  void userId;
  return record;
}

async function createDeployment(ctx: AppContext, app: AppRecord, build: BuildRecord, userId: string): Promise<DeploymentRecord> {
  const record: DeploymentRecord = {
    id: ctx.newId(),
    app_id: app.id,
    org_id: app.org_id,
    build_id: build.id,
    status: "deploying",
    replicas: 1,
    resources: {
      requests: { cpu: APP_SPEC.cpu, memory: APP_SPEC.memory },
      limits: { cpu: APP_SPEC.cpu, memory: APP_SPEC.memory },
    },
    host: app.host,
    url: `https://${app.host}`,
    created_by: userId,
    created_at: ctx.now().toISOString(),
    finished_at: null,
  };
  ctx.store.deployments.set(record.id, record);
  const result = await ctx.deployer.deploy({ app_id: app.id, build_id: build.id, image_digest: build.image_digest ?? "", host: app.host });
  record.status = "running";
  record.host = result.host;
  record.url = result.url;
  record.finished_at = ctx.now().toISOString();
  app.current_deployment_id = record.id;
  app.state = "ready";
  app.updated_at = ctx.now().toISOString();
  return record;
}

export function registerInternalRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/internal/apps/:appId/authz", async (request) => {
    const principal = principalOf(request, ctx.env);
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const app = ctx.store.apps.get(appId);
    if (!app || app.deleted) throw notFound("app not found");
    const role = effectiveRole(ctx, app, principal);
    const aclRole = memberRoleOf(ctx, app, principal);
    return { app_id: app.id, user_id: principal.user_id, role, acl_role: aclRole, allowed: role !== null || aclRole !== null };
  });

  app.post("/internal/app-runtime/llm/chat", async (request) => {
    const body = z.object({ messages: z.array(z.unknown()).default([]), model: z.string().optional() }).parse(request.body ?? {});
    return {
      id: ctx.newId(),
      object: "chat.completion",
      model: body.model ?? "oc-default",
      choices: [{ index: 0, message: { role: "assistant", content: "[skeleton] app-runtime proxy" }, finish_reason: "stop" }],
    };
  });
}

// ---------------- v3 应用权限 + 协同（task-26）

const MEMBER_RANK: Record<AppMemberRole, number> = { viewer: 1, operator: 2, editor: 3, admin: 4, owner: 5 };
const ROLE_ACTIONS: Record<AppMemberRole, AppAction[]> = {
  owner: ["view", "use", "edit", "share", "deploy", "rollback", "delete"],
  admin: ["view", "use", "edit", "share", "deploy", "rollback"],
  editor: ["view", "use", "edit"],
  // ARCH-V3 §5.2/§23.1：operator 仅部署/运维动作（服务身份/CI），不给 edit/share/delete
  operator: ["view", "use", "deploy", "rollback"],
  viewer: ["view"],
};
const SHARE_TO_MEMBER: Record<ShareRole, AppMemberRole> = { view: "viewer", use: "operator", edit: "editor" };

export function memberRoleOf(ctx: AppContext, app: AppRecord, principal: Principal): AppMemberRole | null {
  if (app.created_by === principal.user_id) return "owner";
  let best: AppMemberRole | null = null;
  for (const member of ctx.store.membersOf(app.id)) {
    const applies =
      (member.subject_type === "user" && member.subject_id === principal.user_id) ||
      (member.subject_type === "team" && principal.teams.includes(member.subject_id));
    if (!applies) continue;
    if (!best || MEMBER_RANK[member.role] > MEMBER_RANK[best]) best = member.role;
  }
  const shareRole = effectiveRole(ctx, app, principal);
  if (shareRole) {
    const mapped = SHARE_TO_MEMBER[shareRole];
    if (!best || MEMBER_RANK[mapped] > MEMBER_RANK[best]) best = mapped;
  }
  if (!best && principal.roles.some((role) => role === "owner" || role === "admin") && app.org_id === principal.org_id) {
    best = "admin";
  }
  return best;
}

function requireAction(ctx: AppContext, app: AppRecord, principal: Principal, action: AppAction): AppMemberRole {
  const role = memberRoleOf(ctx, app, principal);
  if (!role) throw notFound("app not found");
  if (!ROLE_ACTIONS[role].includes(action)) throw forbidden(`requires ${action} permission`);
  return role;
}

function actionsFor(role: AppMemberRole): AppAction[] {
  return [...ROLE_ACTIONS[role]];
}

export function registerCollabRoutes(app: FastifyInstance, ctx: AppContext): void {
  const appOfId = (request: FastifyRequest) => {
    const { appId } = z.object({ appId: z.string() }).parse(request.params);
    const principal = principalOf(request, ctx.env);
    const app = appOf(ctx, principal.org_id, appId);
    return { app, principal };
  };

  app.get("/api/v1/apps/:appId/permissions", async (request) => {
    const { app, principal } = appOfId(request);
    const role = requireAction(ctx, app, principal, "view");
    return { app_id: app.id, role, actions: actionsFor(role) };
  });

  app.get("/api/v1/apps/:appId/members", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "share");
    return { items: ctx.store.membersOf(app.id), next_cursor: null };
  });

  app.post("/api/v1/apps/:appId/members", async (request, reply) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "share");
    const body = z
      .object({
        subject_type: z.enum(["user", "team"]),
        subject_id: z.string().min(1),
        role: z.enum(["owner", "admin", "editor", "operator", "viewer"]),
      })
      .parse(request.body);
    const duplicate = ctx.store.membersOf(app.id).find((member) => member.subject_type === body.subject_type && member.subject_id === body.subject_id);
    if (duplicate) throw conflict("member already exists", { member_id: duplicate.id });
    const now = ctx.now().toISOString();
    const record: AppMemberRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      subject_type: body.subject_type,
      subject_id: body.subject_id,
      role: body.role,
      created_by: principal.user_id,
      created_at: now,
      updated_at: now,
    };
    ctx.store.members.set(record.id, record);
    return reply.code(201).send(record);
  });

  app.patch("/api/v1/apps/:appId/members/:memberId", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "share");
    const { memberId } = z.object({ memberId: z.string() }).parse(request.params);
    const member = ctx.store.members.get(memberId);
    if (!member || member.app_id !== app.id) throw notFound("member not found");
    const body = z.object({ role: z.enum(["owner", "admin", "editor", "operator", "viewer"]) }).parse(request.body);
    if (member.role === "owner" && body.role !== "owner") assertNotLastOwner(ctx, app, member);
    member.role = body.role;
    member.updated_at = ctx.now().toISOString();
    return member;
  });

  app.delete("/api/v1/apps/:appId/members/:memberId", async (request, reply) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "share");
    const { memberId } = z.object({ memberId: z.string() }).parse(request.params);
    const member = ctx.store.members.get(memberId);
    if (!member || member.app_id !== app.id) throw notFound("member not found");
    if (member.role === "owner") assertNotLastOwner(ctx, app, member);
    ctx.store.members.delete(member.id);
    return reply.code(204).send();
  });

  const ensureSession = (appRecord: AppRecord): CollabSessionRecord => {
    for (const session of ctx.store.collabSessions.values()) if (session.app_id === appRecord.id) return session;
    const now = ctx.now().toISOString();
    const session: CollabSessionRecord = {
      id: ctx.newId(),
      app_id: appRecord.id,
      org_id: appRecord.org_id,
      base_version: appRecord.version,
      last_seq: 0,
      created_at: now,
      updated_at: now,
    };
    ctx.store.collabSessions.set(session.id, session);
    return session;
  };

  const recordMessage = (
    appRecord: AppRecord,
    principal: Principal,
    input: { client_msg_id: string; type: CollabMessageRecord["type"]; content: string; proposal_id?: string | null },
  ): CollabMessageRecord => {
    const existing = ctx.store.messagesOf(appRecord.id).find((message) => message.client_msg_id === input.client_msg_id);
    if (existing) return existing;
    const session = ensureSession(appRecord);
    session.last_seq += 1;
    session.base_version = appRecord.version;
    session.updated_at = ctx.now().toISOString();
    const message: CollabMessageRecord = {
      id: ctx.newId(),
      app_id: appRecord.id,
      org_id: appRecord.org_id,
      session_id: session.id,
      user_id: principal.user_id,
      client_msg_id: input.client_msg_id,
      type: input.type,
      content: input.content,
      proposal_id: input.proposal_id ?? null,
      seq: session.last_seq,
      created_at: ctx.now().toISOString(),
    };
    ctx.store.collabMessages.set(message.id, message);
    return message;
  };

  app.get("/api/v1/apps/:appId/collab", async (request) => {
    const { app, principal } = appOfId(request);
    const role = requireAction(ctx, app, principal, "view");
    const session = ensureSession(app);
    const latest = ctx.store.proposalsOf(app.id)[0] ?? null;
    return {
      app_id: app.id,
      // openapi CollabBootstrap：session + base_version（扁平字段保留给 UI 兼容）
      session: {
        id: session.id,
        app_id: app.id,
        base_version: app.version,
        content_hash: ctx.store.versionsOf(app.id).find((version) => version.version === app.version)?.content_hash ?? null,
        status: "open",
        created_at: session.created_at,
      },
      base_version: app.version,
      latest_proposal: latest,
      session_id: session.id,
      role,
      members: ctx.store.membersOf(app.id).map((member) => ({ subject_type: member.subject_type, subject_id: member.subject_id, role: member.role })),
      last_seq: session.last_seq,
      updated_at: session.updated_at,
    };
  });

  /**
   * 协同 AI worker（MVP，无真实 LLM）：把 chat 消息异步转换为 open proposal。
   * 幂等：同一 message 只生成一个 proposal；internal tick 可强制消费队列。
   */
  function processCollabJobs(appFilter?: string): number {
    let processed = 0;
    for (const job of ctx.store.collabJobs.values()) {
      if (job.status !== "pending") continue;
      if (appFilter && job.app_id !== appFilter) continue;
      job.status = "running";
      job.attempts += 1;
      job.updated_at = ctx.now().toISOString();
      try {
        const app = ctx.store.apps.get(job.app_id);
        const message = ctx.store.collabMessages.get(job.message_id);
        if (!app || app.deleted || !message) throw new Error("app/message missing");
        const existing = ctx.store.proposalsOf(app.id).find((proposal) => proposal.source_message_id === message.id);
        if (existing) {
          job.status = "done";
          job.updated_at = ctx.now().toISOString();
          continue;
        }
        const safeContent = message.content.replace(/[\u0000-\u001f\u007f]/gu, " ").slice(0, 500);
        const path = `src/agent-${message.id.slice(0, 8)}.ts`;
        const files: ProposalFile[] = [
          {
            path,
            status: "added",
            additions: 2,
            deletions: 0,
            unified_diff: `+// AI worker proposal from message ${message.id}\n+export const suggestion = ${JSON.stringify(safeContent)};`,
          },
        ];
        const proposal: ProposalRecord = {
          id: ctx.newId(),
          app_id: app.id,
          org_id: app.org_id,
          status: "open",
          base_version: app.version,
          summary: `AI: ${safeContent.slice(0, 80) || "apply change"}`,
          hash: `sha256:${createHash("sha256").update(`${message.id}:${safeContent}`).digest("hex")}`,
          files,
          source_message_id: message.id,
          content_hash: `sha256:${createHash("sha256").update(JSON.stringify(files)).digest("hex")}`,
          test_suggestion: `建议对 ${path} 运行类型检查与单测后 approve`,
          generated_by: "ai-worker",
          author_id: message.user_id,
          version_id: null,
          reason: null,
          created_at: ctx.now().toISOString(),
          decided_at: null,
          decided_by: null,
        };
        ctx.store.proposals.set(proposal.id, proposal);
        recordMessage(
          app,
          { org_id: app.org_id, org_slug: "", user_id: message.user_id, roles: ["member"], teams: [] },
          {
            client_msg_id: `proposal:${proposal.id}`,
            type: "proposal_ref",
            content: proposal.summary,
            proposal_id: proposal.id,
          },
        );
        job.status = "done";
        processed += 1;
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "worker failed";
      }
      job.updated_at = ctx.now().toISOString();
    }
    return processed;
  }

  const messageRole = (message: CollabMessageRecord): "user" | "agent" | "system" =>
    message.type === "system" ? "system" : message.type === "proposal_ref" ? "agent" : "user";
  const messageView = (message: CollabMessageRecord) => ({ ...message, role: messageRole(message) });

  const proposalView = (proposal: ProposalRecord) => ({
    ...proposal,
    diff_ref: `proposal:${proposal.id}`,
    affected_files: proposal.files.map((file) => file.path),
    risk_level: "low" as const,
    test_suggestion: proposal.test_suggestion,
    decided_at: proposal.decided_at,
  });

  app.get("/api/v1/apps/:appId/collab/messages", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "view");
    const query = pageQuery.parse(request.query);
    const page = pageOf(ctx.store.messagesOf(app.id), query.cursor, query.limit, (message) => message.id);
    return { ...page, items: page.items.map(messageView) };
  });

  app.post("/api/v1/apps/:appId/collab/messages", async (request, reply) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "use");
    const body = z
      .object({
        client_msg_id: z.string().min(1).max(128),
        type: z.enum(["chat", "system", "proposal_ref"]).default("chat"),
        content: z.string().min(1).max(20_000),
        proposal_id: z.string().nullable().optional(),
      })
      .parse(request.body);
    const message = recordMessage(app, principal, body);
    if (body.type === "chat" && ![...ctx.store.collabJobs.values()].some((job) => job.message_id === message.id)) {
      const job: CollabJobRecord = {
        id: ctx.newId(),
        app_id: app.id,
        org_id: app.org_id,
        message_id: message.id,
        status: "pending",
        attempts: 0,
        error: null,
        created_at: ctx.now().toISOString(),
        updated_at: ctx.now().toISOString(),
      };
      ctx.store.collabJobs.set(job.id, job);
      setTimeout(() => processCollabJobs(app.id), 0);
    }
    return reply.code(201).send(messageView(message));
  });

  app.get("/api/v1/apps/:appId/collab/proposals", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "view");
    const query = pageQuery.parse(request.query);
    const page = pageOf(ctx.store.proposalsOf(app.id), query.cursor, query.limit, (proposal) => proposal.id);
    return { ...page, items: page.items.map(proposalView) };
  });

  app.post("/api/v1/apps/:appId/collab/proposals", async (request, reply) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "edit");
    const body = z
      .object({
        base_version: z.number().int().min(1),
        summary: z.string().min(1).max(500),
        hash: z.string().min(1).max(128),
        files: z
          .array(
            z.object({
              path: z.string().min(1).max(512),
              status: z.enum(["added", "modified", "deleted"]),
              additions: z.number().int().nonnegative().default(0),
              deletions: z.number().int().nonnegative().default(0),
              unified_diff: z.string().max(200_000).default(""),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(request.body);
    validateProposalPatch(body.files);
    const duplicate = ctx.store.proposalsOf(app.id).find((proposal) => proposal.hash === body.hash && proposal.base_version === body.base_version);
    if (duplicate) return reply.code(200).send(duplicate);
    const proposal: ProposalRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      status: "open",
      base_version: body.base_version,
      summary: body.summary,
      hash: body.hash,
      files: body.files as ProposalFile[],
      source_message_id: null,
      content_hash: `sha256:${createHash("sha256").update(JSON.stringify(body.files)).digest("hex")}`,
      test_suggestion: null,
      generated_by: "user",
      author_id: principal.user_id,
      version_id: null,
      reason: null,
      created_at: ctx.now().toISOString(),
      decided_at: null,
      decided_by: null,
    };
    ctx.store.proposals.set(proposal.id, proposal);
    recordMessage(app, principal, {
      client_msg_id: `proposal:${proposal.id}`,
      type: "proposal_ref",
      content: body.summary,
      proposal_id: proposal.id,
    });
    return reply.code(201).send(proposalView(proposal));
  });

  app.post("/api/v1/apps/:appId/collab/proposals/:proposalId/approve", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "edit");
    const { proposalId } = z.object({ proposalId: z.string() }).parse(request.params);
    const body = z.object({ expected_base_version: z.number().int().min(1) }).parse(request.body);
    const proposal = ctx.store.proposals.get(proposalId);
    if (!proposal || proposal.app_id !== app.id) throw notFound("proposal not found");
    if (proposal.status !== "open") throw conflict("proposal already decided", { status: proposal.status });
    // 批准/合并前二次校验（不能只信创建时）
    validateProposalPatch(proposal.files);
    if (body.expected_base_version !== app.version) {
      throw new ApiError({
        code: "conflict",
        status: 409,
        message: "base version conflict",
        details: { code: "collab_conflict", current_base_version: app.version, expected_base_version: body.expected_base_version },
      });
    }
    const now = ctx.now().toISOString();
    const version: AppVersionRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      version: app.version + 1,
      content_hash: `sha256:${createHash("sha256").update(JSON.stringify(proposal.files)).digest("hex")}`,
      status: "published",
      deployment_id: null,
      summary: proposal.summary,
      files: proposal.files,
      created_by: principal.user_id,
      created_at: now,
    };
    ctx.store.versions.set(version.id, version);
    app.version = version.version;
    app.updated_at = now;
    proposal.status = "approved";
    proposal.version_id = version.id;
    proposal.decided_at = now;
    proposal.decided_by = principal.user_id;
    recordMessage(app, principal, {
      client_msg_id: `approved:${proposal.id}:${version.version}`,
      type: "system",
      content: `proposal ${proposal.id} approved as v${version.version}`,
      proposal_id: proposal.id,
    });
    return { version, proposal: proposalView(proposal) };
  });

  app.post("/api/v1/apps/:appId/collab/proposals/:proposalId/reject", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "edit");
    const { proposalId } = z.object({ proposalId: z.string() }).parse(request.params);
    const body = z.object({ reason: z.string().max(2000).default("") }).parse(request.body ?? {});
    const proposal = ctx.store.proposals.get(proposalId);
    if (!proposal || proposal.app_id !== app.id) throw notFound("proposal not found");
    if (proposal.status !== "open") throw conflict("proposal already decided", { status: proposal.status });
    proposal.status = "rejected";
    proposal.reason = body.reason;
    proposal.decided_at = ctx.now().toISOString();
    proposal.decided_by = principal.user_id;
    return proposalView(proposal);
  });

  app.get("/api/v1/apps/:appId/versions", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "view");
    const query = pageQuery.parse(request.query);
    return pageOf(ctx.store.versionsOf(app.id), query.cursor, query.limit, (version) => String(version.version));
  });

  app.post("/api/v1/apps/:appId/versions/:versionId/rollback", async (request) => {
    const { app, principal } = appOfId(request);
    requireAction(ctx, app, principal, "rollback");
    const { versionId } = z.object({ versionId: z.string() }).parse(request.params);
    const target = ctx.store.versions.get(versionId);
    if (!target || target.app_id !== app.id) throw notFound("version not found");
    const now = ctx.now().toISOString();
    const version: AppVersionRecord = {
      id: ctx.newId(),
      app_id: app.id,
      org_id: app.org_id,
      version: app.version + 1,
      content_hash: target.content_hash,
      status: "rolled_back",
      deployment_id: target.deployment_id,
      summary: `rollback to v${target.version}`,
      files: target.files,
      created_by: principal.user_id,
      created_at: now,
    };
    ctx.store.versions.set(version.id, version);
    app.version = version.version;
    app.updated_at = now;
    return { version, rolled_back_to: target.version };
  });

  // 内部 worker tick（测试/定时器可强制消费；不进入公开路由）
  app.post("/internal/collab/tick", async () => {
    const processed = processCollabJobs();
    const jobs = [...ctx.store.collabJobs.values()];
    return {
      processed,
      pending: jobs.filter((job) => job.status === "pending").length,
      failed: jobs.filter((job) => job.status === "failed").length,
    };
  });
}

function assertNotLastOwner(ctx: AppContext, app: AppRecord, member: AppMemberRecord): void {
  const owners = ctx.store.membersOf(app.id).filter((item) => item.role === "owner");
  const creatorIsOwner = app.created_by !== member.subject_id;
  if (owners.length <= 1 && !creatorIsOwner) throw conflict("cannot remove last owner");
}

/** ARCH §5.3 patch 白名单：允许源码/静态资源，禁止 .git/CI/密钥/部署文件与逃逸。 */
const ALLOWED_EXACT = new Set(["package.json", "pnpm-lock.yaml", "bun.lock", "package-lock.json", "README.md", "index.html", "LICENSE"]);
const ALLOWED_PREFIX = ["src/", "public/", "assets/", "app/"];
const DENIED_PREFIX = [".git/", ".github/", ".gitlab/", ".circleci/", "k8s/", "helm/", "deploy/", "secrets/", ".secrets/"];
const DENIED_EXACT = new Set([".gitlab-ci.yml", "Jenkinsfile", ".npmrc"]);
const DENIED_PATTERNS = [
  /^\.env(?:\.|$)/u,
  /^dockerfile*/u,
  /^docker-compose.*\.ya?ml$/u,
  /^id_rsa/u,
  /^\.yarnrc/u,
  /\.(?:pem|key|p12|crt)$/u,
];

export function validateProposalPatch(files: ProposalFile[]): void {
  const failures: Array<{ path: string; reason: string }> = [];
  if (files.length > 50) failures.push({ path: "*", reason: "too_many_files" });
  let totalDiffBytes = 0;
  for (const file of files) {
    const raw = file.path;
    totalDiffBytes += Buffer.byteLength(file.unified_diff ?? "", "utf8");
    if (Buffer.byteLength(file.unified_diff ?? "", "utf8") > 2 * 1024 * 1024) {
      failures.push({ path: raw, reason: "file_too_large" });
      continue;
    }
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      failures.push({ path: raw, reason: "invalid_encoding" });
      continue;
    }
    const normalized = decoded.normalize("NFKC").replace(/\\/gu, "/");
    if (
      normalized !== decoded ||
      decoded.startsWith("/") ||
      decoded.includes("\\") ||
      decoded.split("/").includes("..") ||
      /[\u0000-\u001f\u007f]/u.test(decoded) ||
      /%2e|%2f|%5c/iu.test(raw)
    ) {
      failures.push({ path: raw, reason: "path_escape" });
      continue;
    }
    const lower = normalized.toLowerCase();
    const segments = lower.split("/");
    const base = segments[segments.length - 1] ?? "";
    const denied =
      DENIED_PREFIX.some((prefix) => lower.startsWith(prefix) || lower.includes(`/${prefix}`)) ||
      DENIED_EXACT.has(base) ||
      DENIED_PATTERNS.some((pattern) => pattern.test(base)) ||
      segments.includes(".git") ||
      segments.includes("secrets");
    if (denied) {
      failures.push({ path: raw, reason: "path_not_allowed" });
      continue;
    }
    const allowed =
      ALLOWED_EXACT.has(base) ||
      ALLOWED_PREFIX.some((prefix) => lower.startsWith(prefix)) ||
      /^tsconfig.*\.json$/u.test(base);
    if (!allowed) failures.push({ path: raw, reason: "path_not_allowed" });
  }
  if (totalDiffBytes > 200 * 1024) failures.push({ path: "*", reason: "diff_too_large" });
  if (failures.length > 0) {
    throw new ApiError({
      code: "validation_failed",
      status: 400,
      message: "proposal patch denied by whitelist",
      // 1.1.0 ErrorReason；shared 枚举待同步，先用契约字符串（契约测试以 reason 断言）
      reason: "collab_patch_denied" as never,
      details: { cause: failures[0]?.reason ?? "path_not_allowed", files: failures },
    });
  }
}
