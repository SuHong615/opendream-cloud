// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError, badRequest } from "../lib/errors";
import { encryptSecret, secretKeyFor } from "../lib/secret-box";
import { randomId } from "../lib/crypto";
import { auditFromRequest } from "../services/audit";
import { enqueueOutbox } from "../services/outbox";
import { currentRequestId, parseInput, requireCsrf, requireRole, requireSession } from "./shared";

interface CredentialRow {
  id: string;
  org_id: string;
  name: string;
  env_key: string;
  cipher: string;
  description: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

function serialize(row: CredentialRow) {
  return {
    id: row.id,
    name: row.name,
    env_key: row.env_key,
    description: row.description,
    masked: "••••••••",
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

const envKey = /^[A-Z][A-Z0-9_]{1,63}$/u;

export function registerCredentialRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/credentials", async (request) => {
    const principal = requireSession(ctx, request);
    const rows = await ctx.dbPort.all<CredentialRow>("SELECT * FROM credentials WHERE org_id = ? ORDER BY updated_at DESC", [principal.orgId]);
    return { items: rows.map(serialize), request_id: currentRequestId(request) };
  });

  app.post("/api/v1/credentials", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const body = parseInput(z.object({
      name: z.string().min(1).max(80),
      env_key: z.string().regex(envKey),
      value: z.string().min(1).max(4096),
      description: z.string().max(500).default(""),
    }), request.body ?? {});
    const now = Date.now();
    const id = randomId();
    try {
      await ctx.dbPort.run(
        "INSERT INTO credentials (id, org_id, name, env_key, cipher, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, principal.orgId, body.name, body.env_key, encryptSecret(secretKeyFor(ctx.env), body.value), body.description ?? "", principal.userId, now, now],
      );
    } catch {
      throw badRequest("credential env_key already exists");
    }
    auditFromRequest(ctx.sqlite, { request, principal, action: "credential.create", resourceType: "credential", resourceId: id, outcome: "success", detail: { env_key: body.env_key } });
    enqueueOutbox(ctx, "credential.created", { credential_id: id, env_key: body.env_key }, principal.orgId);
    const row = await ctx.dbPort.get<CredentialRow>("SELECT * FROM credentials WHERE id = ?", [id]);
    return reply.code(201).send(serialize(row!));
  });

  app.put("/api/v1/credentials/:credentialId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { credentialId } = z.object({ credentialId: z.string() }).parse(request.params);
    const row = await ctx.dbPort.get<CredentialRow>("SELECT * FROM credentials WHERE id = ? AND org_id = ?", [credentialId, principal.orgId]);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "credential not found" });
    const body = parseInput(z.object({ name: z.string().min(1).max(80).optional(), value: z.string().min(1).max(4096).optional(), description: z.string().max(500).optional() }), request.body ?? {});
    await ctx.dbPort.run(
      "UPDATE credentials SET name = ?, cipher = ?, description = ?, updated_at = ? WHERE id = ?",
      [body.name ?? row.name, body.value ? encryptSecret(secretKeyFor(ctx.env), body.value) : row.cipher, body.description ?? row.description, Date.now(), credentialId],
    );
    auditFromRequest(ctx.sqlite, { request, principal, action: "credential.update", resourceType: "credential", resourceId: credentialId, outcome: "success" });
    enqueueOutbox(ctx, "credential.updated", { credential_id: credentialId, env_key: row.env_key }, principal.orgId);
    return serialize((await ctx.dbPort.get<CredentialRow>("SELECT * FROM credentials WHERE id = ?", [credentialId]))!);
  });

  app.delete("/api/v1/credentials/:credentialId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { credentialId } = z.object({ credentialId: z.string() }).parse(request.params);
    await ctx.dbPort.run("DELETE FROM credentials WHERE id = ? AND org_id = ?", [credentialId, principal.orgId]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "credential.delete", resourceType: "credential", resourceId: credentialId, outcome: "success" });
    enqueueOutbox(ctx, "credential.deleted", { credential_id: credentialId }, principal.orgId);
    return reply.code(204).send();
  });
}
