// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export type AppRole = "owner" | "admin" | "editor" | "operator" | "viewer";
export type AppAction =
  | "view"
  | "use"
  | "edit"
  | "share"
  | "deploy"
  | "rollback"
  | "delete";

export type AppState =
  | "building"
  | "deploying"
  | "running"
  | "sleeping"
  | "failed"
  | "stopped"
  | string;

export interface AppSummary {
  id: string;
  org_id?: string;
  name: string;
  slug: string;
  state: AppState;
  host: string;
  url?: string | null;
  description?: string | null;
  visibility?: "private" | "org" | "public" | string;
  template?: string | null;
  my_role?: AppRole;
  updated_at?: string;
  created_at?: string;
  resources?: { cpu?: string; memory?: string };
  source_workspace_id?: string | null;
  current_version?: string | null;
}

export interface AppMember {
  id: string;
  app_id?: string;
  subject_type: "user" | "team";
  subject_id: string;
  name?: string;
  email?: string | null;
  role: AppRole;
  created_at?: string;
}

export interface AppShare {
  id: string;
  app_id?: string;
  /** v1 contract: public | org | team | users */
  scope: "public" | "org" | "team" | "users";
  subject_type?: "user" | "team" | null;
  subject_id?: string | null;
  subject_name?: string | null;
  role: "view" | "use" | "edit";
  expires_at?: string | null;
  share_url?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface AppVersion {
  id: string;
  app_id?: string;
  org_id?: string;
  version: string;
  status?: "active" | "superseded" | "rolled_back" | string;
  hash?: string | null;
  summary?: string | null;
  files?: string[];
  rolled_back_to?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  build_state?: string | null;
  is_current?: boolean;
}

export interface CollabSession {
  session_id: string;
  app_id?: string;
  base_version: string;
  status?: "idle" | "active" | "closed" | string;
  updated_at?: string;
  participants?: number;
  members?: {
    user_id: string;
    role: AppRole;
    last_seen_at?: string;
  }[];
  last_seq?: number;
}

export interface CollabMessage {
  id: string;
  role: "user" | "assistant" | "system";
  sender_name?: string;
  content: string;
  created_at: string;
  proposal_id?: string | null;
}

export interface PatchFile {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  unified_diff: string;
}

export interface CollabProposal {
  id: string;
  app_id?: string;
  session_id?: string;
  base_version: string;
  /** v1 contract uses `open` for pending approval. */
  status: "open" | "pending" | "approved" | "rejected" | "conflict";
  summary: string;
  files: PatchFile[];
  test_suggestions?: string[];
  created_by?: string;
  created_by_name?: string;
  created_at: string;
}

export interface AppAuditEvent {
  id: string;
  action: string;
  actor_name?: string;
  resource_name?: string;
  outcome?: "success" | "denied" | "error";
  created_at: string;
}

export const APP_ROLE_ACTIONS: Record<AppRole, AppAction[]> = {
  owner: ["view", "use", "edit", "share", "deploy", "rollback", "delete"],
  admin: ["view", "use", "edit", "share", "deploy", "rollback"],
  editor: ["view", "use", "edit"],
  operator: ["view", "use", "deploy", "rollback"],
  viewer: ["view"],
};

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: "所有者",
  admin: "管理员",
  editor: "编辑者",
  operator: "运维者",
  viewer: "查看者",
};

export const ROLE_DESC: Record<AppRole, string> = {
  owner: "全部权限（含删除）",
  admin: "除删除外的全部权限",
  editor: "可编辑应用内容与协同修改",
  operator: "可使用、发布与回滚",
  viewer: "只读",
};

export function can(
  role: AppRole | undefined,
  action: AppAction,
): boolean {
  if (!role) return false;
  return APP_ROLE_ACTIONS[role]?.includes(action) ?? false;
}

export const APP_STATE_LABEL: Record<string, string> = {
  building: "构建中",
  deploying: "部署中",
  running: "运行中",
  sleeping: "已休眠",
  failed: "失败",
  stopped: "已停止",
};
