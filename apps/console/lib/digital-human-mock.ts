// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type {
  DhAvatar,
  DhMessage,
  DhSession,
  DhVoice,
} from "@/lib/digital-human-types";

const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const mockDhAvatars: DhAvatar[] = [
  {
    id: "avatar-business",
    name: "小云 · 商务",
    style: "2D 半身",
    status: "ready",
    preview_color: "#2563eb",
    description: "适合企业接待、产品咨询",
  },
  {
    id: "avatar-support",
    name: "小悦 · 客服",
    style: "2D 半身",
    status: "ready",
    preview_color: "#15b79e",
    description: "亲和力强，适合工单与售后",
  },
  {
    id: "avatar-teacher",
    name: "小知 · 讲师",
    style: "3D 半身",
    status: "ready",
    preview_color: "#7a5af8",
    description: "适合培训、产品演示",
  },
];

export const mockDhVoices: DhVoice[] = [
  {
    id: "voice-female-warm",
    name: "晓雯 · 温和女声",
    gender: "女",
    language: "zh-CN",
    status: "ready",
    description: "默认客服音色",
  },
  {
    id: "voice-male-steady",
    name: "云舟 · 稳重男声",
    gender: "男",
    language: "zh-CN",
    status: "ready",
    description: "商务讲解",
  },
  {
    id: "voice-female-lively",
    name: "小满 · 活力女声",
    gender: "女",
    language: "zh-CN",
    status: "processing",
    description: "克隆音色（准备中）",
  },
];

export const mockDhSessions: DhSession[] = [
  {
    id: "dh-sess-20261108-01",
    status: "active",
    avatar_id: "avatar-business",
    voice_id: "voice-female-warm",
    mode: "realtime",
    started_at: iso(6),
    turns: 4,
    rtc: { status: "degraded", room: "dh-xingyun-demo-01", note: "本地环境 RTC 占位，仅文本" },
  },
  {
    id: "dh-sess-20261107-02",
    status: "ended",
    avatar_id: "avatar-support",
    voice_id: "voice-male-steady",
    mode: "realtime",
    started_at: iso(60 * 24),
    ended_at: iso(60 * 23.5),
    turns: 12,
    rtc: { status: "unavailable", note: "RTC 不可用，文本降级" },
    end_reason: "user_left",
  },
];

export const mockDhMessages: Record<string, DhMessage[]> = {
  "dh-sess-20261108-01": [
    {
      id: "dh-msg-1",
      role: "assistant",
      text: "你好，我是小云。很高兴为你服务，想了解产品功能还是售后问题？",
      created_at: iso(6),
      latency_ms: 820,
    },
    {
      id: "dh-msg-2",
      role: "user",
      text: "帮我介绍一下发票助手的导出功能。",
      created_at: iso(5),
    },
    {
      id: "dh-msg-3",
      role: "assistant",
      text: "发票助手支持导出 CSV，中文表头在 Excel 中不会乱码；空数据时会提示而不生成文件。",
      created_at: iso(5),
      latency_ms: 1100,
    },
  ],
  "dh-sess-20261107-02": [
    {
      id: "dh-msg-4",
      role: "assistant",
      text: "您好，工单已受理，请描述具体问题。",
      created_at: iso(60 * 24),
    },
    {
      id: "dh-msg-5",
      role: "user",
      text: "导出按钮没有反应。",
      created_at: iso(60 * 23.8),
    },
  ],
};

export const MOCK_DH_REPLIES = [
  "收到。我可以在当前会话里继续帮你定位；如果需要转人工，我会创建一张人工任务。",
  "这个能力由工作流里的 MCP 工具完成。我可以先给你一个操作步骤，也可以直接帮你发起。",
  "已记录你的问题。当前是文本降级模式，语音播报会在 RTC 就绪后启用。",
];
