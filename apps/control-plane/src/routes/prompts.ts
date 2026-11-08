// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../lib/errors";
import { auditFromRequest } from "../services/audit";
import { currentRequestId, parseInput, requireCsrf, requireRole, requireSession } from "./shared";

interface PromptRow {
  id: string;
  org_id: string | null;
  name: string;
  description: string;
  content: string;
  variables: string;
  tags: string;
  model_ref: string | null;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

function view(row: PromptRow): Record<string, unknown> {
  return {
    ...row,
    variables: JSON.parse(row.variables || "[]"),
    tags: JSON.parse(row.tags || "[]"),
    system: row.org_id === null,
  };
}

const bodySchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).default(""),
  content: z.string().min(1).max(20000),
  variables: z.array(z.string().min(1).max(64)).max(50).default([]),
  tags: z.array(z.string().min(1).max(32)).max(20).default([]),
  model_ref: z.string().max(120).nullable().optional(),
});

export function registerPromptRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/prompts", async (request) => {
    const principal = requireSession(ctx, request);
    const query = request.query as { q?: string; tag?: string };
    let rows = await ctx.dbPort.all<PromptRow>("SELECT * FROM prompts WHERE org_id IS NULL OR org_id = ? ORDER BY org_id IS NULL DESC, updated_at DESC", [principal.orgId]);
    if (query.tag) rows = rows.filter((row) => JSON.parse(row.tags || "[]").includes(query.tag));
    if (query.q) {
      const q = query.q.toLowerCase();
      rows = rows.filter((row) => row.name.toLowerCase().includes(q) || row.description.toLowerCase().includes(q) || row.content.toLowerCase().includes(q));
    }
    return { items: rows.map(view), request_id: currentRequestId(request) };
  });

  app.get("/api/v1/prompts/:promptId", async (request) => {
    const principal = requireSession(ctx, request);
    const { promptId } = request.params as { promptId: string };
    const row = await ctx.dbPort.get<PromptRow>("SELECT * FROM prompts WHERE id = ? AND (org_id IS NULL OR org_id = ?)", [promptId, principal.orgId]);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "prompt not found" });
    return view(row);
  });

  app.post("/api/v1/prompts", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const body = parseInput(bodySchema, request.body ?? {});
    const id = crypto.randomUUID();
    const now = Date.now();
    await ctx.dbPort.run("INSERT INTO prompts (id, org_id, name, description, content, variables, tags, model_ref, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, principal.orgId, body.name, body.description ?? "", body.content, JSON.stringify(body.variables ?? []), JSON.stringify(body.tags ?? []), body.model_ref ?? null, principal.userId, now, now]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "prompt.create", resourceType: "prompt", resourceId: id, outcome: "success", detail: { name: body.name } });
    return reply.code(201).send(view((await ctx.dbPort.get<PromptRow>("SELECT * FROM prompts WHERE id = ?", [id]))!));
  });

  app.patch("/api/v1/prompts/:promptId", async (request) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { promptId } = request.params as { promptId: string };
    const row = await ctx.dbPort.get<PromptRow>("SELECT * FROM prompts WHERE id = ? AND org_id = ?", [promptId, principal.orgId]);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "prompt not found or system preset is read-only" });
    const body = parseInput(bodySchema.partial(), request.body ?? {});
    const next = {
      name: body.name ?? row.name,
      description: body.description ?? row.description,
      content: body.content ?? row.content,
      variables: JSON.stringify(body.variables ?? JSON.parse(row.variables || "[]")),
      tags: JSON.stringify(body.tags ?? JSON.parse(row.tags || "[]")),
      model_ref: body.model_ref === undefined ? row.model_ref : body.model_ref,
      updated_at: Date.now(),
    };
    await ctx.dbPort.run("UPDATE prompts SET name=?, description=?, content=?, variables=?, tags=?, model_ref=?, updated_at=? WHERE id=?", [next.name, next.description, next.content, next.variables, next.tags, next.model_ref, next.updated_at, promptId]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "prompt.update", resourceType: "prompt", resourceId: promptId, outcome: "success" });
    return view((await ctx.dbPort.get<PromptRow>("SELECT * FROM prompts WHERE id = ?", [promptId]))!);
  });

  app.delete("/api/v1/prompts/:promptId", async (request, reply) => {
    const principal = requireSession(ctx, request);
    requireCsrf(request, principal);
    requireRole(principal, ["owner", "admin"]);
    const { promptId } = request.params as { promptId: string };
    const row = await ctx.dbPort.get<PromptRow>("SELECT * FROM prompts WHERE id = ? AND org_id = ?", [promptId, principal.orgId]);
    if (!row) throw new ApiError({ code: "not_found", status: 404, message: "prompt not found or system preset is read-only" });
    await ctx.dbPort.run("DELETE FROM prompts WHERE id = ?", [promptId]);
    auditFromRequest(ctx.sqlite, { request, principal, action: "prompt.delete", resourceType: "prompt", resourceId: promptId, outcome: "success" });
    return reply.code(204).send();
  });
}
