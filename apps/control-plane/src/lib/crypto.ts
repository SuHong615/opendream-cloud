// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Principal } from "../types";
const B64URL = /^[A-Za-z0-9_-]+$/;

export function b64url(input: string | Uint8Array): string {
  return Buffer.from(input).toString("base64url");
}

export function fromB64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function hmac256(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function randomId(): string {
  return crypto.randomUUID();
}

/** API Key：`ock_<kid>_<secret>`；返回明文、prefix 与 HMAC 哈希。 */
export function newApiKey(pepper: string): { plaintext: string; prefix: string; hash: string; keyVersion: number } {
  const kid = b64url(Buffer.from(crypto.getRandomValues(new Uint8Array(8)))).slice(0, 10).toLowerCase();
  const secret = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const plaintext = `ock_${kid}_${secret}`;
  return { plaintext, prefix: `ock_${kid}`, hash: hashApiKey(pepper, plaintext), keyVersion: 1 };
}

export function hashApiKey(pepper: string, plaintext: string): string {
  return hmac256(pepper, plaintext);
}

/** 会话 Cookie：payload.signature（HMAC-SHA256，base64url JSON）。 */
export function signCookie(secret: string, payload: Record<string, unknown>): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac256(secret, body)}`;
}

export function verifyCookie<T>(secret: string, token: string): T | undefined {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined || !B64URL.test(body)) return undefined;
  if (!safeEqual(signature, hmac256(secret, body))) return undefined;
  try {
    return JSON.parse(fromB64url(body)) as T;
  } catch {
    return undefined;
  }
}

export interface TicketClaims {
  iss: string;
  aud: string;
  sub: string;
  tenant: string;
  ws: string;
  jti: string;
  iat: number;
  exp: number;
}

/** MVP：HMAC-SHA256 JWT（HS256），claims 与生产 ed25519 完全一致；测试可验签。 */
export function signTicket(secret: string, claims: Omit<TicketClaims, "jti" | "iat" | "exp">, ttlSeconds: number) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "dev-hmac-1" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: TicketClaims = {
    ...claims,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const token = `${header}.${body}.${hmac256(secret, `${header}.${body}`)}`;
  return { token, claims: payload };
}

export function verifyTicket(secret: string, token: string): TicketClaims | undefined {
  const [header, body, signature, extra] = token.split(".");
  if (!header || !body || !signature || extra !== undefined) return undefined;
  if (!safeEqual(signature, hmac256(secret, `${header}.${body}`))) return undefined;
  let claims: TicketClaims;
  try {
    claims = JSON.parse(fromB64url(body)) as TicketClaims;
  } catch {
    return undefined;
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return undefined;
  return claims;
}

export type { Principal };
