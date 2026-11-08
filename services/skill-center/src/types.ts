// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export type Visibility = "private" | "org" | "public";
export type SkillStatus = "draft" | "in_review" | "published" | "deprecated" | "blocked";
export type VersionStatus = "draft" | "published" | "yanked";
export type VersionScanStatus = "pending" | "passed" | "failed";
export type ReviewState = "none" | "pending_review" | "approved" | "rejected";

export interface SkillPermissionSet {
  tools: string[];
  mcp: string[];
  network: string[];
  fs: string[];
  secrets: string[];
}

export interface SkillFile {
  path: string;
  size: number;
  sha256: string;
}

export interface SkillRecord {
  id: string;
  org_id: string;
  org_slug: string;
  slug: string;
  name: string;
  summary: string | null;
  category: string | null;
  visibility: Visibility;
  status: SkillStatus;
  permissions: SkillPermissionSet;
  owner_user_id: string;
  latest_version_id: string | null;
  install_count: number;
  avg_rating: number | null;
  rating_count: number;
  created_at: string;
  updated_at: string;
  deleted: boolean;
}

export interface VersionRecord {
  id: string;
  skill_id: string;
  org_id: string;
  version: string;
  status: VersionStatus;
  scan_status: VersionScanStatus;
  review_state: ReviewState;
  review_comment: string | null;
  manifest: Record<string, unknown>;
  permissions: SkillPermissionSet;
  files: SkillFile[];
  archive_sha256: string;
  signature: string;
  eval_run_id: string | null;
  distribution_ready: boolean;
  published_at: string | null;
  created_at: string;
}

export interface InstallationRecord {
  id: string;
  org_id: string;
  user_id: string;
  workspace_id: string | null;
  skill_id: string;
  version_id: string;
  enabled: boolean;
  auto_update: boolean;
  installed_at: string;
  last_synced_at: string | null;
  last_error: string | null;
  source: "user" | "admin" | "org_default";
}

export interface SourceTokenRecord {
  token: string;
  installation_id: string;
  org_id: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export const EMPTY_PERMISSIONS: SkillPermissionSet = {
  tools: [],
  mcp: [],
  network: [],
  fs: [],
  secrets: [],
};
