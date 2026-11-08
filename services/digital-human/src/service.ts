// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, randomBytes } from "node:crypto";
import { AVATARS, VOICES, findAvatar, findVoice } from "./assets";
import type { Env } from "./env";
import { conflict, forbidden, notFound, sessionUnavailable } from "./errors";
import type {
  Avatar,
  DhEvent,
  DhUsage,
  EmbedTokenRecord,
  RenderJobRecord,
  RenderJobView,
  SessionMode,
  SessionRecord,
  SessionState,
  SessionView,
  Tenant,
  Voice,
} from "./types";
import type { WebhookRegistry } from "./webhooks";

const TERMINAL_STATES: ReadonlySet<SessionState> = new Set<SessionState>(["ended", "error"]);

export const isTerminal = (state: SessionState): boolean => TERMINAL_STATES.has(state);

/** 无 app_id 的 MVP extension 创建会话时使用的占位应用（openapi `DhSession.app_id` 必填）。 */
export const DEMO_APP_ID = "00000000-0000-4000-8000-0000000000a1";

export type SimulateScenario = "degraded" | "tts_unavailable" | "rtc_unavailable" | "lipsync_failed" | "content_blocked";

const PIPELINE_SCENARIOS: ReadonlySet<string> = new Set(["tts_unavailable", "rtc_unavailable", "lipsync_failed"]);

/** 演示故障 → openapi 1.1.0 `dh_*` reason（不新增 reason）。 */
const PIPELINE_REASONS: Record<string, "dh_tts_unavailable" | "dh_rtc_unavailable" | "dh_lipsync_failed"> = {
  tts_unavailable: "dh_tts_unavailable",
  rtc_unavailable: "dh_rtc_unavailable",
  lipsync_failed: "dh_lipsync_failed",
};

export interface CreateSessionInput {
  /** canonical 字段（L1 为占位；MVP 不依赖 App Center）。 */
  app_id?: string;
  mode?: SessionMode;
  /** MVP extension 字段。 */
  avatar_id?: string;
  voice_id?: string;
  persona_ref?: string;
  voice_ref?: string;
  greeting?: string;
  limits?: Record<string, unknown>;
}

export interface SendMessageInput {
  text: string;
  /** 演示/测试钩子（MOCK_SCENARIOS_ENABLED=1 时生效）。 */
  simulate?: SimulateScenario;
}

export interface AssistantReply {
  message_id: string;
  session_id: string;
  role: "assistant";
  text: string;
  state: SessionState;
  latency_ms: number;
  usage: { input_tokens: number; output_tokens: number; total_tokens: number };
  session_usage: DhUsage;
  created_at: string;
}

export interface CreateSessionResult {
  view: SessionView;
  replayed: boolean;
}

export interface Subscription {
  replay: DhEvent[];
  unsubscribe: () => void;
  terminal: boolean;
}

export interface EmbedTokenInput {
  app_id: string;
  origin?: string;
  ttl?: number;
}

export interface EmbedTokenResult {
  token: string;
  app_id: string;
  expires_in: number;
  origin: string | null;
  expires_at: string;
}

export interface CreateRenderJobInput {
  app_id: string;
  script?: string;
  output?: Record<string, unknown>;
}

interface SessionTimers {
  connect: ReturnType<typeof setTimeout>[];
  ttl: ReturnType<typeof setTimeout> | null;
}

interface IdempotencyEntry {
  orgId: string;
  userId: string;
  bodyHash: string;
  sessionId: string;
}

const zeroUsage = (): DhUsage => ({ turns: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, audio_ms: 0 });

/** 粗略 token 估算（mock）：4 字符 ≈ 1 token。 */
export const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.trim().length / 4));

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

/**
 * 数字人 L1 会话服务（内存 store，演示级）：
 * 状态机 created→connecting→active→(degraded)→ended/error；LLM/TTS/RTC/渲染均为 mock。
 * 同时支持 openapi 1.1.0 canonical 路径与 task-39 MVP extension（见 README 契约映射）。
 */
