// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";
import { devLogin, ensureReady, headers, setupHarness, type AuthSession, type TestHarness } from "./helpers/app";

let harness: TestHarness;
let app: FastifyInstance;

beforeAll(async () => {
  harness = await setupHarness({ MOCK_PROVISION_MS: "100" });
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

const email = (name: string) => `${name}-${crypto.randomUUID().slice(0, 8)}@example.com`;

async function ensure(session: AuthSession) {
  return app.inject({ method: "POST", url: "/api/v1/workspaces/me/ensure", headers: headers(session) });
}

async function createAndReady(session: AuthSession): Promise<string> {
  const response = await ensure(session);
  const body = response.json() as { id: string };
  await ensureReady(app, session, body.id);
  return body.id;
}

describe("工作区", () => {
  test("WS-01 ensure 创建进入 provisioning，最终 ready", async () => {
    const session = await devLogin(app, email("ws1"));
    const response = await ensure(session);
    expect(response.statusCode).toBe(202);
    const body = response.json() as { id: string; state: string };
    expect(body.state).toBe("provisioning");
    await ensureReady(app, session, body.id);
    const list = await app.inject({ method: "GET", url: "/api/v1/workspaces", headers: { cookie: session.cookie } });
    expect((list.json() as { items: Array<{ state: string }> }).items[0]?.state).toBe("ready");
  });

  test("WS-02 重复 ensure 返回同一 workspace", async () => {
    const session = await devLogin(app, email("ws2"));
    const first = await ensure(session);
    const workspaceId = (first.json() as { id: string }).id;
    await ensureReady(app, session, workspaceId);
    const second = await ensure(session);
    expect(second.statusCode).toBe(200);
    expect((second.json() as { id: string }).id).toBe(workspaceId);
  });

  test("WS-03 并发 ensure 不重复创建", async () => {
    const session = await devLogin(app, email("ws3"));
    const [a, b] = await Promise.all([ensure(session), ensure(session)]);
    const idA = (a.json() as { id?: string }).id;
    const idB = (b.json() as { id?: string }).id;
    expect(idA).toBeDefined();
    expect(idA).toBe(idB);
    const count = harness.ctx.sqlite
      .query<{ c: number }, [string]>("SELECT COUNT(*) AS c FROM workspaces WHERE owner_user_id = ?")
      .get(session.userId);
    expect(count?.c).toBe(1);
  });

  test("WS-04 跨用户访问返回 404（不泄露存在性）", async () => {
    const alice = await devLogin(app, email("ws4a"));
    const bob = await devLogin(app, email("ws4b"));
    const workspaceId = await createAndReady(alice);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: { cookie: bob.cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  test("WS-05 stop 后 stopped，start 后 ready", async () => {
    const session = await devLogin(app, email("ws5"));
    const workspaceId = await createAndReady(session);
    const stop = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/stop`,
      headers: headers(session),
    });
    expect(stop.statusCode).toBe(202);
    await Bun.sleep(250);
    const stopped = await app.inject({ method: "GET", url: `/api/v1/workspaces/${workspaceId}`, headers: { cookie: session.cookie } });
    expect((stopped.json() as { state: string }).state).toBe("stopped");
    const start = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/start`,
      headers: headers(session),
    });
    expect(start.statusCode).toBe(202);
    await ensureReady(app, session, workspaceId);
  });

  test("WS-06 非法状态迁移返回 409", async () => {
    const session = await devLogin(app, email("ws6"));
    const created = await ensure(session);
    const workspaceId = (created.json() as { id: string }).id;
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/stop`,
      headers: headers(session),
    });
    expect(response.statusCode).toBe(409);
  });

  test("WS-07 destroy 名称不匹配返回 400", async () => {
    const session = await devLogin(app, email("ws7"));
    const workspaceId = await createAndReady(session);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/destroy`,
      headers: headers(session),
      payload: { confirm_name: "wrong-name", acknowledge_data_loss: true },
    });
    expect(response.statusCode).toBe(400);
  });

  test("WS-08 destroy 进入冷却期，cancel 可撤销", async () => {
    const session = await devLogin(app, email("ws8"));
    const workspaceId = await createAndReady(session);
    const displayName = "我的工作区";
    const destroy = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/destroy`,
      headers: headers(session),
      payload: { confirm_name: displayName, acknowledge_data_loss: true },
    });
    expect(destroy.statusCode).toBe(202);
    expect((destroy.json() as { destroy_scheduled_at: string | null }).destroy_scheduled_at).toBeString();
    const cancel = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/destroy/cancel`,
      headers: headers(session),
    });
    expect(cancel.statusCode).toBe(200);
    expect((cancel.json() as { destroy_scheduled_at: string | null }).destroy_scheduled_at).toBeNull();
  });

  test("WS-09 冷却到期后删除，GET 返回 404", async () => {
    const session = await devLogin(app, email("ws9"));
    const workspaceId = await createAndReady(session);
    const destroy = await app.inject({
      method: "POST",
      url: `/api/v1/workspaces/${workspaceId}/destroy`,
      headers: headers(session),
      payload: { confirm_name: "我的工作区", acknowledge_data_loss: true },
    });
    expect(destroy.statusCode).toBe(202);
    await Bun.sleep(300);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(404);
  });

  test("WS-10 退出/无请求不自动销毁", async () => {
    const session = await devLogin(app, email("ws10"));
    const workspaceId = await createAndReady(session);
    await Bun.sleep(250);
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/workspaces/${workspaceId}`,
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { state: string }).state).toBe("ready");
  });

  test("WS-11 列表 summary 含 last_active_at 与 stage（G2-WC-03）", async () => {
    const session = await devLogin(app, email("ws11"));
    const workspaceId = await createAndReady(session);
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/workspaces",
      headers: { cookie: session.cookie },
    });
    expect(response.statusCode).toBe(200);
    const item = (response.json() as { items: Array<{ id: string; stage: string; last_active_at: string | null }> }).items.find(
      (workspace) => workspace.id === workspaceId,
    );
    expect(item).toBeDefined();
    expect(item?.stage).toBe("ready");
    expect(item?.last_active_at === null || typeof item?.last_active_at === "string").toBe(true);
  });

  test("WS-12 超出配额返回 409 ws_quota_exceeded（G2-WC-06）", async () => {
    const session = await devLogin(app, email("ws12"));
    await ensure(session);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: headers(session),
      payload: { display_name: "第二个工作区" },
    });
    expect(second.statusCode).toBe(409);
    const body = second.json() as { error: { code: string; reason: string } };
    expect(body.error.code).toBe("conflict");
    expect(body.error.reason).toBe("ws_quota_exceeded");
  });
});
