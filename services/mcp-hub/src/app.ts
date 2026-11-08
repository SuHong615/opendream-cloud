// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { AppContext, BuildOptions } from "./context";
import { loadEnv } from "./env";
import { ApiError } from "./lib/errors";
import { registerInternalRoutes, registerRoutes, startHealthScheduler } from "./routes";
import { Store } from "./store";
import { flushCallLogs } from "./proxy";
import { TicketService } from "./tickets";

export const VERSION = "0.1.0-g5";

export function buildApp(options: BuildOptions = {}): { app: FastifyInstance; ctx: AppContext } {
  const env = options.env ?? loadEnv();
  const store = options.store ?? new Store();
  const now = options.now ?? (() => new Date());
  const ctx: AppContext = { env, store, version: VERSION, now, newId: options.newId ?? (() => store.newId()), tickets: options.tickets ?? new TicketService(env) };
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  app.addHook("onRequest", async (request, reply) => {
    const id = typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : crypto.randomUUID();
    reply.header("x-request-id", id);
  });
  app.addHook("onError", async (request, reply, error) => {
    console.error(`[mcp-hub] unhandled ${request.method} ${request.url}:`, error);
  });
  app.setErrorHandler((error, request, reply) => {
    const requestId = typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : crypto.randomUUID();
    if (error instanceof ApiError) return reply.code(error.status).send({ error: { ...error.toJSON().error, request_id: requestId } });
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "validation_failed",
          message: "request validation failed",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
          request_id: requestId,
        },
      });
    }
    return reply.code(500).send({ error: { code: "internal_error", message: "internal server error", request_id: requestId } });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: `Route not found: ${request.method} ${request.url}`, request_id: crypto.randomUUID() } }),
  );
  registerRoutes(app, ctx);
  registerInternalRoutes(app, ctx);
  const stopHealth = startHealthScheduler(ctx);
  app.addHook("onClose", async () => {
    stopHealth();
    await flushCallLogs(ctx);
  });
  return { app, ctx };
}
