// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4104),
  DEFAULT_ORG_ID: z.string().default("00000000-0000-4000-8000-000000000001"),
  DEFAULT_USER_ID: z.string().default("00000000-0000-4000-8000-000000000002"),
  BINDING_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(604800).default(86400),
  MOCK_PROBE_MS: z.coerce.number().int().min(0).max(5000).default(0),
  PROXY_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(100000).default(600),
  /** 健康探针：synthetic（默认，本地/测试）或 http（真实 initialize+tools/list）。 */
  HEALTH_PROBE_MODE: z.enum(["synthetic", "http"]).default("synthetic"),
  HEALTH_INTERVAL_MS: z.coerce.number().int().min(0).max(3_600_000).default(60_000),
  HEALTH_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
  HEALTH_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(20).default(3),
  HEALTH_SUCCESS_THRESHOLD: z.coerce.number().int().min(1).max(20).default(2),
  /** 代理：synthetic（骨架返回）或 http（真实转发到 endpoint）。 */
  PROXY_MODE: z.enum(["synthetic", "http"]).default("synthetic"),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(5_000),
  UPSTREAM_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(100).default(5),
  CIRCUIT_OPEN_MS: z.coerce.number().int().min(1000).max(600_000).default(30_000),
  /** 控制面内部地址：调用日志批量投递（可选）。 */
  CONTROL_PLANE_URL: z.string().url().optional(),
  MCP_INTERNAL_TOKEN: z.string().min(8).optional(),
  /** 网关 ticket（生产 EdDSA/JWKS；MVP HMAC 共享 secret）。 */
  MCP_TICKET_SECRET: z.string().min(8).optional(),
  /** EdDSA/Ed25519 JWT：生产唯一形态；public 用于验签，private 仅签发端（control-plane）使用。 */
  MCP_TICKET_PRIVATE_KEY: z.string().optional(),
  MCP_TICKET_PUBLIC_KEY: z.string().optional(),
  MCP_TICKET_KID: z.string().default("mcp-dev-1"),
  MCP_TICKET_ISSUER: z.string().default("control-plane"),
  MCP_TICKET_TTL_SECONDS: z.coerce.number().int().min(30).max(300).default(300),
  DEFAULT_ORG_SLUG: z.string().default("acme"),
});

export type Env = z.infer<typeof envSchema>;
export const loadEnv = (input: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(input);
export const testEnv = (overrides: Partial<Env> = {}): Env => ({ ...loadEnv({ NODE_ENV: "test" }), ...overrides });
