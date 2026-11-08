// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, requireCsrf, requireRole, requireSession } from "./shared";

interface OutboxRow {
  id: string;
  org_id: string | null;
  topic: string;
  payload: string;
  status: string;
  attempts: number;
  available_at: number;
  created_at: number;
  published_at: number | null;
  last_error: string | null;
}

function serialize(row: OutboxRow) {
  return {
    id: row.id,
    org_id: row.org_id,
    topic: row.topic,
    status: row.status,
    attempts: row.attempts,
    available_at: new Date(row.available_at).toISOString(),
    created_at: new Date(row.created_at).toISOString(),
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
    last_error: row.last_error,
  };
}

export function registerOutboxRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/outbox/events", async (request) => {
    const principal = requireSession(ctx, request);
    requireRole(principal, ["owner", "admin"]);
    const query = z.object({ status: z.enum(["pending", "publishing", "published", "failed"]).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }).parse(request.query ?? {});
    const rows = query.status
      ? await ctx.dbPort.all<OutboxRow>("SELECT * FROM outbox_events WHERE org_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?", [principal.orgId, query.status, query.limit])
      : await ctx.dbPort.all<OutboxRow>("SELECT * FROM outbox_events WHERE org_id = ? ORDER BY created_at DESC LIMIT ?", [principal.orgId, query.limit]);
    const stats = await ctx.dbPort.all<{ status: string; count: number }>("SELECT status, COUNT(*) AS count FROM outbox_events WHERE org_id = ? GROUP BY status", [principal.orgId]);
    return { items: rows.map(serialize), stats: Object.fromEntries(stats.map((row) => [row.status, row.count])), request_id: currentRequestId(request) };
  });

  app.post("/api/v1/outbox/events/:eventId/replay", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { eventId } = z.object({ eventId: z.string() }).parse(request.params);
    const row = await ctx.dbPort.get<OutboxRow>("SELECT * FROM outbox_events WHERE id = ? AND org_id = ?", [eventId, principal.orgId]);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "event not found" });
    await ctx.dbPort.run("UPDATE outbox_events SET status = 'pending', attempts = 0, available_at = ?, last_error = NULL WHERE id = ?", [Date.now(), eventId]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "outbox.replay", resourceType: "outbox_event", resourceId: eventId, outcome: "success", detail: { topic: row.topic } });
    return { id: eventId, status: "pending" };
  });
}
