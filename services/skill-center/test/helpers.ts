// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { testEnv } from "../src/env";
import type { AppContext } from "../src/context";
import type { Env } from "../src/env";

export interface Harness {
  app: FastifyInstance;
  ctx: AppContext;
  env: Env;
  close: () => Promise<void>;
}

export function setupHarness(overrides: Partial<Env> = {}): Harness {
  const env = testEnv({ DEFAULT_ORG_SLUG: "acme", ...overrides });
  const { app, ctx } = buildApp({ env });
  return { app, ctx, env, close: () => app.close() };
}

export const ORG_ID = "00000000-0000-4000-8000-000000000001";
export const USER_ID = "00000000-0000-4000-8000-000000000002";
export const TENANT_HEADERS = { "x-oc-org-id": ORG_ID, "x-oc-user-id": USER_ID, "x-oc-org-slug": "acme" };

export async function createSkill(app: FastifyInstance, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/skills",
    headers: TENANT_HEADERS,
    payload: { slug: `skill-${crypto.randomUUID().slice(0, 8)}`, name: "Demo Skill", visibility: "org", ...body },
  });
  if (response.statusCode !== 201) throw new Error(`createSkill failed: ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function createVersion(
  app: FastifyInstance,
  skillId: string,
  body: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/skills/${skillId}/versions`,
    headers: TENANT_HEADERS,
    payload: { version: "1.0.0", files: [{ path: "SKILL.md", size: 10, sha256: "abc" }], archive_sha256: "deadbeef", ...body },
  });
  if (response.statusCode !== 201) throw new Error(`createVersion failed: ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}
