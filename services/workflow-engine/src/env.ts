// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4105),
  DEFAULT_ORG_ID: z.string().default("00000000-0000-4000-8000-000000000001"),
  DEFAULT_USER_ID: z.string().default("00000000-0000-4000-8000-000000000002"),
  DEFAULT_ROLES: z.string().default("owner,admin,member"),
  /** 默认人工任务 SLA（duration 语法 ms|s|m|h|d）。 */
  HUMAN_TASK_SLA_DEFAULT: z.string().default("24h"),
  /** 单次 advance 内最多执行的节点数，防止 DAG 配置错误导致死循环。 */
  MAX_STEPS_PER_ADVANCE: z.coerce.number().int().min(1).max(1000).default(100),
  /** 是否加载内置模板（测试可关）。 */
  WORKFLOW_SEED: z
    .string()
    .default("true")
    .transform((value) => value !== "false" && value !== "0"),
});

export type Env = z.infer<typeof envSchema>;
export const loadEnv = (input: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(input);
export const testEnv = (overrides: Partial<Env> = {}): Env => ({ ...loadEnv({ NODE_ENV: "test" }), ...overrides });
