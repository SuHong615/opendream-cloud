// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { z } from "zod";

const booleanish = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "1" || value === "true"));

/**
 * Digital Human L1 service 环境变量（M3，演示级）。
 * 所有时间单位为毫秒（除显式 *_SECONDS）。
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4106),
  /** 无 x-oc-* 租户头时的开发默认（生产由 control-plane 门面透传，勿依赖默认值）。 */
  DEFAULT_ORG_ID: z.string().default("00000000-0000-4000-8000-000000000001"),
  DEFAULT_USER_ID: z.string().default("00000000-0000-4000-8000-000000000002"),
  /** 会话最长存活时间；超时自动结束（reason=ttl_expired）。 */
  SESSION_TTL_SECONDS: z.coerce.number().int().min(30).max(86_400).default(1800),
  /** 模拟 RTC token TTL（openapi 约定 ≤300s）。 */
  RTC_TOKEN_TTL_SECONDS: z.coerce.number().int().min(10).max(300).default(300),
  /** created→connecting→active 的 mock 连接耗时。 */
  MOCK_CONNECT_MS: z.coerce.number().int().min(0).max(30_000).default(120),
  /** mock LLM 回复延迟。 */
  MOCK_LLM_LATENCY_MS: z.coerce.number().int().min(0).max(60_000).default(120),
  /** 单轮回复延迟超过该阈值即进入 degraded（音频/字幕兜底）。 */
  DEGRADED_LATENCY_MS: z.coerce.number().int().min(0).max(60_000).default(1500),
  /** mock 音频时长估算（每字符毫秒）。 */
  MOCK_AUDIO_MS_PER_CHAR: z.coerce.number().int().min(0).max(1000).default(60),
  /** 每会话保留的 SSE 事件上限（Last-Event-ID 只能回放最近 N 条）。 */
  MAX_EVENTS_PER_SESSION: z.coerce.number().int().min(10).max(10_000).default(500),
  /** Webhook 投递超时 / 最大尝试次数。 */
  WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(3000),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  /** SSE 心跳注释间隔。 */
  SSE_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  /** 演示/测试钩子：允许 x-dh-simulate 或 body.simulate 触发 degraded/error（生产应设为 0）。 */
  MOCK_SCENARIOS_ENABLED: booleanish.default(true),
  /** mock 离线渲染任务推进到 succeeded 的耗时。 */
  MOCK_RENDER_MS: z.coerce.number().int().min(0).max(60_000).default(250),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (input: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(input);

/** 单测用：默认 test 环境 + 低延迟，可按需覆盖。 */
export const testEnv = (overrides: Partial<Env> = {}): Env => ({
  ...loadEnv({ NODE_ENV: "test" }),
  MOCK_CONNECT_MS: 5,
  MOCK_LLM_LATENCY_MS: 5,
  SSE_HEARTBEAT_MS: 60_000,
  ...overrides,
});
