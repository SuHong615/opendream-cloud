// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/** Digital Human L1 服务共享类型（内存 store）。 */

export type SessionState = "created" | "connecting" | "active" | "degraded" | "ended" | "error";

/** openapi `DhSession.mode`。 */
export type SessionMode = "realtime" | "near_realtime" | "offline";

export type DhEventType = "state" | "message" | "ended" | "error";

export interface DhEvent {
  /** 会话内单调递增序号；同时作为 SSE event id（Last-Event-ID 依据）。 */
  seq: number;
  type: DhEventType;
  ts: number;
  data: Record<string, unknown>;
}

export interface DhUsage {
  turns: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  audio_ms: number;
}

export interface Avatar {
  id: string;
  name: string;
  tier: "L1";
  kind: string;
  status: "active" | "offline";
  language: string[];
  preview_url: string;
  manifest_url: string;
  license_ref: string;
  created_at: string;
}

export interface Voice {
  id: string;
  name: string;
  provider: string;
  language: string;
  gender: string;
  style: string;
  status: "active" | "unauthorized";
  created_at: string;
}

export interface SessionRecord {
  id: string;
  org_id: string;
  user_id: string;
  app_id: string;
  mode: SessionMode;
  avatar_id: string;
  voice_id: string;
  persona_ref: string | null;
  voice_ref: string | null;
  greeting: string | null;
  limits: Record<string, unknown>;
  state: SessionState;
  rtc_url: string;
  rtc_room: string;
  rtc_token: string;
  token_expires_at: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  ended_at: number | null;
  end_reason: string | null;
  error_reason: string | null;
  usage: DhUsage;
  events: DhEvent[];
  seq: number;
  last_active_at: number;
}

/** 可从 x-oc-* 头解析出的调用方上下文（门面/网关注入；本服务信任内网头）。 */
export interface Tenant {
  orgId: string;
  userId: string;
  roles: string[];
}

/** 对外会话视图：同时覆盖 openapi `DhSession` 与 task-39 MVP 字段。 */
export interface SessionView {
  id: string;
  session_id: string;
  org_id: string;
  user_id: string;
  app_id: string;
  mode: SessionMode;
  avatar_id: string;
  avatar_name: string;
  voice_id: string;
  voice_name: string;
  persona_ref: string | null;
  voice_ref: string | null;
  greeting: string | null;
  limits: Record<string, unknown>;
  state: SessionState;
  /** openapi `DhSession.status` 兼容别名（= state）。 */
  status: SessionState;
  rtc_url: string;
  rtc: { room: string; url: string; token: string; expires_at: string };
  token: string;
  expires_in: number;
  usage: DhUsage;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  ended_at: string | null;
  end_reason: string | null;
  error_reason: string | null;
}

export interface EmbedTokenRecord {
  tokenHash: string;
  appId: string;
  orgId: string;
  userId: string;
  origin: string | null;
  ttlSeconds: number;
  createdAt: number;
  expiresAt: number;
}

export type RenderJobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface RenderJobRecord {
  id: string;
  orgId: string;
  userId: string;
  appId: string;
  status: RenderJobStatus;
  script: string | null;
  output: Record<string, unknown>;
  outputRef: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
}

export interface RenderJobView {
  id: string;
  app_id: string;
  status: RenderJobStatus;
  output_ref: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}