export class DhService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly listeners = new Map<string, Set<(event: DhEvent) => void>>();
  private readonly timers = new Map<string, SessionTimers>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly embedTokens = new Map<string, EmbedTokenRecord>();
  private readonly renderJobs = new Map<string, RenderJobRecord>();
  private readonly renderTimers = new Map<string, ReturnType<typeof setTimeout>[]>();
  readonly startedAt = Date.now();

  constructor(
    private readonly env: Env,
    private readonly webhooks: WebhookRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listAvatars(): Avatar[] {
    return AVATARS.map((avatar) => ({ ...avatar }));
  }

  listVoices(): Voice[] {
    return VOICES.map((voice) => ({ ...voice }));
  }

  // ---------------- sessions

  createSession(tenant: Tenant, input: CreateSessionInput, idempotencyKey?: string): CreateSessionResult {
    const bodyHash = sha256(JSON.stringify(input));
    if (idempotencyKey) {
      const existing = this.idempotency.get(idempotencyKey);
      if (existing) {
        if (existing.orgId !== tenant.orgId || existing.userId !== tenant.userId) {
          throw conflict("idempotency key belongs to another principal", { idempotency_key: idempotencyKey });
        }
        if (existing.bodyHash !== bodyHash) {
          throw conflict("idempotency key reused with a different body", { idempotency_key: idempotencyKey });
        }
        const replay = this.sessions.get(existing.sessionId);
        if (replay && replay.org_id === tenant.orgId && replay.user_id === tenant.userId) {
          return { view: this.view(replay), replayed: true };
        }
      }
    }

    const avatar = this.resolveAvatar(input);
    const voice = this.resolveVoice(input);
    const existingLive = this.findLiveSession(tenant);
    if (existingLive) {
      throw conflict("an active session already exists for this user", { session_id: existingLive.id, state: existingLive.state }, "dh_session_active");
    }

    const nowMs = this.now().getTime();
    const id = crypto.randomUUID();
    const session: SessionRecord = {
      id,
      org_id: tenant.orgId,
      user_id: tenant.userId,
      app_id: input.app_id ?? DEMO_APP_ID,
      mode: input.mode ?? "realtime",
      avatar_id: avatar.id,
      voice_id: voice.id,
      persona_ref: input.persona_ref ?? avatar.id,
      voice_ref: input.voice_ref ?? voice.id,
      greeting: input.greeting ?? null,
      limits: input.limits ?? {},
      state: "created",
      rtc_room: `dh-${id}`,
      rtc_url: `ws://mock-rtc.local/rooms/${id}`,
      rtc_token: `dh_rtc_${randomBytes(24).toString("base64url")}`,
      token_expires_at: nowMs + this.env.RTC_TOKEN_TTL_SECONDS * 1000,
      created_at: nowMs,
      updated_at: nowMs,
      started_at: null,
      ended_at: null,
      end_reason: null,
      error_reason: null,
      usage: zeroUsage(),
      events: [],
      seq: 0,
      last_active_at: nowMs,
    };
    this.sessions.set(id, session);
    this.timers.set(id, { connect: [], ttl: null });
    this.emit(session, "state", { state: "created", avatar_id: avatar.id, voice_id: voice.id });
    this.webhooks.publish(tenant, {
      type: "dh.session.created",
      data: { session_id: id, avatar_id: avatar.id, voice_id: voice.id, state: "created", app_id: session.app_id },
    });

    this.schedule(id, () => this.transition(session, "connecting"), 0);
    this.schedule(id, () => this.transition(session, "active"), this.env.MOCK_CONNECT_MS);
    this.scheduleTtl(session);
    if (idempotencyKey) this.idempotency.set(idempotencyKey, { orgId: tenant.orgId, userId: tenant.userId, bodyHash, sessionId: id });
    return { view: this.view(session), replayed: false };
  }

  listSessions(tenant: Tenant): SessionView[] {
    return [...this.sessions.values()]
      .filter((session) => session.org_id === tenant.orgId && session.user_id === tenant.userId)
      .sort((a, b) => b.created_at - a.created_at)
      .map((session) => this.view(session));
  }

  getSession(tenant: Tenant, sessionId: string): SessionView {
    return this.view(this.requireSession(tenant, sessionId));
  }

  getSessionRecord(tenant: Tenant, sessionId: string): SessionRecord {
    return this.requireSession(tenant, sessionId);
  }

  async sendMessage(tenant: Tenant, sessionId: string, input: SendMessageInput): Promise<AssistantReply> {
    const session = this.requireSession(tenant, sessionId);
    const scenario = this.env.MOCK_SCENARIOS_ENABLED ? input.simulate : undefined;

    if (isTerminal(session.state)) {
      throw conflict(`session is ${session.state}`, {
        session_id: session.id,
        state: session.state,
        reason: session.error_reason ?? session.end_reason,
      });
    }
    if (scenario === "content_blocked") {
      throw forbidden("content blocked by safety policy", "dh_content_blocked", { session_id: session.id });
    }
    if (scenario && PIPELINE_SCENARIOS.has(scenario)) {
      const reason = PIPELINE_REASONS[scenario]!;
      this.transition(session, "error", { reason });
      throw sessionUnavailable("digital human pipeline unavailable", reason, { session_id: session.id, stage: scenario.split("_")[0] });
    }
    if (session.state === "created" || session.state === "connecting") this.promoteActive(session);

    const started = Date.now();
    await Bun.sleep(this.env.MOCK_LLM_LATENCY_MS);
    const latency = Date.now() - started;
    const replyText = this.composeReply(session, input.text);
    const inputTokens = estimateTokens(input.text);
    const outputTokens = estimateTokens(replyText);
    const nowMs = this.now().getTime();
    const messageId = crypto.randomUUID();

    session.usage.turns += 1;
    session.usage.input_tokens += inputTokens;
    session.usage.output_tokens += outputTokens;
    session.usage.total_tokens += inputTokens + outputTokens;
    session.usage.audio_ms += replyText.length * this.env.MOCK_AUDIO_MS_PER_CHAR;
    session.last_active_at = nowMs;
    session.updated_at = nowMs;

    const usage = { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens };
    this.emit(session, "message", {
      message_id: messageId,
      role: "assistant",
      text: replyText,
      latency_ms: latency,
      usage,
    });
    this.webhooks.publish(tenant, {
      type: "dh.message",
      data: { session_id: session.id, message_id: messageId, role: "assistant", text: replyText, latency_ms: latency, usage },
    });

    const overBudget = this.env.DEGRADED_LATENCY_MS > 0 && latency > this.env.DEGRADED_LATENCY_MS;
    if (scenario === "degraded" || overBudget) {
      this.transition(session, "degraded", { reason: scenario === "degraded" ? "simulated_degraded" : "latency_budget_exceeded" });
    }

    return {
      message_id: messageId,
      session_id: session.id,
      role: "assistant",
      text: replyText,
      state: session.state,
      latency_ms: latency,
      usage,
      session_usage: { ...session.usage },
      created_at: new Date(nowMs).toISOString(),
    };
  }

  endSession(tenant: Tenant, sessionId: string, reason = "user_ended"): SessionView {
    const session = this.requireSession(tenant, sessionId);
    if (isTerminal(session.state)) return this.view(session);
    this.transition(session, "ended", { reason });
    return this.view(session);
  }

  /**
   * SSE 订阅：先按 Last-Event-ID 回放事件，再订阅实时事件；terminal=true 表示回放后即可关闭。
   * 回放快照与监听注册在同一同步块内完成，避免事件缺口。
   */
  subscribe(tenant: Tenant, sessionId: string, lastEventId: number, listener: (event: DhEvent) => void): Subscription {
    const session = this.requireSession(tenant, sessionId);
    const replay = session.events
      .filter((event) => event.seq > Math.max(0, lastEventId))
      .map((event) => ({ ...event, data: { ...event.data } }));
    let set = this.listeners.get(session.id);
    if (!set) {
      set = new Set();
      this.listeners.set(session.id, set);
    }
    const setRef = set;
    setRef.add(listener);
    return {
      replay,
      terminal: isTerminal(session.state),
      unsubscribe: () => {
        setRef.delete(listener);
        if (setRef.size === 0) this.listeners.delete(session.id);
      },
    };
  }

  // ---------------- embed tokens（canonical，L1 mock）

  createEmbedToken(tenant: Tenant, input: EmbedTokenInput): EmbedTokenResult {
    const ttl = Math.min(input.ttl ?? 300, 600);
    const token = `dhemb_${randomBytes(24).toString("base64url")}`;
    const nowMs = this.now().getTime();
    const record: EmbedTokenRecord = {
      tokenHash: sha256(token),
      appId: input.app_id,
      orgId: tenant.orgId,
      userId: tenant.userId,
      origin: input.origin ?? null,
      ttlSeconds: ttl,
      createdAt: nowMs,
      expiresAt: nowMs + ttl * 1000,
    };
    this.embedTokens.set(record.tokenHash, record);
    void tenant;
    return { token, app_id: input.app_id, expires_in: ttl, origin: record.origin, expires_at: new Date(record.expiresAt).toISOString() };
  }

  embedTokenCount(): number {
    return this.embedTokens.size;
  }

  // ---------------- render jobs（canonical，L1 mock）

  createRenderJob(tenant: Tenant, input: CreateRenderJobInput): RenderJobView {
    const nowMs = this.now().getTime();
    const id = crypto.randomUUID();
    const record: RenderJobRecord = {
      id,
      orgId: tenant.orgId,
      userId: tenant.userId,
      appId: input.app_id,
      status: "queued",
      script: input.script ?? null,
      output: input.output ?? {},
      outputRef: null,
      error: null,
      createdAt: nowMs,
      updatedAt: nowMs,
      finishedAt: null,
    };
    this.renderJobs.set(id, record);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const running = setTimeout(() => {
      if (record.status !== "queued") return;
      record.status = "running";
      record.updatedAt = this.now().getTime();
    }, 0);
    running.unref?.();
    const done = setTimeout(() => {
      if (record.status === "canceled") return;
      record.status = "succeeded";
      record.outputRef = `mock://dh/render/${id}.mp4`;
      record.finishedAt = this.now().getTime();
      record.updatedAt = record.finishedAt;
    }, this.env.MOCK_RENDER_MS);
    done.unref?.();
    timers.push(running, done);
    this.renderTimers.set(id, timers);
    return this.renderJobView(record);
  }

  listRenderJobs(tenant: Tenant): RenderJobView[] {
    return [...this.renderJobs.values()]
      .filter((job) => job.orgId === tenant.orgId && job.userId === tenant.userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((job) => this.renderJobView(job));
  }

  getRenderJob(tenant: Tenant, jobId: string): RenderJobView {
    const job = this.renderJobs.get(jobId);
    if (!job || job.orgId !== tenant.orgId || job.userId !== tenant.userId) throw notFound("dh render job not found");
    return this.renderJobView(job);
  }

  counts(): { sessions: number; active: number; listeners: number; render_jobs: number; embed_tokens: number } {
    let active = 0;
    for (const session of this.sessions.values()) {
      if (session.state === "active" || session.state === "connecting" || session.state === "degraded") active += 1;
    }
    return {
      sessions: this.sessions.size,
      active,
      listeners: [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0),
      render_jobs: this.renderJobs.size,
      embed_tokens: this.embedTokens.size,
    };
  }

  dispose(): void {
    for (const id of this.timers.keys()) this.clearTimers(id);
    for (const timers of this.renderTimers.values()) for (const timer of timers) clearTimeout(timer);
    this.renderTimers.clear();
    this.listeners.clear();
    this.sessions.clear();
    this.idempotency.clear();
    this.embedTokens.clear();
    this.renderJobs.clear();
  }

  // ---------------- internals

  private resolveAvatar(input: CreateSessionInput): Avatar {
    if (input.avatar_id !== undefined) {
      const avatar = findAvatar(input.avatar_id);
      if (!avatar || avatar.status !== "active") {
        throw conflict("avatar is unavailable", { avatar_id: input.avatar_id }, "dh_avatar_unavailable");
      }
      return avatar;
    }
    if (input.persona_ref) {
      const avatar = findAvatar(input.persona_ref);
      if (avatar && avatar.status === "active") return avatar;
    }
    const fallback = AVATARS.find((avatar) => avatar.status === "active");
    if (!fallback) throw conflict("no avatar available", {}, "dh_avatar_unavailable");
    return fallback;
  }

  private resolveVoice(input: CreateSessionInput): Voice {
    if (input.voice_id !== undefined) {
      const voice = findVoice(input.voice_id);
      if (!voice || voice.status !== "active") {
        throw forbidden("voice is not authorized", "dh_voice_unauthorized", { voice_id: input.voice_id });
      }
      return voice;
    }
    if (input.voice_ref) {
      const voice = findVoice(input.voice_ref);
      if (voice && voice.status === "active") return voice;
    }
    const fallback = VOICES.find((voice) => voice.status === "active");
    if (!fallback) throw forbidden("no voice available", "dh_voice_unauthorized");
    return fallback;
  }

  private findLiveSession(tenant: Tenant): SessionRecord | undefined {
    for (const session of this.sessions.values()) {
      if (session.org_id === tenant.orgId && session.user_id === tenant.userId && !isTerminal(session.state)) return session;
    }
    return undefined;
  }

  private requireSession(tenant: Tenant, sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session || session.org_id !== tenant.orgId || session.user_id !== tenant.userId) {
      throw notFound("dh session not found");
    }
    return session;
  }

  private schedule(sessionId: string, fn: () => void, delayMs: number): void {
    const timers = this.timers.get(sessionId);
    if (!timers) return;
    const timer = setTimeout(fn, delayMs);
    timer.unref?.();
    timers.connect.push(timer);
  }

  private scheduleTtl(session: SessionRecord): void {
    const timers = this.timers.get(session.id);
    if (!timers) return;
    const timer = setTimeout(() => {
      if (!isTerminal(session.state)) this.transition(session, "ended", { reason: "ttl_expired" });
    }, this.env.SESSION_TTL_SECONDS * 1000);
    timer.unref?.();
    timers.ttl = timer;
  }

  private promoteActive(session: SessionRecord): void {
    const timers = this.timers.get(session.id);
    if (timers) {
      for (const timer of timers.connect) clearTimeout(timer);
      timers.connect = [];
    }
    this.transition(session, "active");
  }

  private clearTimers(sessionId: string): void {
    const timers = this.timers.get(sessionId);
    if (!timers) return;
    for (const timer of timers.connect) clearTimeout(timer);
    if (timers.ttl) clearTimeout(timers.ttl);
    this.timers.delete(sessionId);
  }

  private transition(session: SessionRecord, next: SessionState, extra: { reason?: string } = {}): void {
    if (isTerminal(session.state) || session.state === next) return;
    session.state = next;
    session.updated_at = this.now().getTime();
    if (next === "active" && session.started_at === null) session.started_at = session.updated_at;
    const tenant: Tenant = { orgId: session.org_id, userId: session.user_id, roles: [] };
    if (next === "ended") {
      session.ended_at = session.updated_at;
      session.end_reason = extra.reason ?? "user_ended";
      this.clearTimers(session.id);
      this.emit(session, "ended", { reason: session.end_reason, ended_at: new Date(session.ended_at).toISOString() });
      this.webhooks.publish(tenant, { type: "dh.session.ended", data: { session_id: session.id, reason: session.end_reason } });
      return;
    }
    if (next === "error") {
      session.error_reason = extra.reason ?? "internal_error";
      this.clearTimers(session.id);
      this.emit(session, "error", { reason: session.error_reason, retryable: true });
      this.webhooks.publish(tenant, { type: "dh.session.error", data: { session_id: session.id, reason: session.error_reason } });
      return;
    }
    this.emit(session, "state", { reason: extra.reason ?? null });
    this.webhooks.publish(tenant, {
      type: next === "connecting" ? "dh.session.connecting" : next === "active" ? "dh.session.active" : "dh.session.degraded",
      data: { session_id: session.id, state: next },
    });
  }

  private composeReply(session: SessionRecord, text: string): string {
    const avatar = findAvatar(session.avatar_id);
    const voice = findVoice(session.voice_id);
    const speaker = avatar?.name ?? "数字人";
    const voiceName = voice?.name ?? "默认音色";
    const trimmed = text.trim();
    if (/^(你好|您好|hello|hi|哈喽)[!！。.\s]*$/iu.test(trimmed)) {
      return `您好，我是${speaker}，很高兴为您服务。`;
    }
    if (session.usage.turns === 0 && session.greeting) {
      return `${session.greeting} 收到您的消息：「${trimmed.slice(0, 200)}」。`;
    }
    return `我收到了您的消息：「${trimmed.slice(0, 200)}」。我是${speaker}，正在用${voiceName}为您播报。`;
  }

  private emit(session: SessionRecord, type: DhEvent["type"], data: Record<string, unknown>): void {
    session.seq += 1;
    const event: DhEvent = {
      seq: session.seq,
      type,
      ts: this.now().getTime(),
      data: { session_id: session.id, state: session.state, ...data },
    };
    session.events.push(event);
    if (session.events.length > this.env.MAX_EVENTS_PER_SESSION) {
      session.events.splice(0, session.events.length - this.env.MAX_EVENTS_PER_SESSION);
    }
    const set = this.listeners.get(session.id);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch (error) {
        console.warn(`[digital-human] sse listener error on ${session.id}:`, error);
      }
    }
  }

  private view(session: SessionRecord): SessionView {
    const avatar = findAvatar(session.avatar_id);
    const voice = findVoice(session.voice_id);
    const nowMs = this.now().getTime();
    const expiresIn = Math.max(0, Math.ceil((session.token_expires_at - nowMs) / 1000));
    return {
      id: session.id,
      session_id: session.id,
      org_id: session.org_id,
      user_id: session.user_id,
      app_id: session.app_id,
      mode: session.mode,
      avatar_id: session.avatar_id,
      avatar_name: avatar?.name ?? session.avatar_id,
      voice_id: session.voice_id,
      voice_name: voice?.name ?? session.voice_id,
      persona_ref: session.persona_ref,
      voice_ref: session.voice_ref,
      greeting: session.greeting,
      limits: session.limits,
      state: session.state,
      status: session.state,
      rtc_url: session.rtc_url,
      rtc: {
        room: session.rtc_room,
        url: session.rtc_url,
        token: session.rtc_token,
        expires_at: new Date(session.token_expires_at).toISOString(),
      },
      token: session.rtc_token,
      expires_in: expiresIn,
      usage: { ...session.usage },
      created_at: new Date(session.created_at).toISOString(),
      started_at: session.started_at ? new Date(session.started_at).toISOString() : null,
      updated_at: new Date(session.updated_at).toISOString(),
      ended_at: session.ended_at ? new Date(session.ended_at).toISOString() : null,
      end_reason: session.end_reason,
      error_reason: session.error_reason,
    };
  }

  private renderJobView(job: RenderJobRecord): RenderJobView {
    return {
      id: job.id,
      app_id: job.appId,
      status: job.status,
      output_ref: job.outputRef,
      error: job.error,
      created_at: new Date(job.createdAt).toISOString(),
      finished_at: job.finishedAt ? new Date(job.finishedAt).toISOString() : null,
    };
  }
}
