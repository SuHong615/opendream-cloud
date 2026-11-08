// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Harness } from "./helpers";
import { TENANT_HEADERS, createSession, newTenantHeaders, sendMessage, setupHarness, waitFor, waitForState } from "./helpers";

let harness: Harness;

beforeAll(async () => {
  harness = await setupHarness();
});

afterAll(async () => {
  await harness.close();
});

interface Frame {
  id: number;
  event: string;
  data: Record<string, unknown>;
}

function parseFrames(text: string): Frame[] {
  const frames: Frame[] = [];
  for (const chunk of text.split("\n\n")) {
    if (!chunk.trim()) continue;
    let id: number | undefined;
    let event: string | undefined;
    let data: Record<string, unknown> | undefined;
    for (const line of chunk.split("\n")) {
      if (line.startsWith("id: ")) id = Number(line.slice(4));
      else if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = JSON.parse(line.slice(6)) as Record<string, unknown>;
    }
    if (id !== undefined && event && data) frames.push({ id, event, data });
  }
  return frames;
}

function sseUrl(sessionId: string): string {
  return `${harness.base}/api/v1/dh/sessions/${sessionId}/events`;
}

async function openSse(sessionId: string, headers: Record<string, string>, lastEventId?: number, signal?: AbortSignal): Promise<Response> {
  return fetch(sseUrl(sessionId), {
    headers: { ...headers, ...(lastEventId !== undefined ? { "last-event-id": String(lastEventId) } : {}) },
    signal,
  });
}

describe("digital-human SSE（task-39）", () => {
  test("DH-SSE-01 终态会话：回放全部事件并按 Last-Event-ID 续传不重复", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(harness.app, {}, headers);
    await waitForState(harness.app, created.id, "active", headers);
    await sendMessage(harness.app, created.id, "SSE 回放测试", {}, headers);
    await harness.app.inject({ method: "POST", url: `/api/v1/dh/sessions/${created.id}/end`, headers });

    // 无 Last-Event-ID：回放所有事件后流关闭
    const full = await openSse(created.id, headers);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toContain("text/event-stream");
    const frames = parseFrames(await full.text());
    const types = frames.map((frame) => frame.event);
    expect(types).toContain("state");
    expect(types).toContain("message");
    expect(types).toContain("ended");
    expect(types[types.length - 1]).toBe("ended");
    const seqs = frames.map((frame) => frame.id);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    const ended = frames[frames.length - 1]!;
    expect(ended.data.state).toBe("ended");
    expect(ended.data.reason).toBe("user_ended");

    // Last-Event-ID = 第一条事件的 seq：只回放后续事件
    const firstSeq = frames[0]!.id;
    const resumed = await openSse(created.id, headers, firstSeq);
    const resumedFrames = parseFrames(await resumed.text());
    expect(resumedFrames.length).toBe(frames.length - 1);
    expect(resumedFrames.every((frame) => frame.id > firstSeq)).toBe(true);
    expect(resumedFrames[resumedFrames.length - 1]!.event).toBe("ended");
  });

  test("DH-SSE-02 活跃会话：实时推送 message 事件", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(harness.app, {}, headers);
    await waitForState(harness.app, created.id, "active", headers);

    const controller = new AbortController();
    const response = await openSse(created.id, headers, undefined, controller.signal);
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";

    const reading = (async (): Promise<Frame[]> => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        const frames = parseFrames(received);
        if (frames.some((frame) => frame.event === "message")) return frames;
      }
      return parseFrames(received);
    })();

    await Bun.sleep(20); // 确保订阅已建立
    const reply = await sendMessage(harness.app, created.id, "实时推送测试", {}, headers);
    expect(reply.statusCode).toBe(200);

    const frames = await reading;
    const message = frames.find((frame) => frame.event === "message");
    expect(message).toBeDefined();
    expect(message?.data.role).toBe("assistant");
    expect(String(message?.data.text)).toContain("实时推送测试");
    expect(frames.map((frame) => frame.id)).toEqual([...new Set(frames.map((frame) => frame.id))]);

    controller.abort();
    await Bun.sleep(10);
  });

  test("DH-SSE-03 未知/跨租户会话：404 JSON（不建立 SSE）", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(harness.app, {}, headers);
    const unknown = await openSse(crypto.randomUUID(), headers);
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get("content-type")).toContain("application/json");
    const body = (await unknown.json()) as { error: { code: string; request_id: string } };
    expect(body.error.code).toBe("not_found");
    expect(body.error.request_id).toBeString();

    const cross = await openSse(created.id, TENANT_HEADERS);
    expect(cross.status).toBe(404);
  });

  test("DH-SSE-04 错误会话：error 事件后关闭流", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(harness.app, {}, headers);
    await waitForState(harness.app, created.id, "active", headers);
    const failed = await harness.app.inject({
      method: "POST",
      url: `/api/v1/dh/sessions/${created.id}/messages`,
      headers,
      payload: { text: "触发错误", simulate: "rtc_unavailable" },
    });
    expect(failed.statusCode).toBe(503);

    const response = await openSse(created.id, headers);
    const frames = parseFrames(await response.text());
    const errorFrame = frames.find((frame) => frame.event === "error");
    expect(errorFrame).toBeDefined();
    expect(errorFrame?.data.reason).toBe("dh_rtc_unavailable");
    expect(frames[frames.length - 1]!.event).toBe("error");
  });
});
