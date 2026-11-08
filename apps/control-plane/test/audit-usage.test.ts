// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, ensureReady, headers, setupHarness, type TestHarness } from "./helpers/app";
import { randomId } from "../src/lib/crypto";

let harness: TestHarness;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await setupHarness({ MOCK_PROVISION_MS: "10" });
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;

describe("审计与用量", () => {
  test("AUDIT-01 写操作落审计且不含密钥明文", async () => {
    const session = await devLogin(app, email("audit1"));
    const key = await app.inject({
      method: "POST",
      url: "/api/v1/api-keys",
      headers: headers(session),
      payload: { name: "audited-key" },
    });
    const plaintext = (key.json() as { plaintext: string }).plaintext;
    const ensure = await app.inject({ method: "POST", url: "/api/v1/workspaces/me/ensure", headers: headers(session) });
    const workspaceId = (ensure.json() as { id: string }).id;
    await ensureReady(app, session, workspaceId);
    const audit = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs",
      headers: { cookie: session.cookie },
    });
    expect(audit.statusCode).toBe(200);
    const body = audit.json() as { items: Array<{ action: string; org_id: string }> };
    expect(body.items.some((item) => item.action === "apikey.create")).toBe(true);
    expect(body.items.some((item) => item.action === "workspace.ensure")).toBe(true);
    expect(body.items.every((item) => item.org_id === session.orgId)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(plaintext);
  });

  test("AUDIT-02 member 读取审计返回 403", async () => {
    const session = await devLogin(app, email("audit2"));
    harness.ctx.sqlite.query("UPDATE memberships SET role = 'member' WHERE user_id = ?").run(session.userId);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/audit-logs",
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  test("USAGE-01 用量聚合按组织隔离且 token 统计正确", async () => {
    const session = await devLogin(app, email("usage1"));
    const now = Date.now();
    harness.ctx.sqlite
      .query(
        `INSERT INTO usage_records (id, org_id, user_id, request_id, tokens_input, tokens_output, tokens_reasoning,
          cost_usd, occurred_at, ingested_at) VALUES (?, ?, ?, ?, 100, 50, 0, '0.0012', ?, ?)`,
      )
      .run(randomId(), session.orgId, session.userId, randomId(), now, now);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/usage",
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { summary: { requests: number; tokens: { input: number; output: number }; cost_usd: string } };
    expect(body.summary.requests).toBe(1);
    expect(body.summary.tokens.input).toBe(100);
    expect(body.summary.tokens.output).toBe(50);
  });

  test("USAGE-02 其他租户看不到该用量", async () => {
    const alice = await devLogin(app, email("usage2a"));
    const bob = await devLogin(app, email("usage2b"));
    const now = Date.now();
    harness.ctx.sqlite
      .query(
        `INSERT INTO usage_records (id, org_id, user_id, request_id, tokens_input, cost_usd, occurred_at, ingested_at)
         VALUES (?, ?, ?, ?, 999, '1', ?, ?)`,
      )
      .run(randomId(), alice.orgId, alice.userId, randomId(), now, now);
    const response = await app.inject({ method: "GET", url: "/api/v1/usage", headers: { cookie: bob.cookie } });
    const body = response.json() as { summary: { requests: number } };
    expect(body.summary.requests).toBe(0);
  });
});
