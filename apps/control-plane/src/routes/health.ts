// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context";
import { currentRequestId } from "./shared";

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/api/v1/health", async (request, reply) => {
    const checks: Record<string, "ok" | "degraded" | "down"> = { database: "ok", migrations: "ok" };
    try {
      const count = ctx.sqlite
        .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM schema_migrations")
        .get();
      if (!count || count.c < 1) checks.migrations = "degraded";
    } catch {
      checks.database = "down";
    }
    const healthy = checks.database === "ok";
    return reply.code(healthy ? 200 : 503).send({
      status: healthy ? "ok" : "degraded",
      version: ctx.version,
      checks,
      request_id: currentRequestId(request),
    });
  });

  app.get("/healthz", async (_request, reply) => {
    return reply.code(200).send({ status: "ok", version: ctx.version });
  });

  app.get("/readyz", async (_request, reply) => {
    try {
      const row = ctx.sqlite
        .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM schema_migrations")
        .get();
      if (!row || row.c < 1) return reply.code(503).send({ status: "degraded", reason: "migrations_missing" });
      return reply.code(200).send({ status: "ok" });
    } catch (error) {
      return reply.code(503).send({ status: "degraded", reason: "database_unavailable" });
    }
  });
}
