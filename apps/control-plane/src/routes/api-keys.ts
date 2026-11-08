// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { newApiKey, randomId } from "../lib/crypto";
import { iso } from "../lib/http";
import { notFound } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, parseInput, requireCsrf, requireSession } from "./shared";

const createKeySchema = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.string().min(1)).max(20).optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
});

interface ApiKeyRow {
  id: string;
  org_id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string;
  last_used_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
}

function serializeKey(row: ApiKeyRow) {
  let scopes: string[];
  try {
    scopes = JSON.parse(row.scopes) as string[];
  } catch {
    scopes = [];
  }
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes,
    last_used_at: iso(row.last_used_at),
    expires_at: iso(row.expires_at),
    revoked_at: iso(row.revoked_at),
    created_at: new Date(row.created_at).toISOString(),
  };
}

const DEFAULT_SCOPES = ["workspace:read", "workspace:write", "model:invoke", "usage:read"];

export function registerApiKeyRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/api-keys", async (request) => {
    const principal = requireSession(ctx, request);
    const rows = await ctx.dbPort.all<ApiKeyRow>("SELECT * FROM api_keys WHERE org_id = ? AND user_id = ? ORDER BY created_at DESC", [principal.orgId, principal.userId]);
    return { items: rows.map(serializeKey), next_cursor: null, request_id: currentRequestId(request) };
  });

  app.post("/api/v1/api-keys", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const body = parseInput(createKeySchema, request.body ?? {});
    const created = newApiKey(ctx.env.APIKEY_PEPPER);
    const id = randomId();
    const now = Date.now();
    const scopes = body.scopes ?? DEFAULT_SCOPES;
    const expiresAt = body.expires_at ? Date.parse(body.expires_at) : null;
    await ctx.dbPort.run(
      `INSERT INTO api_keys (id, org_id, user_id, name, prefix, key_hash, key_version, scopes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, principal.orgId, principal.userId, body.name, created.prefix, created.hash, created.keyVersion, JSON.stringify(scopes), expiresAt, now],
    );
    auditFromRequest(ctx.sqlite, {
      request,
      principal,
      action: "apikey.create",
      resourceType: "api_key",
      resourceId: id,
      outcome: "success",
      detail: { prefix: created.prefix, scopes },
    });
    return reply.code(201).send({
      ...serializeKey({
        id,
        org_id: principal.orgId,
        user_id: principal.userId,
        name: body.name,
        prefix: created.prefix,
        scopes: JSON.stringify(scopes),
        last_used_at: null,
        expires_at: expiresAt,
        revoked_at: null,
        created_at: now,
      }),
      plaintext: created.plaintext,
      warning: "请立即保存，此后无法再次获取明文",
    });
  });

  app.delete("/api/v1/api-keys/:keyId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const params = parseInput(z.object({ keyId: z.string().uuid() }), request.params, "params");
    const row = await ctx.dbPort.get<ApiKeyRow>(
      "SELECT * FROM api_keys WHERE id = ? AND org_id = ? AND user_id = ?",
      [params.keyId, principal.orgId, principal.userId],
    );
    if (!row) throw notFound("API key not found");
    if (row.revoked_at === null) {
      await ctx.dbPort.run("UPDATE api_keys SET revoked_at = ? WHERE id = ?", [Date.now(), row.id]);
      auditFromRequest(ctx.sqlite, {
        request,
        principal,
        action: "apikey.revoke",
        resourceType: "api_key",
        resourceId: row.id,
        outcome: "success",
        detail: { prefix: row.prefix },
      });
    }
    return reply.code(204).send();
  });
}
