// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Avatar, Voice } from "./types";

/**
 * L1 资产 seed：2 个 2D 形象 + 3 个音色（内存，演示级）。
 * 真实实现中资产来自 `dh_avatars`/`dh_voices` + OSS/CDN（见 docs/02-architecture/services/DIGITAL-HUMAN.md §8）。
 */
const NOW = "2026-11-08T00:00:00.000Z";

export const AVATARS: Avatar[] = [
  {
    id: "av_l1_cartoon",
    name: "小云（2D 卡通）",
    tier: "L1",
    kind: "2d_cartoon",
    status: "active",
    language: ["zh-CN", "en-US"],
    preview_url: "/assets/avatars/av_l1_cartoon/preview.png",
    manifest_url: "/assets/avatars/av_l1_cartoon/manifest.json",
    license_ref: "license:demo-cc-by-4.0",
    created_at: NOW,
  },
  {
    id: "av_l1_photo",
    name: "晓岚（2D 照片驱动）",
    tier: "L1",
    kind: "2d_photo",
    status: "active",
    language: ["zh-CN"],
    preview_url: "/assets/avatars/av_l1_photo/preview.png",
    manifest_url: "/assets/avatars/av_l1_photo/manifest.json",
    license_ref: "license:demo-internal-portrait-consent",
    created_at: NOW,
  },
];

export const VOICES: Voice[] = [
  {
    id: "vo_zh_female_warm",
    name: "晓云 · 温暖女声",
    provider: "mock-tts",
    language: "zh-CN",
    gender: "female",
    style: "warm",
    status: "active",
    created_at: NOW,
  },
  {
    id: "vo_zh_male_steady",
    name: "云舟 · 沉稳男声",
    provider: "mock-tts",
    language: "zh-CN",
    gender: "male",
    style: "steady",
    status: "active",
    created_at: NOW,
  },
  {
    id: "vo_en_female_bright",
    name: "Nova · Bright Female",
    provider: "mock-tts",
    language: "en-US",
    gender: "female",
    style: "bright",
    status: "active",
    created_at: NOW,
  },
];

const avatarById = new Map(AVATARS.map((item) => [item.id, item]));
const voiceById = new Map(VOICES.map((item) => [item.id, item]));

export const findAvatar = (id: string): Avatar | undefined => avatarById.get(id);
export const findVoice = (id: string): Voice | undefined => voiceById.get(id);
