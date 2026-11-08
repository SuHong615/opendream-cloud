// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { requireApiKey } from "./auth";
import type { AppContext, BuildOptions } from "./context";
import { loadEnv } from "./env";
import { MemoryError } from "./errors";
import { registerRoutes } from "./routes";
import { MemoryStore } from "./store";

export const VERSION = "0.1.0-m5";

export function buildApp(options: BuildOptions = {}): { app: FastifyInstance; ctx: AppContext } {
  const env = options.env ?? loadEnv();
  const store = options.store ?? new MemoryStore(env, options.now);
  const ctx: AppContext = { env, store, version: VERSION };

  const quiet = options.quiet === true || env.NODE_ENV === "test";
  const app = Fastify({
    logger: quiet ? false : { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 2 * 1024 * 1024,
  });

  // 允许 `content-type: application/json` + 空 body（DELETE/无参数写操作）按 {} 处理
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = typeof body === "string" ? body : String(body ?? "");
    if (text.trim() === "") return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers["x-request-id"];
    const requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : request.id;
    reply.header("x-request-id", requestId);
  });

  // 内部数据面鉴权：/healthz、/readyz 开放，其余全部要求 Bearer MEMORY_API_KEY
  app.addHook("preHandler", async (request) => {
    const path = request.url.split("?")[0] ?? request.url;
    if (path === "/healthz" || path === "/readyz") return;
    requireApiKey(request, env.MEMORY_API_KEY);
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : request.id;
    if (error instanceof MemoryError) return reply.code(error.status).send(error.toBody(requestId));
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
    console.error(`[memory-service] unhandled ${request.method} ${request.url}:`, error);
    const status = (error as { statusCode?: number }).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(status).send({ error: { code: "validation_failed", message, request_id: requestId } });
    }
    return reply.code(500).send({ error: { code: "internal_error", message: "internal server error", request_id: requestId } });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: `Route not found: ${request.method} ${request.url}`, request_id: request.id } }),
  );

  registerRoutes(app, ctx);

  app.addHook("onClose", async () => {
    // 内存 store 无外部资源；预留清理钩子。
  });

  return { app, ctx };
}
