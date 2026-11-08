// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { AppContext } from "./context";
import type { Env } from "./env";
import { loadEnv } from "./env";
import { openDatabase } from "./db/client";
import { SqlitePort } from "./db/port";
import { migrate } from "./db/migrate";
import { seedDev } from "./db/seed";
import { MockProvisioner } from "./provisioner/mock";
import type { Provisioner } from "./provisioner/types";
import { mockHookTransition, registerWorkspaceRoutes } from "./routes/workspaces";
import { registerAuthRoutes } from "./routes/auth";
import { registerApiKeyRoutes } from "./routes/api-keys";
import { registerModelRoutes } from "./routes/models";
import { registerMcpRoutes } from "./routes/mcp";
import { registerAppRoutes } from "./routes/apps";
import { registerWorkflowDigitalHumanRoutes } from "./routes/workflow-dh";
import { registerM5Routes } from "./routes/m5";
import { registerAgentWorkforceRoutes } from "./routes/workforce";
import { registerExperimentRoutes } from "./routes/experiments";
import { registerSkillRoutes } from "./routes/skills";
import { registerPromptRoutes } from "./routes/prompts";
import { registerBacklogRoutes } from "./routes/backlog";
import { installMetrics } from "./metrics";
import { registerDesktopRoutes } from "./routes/desktop";
import { registerCredentialRoutes } from "./routes/credentials";
import { registerOutboxRoutes } from "./routes/outbox";
import { startOutboxPublisher, stopOutboxPublisher } from "./services/outbox";
import { registerEvalRoutes } from "./routes/eval";
import { registerAuditRoutes } from "./routes/audit";
import { registerUsageRoutes } from "./routes/usage";
import { registerHealthRoutes } from "./routes/health";
import { ApiError } from "./lib/errors";
import { HEADER_REQUEST_ID } from "./lib/constants";
import { flushCookies } from "./lib/http";
import { writeOpencodeConfig } from "./services/opencode-config";

export interface BuildOptions {
  env?: Env;
  databasePath?: string;
  seed?: boolean;
  quiet?: boolean;
}

