// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export interface EvalDataset {
  id: string;
  name: string;
  description?: string | null;
  cases_count?: number;
  version?: string;
  updated_at?: string;
}

export interface EvalEvaluator {
  id: string;
  name: string;
  display_name?: string;
  kind?: string;
  metric?: string;
  is_preset?: boolean;
  version?: string;
  status?: string;
  description?: string | null;
  updated_at?: string;
}

export interface EvalRun {
  id: string;
  name?: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled" | "timeout" | string;
  dataset_id?: string;
  dataset_name?: string;
  evaluator_name?: string;
  pass_rate?: number | null;
  cost_usd?: string | null;
  started_at?: string;
  finished_at?: string | null;
  cases?: number;
  failures?: number | null;
}

export interface MemoryItem {
  id: string;
  text: string;
  scope?: string;
  user_id?: string;
  created_at?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface ExperienceItem {
  id: string;
  title: string;
  content: string;
  tags?: string[];
  source?: string;
  created_at?: string;
}

export interface ObsService {
  name: string;
  status: "ok" | "degraded" | "down" | string;
  latency_ms?: number;
}

export interface ObsOverview {
  workspaces?: number;
  tokens?: number;
  cost_usd?: string;
  error_rate?: number;
  mcp_servers?: number;
  eval_runs?: number;
  services?: ObsService[];
  updated_at?: string;
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface OrgQuota {
  workspaces: number;
  members: number;
  budget_usd: number;
  mcp_servers: number;
  workspaces_used?: number;
  members_used?: number;
  budget_used_usd?: number;
  mcp_servers_used?: number;
}

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  created_at?: string;
}

export interface OrgMember {
  id: string;
  member_id?: string;
  user_id?: string;
  display_name?: string;
  email?: string;
  role: "owner" | "admin" | "member" | "viewer" | string;
  status?: string;
  created_at?: string;
}
