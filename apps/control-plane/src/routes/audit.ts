// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { parseJson, pageLimit } from "../lib/http";
import { forbidden } from "../lib/errors";
import { currentRequestId, parseInput, requireSession } from "./shared";

export function registerAuditRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/audit-logs", async (request) => {
    const principal = requireSession(ctx, request);
    if (principal.role === "member" || principal.role === "viewer") {
      throw forbidden("audit.read.org required", { permission: "audit.read.org" });
    }
    const query = parseInput(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        action: z.string().optional(),
        resource_type: z.string().optional(),
        resource_id: z.string().optional(),
        outcome: z.enum(["success", "denied", "error"]).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
      }),
      request.query ?? {},
      "query",
    );
    const limit = pageLimit(query.limit);
    const rows = (await ctx.dbPort.all<{
      id: string;
      org_id: string | null;
      actor_type: string;
      actor_id: string | null;
      actor_ip: string | null;
      user_agent: string | null;
      action: string;
      resource_type: string;
      resource_id: string | null;
      outcome: string;
      detail: string | null;
      request_id: string | null;
      created_at: number;
    }>("SELECT * FROM audit_logs WHERE org_id = ? ORDER BY created_at DESC LIMIT 500", [principal.orgId]))
      .filter((row) => {
        if (query.action && row.action !== query.action) return false;
        if (query.resource_type && row.resource_type !== query.resource_type) return false;
        if (query.resource_id && row.resource_id !== query.resource_id) return false;
        if (query.outcome && row.outcome !== query.outcome) return false;
        if (query.from && row.created_at < Date.parse(query.from)) return false;
        if (query.to && row.created_at > Date.parse(query.to)) return false;
        return true;
      })
      .slice(0, limit);
    return {
      items: rows.map((row) => ({
        id: row.id,
        org_id: row.org_id,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        actor_ip: row.actor_ip,
        user_agent: row.user_agent,
        action: row.action,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        outcome: row.outcome,
        detail: parseJson<Record<string, unknown>>(row.detail, {}),
        request_id: row.request_id,
        created_at: new Date(row.created_at).toISOString(),
      })),
      next_cursor: null,
      request_id: currentRequestId(request),
    };
  });
}
