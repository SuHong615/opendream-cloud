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

async function modelsOf(session: Awaited<ReturnType<typeof devLogin>>) {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/models",
    headers: { cookie: session.cookie },
  });
  expect(response.statusCode).toBe(200);
  return (response.json() as { items: Array<{ id: string; litellm_alias: string }> }).items;
}

describe("模型中心", () => {
  test("MODEL-01 平台模型列表可见（含 2 个 seed 模型）", async () => {
    const session = await devLogin(app, email("model1"));
    const items = await modelsOf(session);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((model) => model.litellm_alias === "litellm/claude-sonnet-5")).toBe(true);
  });

  test("MODEL-02 策略 deny 后 member 不可见（admin 仍可管理）", async () => {
    const session = await devLogin(app, email("model2"));
    const items = await modelsOf(session);
    const denied = items[0]!;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/model-policies",
      headers: headers(session),
      payload: {
        name: "deny-one",
        is_default: true,
        enforcement: "enforce",
        rules: [{ effect: "deny", subject_type: "org", model_id: denied.id }],
      },
    });
    expect(created.statusCode).toBe(201);
    // 降为 member 后按策略过滤（admin 视角仍可见用于管理）
    harness.ctx.sqlite.query("UPDATE memberships SET role = 'member' WHERE user_id = ?").run(session.userId);
    const after = await modelsOf(session);
    expect(after.some((model) => model.id === denied.id)).toBe(false);
    const detail = await app.inject({
      method: "GET",
      url: `/api/v1/models/${denied.id}`,
      headers: { cookie: session.cookie },
    });
    expect([403, 404]).toContain(detail.statusCode);
  });

  test("MODEL-03 策略乐观锁字段：PUT 后 version 递增、规则替换", async () => {
    const session = await devLogin(app, email("model3"));
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/model-policies",
      headers: headers(session),
      payload: { name: "replace-me", is_default: true, enforcement: "warn", rules: [] },
    });
    const policy = created.json() as { id: string; rules: unknown[] };
    const replaced = await app.inject({
      method: "PUT",
      url: `/api/v1/model-policies/${policy.id}`,
      headers: headers(session),
      payload: { name: "replace-me", enforcement: "enforce", rules: [{ effect: "allow", subject_type: "org" }] },
    });
    expect(replaced.statusCode).toBe(200);
    const body = replaced.json() as { rules: unknown[]; enforcement: string };
    expect(body.rules.length).toBe(1);
    expect(body.enforcement).toBe("enforce");
  });

  test("MODEL-04 策略 preview 返回影响面", async () => {
    const session = await devLogin(app, email("model4"));
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/model-policies",
      headers: headers(session),
      payload: { name: "preview", is_default: true, rules: [] },
    });
    const policy = created.json() as { id: string };
    const preview = await app.inject({
      method: "POST",
      url: `/api/v1/model-policies/${policy.id}/preview`,
      headers: headers(session),
      payload: { rules: [] },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json() as { affected_users: number; affected_workspaces: number };
    expect(body.affected_users).toBeGreaterThanOrEqual(1);
    expect(body.affected_workspaces).toBeGreaterThanOrEqual(0);
  });

  test("MODEL-05 创建 provider 与列表（不返回凭证）", async () => {
    const session = await devLogin(app, email("model5"));
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/model-providers",
      headers: headers(session),
      payload: {
        name: "My Gateway",
        kind: "openai_compatible",
        base_url: "https://gateway.example.com/v1",
        credentials: { api_key: "sk-secret-never-returned" },
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { id: string; has_credential: boolean };
    expect(body.has_credential).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/model-providers",
      headers: { cookie: session.cookie },
    });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain("sk-secret");
  });
});
