// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Sqlite } from "../db/client";
import type { Env } from "../env";
import type { Principal, SessionPayload } from "../types";
import { ApiError, unauthorized } from "../lib/errors";
import { hashApiKey, verifyCookie } from "../lib/crypto";
import { parseCookies } from "../lib/http";
import type { OrgRole } from "../lib/constants";
import type { FastifyRequest } from "fastify";

const REVOKED = new Set<string>();

export function revokeSession(sid: string): void {
  REVOKED.add(sid);
}

export function isSessionRevoked(sid: string): boolean {
  return REVOKED.has(sid);
}

export interface UserRecord {
  id: string;
  email: string;
  display_name: string;
  status: string;
  created_at: number;
}

export interface MembershipRecord {
  org_id: string;
  role: OrgRole;
}

export function findUserByEmail(sqlite: Sqlite, email: string): UserRecord | undefined {
  return sqlite
    .query<UserRecord, [string]>("SELECT id, email, display_name, status, created_at FROM users WHERE email = ?")
    .get(email.toLowerCase()) ?? undefined;
}

export function findUserById(sqlite: Sqlite, id: string): UserRecord | undefined {
  return sqlite
    .query<UserRecord, [string]>("SELECT id, email, display_name, status, created_at FROM users WHERE id = ?")
    .get(id) ?? undefined;
}

export function findMembership(sqlite: Sqlite, orgId: string, userId: string): MembershipRecord | undefined {
  return sqlite
    .query<MembershipRecord, [string, string]>(
      "SELECT org_id, role FROM memberships WHERE org_id = ? AND user_id = ? AND status = 'active'",
    )
    .get(orgId, userId) ?? undefined;
}

export function firstMembership(sqlite: Sqlite, userId: string): MembershipRecord | undefined {
  return sqlite
    .query<MembershipRecord, [string]>(
      "SELECT org_id, role FROM memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at LIMIT 1",
    )
    .get(userId) ?? undefined;
}

/** dev-login锛欽IT 寤?user + personal org + owner membership锛涘凡瀛樺湪鍒欏鐢ㄣ€?*/
export function ensureDevIdentity(
  sqlite: Sqlite,
  email: string,
): { user: UserRecord; org: { id: string; slug: string; name: string }; role: OrgRole } {
  const normalized = email.trim().toLowerCase();
  const existing = findUserByEmail(sqlite, normalized);
  if (existing) {
    const membership = firstMembership(sqlite, existing.id);
    if (!membership) throw new ApiError({ code: "forbidden", message: "user has no active organization" });
    const org = sqlite
      .query<{ id: string; slug: string; name: string }, [string]>("SELECT id, slug, name FROM orgs WHERE id = ?")
      .get(membership.org_id);
    if (!org) throw new ApiError({ code: "internal_error", message: "organization missing" });
    sqlite.query("UPDATE users SET last_login_at = ? WHERE id = ?").run(Date.now(), existing.id);
    return { user: existing, org, role: membership.role };
  }

  const now = Date.now();
  const userId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const slug = `u-${userId.slice(0, 8)}`;
  const displayName = normalized.split("@")[0] ?? "User";
  sqlite.transaction(() => {
    sqlite
      .query(
        "INSERT INTO users (id, email, display_name, locale, status, last_login_at, created_at) VALUES (?, ?, ?, 'zh-CN', 'active', ?, ?)",
      )
      .run(userId, normalized, displayName, now, now);
    sqlite
      .query(
        "INSERT INTO orgs (id, slug, name, kind, plan, data_region, status, created_at) VALUES (?, ?, ?, 'personal', 'free', 'cn-hangzhou', 'active', ?)",
      )
      .run(orgId, slug, `${displayName} workspace`, now);
    sqlite
      .query(
        "INSERT INTO memberships (id, org_id, user_id, role, status, joined_at, created_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?)",
      )
      .run(crypto.randomUUID(), orgId, userId, now, now);
  })();
  const user = findUserById(sqlite, userId);
  if (!user) throw new ApiError({ code: "internal_error", message: "user creation failed" });
  return { user, org: { id: orgId, slug, name: `${displayName} workspace` }, role: "owner" };
}

export function parseSession(env: Env, cookieHeader: string | undefined): SessionPayload | undefined {
  const cookies = parseCookies(cookieHeader);
  const token = cookies["__Host-oc_session"];
  if (!token) return undefined;
  const payload = verifyCookie<SessionPayload>(env.SESSION_SECRET, token);
  if (!payload) return undefined;
  if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return undefined;
  if (typeof payload.sid !== "string" || REVOKED.has(payload.sid)) return undefined;
  return payload;
}

export function requireSessionPrincipal(env: Env, sqlite: Sqlite, request: FastifyRequest): Principal {
  const payload = parseSession(env, request.headers.cookie);
  if (!payload) throw unauthorized("Session missing or expired");
  const membership = findMembership(sqlite, payload.org, payload.sub);
  if (!membership) throw unauthorized("Session organization is no longer accessible");
  const user = findUserById(sqlite, payload.sub);
  if (!user || user.status !== "active") throw unauthorized("Account is not active");
  return {
    kind: "session",
    userId: payload.sub,
    orgId: payload.org,
    role: membership.role,
    scopes: ["*"],
    sessionId: payload.sid,
  };
}

export function apiKeyPrefix(plaintext: string): string | undefined {
  if (!plaintext.startsWith("ock_") || plaintext.length < 15) return undefined;
  return plaintext.slice(0, 14);
}

export function authenticateApiKey(env: Env, sqlite: Sqlite, plaintext: string): Principal {
  const prefix = apiKeyPrefix(plaintext);
  if (!prefix) throw unauthorized("Invalid API key");
  const row = sqlite
    .query<
      { id: string; org_id: string; user_id: string; key_hash: string; scopes: string; expires_at: number | null; revoked_at: number | null },
      [string]
    >("SELECT id, org_id, user_id, key_hash, scopes, expires_at, revoked_at FROM api_keys WHERE prefix = ?")
    .get(prefix);
  if (!row) throw unauthorized("Invalid API key");
  if (row.revoked_at !== null) throw unauthorized("API key revoked");
  if (row.expires_at !== null && row.expires_at <= Date.now()) throw unauthorized("API key expired");
  if (hashApiKey(env.APIKEY_PEPPER, plaintext) !== row.key_hash) throw unauthorized("Invalid API key");
  const membership = findMembership(sqlite, row.org_id, row.user_id);
  if (!membership) throw unauthorized("API key owner is not a member");
  sqlite.query("UPDATE api_keys SET last_used_at = ? WHERE id = ?").run(Date.now(), row.id);
  let scopes: string[];
  try {
    scopes = JSON.parse(row.scopes) as string[];
  } catch {
    scopes = [];
  }
  return {
    kind: "api_key",
    userId: row.user_id,
    orgId: row.org_id,
    role: membership.role,
    scopes,
    apiKeyId: row.id,
  };
}

/** Session or API Key. API Key is accepted only via `Authorization: Bearer ock_...`. */
export function requirePrincipal(env: Env, sqlite: Sqlite, request: FastifyRequest): Principal {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authenticateApiKey(env, sqlite, authorization.slice("Bearer ".length).trim());
  }
  return requireSessionPrincipal(env, sqlite, request);
}

