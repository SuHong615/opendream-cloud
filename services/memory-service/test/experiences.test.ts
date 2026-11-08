// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Harness } from "./helpers";
import { OTHER_ORG_ID, authHeaders, setupHarness } from "./helpers";

let harness: Harness;
let app: Harness["app"];
let env: Harness["env"];

beforeAll(async () => {
  harness = await setupHarness();
  app = harness.app;
  env = harness.env;
});

afterAll(async () => {
  await app.close();
});

describe("memory-service experience 库（task-47）", () => {
  test("EXP-01 seed：默认租户 2 条 experience", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/experiences", headers: authHeaders(env) });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      items: Array<{ id: string; title: string; content: string; tags: string[]; source: string; created_by: string; created_at: string }>;
      count: number;
    };
    expect(body.count).toBeGreaterThanOrEqual(2);
    for (const item of body.items) {
      expect(item.id).toBeString();
      expect(item.title).toBeString();
      expect(item.content).toBeString();
      expect(Array.isArray(item.tags)).toBe(true);
      expect(item.created_at).toBeString();
    }
  });

  test("EXP-02 创建 experience：201 + 字段落库，list 可见", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/experiences",
      headers: authHeaders(env),
      payload: {
        title: "本地 Docker 启动模型中心",
        content: "compose up 后访问 control-plane :4000，dev-login 后调用 /model-providers 注册 mock-model:9100。",
        tags: ["docker", "model-center"],
        source: "manual",
      },
    });
    expect(response.statusCode).toBe(201);
    const created = response.json() as { id: string; title: string; tags: string[]; source: string; created_by: string };
    expect(created.id).toBeString();
    expect(created.title).toBe("本地 Docker 启动模型中心");
    expect(created.tags).toEqual(["docker", "model-center"]);
    expect(created.source).toBe("manual");
    expect(created.created_by).toBe(env.DEFAULT_USER_ID);

    const list = await app.inject({ method: "GET", url: "/api/v1/experiences?limit=50", headers: authHeaders(env) });
    const items = (list.json() as { items: Array<{ id: string }> }).items;
    expect(items.some((item) => item.id === created.id)).toBe(true);
  });

  test("EXP-03 search：q 命中标题/正文/标签，score 降序", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/experiences/search?q=${encodeURIComponent("数字人")}`,
      headers: authHeaders(env),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ id: string; title: string; content: string; score: number }>; count: number };
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(`${body.items[0]!.title}${body.items[0]!.content}`).toContain("数字人");
    const scores = body.items.map((item) => item.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    const tagSearch = await app.inject({
      method: "GET",
      url: "/api/v1/experiences/search?q=model-center",
      headers: authHeaders(env),
    });
    expect((tagSearch.json() as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(1);

    const none = await app.inject({
      method: "GET",
      url: `/api/v1/experiences/search?q=${encodeURIComponent("完全不存在的zzz")}`,
      headers: authHeaders(env),
    });
    expect((none.json() as { items: unknown[] }).items.length).toBe(0);
  });

  test("EXP-04 租户隔离：其他 org 列表/搜索不可见，且本 org 新建不泄漏", async () => {
    const otherList = await app.inject({ method: "GET", url: "/api/v1/experiences", headers: authHeaders(env, OTHER_ORG_ID) });
    expect((otherList.json() as { items: unknown[] }).items.length).toBe(0);
    const otherSearch = await app.inject({
      method: "GET",
      url: "/api/v1/experiences/search?q=model-center",
      headers: authHeaders(env, OTHER_ORG_ID),
    });
    expect((otherSearch.json() as { items: unknown[] }).items.length).toBe(0);

    const created = await app.inject({
      method: "POST",
      url: "/api/v1/experiences",
      headers: authHeaders(env, OTHER_ORG_ID),
      payload: { title: "org-B 专属经验", content: "仅 B 可见的内容 falcon-9。" },
    });
    expect(created.statusCode).toBe(201);
    const createdId = (created.json() as { id: string }).id;

    const defaultSearch = await app.inject({
      method: "GET",
      url: "/api/v1/experiences/search?q=falcon-9",
      headers: authHeaders(env),
    });
    expect((defaultSearch.json() as { items: Array<{ id: string }> }).items.some((item) => item.id === createdId)).toBe(false);
  });

  test("EXP-05 参数校验：缺 title/content → 400", async () => {
    const noTitle = await app.inject({
      method: "POST",
      url: "/api/v1/experiences",
      headers: authHeaders(env),
      payload: { content: "x" },
    });
    expect(noTitle.statusCode).toBe(400);
    expect((noTitle.json() as { error: { code: string } }).error.code).toBe("validation_failed");

    const noContent = await app.inject({
      method: "POST",
      url: "/api/v1/experiences",
      headers: authHeaders(env),
      payload: { title: "x" },
    });
    expect(noContent.statusCode).toBe(400);

    const missingQ = await app.inject({ method: "GET", url: "/api/v1/experiences/search", headers: authHeaders(env) });
    expect(missingQ.statusCode).toBe(400);
  });

  test("EXP-06 鉴权：experience 端点同样要求 Bearer key（401）", async () => {
    for (const [method, url] of [
      ["GET", "/api/v1/experiences"],
      ["POST", "/api/v1/experiences"],
      ["GET", "/api/v1/experiences/search?q=x"],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        headers: { "x-oc-org-id": env.DEFAULT_ORG_ID },
        payload: method === "POST" ? { title: "x", content: "y" } : undefined,
      });
      expect(response.statusCode).toBe(401);
    }
  });
});
