// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export type WorkflowStatus =
  | "draft"
  | "published"
  | "deprecated"
  | "pending"
  | "running"
  | "waiting_human"
  | "succeeded"
  | "failed"
  | "canceled"
  | "compensating";

export interface WorkflowDefinition {
  id: string;
  slug?: string;
  name: string;
  display_name?: string;
  description?: string | null;
  category?: string;
  is_template?: boolean;
  status: "draft" | "published" | "deprecated" | string;
  latest_version?: string | null;
  latest_version_id?: string | null;
  node_count?: number;
  visibility?: string;
  updated_at?: string;
  created_at?: string;
}

export interface WorkflowStep {
  id?: string;
  node_id: string;
  node_type: string;
  name?: string;
  status: "pending" | "running" | "succeeded" | "failed" | "skipped" | "waiting_human" | string;
  attempt?: number;
  started_at?: string | null;
  ended_at?: string | null;
  duration_ms?: number | null;
  error_reason?: string | null;
  output?: string | null;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  version?: string;
  status: WorkflowStatus | string;
  trigger_type?: string;
  inputs?: Record<string, string>;
  outputs?: string | null;
  started_at?: string;
  ended_at?: string | null;
  steps?: WorkflowStep[];
  artifacts?: WorkflowArtifact[];
  error_reason?: string | null;
}

export interface WorkflowArtifact {
  id: string;
  run_id?: string;
  step_id?: string;
  kind: string;
  uri: string;
  checksum?: string;
  size?: number;
  created_at?: string;
}

export interface HumanTask {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "expired" | string;
  source?: string;
  workflow_name?: string;
  run_id?: string;
  subject_id?: string;
  form?: Record<string, unknown> | null;
  assignee_type?: string;
  assignee_name?: string;
  sla_due_at?: string;
  created_at?: string;
  comment?: string;
  decision?: string;
}

export interface WorkflowTemplate {
  id: string;
  category: string;
  name: string;
  display_name: string;
  description?: string | null;
  dsl?: unknown;
}

export const WORKFLOW_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  deprecated: "已弃用",
  pending: "等待中",
  running: "运行中",
  waiting_human: "等待人工",
  succeeded: "成功",
  failed: "失败",
  canceled: "已取消",
  compensating: "补偿中",
};

export const WORKFLOW_STATUS_TONE: Record<
  string,
  "ok" | "info" | "warn" | "err" | "muted"
> = {
  draft: "muted",
  published: "ok",
  deprecated: "muted",
  pending: "info",
  running: "info",
  waiting_human: "warn",
  succeeded: "ok",
  failed: "err",
  canceled: "muted",
  compensating: "warn",
};
