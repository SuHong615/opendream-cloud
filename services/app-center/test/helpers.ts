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

export const ORG_ID = "00000000-0000-4000-8000-000000000001";
export const USER_ID = "00000000-0000-4000-8000-000000000002";
export const TENANT_HEADERS = { "x-oc-org-id": ORG_ID, "x-oc-user-id": USER_ID, "x-oc-roles": "owner" };

export function setupHarness(overrides: Partial<Env> = {}): Harness {
  const env = testEnv(overrides);
  const { app, ctx } = buildApp({ env });
  return { app, ctx, env, close: () => app.close() };
}

export async function createApp(app: FastifyInstance, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/apps",
    headers: TENANT_HEADERS,
    payload: { slug: `app-${crypto.randomUUID().slice(0, 8)}`, name: "Demo App", template: "node", ...body },
  });
  if (response.statusCode !== 201) throw new Error(`createApp ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function buildAndDeploy(app: FastifyInstance, appId: string): Promise<{ build: Record<string, unknown>; deployment: Record<string, unknown> }> {
  const buildResponse = await app.inject({ method: "POST", url: `/api/v1/apps/${appId}/builds`, headers: TENANT_HEADERS, payload: {} });
  if (buildResponse.statusCode !== 202) throw new Error(`build ${buildResponse.statusCode} ${buildResponse.body}`);
  const build = buildResponse.json() as Record<string, unknown>;
  const deployResponse = await app.inject({
    method: "POST",
    url: `/api/v1/apps/${appId}/deployments`,
    headers: TENANT_HEADERS,
    payload: { build_id: build.id },
  });
  if (deployResponse.statusCode !== 202) throw new Error(`deploy ${deployResponse.statusCode} ${deployResponse.body}`);
  return { build, deployment: deployResponse.json() as Record<string, unknown> };
}
