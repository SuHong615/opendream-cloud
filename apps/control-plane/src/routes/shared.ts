// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import type { Principal } from "../types";
import { badRequest, forbidden, unauthorized } from "../lib/errors";
import { randomId, signCookie } from "../lib/crypto";
import { clearCookie, parseCookies, requestIdOf, setCookie } from "../lib/http";
import { CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../lib/constants";
import { requirePrincipal, requireSessionPrincipal } from "../services/auth";
import type { OrgRole } from "../lib/constants";

export function parseInput<T>(schema: z.ZodType<T>, value: unknown, where = "body"): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest(`invalid ${where}`, {
      issues: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return result.data;
}

export function requireSession(ctx: AppContext, request: FastifyRequest): Principal {
  return requireSessionPrincipal(ctx.env, ctx.sqlite, request);
}

export function requireAnyPrincipal(ctx: AppContext, request: FastifyRequest): Principal {
  return requirePrincipal(ctx.env, ctx.sqlite, request);
}

export function requireRole(principal: Principal, roles: OrgRole[]): void {
  if (!roles.includes(principal.role)) {
    throw forbidden("Insufficient role", { required: roles, actual: principal.role });
  }
}

/** API Key scope 校验（会话 principal scopes=["*"] 直接通过）。 */
export function requireScope(principal: Principal, scope: string): void {
  if (principal.scopes.includes("*")) return;
  if (!principal.scopes.includes(scope)) {
    throw forbidden(`API key missing scope: ${scope}`, { required_scope: scope });
  }
}

/** 写操作 CSRF：会话认证必须带 `x-csrf-token` 且与 Cookie 一致；API Key 不需要。 */
export function requireCsrf(request: FastifyRequest, principal: Principal): void {
  if (principal.kind !== "session") return;
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const cookies = parseCookies(request.headers.cookie);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];
  if (typeof headerToken !== "string" || !cookieToken || headerToken !== cookieToken) {
    throw forbidden("CSRF token missing or invalid", { reason: "csrf" });
  }
}

export function startSession(
  ctx: AppContext,
  reply: FastifyReply,
  input: { userId: string; orgId: string },
): { sid: string; csrfToken: string; expiresAt: number } {
  const sid = randomId();
  const csrfToken = randomId();
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const token = signCookie(ctx.env.SESSION_SECRET, {
    sub: input.userId,
    org: input.orgId,
    sid,
    exp: expiresAt,
  });
  setCookie(reply, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
  });
  setCookie(reply, CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
  });
  return { sid, csrfToken, expiresAt };
}

export function endSession(reply: FastifyReply): void {
  clearCookie(reply, SESSION_COOKIE);
  clearCookie(reply, CSRF_COOKIE);
}

export function currentRequestId(request: FastifyRequest): string {
  return requestIdOf(request);
}

export function assertAuthenticated(principal: Principal | undefined): Principal {
  if (!principal) throw unauthorized();
  return principal;
}
