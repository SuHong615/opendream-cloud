// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { InstallationRecord, SkillRecord, VersionRecord } from "./types";

export function skillView(skill: SkillRecord, latest: VersionRecord | undefined, installs: number): Record<string, unknown> {
  return {
    id: skill.id,
    org_id: skill.org_id,
    slug: skill.slug,
    name: skill.name,
    summary: skill.summary,
    category: skill.category,
    visibility: skill.visibility,
    status: skill.status,
    latest_version: latest ? versionSummary(latest) : null,
    permissions: skill.permissions,
    install_count: installs,
    avg_rating: skill.avg_rating,
    rating_count: skill.rating_count,
    created_at: skill.created_at,
  };
}

export function versionSummary(version: VersionRecord): Record<string, unknown> {
  return {
    id: version.id,
    version: version.version,
    status: version.status,
    scan_status: version.scan_status,
    published_at: version.published_at,
  };
}

export function versionView(version: VersionRecord): Record<string, unknown> {
  return {
    ...versionSummary(version),
    skill_id: version.skill_id,
    manifest: version.manifest,
    permissions: version.permissions,
    entry: "SKILL.md",
    content_hash: version.archive_sha256,
    files: version.files,
    created_at: version.created_at,
  };
}

export function installationView(installation: InstallationRecord, skill: SkillRecord, version: VersionRecord): Record<string, unknown> {
  return {
    id: installation.id,
    skill_id: skill.id,
    skill_slug: skill.slug,
    skill_name: skill.name,
    version_id: version.id,
    version: version.version,
    workspace_id: installation.workspace_id,
    enabled: installation.enabled,
    auto_update: installation.auto_update,
    installed_at: installation.installed_at,
    last_synced_at: installation.last_synced_at,
    last_error: installation.last_error,
    source: installation.source,
  };
}
