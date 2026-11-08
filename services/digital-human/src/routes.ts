// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "./context";
import { badRequest, notFound } from "./errors";
import type { DhEvent, Tenant } from "./types";

const SESSION_MODES = ["realtime", "near_realtime", "offline"] as const;
const SIMULATE_SCENARIOS = ["degraded", "tts_unavailable", "rtc_unavailable", "lipsync_failed", "content_blocked"] as const;

const sessionParams = z.object({ sessionId: z.string().uuid() });
const jobParams = z.object({ jobId: z.string().uuid() });
const webhookParams = z.object({ webhookId: z.string().uuid() });

const paginationQuery = z.object({
  cursor: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const createSessionSchema = z.object({
  app_id: z.string().uuid().optional(),
  mode: z.enum(SESSION_MODES).optional(),
  avatar_id: z.string().min(1).max(64).optional(),
  voice_id: z.string().min(1).max(64).optional(),
  persona_ref: z.string().min(1).max(128).optional(),
  voice_ref: z.string().min(1).max(128).optional(),
  greeting: z.string().min(1).max(1000).optional(),
  limits: z.record(z.unknown()).optional(),
});

const messageSchema = z.object({
  text: z.string().min(1).max(4000),
  simulate: z.enum(SIMULATE_SCENARIOS).optional(),
});

const webhookSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.string().min(1).max(64)).min(1).max(20).optional(),
  description: z.string().max(200).optional(),
});

const embedTokenSchema = z.object({
  app_id: z.string().uuid(),
  origin: z.string().min(1).max(200).optional(),
  ttl: z.number().int().min(1).max(600).optional(),
});

