// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { loadEnv, type Env } from "../../src/env";
import type { AppContext } from "../../src/context";

export interface TestHarness {
  app: FastifyInstance;
  ctx: AppContext;
  env: Env;
  dir: string;
  close: () => Promise<void>;
}

export async function setupHarness(overrides: Partial<NodeJS.ProcessEnv> = {}): Promise<TestHarness> {
  const dir = mkdtempSync(join(tmpdir(), "oc-control-plane-"));
  const env = loadEnv({
    ...process.env,
    NODE_ENV: "test",
    DATABASE_PATH: join(dir, "test.sqlite"),
    ALLOW_DEV_LOGIN: "1",
    DESTROY_COOLDOWN_MS: "40",
    MOCK_PROVISION_MS: "5",
    SEED_DEV: "true",
    SESSION_SECRET: "test-session-secret-0123456789",
    APIKEY_PEPPER: "test-apikey-pepper-0123456789",
    TICKET_SECRET: "test-ticket-secret-0123456789",
    OPENCODE_CONFIG_OUT: join(dir, "opencode.json"),
    ...overrides,
  });
  const { app, ctx } = buildApp({ env, quiet: process.env.OC_TEST_DEBUG !== "1" });
  await app.ready();
  return {
    app,
    ctx,
    env,
    dir,
    close: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface AuthSession {
  cookie: string;
  csrf: string;
  userId: string;
  orgId: string;
  email: string;
}

function cookieHeaderFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? [raw] : [];
  return list.map((item) => item.split(";")[0]!).join("; ");
}

export async function devLogin(app: FastifyInstance, email: string): Promise<AuthSession> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/dev-login",
    payload: { email },
  });
  if (response.statusCode !== 200) throw new Error(`dev-login failed: ${response.statusCode} ${response.body}`);
  const body = response.json() as { user: { id: string }; org: { id: string }; csrf_token: string };
  return {
    cookie: cookieHeaderFrom(response),
    csrf: body.csrf_token,
    userId: body.user.id,
    orgId: body.org.id,
    email,
  };
}

export function headers(session: AuthSession): Record<string, string> {
  return { cookie: session.cookie, "x-csrf-token": session.csrf };
}

export async function ensureReady(app: FastifyInstance, session: AuthSession, workspaceId: string): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: { cookie: session.cookie },
    });
    if (response.statusCode === 200) {
      const body = response.json() as { state: string };
      if (body.state === "ready") return body.state;
    }
    await Bun.sleep(10);
  }
  throw new Error("workspace did not become ready");
}

export async function ensureWorkspace(app: FastifyInstance, session: AuthSession): Promise<{ id: string; state: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/workspaces/me/ensure",
    headers: headers(session),
  });
  if (response.statusCode !== 202 && response.statusCode !== 200) {
    throw new Error(`ensure failed: ${response.statusCode} ${response.body}`);
  }
  return response.json() as { id: string; state: string };
}
