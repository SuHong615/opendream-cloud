// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4102),
  DEFAULT_ORG_ID: z.string().default("00000000-0000-4000-8000-000000000001"),
  DEFAULT_USER_ID: z.string().default("00000000-0000-4000-8000-000000000002"),
  RUNNER_IMAGE_DIGEST: z.string().default("sha256:dev-runner"),
  MOCK_RUN_MS: z.coerce.number().int().min(0).max(5000).default(0),
});

export type Env = z.infer<typeof envSchema>;
export const loadEnv = (input: NodeJS.ProcessEnv = process.env): Env => envSchema.parse(input);
export const testEnv = (overrides: Partial<Env> = {}): Env => ({ ...loadEnv({ NODE_ENV: "test" }), ...overrides });
