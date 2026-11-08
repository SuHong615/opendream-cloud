// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { badRequest, forbidden, unauthorized } from "../lib/errors";
import { parseCookies } from "../lib/http";
import { CSRF_HEADER, CSRF_COOKIE } from "../lib/constants";
import { ensureDevIdentity, findMembership, findUserById, parseSession, revokeSession } from "../services/auth";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, endSession, parseInput, startSession } from "./shared";

const devLoginSchema = z.object({
  email: z.string().email(),
});

interface OidcState { redirect: string; expiresAt: number; nonce: string }
const oidcStates = new Map<string, OidcState>();

function safeRedirect(input: unknown): string {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//")) return "/workspaces";
  return input;
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/auth/config", async () => ({
    dev_login: ctx.env.ALLOW_DEV_LOGIN,
    oidc: {
      enabled: ctx.env.OIDC_ENABLED,
      mode: ctx.env.OIDC_MOCK ? "mock" : "oidc",
      login_url: "/api/v1/auth/login",
    },
  }));

  /** OIDC 登录入口：mock 模式走本地授权页；真实模式跳转企业 IdP。 */
  app.get("/api/v1/auth/login", async (request, reply) => {
    if (!ctx.env.OIDC_ENABLED) throw badRequest("OIDC login is disabled");
    const query = request.query as { redirect?: string };
    const state = crypto.randomUUID();
    const redirect = safeRedirect(query.redirect);
    oidcStates.set(state, { redirect, expiresAt: Date.now() + 10 * 60_000, nonce: crypto.randomUUID() });
    const redirectUri = ctx.env.OIDC_REDIRECT_URI;
    if (ctx.env.OIDC_MOCK) {
      return reply.redirect(`/api/v1/auth/mock-authorize?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`);
    }
    if (!ctx.env.OIDC_ISSUER || !ctx.env.OIDC_CLIENT_ID) throw badRequest("OIDC issuer/client_id is not configured");
    const authorize = new URL(`${ctx.env.OIDC_ISSUER.replace(/\/+$/u, "")}/authorize`);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", ctx.env.OIDC_CLIENT_ID);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", ctx.env.OIDC_SCOPES);
    authorize.searchParams.set("state", state);
    return reply.redirect(authorize.toString());
  });

  /** 仅 OIDC_MOCK=1：本地模拟 IdP 授权页（输入企业邮箱）。 */
  app.get("/api/v1/auth/mock-authorize", async (request, reply) => {
    if (!ctx.env.OIDC_ENABLED || !ctx.env.OIDC_MOCK) throw badRequest("mock OIDC is disabled");
    const query = request.query as { state?: string; email?: string; redirect_uri?: string };
    const state = query.state ?? "";
    if (!oidcStates.has(state)) throw badRequest("invalid state");
    if (!query.email) {
      return reply.type("text/html").send(`<!doctype html><html><body style="font-family:sans-serif;padding:40px">
        <h2>OpenDream Cloud · Mock SSO</h2>
        <p>本地模拟企业 IdP；输入邮箱后回调控制面。</p>
        <form method="get" action="/api/v1/auth/mock-authorize">
          <input type="hidden" name="state" value="${state.replace(/"/g, "&quot;")}" />
          <input type="hidden" name="redirect_uri" value="${(query.redirect_uri ?? "").replace(/"/g, "&quot;")}" />
          <input name="email" type="email" placeholder="you@company.com" required style="padding:8px;width:320px" />
          <button type="submit" style="padding:8px 16px">继续</button>
        </form></body></html>`);
    }
    const code = Buffer.from(JSON.stringify({ email: query.email }), "utf8").toString("base64url");
    const target = new URL(ctx.env.OIDC_REDIRECT_URI);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    return reply.redirect(target.toString());
  });

  /** OIDC 回调：mock 解码邮箱；真实模式换取 token/userinfo。 */
  app.get("/api/v1/auth/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    if (query.error) throw badRequest(`OIDC error: ${query.error}`);
    if (!query.code || !query.state) throw badRequest("missing code/state");
    const state = oidcStates.get(query.state);
    if (!state || state.expiresAt < Date.now()) throw badRequest("invalid or expired state");
    oidcStates.delete(query.state);
    let email = "";
    if (ctx.env.OIDC_MOCK) {
      const decoded = JSON.parse(Buffer.from(query.code, "base64url").toString("utf8")) as { email?: string };
      email = decoded.email ?? "";
    } else {
      const token = await exchangeOidcCode(ctx.env, query.code);
      email = token.email;
    }
    if (!email) throw badRequest("OIDC user has no email");
    const identity = ensureDevIdentity(ctx.sqlite, email);
    const session = startSession(ctx, reply, { userId: identity.user.id, orgId: identity.org.id });
    auditFromRequest(ctx.sqlite, { request, action: "auth.oidc_login", resourceType: "session", resourceId: session.sid, outcome: "success", orgId: identity.org.id, detail: { email, mode: ctx.env.OIDC_MOCK ? "mock" : "oidc" } });
    return reply.redirect(new URL(state.redirect, ctx.env.CONSOLE_BASE_URL).toString());
  });

  /** 刷新会话：有效会话则滚动续期并轮换 CSRF。 */
  app.post("/api/v1/auth/refresh", async (request, reply) => {
    const payload = parseSession(ctx.env, request.headers.cookie);
    if (!payload) throw unauthorized("Session missing or expired");
    const session = startSession(ctx, reply, { userId: payload.sub, orgId: payload.org });
    return reply.send({ ok: true, session: { user_id: payload.sub, org_id: payload.org, expires_at: new Date(session.expiresAt).toISOString() }, csrf_token: session.csrfToken });
  });

  app.post("/api/v1/auth/dev-login", async (request, reply) => {
    if (!ctx.env.ALLOW_DEV_LOGIN) {
      throw forbidden("dev-login is disabled", { reason: "dev_login_disabled" });
    }
    const body = parseInput(devLoginSchema, request.body ?? {});
    const identity = ensureDevIdentity(ctx.sqlite, body.email);
    const session = startSession(ctx, reply, { userId: identity.user.id, orgId: identity.org.id });
    auditFromRequest(ctx.sqlite, {
      request,
      action: "auth.dev_login",
      resourceType: "session",
      resourceId: session.sid,
      outcome: "success",
      orgId: identity.org.id,
      detail: { email: identity.user.email, experimental: true },
    });
    return reply.code(200).send({
      session: {
        user_id: identity.user.id,
        org_id: identity.org.id,
        expires_at: new Date(session.expiresAt).toISOString(),
        issued_at: new Date().toISOString(),
      },
      user: {
        id: identity.user.id,
        email: identity.user.email,
        display_name: identity.user.display_name,
        status: identity.user.status,
        created_at: new Date(identity.user.created_at).toISOString(),
      },
      org: { id: identity.org.id, slug: identity.org.slug, name: identity.org.name, role: identity.role },
      csrf_token: session.csrfToken,
    });
  });

  app.get("/api/v1/me", async (request, reply) => {
    const payload = parseSession(ctx.env, request.headers.cookie);
    if (!payload) throw unauthorized("Session missing or expired");
    const user = findUserById(ctx.sqlite, payload.sub);
    if (!user || user.status !== "active") throw unauthorized("Account is not active");
    const memberships = ctx.sqlite
      .query<{ org_id: string; role: string; slug: string; name: string }, [string]>(
        `SELECT m.org_id, m.role, o.slug, o.name FROM memberships m JOIN orgs o ON o.id = m.org_id
         WHERE m.user_id = ? AND m.status = 'active' ORDER BY m.created_at`,
      )
      .all(user.id);
    const active = memberships.find((m) => m.org_id === payload.org) ?? memberships[0];
    if (!active) throw unauthorized("No active organization");
    const role = active.role as "owner" | "admin" | "member" | "viewer";
    const cookies = parseCookies(request.headers.cookie);
    const csrf = cookies[CSRF_COOKIE];
    if (csrf) reply.header(CSRF_HEADER, csrf);
    return reply.send({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        status: user.status,
        created_at: new Date(user.created_at).toISOString(),
      },
      orgs: memberships.map((m) => ({ id: m.org_id, slug: m.slug, name: m.name, role: m.role })),
      active_org: { id: active.org_id, slug: active.slug, name: active.name, role },
      permissions: permissionsForRole(role),
      entitlements: { max_workspaces: 1, features: ["dev_login"] },
    });
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const payload = parseSession(ctx.env, request.headers.cookie);
    if (!payload) {
      endSession(reply);
      return reply.code(204).send();
    }
    const cookies = parseCookies(request.headers.cookie);
    const headerToken = request.headers[CSRF_HEADER];
    if (cookies[CSRF_COOKIE] !== undefined && headerToken !== cookies[CSRF_COOKIE]) {
      throw badRequest("CSRF token missing or invalid");
    }
    revokeSession(payload.sid);
    auditFromRequest(ctx.sqlite, {
      request,
      action: "auth.logout",
      resourceType: "session",
      resourceId: payload.sid,
      outcome: "success",
      orgId: payload.org,
      detail: {},
    });
    endSession(reply);
    return reply.code(204).send();
  });

  // 便于本地验证：当前会话的 CSRF token（不在 openapi，仅 dev 使用）
  app.get("/api/v1/auth/csrf", async (request, reply) => {
    const payload = parseSession(ctx.env, request.headers.cookie);
    if (!payload) throw unauthorized();
    const cookies = parseCookies(request.headers.cookie);
    return reply.send({ csrf_token: cookies[CSRF_COOKIE] ?? null, request_id: currentRequestId(request) });
  });
}

