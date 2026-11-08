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
  base: string;
  close: () => Promise<void>;
}

export const TENANT_HEADERS = {
  "x-oc-org-id": "00000000-0000-4000-8000-000000000001",
  "x-oc-user-id": "00000000-0000-4000-8000-000000000002",
  "x-oc-roles": "owner",
};

export const OTHER_TENANT_HEADERS = {
  "x-oc-org-id": "00000000-0000-4000-8000-0000000000c1",
  "x-oc-user-id": "00000000-0000-4000-8000-0000000000c2",
  "x-oc-roles": "owner",
};

/** 每个用例独立租户，避免"同一用户仅一个活跃会话"互相干扰。 */
export function newTenantHeaders(roles = "owner"): Record<string, string> {
  return {
    "x-oc-org-id": crypto.randomUUID(),
    "x-oc-user-id": crypto.randomUUID(),
    "x-oc-roles": roles,
  };
}

/** 启动真实端口实例（SSE 需要原始 HTTP 流）。 */
export async function setupHarness(overrides: Partial<Env> = {}): Promise<Harness> {
  const env = testEnv(overrides);
  const { app, ctx } = buildApp({ env });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("failed to bind test server");
  return {
    app,
    ctx,
    env,
    base: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
    },
  };
}

export async function waitFor<T>(fn: () => Promise<T | undefined> | T | undefined, options: { timeoutMs?: number; intervalMs?: number; label?: string } = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const intervalMs = options.intervalMs ?? 10;
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== undefined && value !== false && value !== null) return value;
    if (Date.now() - started > timeoutMs) throw new Error(`waitFor timeout: ${options.label ?? "condition"}`);
    await Bun.sleep(intervalMs);
  }
}

export interface CreatedSession {
  id: string;
  body: Record<string, unknown>;
}

export async function createSession(
  app: FastifyInstance,
  overrides: Record<string, unknown> = {},
  headers: Record<string, string> = TENANT_HEADERS,
): Promise<CreatedSession> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/dh/sessions",
    headers,
    payload: {
      avatar_id: "av_l1_cartoon",
      voice_id: "vo_zh_female_warm",
      ...overrides,
    },
  });
  if (response.statusCode !== 201 && response.statusCode !== 200) {
    throw new Error(`createSession ${response.statusCode} ${response.body}`);
  }
  const body = response.json() as Record<string, unknown>;
  return { id: String(body.session_id), body };
}

export async function getSession(app: FastifyInstance, id: string, headers: Record<string, string> = TENANT_HEADERS): Promise<Record<string, unknown>> {
  const response = await app.inject({ method: "GET", url: `/api/v1/dh/sessions/${id}`, headers });
  if (response.statusCode !== 200) throw new Error(`getSession ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function waitForState(app: FastifyInstance, id: string, state: string, headers: Record<string, string> = TENANT_HEADERS): Promise<Record<string, unknown>> {
  return waitFor(
    async () => {
      const body = await getSession(app, id, headers);
      return body.state === state ? body : undefined;
    },
    { label: `session ${id} -> ${state}` },
  );
}

export async function sendMessage(
  app: FastifyInstance,
  id: string,
  text: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = TENANT_HEADERS,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/dh/sessions/${id}/messages`,
    headers,
    payload: { text, ...extra },
  });
  return { statusCode: response.statusCode, body: response.json() as Record<string, unknown> };
}
