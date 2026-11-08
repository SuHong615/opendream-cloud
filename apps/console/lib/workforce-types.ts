// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export type AgentRole = "lead" | "specialist" | "reviewer" | "operator";
export type AgentMemoryScope = "private" | "team" | "org";
export type AgentAutonomy = "suggest" | "execute_with_approval" | "autonomous";
export type AgentRunStatus =
  | "running"
  | "waiting_human"
  | "completed"
  | "canceled"
  | "failed";

export interface AgentEmployee {
  id: string;
  org_id?: string;
  name: string;
  role: AgentRole | string;
  title: string;
  mission: string;
  skills: string[];
  mcp_servers: string[];
  memory_scope: AgentMemoryScope | string;
  autonomy: AgentAutonomy | string;
  status: "active" | "paused" | string;
  avatar_color?: string;
  created_at?: string;
}

export interface AgentSquad {
  id: string;
  org_id?: string;
  name: string;
  mission: string;
  orchestration: "sequential" | "parallel" | "router" | "debate" | string;
  lead_id: string;
  member_ids: string[];
  app_ids: string[];
  human_gates: string[];
  sla_minutes: number;
  status: "active" | "paused" | string;
  created_at?: string;
  lead?: AgentEmployee | null;
  members?: AgentEmployee[];
}

export interface AgentGuardrails {
  allowed_tools: string[];
  forbidden_actions: string[];
  max_autonomy: AgentAutonomy | string;
  require_approval_for: string[];
}

export interface AgentEmployeeVersion {
  id: string;
  employee_id: string;
  version: string;
  snapshot: AgentEmployee;
  created_at: string;
}

export interface AgentSchedule {
  id: string;
  org_id?: string;
  name: string;
  squad_id: string;
  goal: string;
  interval_minutes: number;
  enabled: boolean;
  next_run_at?: string;
  last_run_at?: string | null;
  last_run_id?: string | null;
  created_at?: string;
}

export interface AgentTask {
  id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  status: "queued" | "running" | "completed" | "blocked" | "skipped" | string;
  output?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface AgentMessage {
  id: string;
  employee_id: string;
  employee_name: string;
  role: "lead" | "member" | "system" | "human" | string;
  content: string;
  created_at: string;
}

export interface AgentArtifact {
  name: string;
  kind: string;
  content: string;
}

export interface AgentApproval {
  gate: string;
  requested_at: string;
  decided_at?: string | null;
  decision?: "approved" | "rejected" | null;
}

export interface AgentRun {
  id: string;
  org_id?: string;
  squad_id: string;
  squad_name: string;
  goal: string;
  app_id?: string | null;
  status: AgentRunStatus | string;
  tasks: AgentTask[];
  messages: AgentMessage[];
  artifacts: AgentArtifact[];
  approvals: AgentApproval[];
  usage?: { tokens: number; cost_usd: number };
  created_at: string;
  completed_at?: string | null;
}

export const AGENT_ROLE_LABEL: Record<string, string> = {
  lead: "负责人",
  specialist: "专家",
  reviewer: "评审",
  operator: "运营",
};

export const AUTONOMY_LABEL: Record<string, string> = {
  suggest: "仅建议",
  execute_with_approval: "执行需审批",
  autonomous: "自主执行",
};

export const MEMORY_SCOPE_LABEL: Record<string, string> = {
  private: "私有",
  team: "团队",
  org: "组织",
};

export const ORCHESTRATION_LABEL: Record<string, string> = {
  sequential: "顺序编排",
  parallel: "并行",
  router: "路由",
  debate: "辩论",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  running: "运行中",
  waiting_human: "等待人工",
  completed: "已完成",
  canceled: "已取消",
  failed: "失败",
};

export const TASK_STATUS_LABEL: Record<string, string> = {
  queued: "排队",
  running: "进行中",
  completed: "已完成",
  blocked: "阻塞",
  skipped: "跳过",
};