const renderJobSchema = z.object({
  app_id: z.string().uuid(),
  script: z.string().max(20_000).optional(),
  output: z.record(z.unknown()).optional(),
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

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** 门面/网关注入的租户头；无头时回退到开发默认值（生产仅内网可达，鉴权在门面）。 */
function tenantOf(request: FastifyRequest, ctx: AppContext): Tenant {
  const orgId = headerValue(request, "x-oc-org-id") ?? ctx.env.DEFAULT_ORG_ID;
  const userId = headerValue(request, "x-oc-user-id") ?? ctx.env.DEFAULT_USER_ID;
  const roles = (headerValue(request, "x-oc-roles") ?? "owner")
    .split(",")
    .map((role) => role.trim())
    .filter(Boolean);
  return { orgId, userId, roles };
}

function pageOf<T>(items: T[], query: { cursor?: string; limit?: number }, idOf: (item: T) => string): { items: T[]; next_cursor: string | null } {
  const limit = query.limit ?? 20;
  let start = 0;
  if (query.cursor) {
    const index = items.findIndex((item) => idOf(item) === query.cursor);
    start = index >= 0 ? index + 1 : 0;
  }
  const slice = items.slice(start, start + limit);
  const last = slice[slice.length - 1];
  return { items: slice, next_cursor: start + limit < items.length && last ? idOf(last) : null };
}

function parseEventId(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sseFrame(event: DhEvent): string {
  const payload = {
    seq: event.seq,
    type: event.type,
    ts: new Date(event.ts).toISOString(),
    ...event.data,
  };
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  // ---------------- health
  app.get("/healthz", async () => {
    const counts = ctx.service.counts();
    return {
      status: "ok",
      service: "digital-human",
      version: ctx.version,
      uptime_ms: Date.now() - ctx.service.startedAt,
      mode: "l1-mock",
      sessions: { total: counts.sessions, active: counts.active, sse_listeners: counts.listeners },
      webhooks: ctx.webhooks.count(),
      render_jobs: counts.render_jobs,
      embed_tokens: counts.embed_tokens,
    };
  });

  app.get("/readyz", async () => ({ status: "ok" }));

  // ---------------- assets（MVP extension）
  app.get("/api/v1/dh/avatars", async (request) => {
    tenantOf(request, ctx);
    return { items: ctx.service.listAvatars(), next_cursor: null, request_id: request.id };
  });

  app.get("/api/v1/dh/voices", async (request) => {
    tenantOf(request, ctx);
    return { items: ctx.service.listVoices(), next_cursor: null, request_id: request.id };
  });

  // ---------------- sessions（canonical + MVP fields）
  app.get("/api/v1/dh/sessions", async (request) => {
    const tenant = tenantOf(request, ctx);
    const query = parse(paginationQuery, request.query ?? {}, "query");
    const page = pageOf(ctx.service.listSessions(tenant), query, (session) => session.id);
    return { ...page, request_id: request.id };
  });

  app.post("/api/v1/dh/sessions", async (request, reply) => {
    const tenant = tenantOf(request, ctx);
    const input = parse(createSessionSchema, request.body ?? {});
    const idempotencyKey = headerValue(request, "idempotency-key");
    const result = ctx.service.createSession(tenant, input, idempotencyKey);
    return reply.code(result.replayed ? 200 : 201).send({ ...result.view, request_id: request.id });
  });

  app.get("/api/v1/dh/sessions/:sessionId", async (request) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(sessionParams, request.params, "params");
    return { ...ctx.service.getSession(tenant, params.sessionId), request_id: request.id };
  });

  // canonical：结束会话（DELETE）
  app.delete("/api/v1/dh/sessions/:sessionId", async (request) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(sessionParams, request.params, "params");
    return { ...ctx.service.endSession(tenant, params.sessionId), request_id: request.id };
  });

  // canonical：文本输入（sendDhTextInput）；同步返回 mock 回复便于 L1 demo
  app.post("/api/v1/dh/sessions/:sessionId/input", async (request) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(sessionParams, request.params, "params");
    const input = parse(messageSchema, request.body ?? {});
    const reply = await ctx.service.sendMessage(tenant, params.sessionId, input);
    return {
      accepted: true,
      session_id: reply.session_id,
      state: reply.state,
      status: reply.state,
      reply,
      request_id: request.id,
    };
  });

  // MVP alias：发消息（task-39）
  app.post("/api/v1/dh/sessions/:sessionId/messages", async (request) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(sessionParams, request.params, "params");
    const input = parse(messageSchema, request.body ?? {});
    const reply = await ctx.service.sendMessage(tenant, params.sessionId, input);
    return { ...reply, request_id: request.id };
  });

  // MVP alias：结束会话（task-39）
  app.post("/api/v1/dh/sessions/:sessionId/end", async (request) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(sessionParams, request.params, "params");
    return { ...ctx.service.endSession(tenant, params.sessionId), request_id: request.id };
  });

  // ---------------- SSE events（MVP extension：state / message / ended / error）
  app.get("/api/v1/dh/sessions/:sessionId/events", async (request, reply) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(sessionParams, request.params, "params");
    ctx.service.getSessionRecord(tenant, params.sessionId); // 404 早失败（非 SSE 流）
    const queryLast = typeof request.query === "object" && request.query !== null ? (request.query as { last_event_id?: string }).last_event_id : undefined;
    const lastEventId = parseEventId(request.headers["last-event-id"]) || parseEventId(queryLast);

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      "x-request-id": request.id,
    });
    raw.flushHeaders?.();

    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let unsubscribe: () => void = () => {};
    const cleanup = (): void => {
      if (closed) return;
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
      if (!raw.writableEnded) raw.end();
    };
    const writeEvent = (event: DhEvent): void => {
      if (raw.writableEnded || raw.destroyed) return;
      raw.write(sseFrame(event));
    };

    const subscription = ctx.service.subscribe(tenant, params.sessionId, lastEventId, (event) => {
      writeEvent(event);
      if (event.type === "ended" || event.type === "error") cleanup();
    });
    unsubscribe = subscription.unsubscribe;
    for (const event of subscription.replay) writeEvent(event);
    if (subscription.terminal) {
      cleanup();
      return;
    }
    raw.write("retry: 3000\n\n");
    heartbeat = setInterval(() => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(`: ping ${Date.now()}\n\n`);
    }, ctx.env.SSE_HEARTBEAT_MS);
    heartbeat.unref?.();
    request.raw.on("close", cleanup);
  });

  // ---------------- webhooks（MVP extension：HMAC 签名回调）
  app.post("/api/v1/dh/webhooks", async (request, reply) => {
    const tenant = tenantOf(request, ctx);
    const input = parse(webhookSchema, request.body ?? {});
    const { view, secret } = ctx.webhooks.register(tenant, input);
    return reply.code(201).send({
      ...view,
      // 明文 secret 仅注册时返回一次（列表只显示掩码）
      secret,
      signature_header: "x-dh-signature",
      signature_format: "t=<unix>,v1=hex(hmac-sha256(secret, `${t}.${rawBody}`))",
      request_id: request.id,
    });
  });

  app.get("/api/v1/dh/webhooks", async (request) => {
    const tenant = tenantOf(request, ctx);
    return { items: ctx.webhooks.list(tenant), next_cursor: null, request_id: request.id };
  });

  app.delete("/api/v1/dh/webhooks/:webhookId", async (request, reply) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(webhookParams, request.params, "params");
    if (!ctx.webhooks.delete(tenant, params.webhookId)) throw notFound("webhook not found");
    return reply.code(204).send();
  });

  // ---------------- embed tokens（canonical 1.1.0）
  app.post("/api/v1/dh/embed-tokens", async (request) => {
    const tenant = tenantOf(request, ctx);
    const input = parse(embedTokenSchema, request.body ?? {});
    return { ...ctx.service.createEmbedToken(tenant, input), request_id: request.id };
  });

  // ---------------- render jobs（canonical 1.1.0，mock 渲染）
  app.get("/api/v1/dh/render-jobs", async (request) => {
    const tenant = tenantOf(request, ctx);
    const query = parse(paginationQuery, request.query ?? {}, "query");
    const page = pageOf(ctx.service.listRenderJobs(tenant), query, (job) => job.id);
    return { ...page, request_id: request.id };
  });

  app.post("/api/v1/dh/render-jobs", async (request) => {
    const tenant = tenantOf(request, ctx);
    const input = parse(renderJobSchema, request.body ?? {});
    return { ...ctx.service.createRenderJob(tenant, input), request_id: request.id };
  });

  app.get("/api/v1/dh/render-jobs/:jobId", async (request) => {
    const tenant = tenantOf(request, ctx);
    const params = parse(jobParams, request.params, "params");
    return { ...ctx.service.getRenderJob(tenant, params.jobId), request_id: request.id };
  });
}
