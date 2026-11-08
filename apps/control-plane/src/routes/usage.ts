// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { currentRequestId, parseInput, requireAnyPrincipal, requireScope } from "./shared";

export function registerUsageRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/usage", async (request) => {
    const principal = requireAnyPrincipal(ctx, request);
    requireScope(principal, "usage:read");
    const query = parseInput(
      z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        group_by: z.enum(["user", "workspace", "model", "day", "hour", "none"]).optional(),
        workspace_id: z.string().optional(),
        user_id: z.string().optional(),
        model_id: z.string().optional(),
        include_total: z.enum(["true", "false"]).optional(),
      }),
      request.query ?? {},
      "query",
    );
    const from = query.from ? Date.parse(query.from) : Date.now() - 24 * 60 * 60 * 1000;
    const to = query.to ? Date.parse(query.to) : Date.now();
    const rows = (await ctx.dbPort.all<{
      user_id: string | null;
      workspace_id: string | null;
      model_id: string | null;
      tokens_input: number;
      tokens_output: number;
      tokens_reasoning: number;
      tokens_cache_read: number;
      tokens_cache_write: number;
      cost_usd: string;
      occurred_at: number;
    }>(
      `SELECT user_id, workspace_id, model_id, tokens_input, tokens_output, tokens_reasoning,
        tokens_cache_read, tokens_cache_write, cost_usd, occurred_at
       FROM usage_records WHERE org_id = ? AND occurred_at >= ? AND occurred_at <= ?`,
      [principal.orgId, from, to],
    )).filter((row) => {
      if (query.workspace_id && row.workspace_id !== query.workspace_id) return false;
      if (query.user_id && row.user_id !== query.user_id) return false;
      if (query.model_id && row.model_id !== query.model_id) return false;
      return true;
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.requests += 1;
        acc.tokens.input += row.tokens_input;
        acc.tokens.output += row.tokens_output;
        acc.tokens.reasoning += row.tokens_reasoning;
        acc.tokens.cache.read += row.tokens_cache_read;
        acc.tokens.cache.write += row.tokens_cache_write;
        acc.cost += Number(row.cost_usd);
        return acc;
      },
      {
        requests: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        cost: 0,
      },
    );

    return {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      group_by: query.group_by ?? "none",
      currency: "USD",
      summary: {
        requests: summary.requests,
        tokens: summary.tokens,
        cost_usd: summary.cost.toFixed(6),
      },
      items: [],
      next_cursor: null,
      request_id: currentRequestId(request),
    };
  });
}
