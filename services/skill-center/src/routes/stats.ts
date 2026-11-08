// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../context";
import { notFound } from "../lib/errors";

export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/skills/:skillId/stats", async (request) => {
    const { skillId } = z.object({ skillId: z.string() }).parse(request.params);
    const skill = ctx.store.skills.get(skillId);
    if (!skill || skill.deleted) throw notFound("skill not found");
    const installations = [...ctx.store.installations.values()].filter((item) => item.skill_id === skill.id);
    return {
      skill_id: skill.id,
      installs_total: installations.length,
      installs_active: installations.filter((item) => item.enabled).length,
      calls_total: 0,
      rating_avg: skill.avg_rating,
      rating_count: skill.rating_count,
      last_error_at: null,
    };
  });
}
