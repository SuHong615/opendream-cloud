// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { newApiKey, randomId } from "../lib/crypto";
import { auditFromRequest } from "../services/audit";
import { uploadExport } from "../services/export-storage";
import { currentRequestId, parseInput, requireCsrf, requireRole, requireSession } from "./shared";

interface ExportJob { id: string; org_id: string; kind: "audit" | "usage"; status: "completed"; content: string; created_at: string; rows: number }
const exports = new Map<string, ExportJob>();
interface QuotaRequest { id: string; org_id: string; resource: string; amount: number; reason: string; status: "pending" | "approved" | "rejected"; created_at: string }
const quotaRequests = new Map<string, QuotaRequest>();

export function registerBacklogRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------- API key rotation
  const rotate = async (request: { headers: Record<string, unknown>; params: unknown; body: unknown }) => {
    const principal = requireSession(ctx, request as never);
    requireCsrf(request as never, principal);
    const { keyId } = z.object({ keyId: z.string() }).parse(request.params);
    const row = ctx.sqlite.query<{ id: string }, [string, string, string]>("SELECT id FROM api_keys WHERE id = ? AND org_id = ? AND user_id = ?").get(keyId, principal.orgId, principal.userId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "api key not found" });
    const created = newApiKey(ctx.env.APIKEY_PEPPER);
    ctx.sqlite
      .query("UPDATE api_keys SET prefix = ?, key_hash = ?, key_version = key_version + 1, created_at = ? WHERE id = ?")
      .run(created.prefix, created.hash, Date.now(), keyId);
    auditFromRequest(ctx.sqlite, { request: request as never, principal, action: "apikey.rotate", resourceType: "api_key", resourceId: keyId, outcome: "success" });
    return { id: keyId, plaintext: created.plaintext, prefix: created.prefix, rotated_at: new Date().toISOString() };
  };
  app.post("/api/v1/api-keys/:keyId/rotate", rotate);
  app.post("/api/v1/api-keys/:keyId", rotate);

  // ---------------- Organizations
  app.get("/api/v1/orgs", async (request) => {
    const principal = requireSession(ctx, request);
    const rows = ctx.sqlite
      .query<{ id: string; slug: string; name: string; role: string }, [string]>(
        "SELECT o.id, o.slug, o.name, m.role FROM orgs o JOIN memberships m ON m.org_id = o.id WHERE m.user_id = ? ORDER BY o.created_at",
      )
      .all(principal.userId);
    return { items: rows.map((row) => ({ ...row, current: row.id === principal.orgId })) };
  });
  app.post("/api/v1/orgs", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const body = parseInput(z.object({ name: z.string().min(1).max(120), slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/).optional() }), request.body ?? {});
    const slug = body.slug ?? `o-${randomId().slice(0, 8)}`;
    const now = Date.now();
    const orgId = randomId();
    ctx.sqlite.query("INSERT INTO orgs (id, slug, name, kind, plan, data_region, status, created_at) VALUES (?, ?, ?, 'team', 'free', 'cn-hangzhou', 'active', ?)").run(orgId, slug, body.name, now);
    ctx.sqlite.query("INSERT INTO memberships (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, 'owner', 'active', ?)").run(randomId(), orgId, principal.userId, now);
    auditFromRequest(ctx.sqlite, { request, principal, action: "org.create", resourceType: "org", resourceId: orgId, outcome: "success", detail: { name: body.name } });
    return reply.code(201).send({ id: orgId, slug, name: body.name, role: "owner" });
  });
  app.get("/api/v1/orgs/:orgId", async (request) => {
    const principal = requireSession(ctx, request);
    const { orgId } = z.object({ orgId: z.string() }).parse(request.params);
    const row = ctx.sqlite.query<{ id: string; slug: string; name: string; plan: string }, [string, string]>("SELECT o.id, o.slug, o.name, o.plan FROM orgs o JOIN memberships m ON m.org_id = o.id WHERE o.id = ? AND m.user_id = ?").get(orgId, principal.userId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "organization not found" });
    return row;
  });
  app.patch("/api/v1/orgs/:orgId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const { orgId } = z.object({ orgId: z.string() }).parse(request.params);
    const body = parseInput(z.object({ name: z.string().min(1).max(120).optional() }), request.body ?? {});
    const member = ctx.sqlite.query<{ role: string }, [string, string]>("SELECT role FROM memberships WHERE org_id = ? AND user_id = ?").get(orgId, principal.userId);
    if (!member || !["owner", "admin"].includes(member.role)) throw new ApiError({ code: "not_found", status: 404, message: "organization not found" });
    if (body.name) ctx.sqlite.query("UPDATE orgs SET name = ? WHERE id = ?").run(body.name, orgId);
    return { id: orgId, name: body.name };
  });

  // ---------------- quotas / quota requests
  app.get("/api/v1/quotas", async (request) => {
    const principal = requireSession(ctx, request);
    const row = ctx.sqlite.query<{ workspaces: number; members: number; budget_usd: number; mcp_servers: number }, [string]>("SELECT workspaces, members, budget_usd, mcp_servers FROM org_quotas WHERE org_id = ?").get(principal.orgId);
    return row ?? { workspaces: 10, members: 50, budget_usd: 100, mcp_servers: 20 };
  });
  app.get("/api/v1/quota-requests", async (request) => {
    const principal = requireSession(ctx, request);
    return { items: [...quotaRequests.values()].filter((item) => item.org_id === principal.orgId) };
  });
  app.post("/api/v1/quota-requests", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const body = parseInput(z.object({ resource: z.enum(["workspaces", "members", "budget_usd", "mcp_servers"]), amount: z.number().positive(), reason: z.string().max(1000).default("") }), request.body ?? {});
    const record: QuotaRequest = { id: randomId(), org_id: principal.orgId, resource: body.resource, amount: body.amount, reason: body.reason ?? "", status: "pending", created_at: new Date().toISOString() };
    quotaRequests.set(record.id, record);
    auditFromRequest(ctx.sqlite, { request, principal, action: "quota.request", resourceType: "quota_request", resourceId: record.id, outcome: "success" });
    return reply.code(201).send(record);
  });

  // ---------------- audit / usage exports
  app.post("/api/v1/audit-logs/exports", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const rows = ctx.sqlite.query("SELECT * FROM audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT 10000").all(principal.orgId);
    const content = rows.map((row) => JSON.stringify(row)).join("\n");
    const job: ExportJob = { id: randomId(), org_id: principal.orgId, kind: "audit", status: "completed", content, created_at: new Date().toISOString(), rows: rows.length };
    exports.set(job.id, job);
    const uploaded = await uploadExport(ctx.env, `audit-${job.id}.ndjson`, content).catch(() => null);
    return reply.code(202).send({ id: job.id, kind: job.kind, status: job.status, rows: job.rows, download_url: uploaded ?? `/api/v1/audit-logs/exports/${job.id}` });
  });
  app.get("/api/v1/audit-logs/exports/:exportId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    const job = exports.get((request.params as { exportId: string }).exportId);
    if (!job || job.org_id !== principal.orgId || job.kind !== "audit") throw new ApiError({ code: "not_found", status: 404, message: "export not found" });
    return reply.type("application/x-ndjson").send(job.content);
  });
  app.post("/api/v1/usage/exports", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const rows = ctx.sqlite.query("SELECT * FROM usage_records WHERE org_id = ? ORDER BY occurred_at DESC LIMIT 10000").all(principal.orgId);
    const content = rows.map((row) => JSON.stringify(row)).join("\n");
    const job: ExportJob = { id: randomId(), org_id: principal.orgId, kind: "usage", status: "completed", content, created_at: new Date().toISOString(), rows: rows.length };
    exports.set(job.id, job);
    const uploaded = await uploadExport(ctx.env, `usage-${job.id}.ndjson`, content).catch(() => null);
    return reply.code(202).send({ id: job.id, kind: job.kind, status: job.status, rows: job.rows, download_url: uploaded ?? `/api/v1/usage/exports/${job.id}` });
  });
  app.get("/api/v1/usage/exports/:exportId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    const job = exports.get((request.params as { exportId: string }).exportId);
    if (!job || job.org_id !== principal.orgId || job.kind !== "usage") throw new ApiError({ code: "not_found", status: 404, message: "export not found" });
    return reply.type("application/x-ndjson").send(job.content);
  });

  // ---------------- events SSE (heartbeat + optional in-process notifications)
  app.get("/api/v1/events", async (request, reply) => {
    const principal = requireSession(ctx, request);
    const raw = reply.raw;
    raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    raw.write(`event: ready\ndata: ${JSON.stringify({ org_id: principal.orgId, ts: Date.now() })}\n\n`);
    const timer = setInterval(() => raw.write(`: ping\n\n`), 15_000);
    request.raw.on("close", () => clearInterval(timer));
    return reply;
  });

  // ---------------- workspace retry / restore
  app.post("/api/v1/workspaces/:workspaceId/retry", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const { workspaceId } = z.object({ workspaceId: z.string() }).parse(request.params);
    const row = ctx.sqlite.query<{ id: string }, [string, string]>( "SELECT id FROM workspaces WHERE id = ? AND org_id = ? AND deleted_at IS NULL").get(workspaceId, principal.orgId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "workspace not found" });
    ctx.sqlite.query("UPDATE workspaces SET state = 'provisioning', state_reason = NULL WHERE id = ?").run(workspaceId);
    auditFromRequest(ctx.sqlite, { request, principal, action: "workspace.retry", resourceType: "workspace", resourceId: workspaceId, outcome: "success" });
    return { id: workspaceId, state: "provisioning" };
  });
  app.post("/api/v1/workspaces/:workspaceId/restore", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const { workspaceId } = z.object({ workspaceId: z.string() }).parse(request.params);
    const row = ctx.sqlite.query<{ id: string; state: string }, [string, string]>("SELECT id, state FROM workspaces WHERE id = ? AND org_id = ?").get(workspaceId, principal.orgId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "workspace not found" });
    ctx.sqlite.query("UPDATE workspaces SET state = 'ready', state_reason = NULL, deleted_at = NULL WHERE id = ?").run(workspaceId);
    auditFromRequest(ctx.sqlite, { request, principal, action: "workspace.restore", resourceType: "workspace", resourceId: workspaceId, outcome: "success" });
    return { id: workspaceId, state: "ready", restored: true };
  });

  // ---------------- workspace snapshots
  const snapshots = new Map<string, Array<{ id: string; workspace_id: string; label: string; created_at: string; size: string }>>();
  app.get("/api/v1/workspaces/:workspaceId/snapshots", async (request) => {
    const principal = requireSession(ctx, request);
    const { workspaceId } = z.object({ workspaceId: z.string() }).parse(request.params);
    const row = ctx.sqlite.query<{ id: string }, [string, string]>("SELECT id FROM workspaces WHERE id = ? AND org_id = ? AND deleted_at IS NULL").get(workspaceId, principal.orgId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "workspace not found" });
    return { items: snapshots.get(workspaceId) ?? [] };
  });
  app.post("/api/v1/workspaces/:workspaceId/snapshots", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    const { workspaceId } = z.object({ workspaceId: z.string() }).parse(request.params);
    const body = parseInput(z.object({ label: z.string().max(120).optional() }), request.body ?? {});
    const row = ctx.sqlite.query<{ id: string }, [string, string]>("SELECT id FROM workspaces WHERE id = ? AND org_id = ? AND deleted_at IS NULL").get(workspaceId, principal.orgId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "workspace not found" });
    const record = { id: randomId(), workspace_id: workspaceId, label: body.label ?? `snapshot-${new Date().toISOString()}`, created_at: new Date().toISOString(), size: "20Gi" };
    snapshots.set(workspaceId, [record, ...(snapshots.get(workspaceId) ?? [])]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "workspace.snapshot.create", resourceType: "workspace_snapshot", resourceId: record.id, outcome: "success" });
    return reply.code(201).send(record);
  });

  // ---------------- model policy delete
  app.delete("/api/v1/model-policies/:policyId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { policyId } = z.object({ policyId: z.string() }).parse(request.params);
    const row = ctx.sqlite.query<{ id: string }, [string, string]>("SELECT id FROM model_policies WHERE id = ? AND org_id = ?").get(policyId, principal.orgId);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "policy not found" });
    ctx.sqlite.query("DELETE FROM model_policies WHERE id = ?").run(policyId);
    auditFromRequest(ctx.sqlite, { request, principal, action: "model.policy.delete", resourceType: "model_policy", resourceId: policyId, outcome: "success" });
    return reply.code(204).send();
  });
}
