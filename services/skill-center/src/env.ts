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
  PORT: z.coerce.number().int().min(1).max(65535).default(4101),
  DEFAULT_ORG_ID: z.string().default("00000000-0000-4000-8000-000000000001"),
  DEFAULT_USER_ID: z.string().default("00000000-0000-4000-8000-000000000002"),
  DEFAULT_ORG_SLUG: z.string().default("acme"),
  TOKEN_SECRET: z.string().min(16).default("dev-skill-token-secret-change-in-production"),
  TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  SEED: booleanish.default(true),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(input);
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return { ...loadEnv({ NODE_ENV: "test" }), ...overrides };
}
