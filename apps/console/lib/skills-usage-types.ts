// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface SkillVersionSummary {
  id: string;
  version: string;
  status: string;
  scan_status?: string;
  published_at?: string | null;
  review_state?: string;
  review_comment?: string | null;
  created_at?: string;
}

export interface SkillVersion extends SkillVersionSummary {
  skill_id?: string;
  manifest?: {
    name?: string;
    description?: string;
    content?: string;
    code?: string;
    files?: string[];
    source?: string;
    [key: string]: unknown;
  };
  files?: Array<{ path: string; size: number; sha256: string }>;
  permissions?: Record<string, string[]>;
}

export interface SkillUploadInput {
  slug: string;
  name: string;
  summary?: string;
  category?: string;
  visibility?: string;
  version?: string;
  content?: string;
  code?: string;
  files?: string[];
}

export interface SkillDebugResult {
  skill_id: string;
  version_id?: string | null;
  input: string;
  steps: Array<{ step: string; status: string; detail?: string }>;
  output: string;
  duration_ms?: number;
}


export interface Skill {
  id: string;
  org_id?: string;
  slug: string;
  name: string;
  summary?: string | null;
  category?: string | null;
  visibility?: string;
  status: string;
  latest_version?: SkillVersionSummary | null;
  permissions?: Record<string, string[]>;
  install_count?: number;
  avg_rating?: number | null;
  rating_count?: number;
  created_at?: string;
}

export interface SkillInstallation {
  id: string;
  skill_id: string;
  skill_slug: string;
  skill_name: string;
  version_id: string;
  version: string;
  workspace_id?: string | null;
  enabled?: boolean;
  auto_update?: boolean;
  installed_at?: string;
  last_synced_at?: string | null;
  last_error?: string | null;
  source?: string;
}

export interface UsageTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: { read: number; write: number };
}

export interface UsageResponse {
  from: string;
  to: string;
  group_by: string;
  currency: string;
  summary: {
    requests: number;
    tokens: UsageTokens;
    cost_usd: string;
  };
  items: Array<Record<string, unknown>>;
  next_cursor?: string | null;
}

export const SKILL_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  in_review: "审核中",
  published: "已发布",
  deprecated: "已弃用",
  blocked: "已封禁",
};
