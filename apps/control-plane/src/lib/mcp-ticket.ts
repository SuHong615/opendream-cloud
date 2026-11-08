// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, createPrivateKey, randomUUID, sign } from "node:crypto";
import type { Env } from "../env";

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

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function canonicalScopeHash(scope: string[], serverVersion: string): string {
  const canonical = JSON.stringify({ scope: [...scope].sort(), server_version: serverVersion });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export class McpTicketSigner {
  readonly kid: string;
  readonly issuer: string;
  readonly ttlSeconds: number;
  private readonly privateKey: ReturnType<typeof createPrivateKey>;

  constructor(env: Env) {
    const pem = env.MCP_TICKET_PRIVATE_KEY
      ? env.MCP_TICKET_PRIVATE_KEY.includes("BEGIN")
        ? env.MCP_TICKET_PRIVATE_KEY
        : Buffer.from(env.MCP_TICKET_PRIVATE_KEY, "base64").toString("utf8")
      : "";
    if (!pem) throw new Error("MCP_TICKET_PRIVATE_KEY missing");
    this.privateKey = createPrivateKey(pem);
    this.kid = env.MCP_TICKET_KID;
    this.issuer = env.MCP_TICKET_ISSUER;
    this.ttlSeconds = env.MCP_TICKET_TTL_SECONDS;
  }

  issue(input: {
    sub: string;
    org: string;
    org_slug: string;
    binding_id: string;
    server_id: string;
    server_version: string;
    scope: string[];
    ws?: string;
    app?: string;
    ttl_seconds?: number;
  }): { ticket: string; claims: McpTicketClaims; jti: string; kid: string; expires_in: number } {
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(30, Math.min(input.ttl_seconds ?? this.ttlSeconds, 300));
    const jti = randomUUID();
    const claims: McpTicketClaims = {
      iss: this.issuer,
      aud: `mcp:org:${input.org_slug}`,
      sub: input.sub,
      org: input.org,
      org_slug: input.org_slug,
      ...(input.ws ? { ws: input.ws } : {}),
      ...(input.app ? { app: input.app } : {}),
      binding_id: input.binding_id,
      server_id: input.server_id,
      server_version: input.server_version,
      scope: input.scope,
      scope_hash: canonicalScopeHash(input.scope, input.server_version),
      jti,
      iat: now,
      exp: now + ttl,
    };
    const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: this.kid }));
    const payload = b64url(JSON.stringify(claims));
    const signature = sign(null, Buffer.from(`${header}.${payload}`), this.privateKey).toString("base64url");
    return { ticket: `${header}.${payload}.${signature}`, claims, jti, kid: this.kid, expires_in: ttl };
  }
}
