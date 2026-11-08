// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface DhAvatar {
  id: string;
  name: string;
  style?: string;
  status?: "ready" | "processing" | "unavailable" | string;
  preview_color?: string;
  description?: string;
}

export interface DhVoice {
  id: string;
  name: string;
  gender?: string;
  language?: string;
  status?: "ready" | "processing" | "unavailable" | string;
  description?: string;
}

export type DhSessionStatus =
  | "creating"
  | "active"
  | "ended"
  | "error"
  | string;

export interface DhSession {
  id: string;
  status: DhSessionStatus;
  avatar_id?: string;
  voice_id?: string;
  mode?: "realtime" | "rtmp" | "offline" | string;
  started_at?: string;
  ended_at?: string | null;
  turns?: number;
  rtc?: {
    status: "connecting" | "connected" | "degraded" | "unavailable" | string;
    room?: string;
    note?: string;
  };
  end_reason?: string | null;
  app_id?: string;
}

export interface DhMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  created_at: string;
  latency_ms?: number;
  audio_ms?: number;
  pending?: boolean;
}

export const DH_STATUS_LABEL: Record<string, string> = {
  created: "已创建",
  connecting: "连接中",
  creating: "创建中",
  active: "会话中",
  degraded: "降级会话",
  ended: "已结束",
  error: "异常",
};

export const RTC_STATUS_LABEL: Record<string, string> = {
  connecting: "RTC 连接中（占位）",
  connected: "RTC 已连接（占位）",
  degraded: "RTC 降级：仅文本",
  unavailable: "RTC 不可用：仅文本",
};
