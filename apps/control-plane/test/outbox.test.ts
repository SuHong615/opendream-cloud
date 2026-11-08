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

describe("OUTBOX / DLQ", () => {
  test("失败事件可查询并重放", async () => {
    const session = await devLogin(app, `dlq-${Date.now()}@example.com`);
    const auth = { ...headers(session), cookie: session.cookie };
    await app.inject({ method: "POST", url: "/api/v1/credentials", headers: auth, payload: { name: "DLQ", env_key: "DLQ_TOKEN", value: "v" } });
    const event = harness.ctx.sqlite.query<{ id: string }, [string]>("SELECT id FROM outbox_events WHERE org_id = ? LIMIT 1").get(session.orgId);
    expect(event).toBeTruthy();
    harness.ctx.sqlite.query("UPDATE outbox_events SET status = 'failed', attempts = 10, last_error = 'test' WHERE id = ?").run(event!.id);

    const list = await app.inject({ method: "GET", url: "/api/v1/outbox/events?status=failed", headers: { cookie: session.cookie } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: Array<{ id: string }> }).items.some((row) => row.id === event!.id)).toBe(true);

    const replay = await app.inject({ method: "POST", url: `/api/v1/outbox/events/${event!.id}/replay`, headers: auth, payload: {} });
    expect(replay.statusCode).toBe(200);
    const row = harness.ctx.sqlite.query<{ status: string }, [string]>("SELECT status FROM outbox_events WHERE id = ?").get(event!.id);
    expect(row?.status).toBe("pending");
  });
});
