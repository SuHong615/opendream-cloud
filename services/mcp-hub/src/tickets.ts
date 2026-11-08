// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from "node:crypto";
import type { Env } from "./env";

export interface McpTicketClaims {
  iss: string;
  aud: string;
  sub: string;
  org: string;
  org_slug: string;
  ws?: string;
  app?: string;
  binding_id: string;
  server_id: string;
  server_version: string;
  scope: string[];
  scope_hash: string;
  jti: string;
  iat: number;
  exp: number;
}

function loadPrivate(value: string | undefined): KeyObject | null {
  if (!value) return null;
  const pem = value.includes("BEGIN") ? value : Buffer.from(value, "base64").toString("utf8");
  try {
    return createPrivateKey(pem);
  } catch {
    return null;
  }
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

export function canonicalScopeHash(scope: string[], serverVersion: string): string {
  const canonical = JSON.stringify({ scope: [...scope].sort(), server_version: serverVersion });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/** EdDSA/Ed25519 JWT + JWKS；HMAC 仅 dev 兼容（由 proxy 处理）。 */
export class TicketService {
  readonly publicKey: KeyObject;
  readonly kid: string;
  readonly issuer: string;
  readonly ttlSeconds: number;
  readonly alg = "EdDSA";
  private readonly privateKey: KeyObject | null;
  private readonly denylist = new Map<string, number>();

  constructor(env: Env) {
    const privateKey = loadPrivate(env.MCP_TICKET_PRIVATE_KEY);
    if (privateKey) {
      this.privateKey = privateKey;
      this.publicKey = createPublicKey(privateKey);
    } else if (env.MCP_TICKET_PUBLIC_KEY) {
      this.privateKey = null;
      this.publicKey = createPublicKey(
        env.MCP_TICKET_PUBLIC_KEY.includes("BEGIN")
          ? env.MCP_TICKET_PUBLIC_KEY
          : Buffer.from(env.MCP_TICKET_PUBLIC_KEY, "base64").toString("utf8"),
      );
    } else {
      // dev 本地：进程内生成一次；生产必须注入密钥并发布 JWKS
      const pair = generateKeyPairSync("ed25519");
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
    }
    this.kid = env.MCP_TICKET_KID || "mcp-dev-1";
    this.issuer = env.MCP_TICKET_ISSUER || "control-plane";
    this.ttlSeconds = env.MCP_TICKET_TTL_SECONDS || 300;
  }

  issue(claims: Omit<McpTicketClaims, "iss" | "iat" | "exp" | "jti" | "scope_hash"> & { ttl_seconds?: number; jti?: string }): { ticket: string; claims: McpTicketClaims; kid: string } {
    if (!this.privateKey) throw new Error("ticket private key unavailable");
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.min(claims.ttl_seconds ?? this.ttlSeconds, this.ttlSeconds);
    const full: McpTicketClaims = {
      ...claims,
      iss: this.issuer,
      scope_hash: canonicalScopeHash(claims.scope, claims.server_version),
      jti: claims.jti ?? randomUUID(),
      iat: now,
      exp: now + ttl,
    };
    const header = b64url(JSON.stringify({ alg: this.alg, typ: "JWT", kid: this.kid }));
    const payload = b64url(JSON.stringify(full));
    const signature = sign(null, Buffer.from(`${header}.${payload}`), this.privateKey).toString("base64url");
    return { ticket: `${header}.${payload}.${signature}`, claims: full, kid: this.kid };
  }

  verify(token: string, nowSeconds = Math.floor(Date.now() / 1000)): McpTicketClaims {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("jwt_malformed");
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
    const header = decodeSegment(headerPart) as { alg?: string; kid?: string };
    if (header.alg !== "EdDSA") throw new Error("jwt_alg_invalid");
    if (header.kid && header.kid !== this.kid) throw new Error("jwt_kid_unknown");
    const ok = verify(null, Buffer.from(`${headerPart}.${payloadPart}`), this.publicKey, Buffer.from(signaturePart, "base64url"));
    if (!ok) throw new Error("jwt_signature_invalid");
    const claims = decodeSegment(payloadPart) as McpTicketClaims;
    if (claims.iss !== this.issuer) throw new Error("jwt_issuer_invalid");
    if (!claims.aud?.startsWith("mcp:org:")) throw new Error("jwt_audience_invalid");
    if (typeof claims.exp !== "number" || claims.exp < nowSeconds) throw new Error("jwt_expired");
    if (claims.exp - claims.iat > 300 + 5) throw new Error("jwt_ttl_too_long");
    if (this.denylist.has(claims.jti)) throw new Error("jwt_revoked");
    return claims;
  }

  jwks(): { keys: Array<Record<string, unknown>> } {
    const jwk = this.publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    return { keys: [{ ...jwk, kid: this.kid, alg: this.alg, use: "sig" }] };
  }

  revokeJti(jti: string, ttlSeconds = 300): void {
    this.denylist.set(jti, Math.floor(Date.now() / 1000) + ttlSeconds);
    for (const [key, exp] of this.denylist) if (exp < Math.floor(Date.now() / 1000)) this.denylist.delete(key);
  }

  isJtiRevoked(jti: string): boolean {
    return this.denylist.has(jti);
  }
}