export const REGISTERED_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/api/v1/auth/dev-login" },
  { method: "GET", path: "/api/v1/me" },
  { method: "POST", path: "/api/v1/auth/logout" },
  { method: "GET", path: "/api/v1/auth/csrf" },
  { method: "GET", path: "/api/v1/api-keys" },
  { method: "POST", path: "/api/v1/api-keys" },
  { method: "DELETE", path: "/api/v1/api-keys/:keyId" },
  { method: "GET", path: "/api/v1/model-providers" },
  { method: "POST", path: "/api/v1/model-providers" },
  { method: "PATCH", path: "/api/v1/model-providers/:providerId" },
  { method: "DELETE", path: "/api/v1/model-providers/:providerId" },
  { method: "GET", path: "/api/v1/model-provider-presets" },
  { method: "POST", path: "/api/v1/model-providers/:providerId/test" },
  { method: "POST", path: "/api/v1/model-providers/:providerId/sync" },
  { method: "POST", path: "/api/v1/model-providers/:providerId/activate" },
  { method: "GET", path: "/api/v1/model-config/preview" },
  // v3 MCP（registry/lifecycle/bindings 转发 mcp-hub；policy/audit 本地）
  { method: "GET", path: "/api/v1/mcp-servers" },
  { method: "POST", path: "/api/v1/mcp-servers" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId" },
  { method: "PATCH", path: "/api/v1/mcp-servers/:serverId" },
  { method: "DELETE", path: "/api/v1/mcp-servers/:serverId" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/health" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/health-check" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/submit-review" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/review" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/publish" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/deprecate" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/offline" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/versions" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/versions/:versionId" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions/:versionId/review" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions/:versionId/publish" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/versions/:versionId/yank" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/channels" },
  { method: "PUT", path: "/api/v1/mcp-servers/:serverId/channels/:channel" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/tools" },
  { method: "POST", path: "/api/v1/mcp-servers/:serverId/rollback" },
  { method: "GET", path: "/api/v1/mcp-servers/:serverId/tool-policy" },
  { method: "PUT", path: "/api/v1/mcp-servers/:serverId/tool-policy" },
  { method: "GET", path: "/api/v1/mcp-bindings" },
  { method: "POST", path: "/api/v1/mcp-bindings" },
  { method: "DELETE", path: "/api/v1/mcp-bindings/:bindingId" },
  { method: "POST", path: "/api/v1/mcp-bindings/:bindingId/rotate-token" },
  { method: "POST", path: "/api/v1/mcp-bindings/:bindingId/ticket" },
  { method: "GET", path: "/api/v1/mcp-oauth/callback" },
  { method: "GET", path: "/api/v1/mcp-call-logs" },
  // v3 App Center 门面（路径通配转发 app-center；ACL 在 app-center）
  { method: "GET", path: "/api/v1/apps" },
  { method: "POST", path: "/api/v1/apps" },
  { method: "GET", path: "/api/v1/apps/*" },
  { method: "POST", path: "/api/v1/apps/*" },
  { method: "PATCH", path: "/api/v1/apps/*" },
  { method: "PUT", path: "/api/v1/apps/*" },
  { method: "DELETE", path: "/api/v1/apps/*" },
  // v3 workflow-engine / digital-human 门面（通配转发，具体路径见 openapi 1.1）
  { method: "*", path: "/api/v1/workflows/*" },
  { method: "*", path: "/api/v1/workflow-runs/*" },
  { method: "*", path: "/api/v1/workflow-templates/*" },
  { method: "*", path: "/api/v1/human-tasks/*" },
  { method: "*", path: "/api/v1/workflow-definitions/*" },
  { method: "*", path: "/api/v1/workflow-instances/*" },
  { method: "*", path: "/api/v1/workflow-versions/*" },
  { method: "*", path: "/api/v1/dh/*" },
  // v3 评测中心门面（eval-* 通配转发；evaluator 为 MVP extension）
  { method: "*", path: "/api/v1/eval-datasets/*" },
  { method: "*", path: "/api/v1/eval-runs/*" },
  { method: "*", path: "/api/v1/eval-evaluators/*" },
  { method: "GET", path: "/api/v1/workflow-service/health" },
  { method: "GET", path: "/api/v1/digital-human/health" },
  // M5 eval 门面（eval.ts）
  { method: "*", path: "/api/v1/eval-datasets/*" },
  { method: "*", path: "/api/v1/eval-runs/*" },
  { method: "*", path: "/api/v1/eval-evaluators/*" },
  // M5 observability / organizations（m5.ts）
  { method: "GET", path: "/api/v1/observability/overview" },
  { method: "GET", path: "/api/v1/observability/timeseries" },
  { method: "GET", path: "/api/v1/organizations/current" },
  { method: "GET", path: "/api/v1/organizations/current/members" },
  { method: "POST", path: "/api/v1/organizations/current/members" },
  { method: "PATCH", path: "/api/v1/organizations/current/members/:memberId" },
  { method: "DELETE", path: "/api/v1/organizations/current/members/:memberId" },
  { method: "GET", path: "/api/v1/organizations/current/quotas" },
  { method: "PUT", path: "/api/v1/organizations/current/quotas" },
  // M5 memory / experience 门面（代理 MEMORY_URL，公开路径）
  { method: "*", path: "/api/v1/memories" },
  { method: "*", path: "/api/v1/memories/*" },
  { method: "*", path: "/api/v1/experiences" },
  { method: "*", path: "/api/v1/experiences/*" },
  { method: "GET", path: "/api/v1/models" },
  { method: "GET", path: "/api/v1/models/:modelId" },
  { method: "GET", path: "/api/v1/model-policies" },
  { method: "POST", path: "/api/v1/model-policies" },
  { method: "GET", path: "/api/v1/model-policies/:policyId" },
  { method: "PUT", path: "/api/v1/model-policies/:policyId" },
  { method: "POST", path: "/api/v1/model-policies/:policyId/preview" },
  { method: "GET", path: "/api/v1/workspaces" },
  { method: "POST", path: "/api/v1/workspaces" },
  { method: "GET", path: "/api/v1/workspaces/me" },
  { method: "POST", path: "/api/v1/workspaces/me/ensure" },
  { method: "GET", path: "/api/v1/workspaces/:workspaceId" },
  { method: "PATCH", path: "/api/v1/workspaces/:workspaceId" },
  { method: "POST", path: "/api/v1/workspaces/:workspaceId/start" },
  { method: "POST", path: "/api/v1/workspaces/:workspaceId/stop" },
  { method: "POST", path: "/api/v1/workspaces/:workspaceId/destroy" },
  { method: "POST", path: "/api/v1/workspaces/:workspaceId/destroy/cancel" },
  { method: "POST", path: "/api/v1/workspaces/:workspaceId/access-ticket" },
  { method: "GET", path: "/api/v1/workspaces/:workspaceId/events" },
  { method: "GET", path: "/api/v1/audit-logs" },
  { method: "GET", path: "/api/v1/usage" },
  { method: "GET", path: "/api/v1/health" },
  { method: "GET", path: "/healthz" },
  { method: "GET", path: "/readyz" },
];

export function buildApp(options: BuildOptions = {}): { app: FastifyInstance; ctx: AppContext } {
  const env = options.env ?? loadEnv();
  const database = openDatabase(options.databasePath ?? env.DATABASE_PATH);
  migrate(database.sqlite);
  const dbPort = new SqlitePort(options.databasePath ?? env.DATABASE_PATH);
  if (options.seed ?? env.SEED_DEV)
    seedDev(database.sqlite, env.APIKEY_PEPPER, env.MODEL_SECRET_KEY ?? env.SESSION_SECRET, env.SEED_LEGACY_LITELLM);

  const ctx = {
    env,
    database,
    sqlite: database.sqlite,
    db: database.db,
    dbPort,
    version: "0.1.0-g4",
    provisioner: undefined as unknown as Provisioner,
  } satisfies AppContext;

  ctx.provisioner = new MockProvisioner(
    {
      transition: (workspaceId, from, to, opts) => mockHookTransition(ctx, workspaceId, from, to, opts),
    },
    env.MOCK_PROVISION_MS,
  );

  // 启动即写一次 opencode 配置（compose 共享卷场景，workspace 首启即可用；失败只记日志）
  const firstOrg = database.sqlite
    .query<{ id: string }, []>("SELECT id FROM orgs WHERE status = 'active' ORDER BY created_at LIMIT 1")
    .get();
  writeOpencodeConfig(ctx, firstOrg?.id ?? "00000000-0000-0000-0000-000000000000");

  const app = Fastify({
    logger: options.quiet === true ? false : { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 1024 * 1024,
    requestIdHeader: HEADER_REQUEST_ID,
    disableRequestLogging: true,
  });

  app.addHook("onRequest", async (request, reply) => {
    const id = typeof request.headers[HEADER_REQUEST_ID] === "string" ? request.headers[HEADER_REQUEST_ID] : crypto.randomUUID();
    reply.header(HEADER_REQUEST_ID, id);
  });

  // 允许无 body 的 POST（test/sync/activate 等）在 content-type: application/json 时按 {} 处理
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = typeof body === "string" ? body : String(body ?? "");
    if (text.trim() === "") return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    flushCookies(reply);
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = typeof request.headers[HEADER_REQUEST_ID] === "string" ? request.headers[HEADER_REQUEST_ID] : crypto.randomUUID();
    if (error instanceof ApiError) {
      return reply.code(error.status).send({
        error: {
          code: error.code,
          ...(error.reason ? { reason: error.reason } : {}),
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
          request_id: requestId,
        },
      });
    }
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
    if (typeof (error as { statusCode?: number }).statusCode === "number" && (error as { statusCode: number }).statusCode < 500) {
      const statusCode = (error as { statusCode: number }).statusCode;
      return reply.code(statusCode).send({
        error: {
          code: "validation_failed",
          message: (error as Error).message,
          request_id: requestId,
        },
      });
    }
    request.log.error({ err: error }, "unhandled request error");
    return reply.code(500).send({
      error: {
        code: "internal_error",
        message: "internal server error",
        request_id: requestId,
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: "not_found",
        message: `Route not found: ${request.method} ${request.url}`,
        request_id: typeof request.headers[HEADER_REQUEST_ID] === "string" ? request.headers[HEADER_REQUEST_ID] : crypto.randomUUID(),
      },
    });
  });

  registerHealthRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerApiKeyRoutes(app, ctx);
  registerModelRoutes(app, ctx);
  registerMcpRoutes(app, ctx);
  registerAppRoutes(app, ctx);
  registerWorkflowDigitalHumanRoutes(app, ctx);
  registerM5Routes(app, ctx);
registerAgentWorkforceRoutes(app, ctx);
registerExperimentRoutes(app, ctx);
registerSkillRoutes(app, ctx);
registerPromptRoutes(app, ctx);
registerBacklogRoutes(app, ctx);
registerDesktopRoutes(app, ctx);
registerCredentialRoutes(app, ctx);
registerOutboxRoutes(app, ctx);
  registerEvalRoutes(app, ctx);
  registerWorkspaceRoutes(app, ctx);
  registerAuditRoutes(app, ctx);
  registerUsageRoutes(app, ctx);
  installMetrics(app, ctx);
  startOutboxPublisher(ctx);

  app.addHook("onClose", async () => {
    await stopOutboxPublisher();
    await dbPort.close();
    database.sqlite.close();
  });

  return { app, ctx };
}
