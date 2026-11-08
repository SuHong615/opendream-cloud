// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface McpServer {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  transport?: string;
  url?: string;
  status?: string;
  latest_version?: string | null;
  channel?: string | null;
  tools_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface McpVersion {
  id: string;
  version: string;
  status: "draft" | "pending_review" | "published" | "yanked" | "rejected" | string;
  changelog?: string | null;
  tools_count?: number;
  created_by?: string;
  reviewed_by?: string | null;
  created_at?: string;
  published_at?: string | null;
  yanked_at?: string | null;
}

export interface McpChannel {
  channel: "stable" | "canary" | string;
  version_id: string;
  version?: string;
  effective_at?: string;
}

export interface McpTool {
  name: string;
  description?: string | null;
  risk?: "low" | "medium" | "high" | string;
  read_only?: boolean;
  destructive?: boolean;
  input_schema_hash?: string;
}

export const MCP_VERSION_STATUS: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  yanked: "已撤回",
  rejected: "已拒绝",
};

export const MCP_RISK_LABEL: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};
