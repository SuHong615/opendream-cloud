// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { randomUUID } from "node:crypto";
import type {
  InstallationRecord,
  SkillPermissionSet,
  SkillRecord,
  SourceTokenRecord,
  VersionRecord,
} from "./types";
import { EMPTY_PERMISSIONS } from "./types";

/** MVP 内存存储；接 PG/SQLite 时保持方法签名不变（repository 接口）。 */
export class Store {
  readonly skills = new Map<string, SkillRecord>();
  readonly versions = new Map<string, VersionRecord>();
  readonly installations = new Map<string, InstallationRecord>();
  readonly sourceTokens = new Map<string, SourceTokenRecord>();

  constructor(options: { seed?: boolean } = {}) {
    if (options.seed !== false) this.seed();
  }

  /** 系统预置技能（org_id=system + public），保证 Skill 中心开箱可用。 */
  private seed(): void {
    const now = "2026-11-08T00:00:00.000Z";
    const presets = [
      { slug: "code-review", name: "代码审查", summary: "按团队规范审查 diff，输出阻塞问题、建议与风险等级。", category: "sdlc" },
      { slug: "test-runner", name: "测试执行", summary: "运行单测/E2E，汇总失败用例与最小复现步骤。", category: "sdlc" },
      { slug: "invoice-parse", name: "发票解析", summary: "从发票文本/PDF 抽取号码、金额、税额与供应商。", category: "finance" },
      { slug: "customer-triage", name: "客服分诊", summary: "对客户问题分类、定级并生成回复草稿。", category: "support" },
    ];
    for (const preset of presets) {
      const skillId = `skill_system_${preset.slug}`;
      const versionId = `skillver_system_${preset.slug}_1`;
      const permissions = defaultPermissions();
      const skill: SkillRecord = {
        id: skillId,
        org_id: "system",
        org_slug: "system",
        slug: preset.slug,
        name: preset.name,
        summary: preset.summary,
        category: preset.category,
        visibility: "public",
        status: "published",
        permissions,
        owner_user_id: "system",
        latest_version_id: versionId,
        install_count: 0,
        avg_rating: 4.8,
        rating_count: 12,
        created_at: now,
        updated_at: now,
        deleted: false,
      };
      const version: VersionRecord = {
        id: versionId,
        skill_id: skillId,
        org_id: "system",
        version: "1.0.0",
        status: "published",
        scan_status: "passed",
        review_state: "approved",
        review_comment: null,
        manifest: { name: preset.name, description: preset.summary },
        permissions,
        files: [{ path: "SKILL.md", size: 256, sha256: `sha256:${preset.slug}` }],
        archive_sha256: `sha256:archive-${preset.slug}`,
        signature: `sig-${preset.slug}`,
        eval_run_id: "eval_system_pass",
        distribution_ready: true,
        published_at: now,
        created_at: now,
      };
      this.skills.set(skill.id, skill);
      this.versions.set(version.id, version);
    }
  }

  newId(): string {
    return randomUUID();
  }

  findSkillBySlug(orgId: string, slug: string): SkillRecord | undefined {
    for (const skill of this.skills.values()) {
      if (skill.org_id === orgId && skill.slug === slug && !skill.deleted) return skill;
    }
    return undefined;
  }

  findSkillByOrgSlug(orgSlug: string, slug: string): SkillRecord | undefined {
    for (const skill of this.skills.values()) {
      if (skill.org_slug === orgSlug && skill.slug === slug && !skill.deleted) return skill;
    }
    return undefined;
  }

  versionsOf(skillId: string): VersionRecord[] {
    return [...this.versions.values()]
      .filter((version) => version.skill_id === skillId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  latestVersion(skill: SkillRecord): VersionRecord | undefined {
    if (skill.latest_version_id) return this.versions.get(skill.latest_version_id);
    return this.versionsOf(skill.id).at(-1);
  }

  versionBySkillAndSemver(skillId: string, version: string): VersionRecord | undefined {
    for (const record of this.versions.values()) {
      if (record.skill_id === skillId && record.version === version) return record;
    }
    return undefined;
  }

  installationsOf(orgId: string, query: { workspaceId?: string; skillId?: string }): InstallationRecord[] {
    return [...this.installations.values()]
      .filter((installation) => installation.org_id === orgId)
      .filter((installation) => (query.workspaceId ? installation.workspace_id === query.workspaceId : true))
      .filter((installation) => (query.skillId ? installation.skill_id === query.skillId : true))
      .sort((a, b) => a.installed_at.localeCompare(b.installed_at));
  }

  installCount(skillId: string): number {
    let count = 0;
    for (const installation of this.installations.values()) {
      if (installation.skill_id === skillId && installation.enabled) count += 1;
    }
    return count;
  }

  tokenByValue(token: string): SourceTokenRecord | undefined {
    const record = this.sourceTokens.get(token);
    if (!record) return undefined;
    if (record.revoked_at) return undefined;
    return record;
  }

  revokeTokensOf(installationId: string, now: Date): void {
    for (const record of this.sourceTokens.values()) {
      if (record.installation_id === installationId && !record.revoked_at) record.revoked_at = now.toISOString();
    }
  }
}

export function defaultPermissions(input?: Partial<SkillPermissionSet>): SkillPermissionSet {
  return {
    tools: input?.tools ?? EMPTY_PERMISSIONS.tools,
    mcp: input?.mcp ?? EMPTY_PERMISSIONS.mcp,
    network: input?.network ?? EMPTY_PERMISSIONS.network,
    fs: input?.fs ?? EMPTY_PERMISSIONS.fs,
    secrets: input?.secrets ?? EMPTY_PERMISSIONS.secrets,
  };
}
