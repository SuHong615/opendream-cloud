// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tenantOf } from "./auth";
import type { AppContext } from "./context";
import { badRequest } from "./errors";

const memoryMessageSchema = z.object({
  role: z.string().min(1).max(32),
  content: z.string().min(1).max(4000),
});

const addMemorySchema = z.object({
  messages: z.array(memoryMessageSchema).min(1).max(50),
  user_id: z.string().min(1).max(128).optional(),
  agent_id: z.string().min(1).max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const listMemoryQuery = z.object({
  user_id: z.string().min(1).max(128).optional(),
  agent_id: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const searchMemorySchema = z.object({
  query: z.string().min(1).max(1000),
  user_id: z.string().min(1).max(128).optional(),
  agent_id: z.string().min(1).max(128).optional(),
  top_k: z.number().int().min(1).max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
});

const memoryParams = z.object({ memoryId: z.string().min(1).max(128) });

const createExperienceSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20_000),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  source: z.string().min(1).max(200).optional(),
});

const listExperienceQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const searchExperienceQuery = z.object({
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown, where = "body"): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw badRequest(`invalid ${where}`, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
  return parsed.data;
}

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------- health
  app.get("/healthz", async () => {
    const counts = ctx.store.counts();
    return {
      status: "ok",
      service: "memory-service",
      version: ctx.version,
      uptime_ms: Date.now() - ctx.store.startedAt,
      memories: counts.memories,
      experiences: counts.experiences,
    };
  });

  app.get("/readyz", async () => ({ status: "ok" }));

  // ---------------- memory（mem0 兼容，数据面内部接口；不注册公开契约）
  app.post("/v1/memories", async (request) => {
    const tenant = tenantOf(request, ctx.env);
    const input = parse(addMemorySchema, request.body ?? {});
    const memory = ctx.store.addMemory(tenant, input);
    return {
      results: [{ ...memory, event: "ADD" }],
      items: [memory],
      count: 1,
      request_id: request.id,
    };
  });

  app.get("/v1/memories", async (request) => {
    const tenant = tenantOf(request, ctx.env);
    const query = parse(listMemoryQuery, request.query ?? {}, "query");
    const items = ctx.store.listMemories(tenant, query);
    return { results: items, items, count: items.length, request_id: request.id };
  });

  app.post("/v1/memories/search", async (request) => {
    const tenant = tenantOf(request, ctx.env);
    const input = parse(searchMemorySchema, request.body ?? {});
    const results = ctx.store.searchMemories(tenant, input);
    return { results, count: results.length, request_id: request.id };
  });

  app.delete("/v1/memories/:memoryId", async (request) => {
    const tenant = tenantOf(request, ctx.env);
    const params = parse(memoryParams, request.params, "params");
    ctx.store.deleteMemory(tenant, params.memoryId);
    return { message: "Memory deleted successfully", id: params.memoryId, request_id: request.id };
  });

  // ---------------- experience（MVP extension，1.2 收编）
  app.get("/api/v1/experiences", async (request) => {
    const tenant = tenantOf(request, ctx.env);
    const query = parse(listExperienceQuery, request.query ?? {}, "query");
    const items = ctx.store.listExperiences(tenant, query.limit);
    return { items, count: items.length, next_cursor: null, request_id: request.id };
  });

  app.post("/api/v1/experiences", async (request, reply) => {
    const tenant = tenantOf(request, ctx.env);
    const input = parse(createExperienceSchema, request.body ?? {});
    const experience = ctx.store.createExperience(tenant, input);
    return reply.code(201).send({ ...experience, request_id: request.id });
  });

  app.get("/api/v1/experiences/search", async (request) => {
    const tenant = tenantOf(request, ctx.env);
    const query = parse(searchExperienceQuery, request.query ?? {}, "query");
    const items = ctx.store.searchExperiences(tenant, query.q, query.limit);
    return { items, count: items.length, request_id: request.id };
  });
}
