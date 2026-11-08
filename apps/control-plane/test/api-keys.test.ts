// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, headers, setupHarness, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await setupHarness();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function createKey(session: Awaited<ReturnType<typeof devLogin>>, body: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/api-keys",
    headers: headers(session),
    payload: { name: "ci-key", ...body },
  });
  return response;
}

describe("API Key", () => {
  test("KEY-01 创建返回一次明文，DB 只存哈希与前缀", async () => {
    const session = await devLogin(app, email("key1"));
    const response = await createKey(session);
    expect(response.statusCode).toBe(201);
    const body = response.json() as { plaintext: string; prefix: string; id: string };
    expect(body.plaintext.startsWith("ock_")).toBe(true);
    expect(body.plaintext.length).toBeGreaterThan(30);
    const row = harness.ctx.sqlite
      .query<{ key_hash: string; prefix: string }, [string]>("SELECT key_hash, prefix FROM api_keys WHERE id = ?")
      .get(body.id);
    expect(row?.key_hash).not.toBe(body.plaintext);
    expect(row?.prefix).toBe(body.prefix);
    const listed = await app.inject({ method: "GET", url: "/api/v1/api-keys", headers: { cookie: session.cookie } });
    expect(JSON.stringify(listed.json())).not.toContain(body.plaintext);
  });

  test("KEY-02 用 API Key 访问 usage（Bearer）", async () => {
    const session = await devLogin(app, email("key2"));
    const created = (await createKey(session, { scopes: ["usage:read"] })).json() as { plaintext: string };
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/usage",
      headers: { authorization: `Bearer ${created.plaintext}` },
    });
    expect(response.statusCode).toBe(200);
  });

  test("KEY-03 吊销后 API Key 立即 401", async () => {
    const session = await devLogin(app, email("key3"));
    const created = (await createKey(session)).json() as { plaintext: string; id: string };
    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-keys/${created.id}`,
      headers: headers(session),
    });
    expect(revoke.statusCode).toBe(204);
    const use = await app.inject({
      method: "GET",
      url: "/api/v1/usage",
      headers: { authorization: `Bearer ${created.plaintext}` },
    });
    expect(use.statusCode).toBe(401);
  });

  test("KEY-04 伪造 Key 返回 401 且不泄露原因", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/usage",
      headers: { authorization: "Bearer ock_0000000000_invalidinvalidinvalidinvalidinvalid" },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { message: string } };
    expect(body.error.message).toBe("Invalid API key");
  });

  test("KEY-05 scope 不足返回 403", async () => {
    const session = await devLogin(app, email("key5"));
    const created = (await createKey(session, { scopes: ["workspace:read"] })).json() as { plaintext: string };
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/usage",
      headers: { authorization: `Bearer ${created.plaintext}` },
    });
    expect(response.statusCode).toBe(403);
  });

  test("KEY-06 过期 Key 返回 401", async () => {
    const session = await devLogin(app, email("key6"));
    const created = (await createKey(session, { expires_at: new Date(Date.now() - 60_000).toISOString() })).json() as {
      plaintext: string;
    };
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/usage",
      headers: { authorization: `Bearer ${created.plaintext}` },
    });
    expect(response.statusCode).toBe(401);
  });
});
