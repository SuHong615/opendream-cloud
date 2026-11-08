// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { z } from "zod";

const booleanish = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .transform((v) => (typeof v === "boolean" ? v : v === "1" || v === "true"));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  // 0 表示由 OS 分配随机端口（测试/独立实例用）
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  DATABASE_PATH: z.string().default(".data/control-plane.sqlite"),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-in-production"),
  APIKEY_PEPPER: z.string().min(16).default("dev-apikey-pepper-change-in-production"),
  TICKET_SECRET: z.string().min(16).default("dev-ticket-secret-change-in-production"),
  /** 模型供应商 API Key 加密密钥；缺省从 SESSION_SECRET 派生。 */
  MODEL_SECRET_KEY: z.string().min(16).optional(),
  /** 模型供应商 /models 连通性测试超时（毫秒）。 */
  MODEL_PROVIDER_TEST_TIMEOUT_MS: z.coerce.number().int().min(1).max(120_000).default(10_000),
  /** 生成的 opencode 配置目标路径（compose 映射到 workspace 的 ~/.config/opencode/opencode.json）。 */
  OPENCODE_CONFIG_OUT: z.string().default(process.platform === "win32" ? ".data/opencode.json" : "/shared/opencode.json"),
  /** v3 MCP 数据面（mcp-hub）地址；control-plane 作为 Registry/Policy/Audit 门面转发。 */
  MCP_HUB_URL: z.string().url().default("http://127.0.0.1:4104"),
  /** v3 App Center（权限/分享/协同）数据面；control-plane 作为 REST 门面。 */
  APP_CENTER_URL: z.string().url().default("http://127.0.0.1:4103"),
  /** v3 工作流引擎（control-plane 门面转发）。 */
  WORKFLOW_URL: z.string().url().default("http://workflow-engine:4105"),
  /** v3 数字人控制面（control-plane 门面转发）。 */
  DIGITAL_HUMAN_URL: z.string().url().default("http://digital-human:4106"),
  AGENT_WORKFORCE_URL: z.string().url().default("http://agent-workforce:4106"),
  EXPERIMENT_CENTER_URL: z.string().url().default("http://experiment-center:4108"),
  SKILL_CENTER_URL: z.string().url().default("http://skill-center:4101"),
  /** v3 评测中心（eval-* 门面）。 */
  EVAL_CENTER_URL: z.string().url().default("http://eval-center:4102"),
  /** v3 memory/experience 服务（公开 /api/v1/memories*、/experiences* 门面）。 */
  MEMORY_URL: z.string().url().default("http://memory-service:4107"),
  MEMORY_API_KEY: z.string().min(8).default("local-memory-key"),
  /** hub → control-plane 内部调用（call-logs:batch）共享 token。 */
  MCP_INTERNAL_TOKEN: z.string().min(8).optional(),
  /** EdDSA/Ed25519 MCP binding ticket 签发（生产唯一形态；HMAC 仅 hub 本地 dev 兼容）。 */
  MCP_TICKET_PRIVATE_KEY: z.string().optional(),
  MCP_TICKET_KID: z.string().default("mcp-dev-1"),
  MCP_TICKET_ISSUER: z.string().default("control-plane"),
  MCP_TICKET_TTL_SECONDS: z.coerce.number().int().min(30).max(300).default(300),
  ALLOW_DEV_LOGIN: booleanish.default(true),
  OIDC_ENABLED: booleanish.default(false),
  OIDC_MOCK: booleanish.default(true),
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().url().default("http://localhost:4000/api/v1/auth/callback"),
  OIDC_SCOPES: z.string().default("openid profile email"),
  CONSOLE_BASE_URL: z.string().url().default("http://localhost:3000"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  METRICS_TOKEN: z.string().min(8).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanish.default(true),
  S3_PREFIX: z.string().default("opendream/exports"),
  NATS_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  OUTBOX_POLL_MS: z.coerce.number().int().min(200).max(60_000).default(2000),
  DESTROY_COOLDOWN_MIN: z.coerce.number().int().min(5).max(1440).default(5),
  /** 仅测试用：覆盖冷却期毫秒数（生产不设置，始终用分钟配置） */
  DESTROY_COOLDOWN_MS: z.coerce.number().int().min(10).max(86_400_000).optional(),
  MOCK_PROVISION_MS: z.coerce.number().int().min(0).max(60_000).default(120),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:4000"),
  WORKSPACE_HOST_SUFFIX: z.string().default("ws.opencode.local"),
  // 本地单工作区演示：直接使用固定 host（如 localhost:8080），由 local-gateway 兜底
  LOCAL_WORKSPACE_HOST: z.string().optional(),
  // 本地演示可设为 http（配合 local-gateway）；生产固定 https
  WORKSPACE_URL_SCHEME: z.enum(["http", "https"]).default("https"),
  SEED_DEV: booleanish.default(true),
  // 本地演示可关闭旧版 LiteLLM 占位供应商，只保留企业 Mock provider
  SEED_LEGACY_LITELLM: booleanish.default(true),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const merged: NodeJS.ProcessEnv = { ...input };
  if (!merged.PORT && merged.CONTROL_PLANE_PORT) merged.PORT = merged.CONTROL_PLANE_PORT;
  if (!merged.DATABASE_PATH && merged.DATABASE_URL?.startsWith("file:")) {
    merged.DATABASE_PATH = merged.DATABASE_URL.slice("file:".length);
  }
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid environment: ${detail}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.ALLOW_DEV_LOGIN) {
    throw new Error("ALLOW_DEV_LOGIN must be disabled in production");
  }
  return parsed.data;
}
