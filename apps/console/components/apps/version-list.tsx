"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Button } from "@/components/ui";
import { relativeTime } from "@/lib/api";
import type { AppVersion } from "@/lib/app-collab-types";

export function VersionList({
  versions,
  canRollback,
  onRollback,
  rollingId,
}: {
  versions: AppVersion[];
  canRollback: boolean;
  onRollback: (version: AppVersion) => void;
  rollingId?: string | null;
}) {
  return (
    <section className="oc-card p-5" data-testid="version-list">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold">版本与回滚</h2>
          <p className="mt-1 text-sm text-fg-secondary">
            每次协同提案批准后生成新版本；回滚会发布一个新版本指向历史构建，不影响分享链接。
          </p>
        </div>
        <span className="oc-badge">{versions.length} 个版本</span>
      </div>

      <ul className="mt-4 divide-y">
        {versions.map((version) => {
          const current = version.is_current || version.status === "active";
          return (
            <li
              key={version.id}
              className="flex flex-wrap items-center gap-3 py-3"
              data-testid="version-row"
              data-version={version.version}
              data-current={current ? "true" : "false"}
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-mono text-xs font-semibold"
                style={{
                  background: current ? "var(--oc-primary-subtle)" : "var(--oc-surface-hover)",
                  color: current ? "var(--oc-primary)" : "var(--oc-text-secondary)",
                }}
              >
                {version.version}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {version.summary || "版本更新"}
                  </span>
                  {current && (
                    <span className="oc-badge oc-badge-primary">当前版本</span>
                  )}
                  {version.status === "rolled_back" && (
                    <span className="oc-badge">已回滚</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                  <span>{version.created_by_name || "系统"}</span>
                  <span>{relativeTime(version.created_at)}</span>
                  {version.hash && (
                    <span className="font-mono">{version.hash.slice(0, 8)}</span>
                  )}
                  {version.build_state && <span>构建 {version.build_state}</span>}
                </div>
              </div>
              {canRollback && !current && (
                <Button
                  className="oc-btn-sm"
                  loading={rollingId === version.id}
                  onClick={() => onRollback(version)}
                  data-testid="version-rollback"
                >
                  回滚到此版本
                </Button>
              )}
            </li>
          );
        })}
        {versions.length === 0 && (
          <li className="py-8 text-center text-sm text-fg-secondary">
            还没有版本记录。批准第一个协同提案后会生成 v1。
          </li>
        )}
      </ul>
    </section>
  );
}
