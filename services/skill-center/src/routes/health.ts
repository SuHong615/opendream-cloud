// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../context";

export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/healthz", async () => ({ status: "ok", version: ctx.version }));
  app.get("/readyz", async (_request, reply) => {
    if (ctx.store.skills.size < 0) return reply.code(503).send({ status: "degraded" });
    return reply.code(200).send({ status: "ok" });
  });
  app.get("/api/v1/health", async () => ({
    status: "ok",
    service: "skill-center",
    version: ctx.version,
    checks: { store: "ok", contract: "frozen" },
  }));
}
