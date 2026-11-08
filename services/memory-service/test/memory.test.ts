// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Harness } from "./helpers";
import { OTHER_ORG_ID, addMemory, authHeaders, setupHarness } from "./helpers";

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

describe("memory-service（task-47）", () => {
  test("AUTH-01 缺失/错误 API Key → 401；healthz 开放", async () => {
    const missing = await app.inject({ method: "GET", url: "/v1/memories" });
    expect(missing.statusCode).toBe(401);
    const missingBody = missing.json() as { error: { code: string; request_id: string } };
    expect(missingBody.error.code).toBe("unauthorized");
    expect(missingBody.error.request_id).toBeString();

    const wrong = await app.inject({
      method: "GET",
      url: "/v1/memories",
      headers: { authorization: "Bearer wrong-key" },
    });
    expect(wrong.statusCode).toBe(401);

    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    const healthBody = health.json() as { status: string; service: string; memories: number; experiences: number };
    expect(healthBody.status).toBe("ok");
    expect(healthBody.service).toBe("memory-service");
    expect(healthBody.memories).toBeGreaterThanOrEqual(3);
    expect(healthBody.experiences).toBeGreaterThanOrEqual(2);
  });

  test("MEM-01 seed：默认租户 3 条 memory，字段完整", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/memories", headers: authHeaders(env) });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      results: Array<{ id: string; memory: string; user_id: string; metadata: Record<string, unknown>; created_at: string }>;
      count: number;
      items: unknown[];
    };
    expect(body.count).toBeGreaterThanOrEqual(3);
    expect(body.results.length).toBe(body.count);
    expect(Array.isArray(body.items)).toBe(true);
    for (const item of body.results) {
      expect(item.id).toBeString();
      expect(item.memory).toBeString();
      expect(item.user_id).toBe(env.DEFAULT_USER_ID);
      expect(item.created_at).toBeString();
    }
  });

  test("MEM-02 add（mem0 兼容）：messages → ADD，list 可见", async () => {
    const content = "我偏好使用 Bun 做单元测试，喜欢快速的运行时。";
    const response = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: authHeaders(env),
      payload: {
        messages: [
          { role: "user", content },
          { role: "assistant", content: "好的，已记录您的偏好。" },
        ],
        user_id: "user-mem-02",
        agent_id: "agent-code",
        metadata: { source: "test" },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      results: Array<{ id: string; memory: string; event: string; user_id: string; agent_id: string; metadata: Record<string, unknown> }>;
    };
    expect(body.results.length).toBe(1);
    const added = body.results[0]!;
    expect(added.event).toBe("ADD");
    expect(added.memory).toContain(content);
    expect(added.user_id).toBe("user-mem-02");
    expect(added.agent_id).toBe("agent-code");
    expect(added.metadata.source).toBe("test");

    const list = await app.inject({ method: "GET", url: `/v1/memories?user_id=user-mem-02`, headers: authHeaders(env) });
    const items = (list.json() as { results: Array<{ id: string }> }).results;
    expect(items.some((item) => item.id === added.id)).toBe(true);
  });

  test("MEM-03 参数校验：空 messages / 非法 search 参数 → 400", async () => {
    const empty = await app.inject({
      method: "POST",
      url: "/v1/memories",
      headers: authHeaders(env),
      payload: { messages: [] },
    });
    expect(empty.statusCode).toBe(400);
    expect((empty.json() as { error: { code: string } }).error.code).toBe("validation_failed");

    const missing = await app.inject({ method: "POST", url: "/v1/memories", headers: authHeaders(env), payload: {} });
    expect(missing.statusCode).toBe(400);

    const badSearch = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: authHeaders(env),
      payload: { query: "x", top_k: 999 },
    });
    expect(badSearch.statusCode).toBe(400);
  });

  test("MEM-04 search：mock 相似度排序 + score 阈值 + top_k", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: authHeaders(env),
      payload: { query: "TypeScript", top_k: 5 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { results: Array<{ id: string; memory: string; score: number }>; count: number };
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0]!.memory.toLowerCase()).toContain("typescript");
    const scores = body.results.map((item) => item.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(scores.every((score) => score > 0 && score <= 1)).toBe(true);

    const topOne = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: authHeaders(env),
      payload: { query: "TypeScript", top_k: 1 },
    });
    expect((topOne.json() as { results: unknown[] }).results.length).toBe(1);

    const noMatch = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: authHeaders(env),
      payload: { query: "完全不存在zzzqqq", threshold: 0.9 },
    });
    expect((noMatch.json() as { results: unknown[] }).results.length).toBe(0);
  });

  test("MEM-05 租户隔离：其他 org 不可见/不可删除；search 不跨 org", async () => {
    const added = await addMemory(harness, "org-A 专属记忆：内部代号 falcon-7。");

    const otherList = await app.inject({
      method: "GET",
      url: "/v1/memories?user_id=user-mem-05",
      headers: authHeaders(env, OTHER_ORG_ID),
    });
    expect(otherList.statusCode).toBe(200);
    expect((otherList.json() as { results: unknown[] }).results.length).toBe(0);

    const otherSearch = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: authHeaders(env, OTHER_ORG_ID),
      payload: { query: "falcon-7" },
    });
    expect((otherSearch.json() as { results: unknown[] }).results.length).toBe(0);

    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/v1/memories/${added.id}`,
      headers: authHeaders(env, OTHER_ORG_ID),
    });
    expect(crossDelete.statusCode).toBe(404);
    expect((crossDelete.json() as { error: { code: string } }).error.code).toBe("not_found");

    const ownSearch = await app.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: authHeaders(env),
      payload: { query: "falcon-7" },
    });
    expect((ownSearch.json() as { results: Array<{ id: string }> }).results.some((item) => item.id === added.id)).toBe(true);
  });

  test("MEM-06 delete：本人删除 200（mem0 message），再次删除 404", async () => {
    const added = await addMemory(harness, "待删除的临时记忆。");
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/memories/${added.id}`,
      headers: { ...authHeaders(env), "content-type": "application/json" },
    });
    expect(deleted.statusCode).toBe(200);
    expect((deleted.json() as { message: string }).message).toBe("Memory deleted successfully");

    const again = await app.inject({
      method: "DELETE",
      url: `/v1/memories/${added.id}`,
      headers: authHeaders(env),
    });
    expect(again.statusCode).toBe(404);

    const list = await app.inject({ method: "GET", url: "/v1/memories", headers: authHeaders(env) });
    expect((list.json() as { results: Array<{ id: string }> }).results.some((item) => item.id === added.id)).toBe(false);
  });

  test("MEM-07 mem0 兼容响应结构：GET /v1/memories 返回 results[]", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/memories?limit=2", headers: authHeaders(env) });
    const body = response.json() as { results: unknown[]; items: unknown[]; count: number };
    expect(body.results.length).toBe(2);
    expect(body.items.length).toBe(body.count);
  });
});
