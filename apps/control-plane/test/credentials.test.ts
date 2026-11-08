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

describe("CREDENTIALS", () => {
  test("创建/列表/更新/删除凭证，列表不回显明文", async () => {
    const session = await devLogin(app, `cred-${Date.now()}@example.com`);
    const auth = { ...headers(session), cookie: session.cookie };
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/credentials",
      headers: auth,
      payload: { name: "GitHub Token", env_key: "GITHUB_ACCESS_TOKEN", value: "ghp_secret_value", description: "只读" },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string; env_key: string; masked: string };
    expect(body.env_key).toBe("GITHUB_ACCESS_TOKEN");
    expect(body.masked).not.toContain("secret");
    const outbox = harness.ctx.sqlite.query<{ topic: string }, [string]>("SELECT topic FROM outbox_events WHERE org_id = ?").all(session.orgId);
    expect(outbox.some((row) => row.topic === "credential.created")).toBe(true);

    const list = await app.inject({ method: "GET", url: "/api/v1/credentials", headers: { cookie: session.cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain("ghp_secret_value");

    const updated = await app.inject({ method: "PUT", url: `/api/v1/credentials/${body.id}`, headers: auth, payload: { value: "ghp_new_value" } });
    expect(updated.statusCode).toBe(200);

    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/credentials/${body.id}`, headers: auth });
    expect(deleted.statusCode).toBe(204);
  });

  test("非 owner/admin 不可写凭证", async () => {
    const session = await devLogin(app, `viewer-${Date.now()}@example.com`);
    // 直接改角色模拟 viewer
    harness.ctx.sqlite.query("UPDATE memberships SET role = 'viewer' WHERE user_id = ?").run(session.userId);
    const denied = await app.inject({
      method: "POST",
      url: "/api/v1/credentials",
      headers: { ...headers(session), cookie: session.cookie },
      payload: { name: "x", env_key: "X_KEY", value: "v" },
    });
    expect(denied.statusCode).toBe(403);
  });
});
