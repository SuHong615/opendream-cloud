// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import type { AppContext } from "../src/context";
import { testEnv, type Env } from "../src/env";

export interface Harness {
  app: FastifyInstance;
  ctx: AppContext;
  env: Env;
}

export async function setupHarness(overrides: Partial<Env> = {}): Promise<Harness> {
  const env = testEnv(overrides);
  const { app, ctx } = buildApp({ env });
  await app.ready();
  return { app, ctx, env };
}

export const OTHER_ORG_ID = "00000000-0000-4000-8000-0000000000d1";
export const OTHER_USER_ID = "00000000-0000-4000-8000-0000000000d2";

export function authHeaders(env: Env, orgId?: string, userId?: string, apiKey?: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey ?? env.MEMORY_API_KEY}`,
    "x-oc-org-id": orgId ?? env.DEFAULT_ORG_ID,
    "x-oc-user-id": userId ?? env.DEFAULT_USER_ID,
  };
}

export async function addMemory(
  harness: Harness,
  content: string,
  overrides: Record<string, unknown> = {},
  orgId?: string,
): Promise<Record<string, unknown>> {
  const response = await harness.app.inject({
    method: "POST",
    url: "/v1/memories",
    headers: authHeaders(harness.env, orgId),
    payload: { messages: [{ role: "user", content }], ...overrides },
  });
  if (response.statusCode !== 200) throw new Error(`addMemory ${response.statusCode} ${response.body}`);
  const body = response.json() as { results: Array<Record<string, unknown>> };
  return body.results[0]!;
}
