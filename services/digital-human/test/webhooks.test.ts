// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Harness } from "./helpers";
import { createSession, newTenantHeaders, sendMessage, setupHarness, waitFor, waitForState } from "./helpers";

interface Delivery {
  headers: Record<string, string>;
  rawBody: string;
  body: { id: string; type: string; created_at: string; data: Record<string, unknown> };
}

let harness: Harness;
const receiverDeliveries: Delivery[] = [];
const filteredDeliveries: Delivery[] = [];
let receiver: ReturnType<typeof Bun.serve>;
let filteredReceiver: ReturnType<typeof Bun.serve>;

beforeAll(async () => {
  harness = await setupHarness();
  receiver = Bun.serve({
    port: 0,
    async fetch(request) {
      const rawBody = await request.text();
      receiverDeliveries.push({
        headers: Object.fromEntries(request.headers.entries()),
        rawBody,
        body: JSON.parse(rawBody) as Delivery["body"],
      });
      return new Response("ok");
    },
  });
  filteredReceiver = Bun.serve({
    port: 0,
    async fetch(request) {
      const rawBody = await request.text();
      filteredDeliveries.push({
        headers: Object.fromEntries(request.headers.entries()),
        rawBody,
        body: JSON.parse(rawBody) as Delivery["body"],
      });
      return new Response("ok");
    },
  });
});

afterAll(async () => {
  receiver.stop(true);
  filteredReceiver.stop(true);
  await harness.close();
});

function verifySignature(secret: string, delivery: Delivery): boolean {
  const signature = delivery.headers["x-dh-signature"];
  if (!signature) return false;
  const parts = signature.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const digest = parts.find((part) => part.startsWith("v1="))?.slice(3);
  if (!timestamp || !digest) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${delivery.rawBody}`, "utf8").digest("hex");
  return expected === digest;
}

async function registerWebhook(
  headers: Record<string, string>,
  url: string,
  events?: string[],
): Promise<{ webhook_id: string; secret: string }> {
  const response = await harness.app.inject({
    method: "POST",
    url: "/api/v1/dh/webhooks",
    headers,
    payload: { url, ...(events ? { events } : {}) },
  });
  if (response.statusCode !== 201) throw new Error(`registerWebhook ${response.statusCode} ${response.body}`);
  return response.json() as { webhook_id: string; secret: string };
}

describe("digital-human Webhook（task-39）", () => {
  test("DH-WH-01 会话事件回调：HMAC 验签通过，事件类型覆盖 created/active/message/ended", async () => {
    const headers = newTenantHeaders();
    const { secret } = await registerWebhook(headers, `http://127.0.0.1:${receiver.port}/hooks`);

    const created = await createSession(harness.app, {}, headers);
    await waitForState(harness.app, created.id, "active", headers);
    await sendMessage(harness.app, created.id, "webhook 测试", {}, headers);
    await harness.app.inject({ method: "POST", url: `/api/v1/dh/sessions/${created.id}/end`, headers });

    await waitFor(() => (receiverDeliveries.some((delivery) => delivery.body.type === "dh.session.ended") ? receiverDeliveries : undefined), {
      label: "webhook deliveries",
      timeoutMs: 3000,
    });

    const types = receiverDeliveries.map((delivery) => delivery.body.type);
    for (const expected of ["dh.session.created", "dh.session.active", "dh.message", "dh.session.ended"]) {
      expect(types).toContain(expected);
    }
    for (const delivery of receiverDeliveries) {
      expect(delivery.headers["x-dh-event"]).toBe(delivery.body.type);
      expect(delivery.headers["x-dh-delivery"]).toBe(delivery.body.id);
      expect(verifySignature(secret, delivery)).toBe(true);
    }
    const ended = receiverDeliveries.find((delivery) => delivery.body.type === "dh.session.ended");
    expect(ended?.body.data.session_id).toBe(created.id);
    expect(ended?.body.data.reason).toBe("user_ended");
  });

  test("DH-WH-02 事件过滤：仅订阅 dh.session.ended 时只收 ended", async () => {
    const headers = newTenantHeaders();
    const { secret } = await registerWebhook(headers, `http://127.0.0.1:${filteredReceiver.port}/hooks`, ["dh.session.ended"]);

    const created = await createSession(harness.app, {}, headers);
    await waitForState(harness.app, created.id, "active", headers);
    await sendMessage(harness.app, created.id, "过滤测试", {}, headers);
    await harness.app.inject({ method: "POST", url: `/api/v1/dh/sessions/${created.id}/end`, headers });

    await waitFor(() => (filteredDeliveries.length > 0 ? filteredDeliveries : undefined), { label: "filtered webhook", timeoutMs: 3000 });
    await Bun.sleep(100); // 给可能误投递的窗口
    expect(filteredDeliveries.every((delivery) => delivery.body.type === "dh.session.ended")).toBe(true);
    expect(filteredDeliveries[0]?.body.data.session_id).toBe(created.id);
    expect(verifySignature(secret, filteredDeliveries[0]!)).toBe(true);
  });

  test("DH-WH-03 注册校验：非法 URL → 400", async () => {
    const headers = newTenantHeaders();
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/v1/dh/webhooks",
      headers,
      payload: { url: "not-a-url" },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe("validation_failed");
  });
});
