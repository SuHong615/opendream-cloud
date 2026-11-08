// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Skill, SkillInstallation } from "@/lib/skills-usage-types";

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const mockSkills: Skill[] = [
  {
    id: "skill-coding",
    slug: "coding-standards",
    name: "代码规范检查",
    summary: "按团队规范检查命名、错误处理与测试覆盖，输出可执行修复建议",
    category: "engineering",
    visibility: "org",
    status: "published",
    latest_version: { id: "skv-1", version: "1.4.0", status: "published" },
    install_count: 12,
    avg_rating: 4.6,
    rating_count: 8,
    created_at: iso(30),
  },
  {
    id: "skill-invoice",
    slug: "invoice-extract",
    name: "发票抽取",
    summary: "从发票 OCR 文本抽取金额、税号、日期与明细，输出严格 JSON",
    category: "finance",
    visibility: "public",
    status: "published",
    latest_version: { id: "skv-2", version: "2.0.1", status: "published" },
    install_count: 31,
    avg_rating: 4.8,
    rating_count: 20,
    created_at: iso(24),
  },
  {
    id: "skill-support",
    slug: "support-triage",
    name: "客服分诊",
    summary: "判断客户问题类别与优先级，给出答复建议并决定是否转人工",
    category: "support",
    visibility: "public",
    status: "in_review",
    latest_version: { id: "skv-3", version: "0.9.0", status: "in_review" },
    install_count: 3,
    avg_rating: null,
    rating_count: 0,
    created_at: iso(10),
  },
];

export const mockSkillInstallations: SkillInstallation[] = [
  {
    id: "inst-1",
    skill_id: "skill-coding",
    skill_slug: "coding-standards",
    skill_name: "代码规范检查",
    version_id: "skv-1",
    version: "1.4.0",
    workspace_id: null,
    enabled: true,
    auto_update: false,
    installed_at: iso(3),
    source: "user",
  },
];
