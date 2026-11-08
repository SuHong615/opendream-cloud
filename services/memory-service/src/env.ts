// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(0).max(65535).default(4107),
  /** 内部 API Key：control-plane 门面以 `Authorization: Bearer <key>` 调用；缺失/错误 401。 */
  MEMORY_API_KEY: z.string().min(8).default("dev-memory-api-key-0123456789"),
  /** 无 x-oc-* 头时的开发默认租户（生产由门面透传，勿依赖）。 */
  DEFAULT_ORG_ID: z.string().default("00000000-0000-4000-8000-000000000001"),
  DEFAULT_USER_ID: z.string().default("00000000-0000-4000-8000-000000000002"),
  /** 搜索默认 top_k / 相似度阈值（mock 词法相似度）。 */
  SEARCH_DEFAULT_TOP_K: z.coerce.number().int().min(1).max(50).default(10),
  SEARCH_DEFAULT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.1),
  /** 列表默认/最大条数。 */
  LIST_DEFAULT_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  LIST_MAX_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (input: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(input);

export const testEnv = (overrides: Partial<Env> = {}): Env => ({
  ...loadEnv({
    NODE_ENV: "test",
    MEMORY_API_KEY: "test-memory-api-key-0123456789",
  }),
  ...overrides,
});
