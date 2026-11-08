// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyRequest } from "fastify";
import type { Env } from "./env";

export interface Principal {
  org_id: string;
  org_slug: string;
  user_id: string;
  roles: string[];
  teams: string[];
}

export function principalOf(request: FastifyRequest, env: Env): Principal {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    org_id: header("x-oc-org-id") ?? env.DEFAULT_ORG_ID,
    org_slug: header("x-oc-org-slug") ?? env.DEFAULT_ORG_SLUG,
    user_id: header("x-oc-user-id") ?? env.DEFAULT_USER_ID,
    roles: (header("x-oc-roles") ?? "owner,admin,member").split(",").map((role) => role.trim()),
    teams: (header("x-oc-teams") ?? "").split(",").map((team) => team.trim()).filter(Boolean),
  };
}

export type AppState = "draft" | "ready" | "failed" | "stopped" | "deleted";
export type BuildStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";
export type DeploymentStatus = "pending" | "deploying" | "running" | "sleeping" | "failed" | "stopped";
export type DomainStatus = "pending_verification" | "issuing" | "active" | "failed";
export type ShareScope = "public" | "org" | "team" | "users";
export type ShareRole = "view" | "use" | "edit";
export type AppMemberRole = "owner" | "admin" | "editor" | "operator" | "viewer";
export type AppAction = "view" | "use" | "edit" | "share" | "deploy" | "rollback" | "delete";

export interface AppMemberRecord {
  id: string;
  app_id: string;
  org_id: string;
  subject_type: "user" | "team";
  subject_id: string;
  role: AppMemberRole;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CollabSessionRecord {
  id: string;
  app_id: string;
  org_id: string;
  base_version: number;
  last_seq: number;
  created_at: string;
  updated_at: string;
}

export interface CollabMessageRecord {
  id: string;
  app_id: string;
  org_id: string;
  session_id: string;
  user_id: string;
  client_msg_id: string;
  type: "chat" | "system" | "proposal_ref";
  content: string;
  proposal_id: string | null;
  seq: number;
  created_at: string;
}

export interface ProposalFile {
  path: string;
  status: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
  unified_diff: string;
}

export interface ProposalRecord {
  id: string;
  app_id: string;
  org_id: string;
  status: "open" | "approved" | "rejected";
  base_version: number;
  summary: string;
  hash: string;
  files: ProposalFile[];
  /** AI worker 生成来源与可复现信息 */
  source_message_id: string | null;
  content_hash: string;
  test_suggestion: string | null;
  generated_by: "ai-worker" | "user";
  author_id: string;
  version_id: string | null;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

export interface CollabJobRecord {
  id: string;
  app_id: string;
  org_id: string;
  message_id: string;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppVersionRecord {
  id: string;
  app_id: string;
  org_id: string;
  version: number;
  content_hash: string;
  status: "draft" | "published" | "rolled_back";
  deployment_id: string | null;
  summary: string;
  files: ProposalFile[];
  created_by: string;
  created_at: string;
}

export interface AppRecord {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  state: AppState;
  template: "node" | "python" | "static" | "custom";
  entry: string;
  context_subdir: string;
  visibility: "private" | "org" | "public";
  host: string;
  custom_domain: string | null;
  current_build_id: string | null;
  current_deployment_id: string | null;
  /** 协同/版本基线（乐观锁） */
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface BuildRecord {
  id: string;
  app_id: string;
  org_id: string;
  build_no: number;
  status: BuildStatus;
  image_digest: string | null;
  sbom_key: string | null;
  log_ref: string | null;
  scan_report: { passed: boolean; critical: number } | null;
  failure_reason: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface DeploymentRecord {
  id: string;
  app_id: string;
  org_id: string;
  build_id: string;
  status: DeploymentStatus;
  replicas: number;
  resources: { requests: { cpu: string; memory: string }; limits: { cpu: string; memory: string } };
  host: string;
  url: string;
  created_by: string;
  created_at: string;
  finished_at: string | null;
}

export interface ShareRecord {
  id: string;
  app_id: string;
  org_id: string;
  scope: ShareScope;
  subject_type: "user" | "team" | "org" | null;
  subject_id: string | null;
  role: ShareRole;
  expires_at: string | null;
  created_by: string;
  created_at: string;
}

export interface DomainRecord {
  id: string;
  app_id: string;
  org_id: string;
  hostname: string;
  status: DomainStatus;
  verify_token: string;
  cert_ref: string | null;
  verified_at: string | null;
  created_at: string;
}

export interface AccessRequestRecord {
  id: string;
  app_id: string;
  org_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface TicketRecord {
  jti: string;
  app_id: string;
  user_id: string;
  role: ShareRole;
  expires_at: string;
  used: boolean;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
