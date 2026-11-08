// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Harness } from "./helpers";
import {
  OTHER_TENANT_HEADERS,
  TENANT_HEADERS,
  createSession,
  getSession,
  newTenantHeaders,
  sendMessage,
  setupHarness,
  waitFor,
  waitForState,
} from "./helpers";

let harness: Harness;
let app: Harness["app"];

beforeAll(async () => {
  harness = await setupHarness();
  app = harness.app;
});

afterAll(async () => {
  await harness.close();
});

describe("digital-human L1（task-39）", () => {
  test("DH-01 assets：2 个 2D 形象 + 3 个音色", async () => {
    const avatars = await app.inject({ method: "GET", url: "/api/v1/dh/avatars", headers: TENANT_HEADERS });
    expect(avatars.statusCode).toBe(200);
    const avatarBody = avatars.json() as { items: Array<{ id: string; name: string; tier: string; status: string; preview_url: string }> };
    expect(avatarBody.items.length).toBeGreaterThanOrEqual(2);
    expect(avatarBody.items.every((item) => item.tier === "L1" && item.status === "active" && item.preview_url)).toBe(true);

    const voices = await app.inject({ method: "GET", url: "/api/v1/dh/voices", headers: TENANT_HEADERS });
    expect(voices.statusCode).toBe(200);
    const voiceBody = voices.json() as { items: Array<{ id: string; name: string; provider: string; language: string }> };
    expect(voiceBody.items.length).toBeGreaterThanOrEqual(3);
    expect(voiceBody.items.every((item) => item.provider === "mock-tts" && item.language)).toBe(true);
  });

  test("DH-02 创建会话：返回 rtc_url/token/expires_in，并迁移到 active", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(app, {}, headers);
    const body = created.body;
    expect(body.session_id).toBeString();
    expect(body.id).toBe(body.session_id);
    expect(body.state).toBe("created");
    expect(body.status).toBe("created");
    expect(String(body.rtc_url)).toStartWith("ws://");
    expect(String(body.token)).toStartWith("dh_rtc_");
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.avatar_id).toBe("av_l1_cartoon");
    expect(body.voice_id).toBe("vo_zh_female_warm");

    const active = await waitForState(app, created.id, "active", headers);
    expect(active.started_at).toBeString();
  });

  test("DH-03 canonical 创建：app_id/mode/status 字段与 DhSession 对齐", async () => {
    const headers = newTenantHeaders();
    const appId = "11111111-1111-4111-8111-111111111111";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dh/sessions",
      headers,
      payload: { app_id: appId, mode: "near_realtime", persona_ref: "av_l1_photo", voice_ref: "vo_zh_male_steady" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as Record<string, unknown>;
    expect(body.id).toBeString();
    expect(body.app_id).toBe(appId);
    expect(body.mode).toBe("near_realtime");
    expect(body.status).toBe("created");
    expect(body.created_at).toBeString();
    const rtc = body.rtc as { room: string; url: string; token: string; expires_at: string };
    expect(rtc.room).toBeString();
    expect(rtc.url).toStartWith("ws://");
    expect(rtc.token).toBeString();
    expect(rtc.expires_at).toBeString();
    expect(body.avatar_id).toBe("av_l1_photo");
    expect(body.voice_id).toBe("vo_zh_male_steady");
  });

  test("DH-04 同一用户已有活跃会话 → 409 dh_session_active", async () => {
    const headers = newTenantHeaders();
    await createSession(app, {}, headers);
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/dh/sessions",
      headers,
      payload: { avatar_id: "av_l1_cartoon", voice_id: "vo_zh_female_warm" },
    });
    expect(second.statusCode).toBe(409);
    const body = second.json() as { error: { code: string; reason: string; request_id: string } };
    expect(body.error.code).toBe("conflict");
    expect(body.error.reason).toBe("dh_session_active");
    expect(body.error.request_id).toBeString();
  });

  test("DH-05 发消息：mock 回复含 latency/usage，会话用量累计", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(app, {}, headers);
    await waitForState(app, created.id, "active", headers);
    const reply = await sendMessage(app, created.id, "请介绍一下你自己", {}, headers);
    expect(reply.statusCode).toBe(200);
    const body = reply.body as {
      message_id: string;
      session_id: string;
      role: string;
      text: string;
      state: string;
      latency_ms: number;
      usage: { input_tokens: number; output_tokens: number; total_tokens: number };
      session_usage: { turns: number; total_tokens: number };
    };
    expect(body.role).toBe("assistant");
    expect(body.session_id).toBe(created.id);
    expect(body.text).toContain("请介绍一下你自己");
    expect(body.latency_ms).toBeGreaterThanOrEqual(0);
    expect(body.usage.total_tokens).toBe(body.usage.input_tokens + body.usage.output_tokens);
    expect(body.session_usage.turns).toBe(1);

    const second = await sendMessage(app, created.id, "你好", {}, headers);
    expect((second.body as { text: string }).text).toContain("很高兴为您服务");
    expect((second.body as { session_usage: { turns: number } }).session_usage.turns).toBe(2);
  });

  test("DH-06 canonical /input 与 MVP /messages 回复等价", async () => {
    const headersA = newTenantHeaders();
    const a = await createSession(app, {}, headersA);
    await waitForState(app, a.id, "active", headersA);
    const viaMessages = await sendMessage(app, a.id, "等价性检查", {}, headersA);
    const text = (viaMessages.body as { text: string }).text;
    expect(text).toContain("等价性检查");

    const headersB = newTenantHeaders();
    const b = await createSession(app, { voice_id: "vo_zh_male_steady" }, headersB);
    await waitForState(app, b.id, "active", headersB);
    const input = await app.inject({
      method: "POST",
      url: `/api/v1/dh/sessions/${b.id}/input`,
      headers: headersB,
      payload: { text: "等价性检查" },
    });
    expect(input.statusCode).toBe(200);
    const body = input.json() as { accepted: boolean; state: string; reply: { role: string; text: string; usage: { total_tokens: number } } };
    expect(body.accepted).toBe(true);
    expect(body.reply.role).toBe("assistant");
    expect(body.reply.text).toContain("等价性检查");
    expect(body.reply.usage.total_tokens).toBeGreaterThan(0);
  });

  test("DH-07 结束会话：/end 与 DELETE 均可，结束后发消息 409", async () => {
    const headers = newTenantHeaders();
    const a = await createSession(app, {}, headers);
    const ended = await app.inject({ method: "POST", url: `/api/v1/dh/sessions/${a.id}/end`, headers });
    expect(ended.statusCode).toBe(200);
    expect((ended.json() as { state: string }).state).toBe("ended");

    const afterEnd = await sendMessage(app, a.id, "还能说话吗", {}, headers);
    expect(afterEnd.statusCode).toBe(409);
    expect((afterEnd.body as { error: { code: string } }).error.code).toBe("conflict");

    const b = await createSession(app, { avatar_id: "av_l1_photo" }, headers);
    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/dh/sessions/${b.id}`,
      headers: { ...headers, "content-type": "application/json" },
    });
    expect(deleted.statusCode).toBe(200);
    const body = deleted.json() as { state: string; ended_at: string; end_reason: string };
    expect(body.state).toBe("ended");
    expect(body.ended_at).toBeString();
    expect(body.end_reason).toBe("user_ended");
  });

  test("DH-08 错误：未知形象 409 / 未知音色 403 / 非法参数 400 / 未知会话 404", async () => {
    const headers = newTenantHeaders();
    const badAvatar = await app.inject({
      method: "POST",
      url: "/api/v1/dh/sessions",
      headers,
      payload: { avatar_id: "av_missing", voice_id: "vo_zh_female_warm" },
    });
    expect(badAvatar.statusCode).toBe(409);
    const avatarError = badAvatar.json() as { error: { code: string; reason: string } };
    expect(avatarError.error.code).toBe("conflict");
    expect(avatarError.error.reason).toBe("dh_avatar_unavailable");

    const badVoice = await app.inject({
      method: "POST",
      url: "/api/v1/dh/sessions",
      headers,
      payload: { avatar_id: "av_l1_cartoon", voice_id: "vo_missing" },
    });
    expect(badVoice.statusCode).toBe(403);
    expect((badVoice.json() as { error: { reason: string } }).error.reason).toBe("dh_voice_unauthorized");

    const created = await createSession(app, {}, headers);
    const empty = await app.inject({
      method: "POST",
      url: `/api/v1/dh/sessions/${created.id}/messages`,
      headers,
      payload: { text: "" },
    });
    expect(empty.statusCode).toBe(400);
    expect((empty.json() as { error: { code: string } }).error.code).toBe("validation_failed");

    const missing = await app.inject({ method: "GET", url: `/api/v1/dh/sessions/${crypto.randomUUID()}`, headers });
    expect(missing.statusCode).toBe(404);
    expect((missing.json() as { error: { code: string } }).error.code).toBe("not_found");
  });

  test("DH-09 租户隔离：其他租户读/发消息/结束均 404", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(app, {}, headers);
    for (const [method, path] of [
      ["GET", `/api/v1/dh/sessions/${created.id}`],
      ["POST", `/api/v1/dh/sessions/${created.id}/messages`],
      ["POST", `/api/v1/dh/sessions/${created.id}/end`],
      ["DELETE", `/api/v1/dh/sessions/${created.id}`],
    ] as const) {
      const response = await app.inject({
        method,
        url: path,
        headers: OTHER_TENANT_HEADERS,
        payload: method === "POST" ? { text: "hi" } : undefined,
      });
      expect(response.statusCode).toBe(404);
    }
    const list = await app.inject({ method: "GET", url: "/api/v1/dh/sessions", headers: OTHER_TENANT_HEADERS });
    const items = (list.json() as { items: Array<{ session_id: string }> }).items;
    expect(items.some((item) => item.session_id === created.id)).toBe(false);
  });

  test("DH-10 模拟 TTS 故障 → 503 dh_tts_unavailable，会话进入 error", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(app, {}, headers);
    await waitForState(app, created.id, "active", headers);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/dh/sessions/${created.id}/messages`,
      headers,
      payload: { text: "测试故障", simulate: "tts_unavailable" },
    });
    expect(response.statusCode).toBe(503);
    const body = response.json() as { error: { code: string; reason: string } };
    expect(body.error.code).toBe("model_gateway_unavailable");
    expect(body.error.reason).toBe("dh_tts_unavailable");
    const session = await getSession(app, created.id, headers);
    expect(session.state).toBe("error");
    expect(session.error_reason).toBe("dh_tts_unavailable");
  });

  test("DH-11 内容安全拦截 → 403 dh_content_blocked，不改变状态", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(app, {}, headers);
    await waitForState(app, created.id, "active", headers);
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/dh/sessions/${created.id}/messages`,
      headers,
      payload: { text: "blocked content", simulate: "content_blocked" },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { reason: string } }).error.reason).toBe("dh_content_blocked");
    const session = await getSession(app, created.id, headers);
    expect(session.state).toBe("active");
  });

  test("DH-12 模拟降级 → degraded（音频/字幕兜底）", async () => {
    const headers = newTenantHeaders();
    const created = await createSession(app, {}, headers);
    await waitForState(app, created.id, "active", headers);
    const response = await sendMessage(app, created.id, "降级测试", { simulate: "degraded" }, headers);
    expect(response.statusCode).toBe(200);
    expect((response.body as { state: string }).state).toBe("degraded");
    const session = await getSession(app, created.id, headers);
    expect(session.state).toBe("degraded");
    expect(session.status).toBe("degraded");
  });

  test("DH-13 幂等：Idempotency-Key 同 body 复用，不同 body 409", async () => {
    const headers = newTenantHeaders();
    const key = crypto.randomUUID();
    const payload = { avatar_id: "av_l1_cartoon", voice_id: "vo_zh_female_warm", greeting: "您好" };
    const first = await app.inject({ method: "POST", url: "/api/v1/dh/sessions", headers: { ...headers, "idempotency-key": key }, payload });
    expect(first.statusCode).toBe(201);
    const firstId = (first.json() as { session_id: string }).session_id;
    const replay = await app.inject({ method: "POST", url: "/api/v1/dh/sessions", headers: { ...headers, "idempotency-key": key }, payload });
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as { session_id: string }).session_id).toBe(firstId);
    const conflict = await app.inject({
      method: "POST",
      url: "/api/v1/dh/sessions",
      headers: { ...headers, "idempotency-key": key },
      payload: { avatar_id: "av_l1_photo", voice_id: "vo_zh_female_warm" },
    });
    expect(conflict.statusCode).toBe(409);
  });

  test("DH-14 embed token：mock 生成 + ttl 上限校验", async () => {
    const headers = newTenantHeaders();
    const appId = "11111111-1111-4111-8111-111111111111";
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/dh/embed-tokens",
      headers,
      payload: { app_id: appId, origin: "https://example.com", ttl: 120 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { token: string; app_id: string; expires_in: number; origin: string };
    expect(body.token).toStartWith("dhemb_");
    expect(body.expires_in).toBe(120);
    expect(body.origin).toBe("https://example.com");
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/dh/embed-tokens",
      headers,
      payload: { app_id: appId, ttl: 900 },
    });
    expect(invalid.statusCode).toBe(400);
  });

  test("DH-15 render jobs：创建→mock 渲染成功→查询/列表/跨租户 404", async () => {
    const headers = newTenantHeaders();
    const appId = "11111111-1111-4111-8111-111111111111";
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/dh/render-jobs",
      headers,
      payload: { app_id: appId, script: "大家好，我是数字人。", output: { format: "mp4" } },
    });
    expect(created.statusCode).toBe(200);
    const job = created.json() as { id: string; app_id: string; status: string; created_at: string };
    expect(job.app_id).toBe(appId);
    expect(["queued", "running"]).toContain(job.status);
    const finished = await waitFor(
      async () => {
        const response = await app.inject({ method: "GET", url: `/api/v1/dh/render-jobs/${job.id}`, headers });
        const body = response.json() as { status: string; output_ref: string | null };
        return body.status === "succeeded" ? body : undefined;
      },
      { label: "render job succeeded" },
    );
    expect(finished.output_ref).toStartWith("mock://dh/render/");
    const list = await app.inject({ method: "GET", url: "/api/v1/dh/render-jobs", headers });
    const items = (list.json() as { items: Array<{ id: string }> }).items;
    expect(items.some((item) => item.id === job.id)).toBe(true);
    const crossTenant = await app.inject({ method: "GET", url: `/api/v1/dh/render-jobs/${job.id}`, headers: OTHER_TENANT_HEADERS });
    expect(crossTenant.statusCode).toBe(404);
  });

  test("DH-16 webhook 注册：secret 仅返回一次，列表只回显掩码", async () => {
    const headers = newTenantHeaders();
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/dh/webhooks",
      headers,
      payload: { url: "http://127.0.0.1:9/hooks", events: ["dh.session.ended"] },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as { webhook_id: string; secret: string; events: string[]; status: string };
    expect(body.secret).toStartWith("whsec_");
    expect(body.events).toEqual(["dh.session.ended"]);
    const list = await app.inject({ method: "GET", url: "/api/v1/dh/webhooks", headers });
    const items = (list.json() as { items: Array<{ webhook_id: string; secret_masked: string; secret?: string }> }).items;
    const found = items.find((item) => item.webhook_id === body.webhook_id);
    expect(found).toBeDefined();
    expect(found?.secret).toBeUndefined();
    expect(found?.secret_masked).toContain("****");
    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/dh/webhooks/${body.webhook_id}`, headers });
    expect(deleted.statusCode).toBe(204);
  });

  test("DH-17 healthz", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string; service: string; version: string; sessions: { total: number } };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("digital-human");
    expect(body.version).toBe("0.1.0-m3");
    expect(body.sessions.total).toBeGreaterThan(0);
  });

  test("DH-18 无租户头：回退默认开发租户（门面负责鉴权）", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/dh/avatars" });
    expect(response.statusCode).toBe(200);
  });
});