function permissionsForRole(role: "owner" | "admin" | "member" | "viewer"): string[] {
  const readOnly = ["org.read", "workspace.read.self", "usage.read.self"];
  if (role === "viewer") return readOnly;
  if (role === "member") {
    return [...readOnly, "workspace.create", "workspace.access", "apikey.create.self", "model.catalog.read", "skill.install", "mcp.bind", "app.publish"];
  }
  if (role === "admin") {
    return [...readOnly, "workspace.create", "workspace.access", "workspace.read.any", "workspace.delete.other", "apikey.create.self", "apikey.manage.other", "model.catalog.read", "model.policy.manage", "model.budget.manage", "usage.read.org", "usage.export", "audit.read.org"];
  }
  return [...readOnly, "workspace.create", "workspace.access", "workspace.read.any", "workspace.delete.other", "apikey.create.self", "apikey.manage.other", "model.catalog.read", "model.policy.manage", "model.budget.manage", "usage.read.org", "usage.export", "audit.read.org", "org.settings.update", "member.invite", "member.remove", "role.assign", "org.delete"];
}

/** 真实 OIDC：discovery + authorization_code 换 token + userinfo。 */
async function exchangeOidcCode(env: AppContext["env"], code: string): Promise<{ email: string }> {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID) throw badRequest("OIDC issuer/client_id is not configured");
  const issuer = env.OIDC_ISSUER.replace(/\/+$/u, "");
  const discoveryResponse = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
  if (!discoveryResponse.ok) throw badRequest("OIDC discovery failed");
  const discovery = (await discoveryResponse.json()) as { token_endpoint?: string; userinfo_endpoint?: string };
  if (!discovery.token_endpoint) throw badRequest("OIDC token_endpoint missing");
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.OIDC_REDIRECT_URI, client_id: env.OIDC_CLIENT_ID });
  if (env.OIDC_CLIENT_SECRET) form.set("client_secret", env.OIDC_CLIENT_SECRET);
  const tokenResponse = await fetch(discovery.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(5000) });
  if (!tokenResponse.ok) throw badRequest("OIDC token exchange failed");
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token || !discovery.userinfo_endpoint) throw badRequest("OIDC userinfo unavailable");
  const userinfoResponse = await fetch(discovery.userinfo_endpoint, { headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(5000) });
  if (!userinfoResponse.ok) throw badRequest("OIDC userinfo failed");
  const userinfo = (await userinfoResponse.json()) as { email?: string; preferred_username?: string };
  const email = userinfo.email ?? (userinfo.preferred_username ? `${userinfo.preferred_username}@oidc.local` : "");
  if (!email) throw badRequest("OIDC userinfo has no email");
  return { email };
}
