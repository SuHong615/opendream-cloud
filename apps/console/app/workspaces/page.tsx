"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import { mockWorkspaces } from "@/lib/mock";
import type { Workspace } from "@/lib/types";

const STAGE_LABEL: Record<string, string> = {
  provisioning: "分配资源 / 拉取镜像",
  starting: "启动引擎",
  ready: "就绪",
  stopped: "已休眠",
  deleting: "销毁中",
  deleted: "已销毁",
  error: "异常",
};

function stageLabel(stage?: string | null): string {
  return (stage && STAGE_LABEL[stage]) || "准备中";
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [demo, setDemo] = useState(false);
  const [creating, setCreating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await api.listWorkspaces();
      setWorkspaces(res.items);
      setDemo(false);
      setError(null);
      const pending = res.items.some((w) =>
        ["provisioning", "starting", "stopping", "deleting"].includes(w.state),
      );
      if (pending) {
        timer.current = setTimeout(() => load({ silent: true }), 2000);
      }
    } catch (err) {
      if (isUnavailable(err)) {
        setDemo(true);
        setWorkspaces(mockWorkspaces);
        setError(null);
      } else if (err instanceof ApiError && err.status === 404) {
        setWorkspaces([]);
      } else if (err instanceof ApiError && err.status === 401) {
        // redirect handled by api layer
      } else if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "加载工作区失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  async function createWorkspace() {
    setCreating(true);
    try {
      const ws = await api.ensureWorkspace();
      setWorkspaces((prev) => {
        const rest = prev.filter((w) => w.id !== ws.id);
        return [ws, ...rest];
      });
      void load({ silent: true });
    } catch (err) {
      if (isUnavailable(err)) {
        setDemo(true);
        setWorkspaces(mockWorkspaces);
        setError(null);
      } else if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      }
    } finally {
      setCreating(false);
    }
  }

  const pending = workspaces.find((w) =>
    ["provisioning", "starting"].includes(w.state),
  );

  function elapsed(iso: string): string {
    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return `${seconds} 秒`;
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  }

  return (
    <AppShell>
      <div data-testid="workspaces-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">云端工作区</div>
            <h1 className="oc-title">工作区</h1>
            <p className="oc-subtitle">
              每个账号拥有独立的 4C8G opencode 工作区。关闭浏览器不会销毁，
              下次回来继续；只有你显式销毁才会删除。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="oc-badge oc-badge-primary">4C8G · 独立 PVC</span>
            <Button
              variant="primary"
              onClick={createWorkspace}
              loading={creating}
              data-testid="workspace-create"
            >
              + 创建工作区
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              控制面暂不可达，当前展示示例工作区（DEV）。恢复后刷新即切换真实数据。
            </Banner>
          </div>
        )}

        {error && (
          <div className="mt-6">
            <ErrorState
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading && !workspaces.length ? (
          <div className="mt-6 grid gap-4 lg:grid-cols-2" data-testid="workspaces-loading">
            <Skeleton lines={5} />
            <Skeleton lines={5} />
          </div>
        ) : !loading && !workspaces.length && !error ? (
          <div className="mt-8">
            <EmptyState
              title="还没有云端工作区"
              description="登录后会自动创建一个 4C8G 工作区；也可以现在手动创建。创建通常需要 30–90 秒。"
              action={
                <Button
                  variant="primary"
                  onClick={createWorkspace}
                  loading={creating}
                  data-testid="empty-create"
                >
                  创建工作区
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {pending && (
              <div className="oc-card p-5" data-testid="provisioning-card">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                        style={{ background: "var(--oc-info)" }}
                      />
                      <span
                        className="relative inline-flex h-3 w-3 rounded-full"
                        style={{ background: "var(--oc-info)" }}
                      />
                    </span>
                    <div>
                      <div className="text-sm font-medium">
                        {pending.display_name} · 正在准备工作区
                      </div>
                      <p className="mt-1 text-sm text-fg-secondary">
                        阶段：{stageLabel(pending.stage)} · 已用 {elapsed(pending.created_at)}
                        （可离开页面，完成后会通知）
                      </p>
                    </div>
                  </div>
                  <StatusBadge state={pending.state} />
                </div>
                <div
                  className="mt-4 h-2 overflow-hidden rounded-full"
                  style={{ background: "var(--oc-surface-hover)" }}
                  role="progressbar"
                  aria-valuetext={`阶段：${stageLabel(pending.stage)}`}
                >
                  <div
                    className="h-full w-1/2 animate-pulse rounded-full"
                    style={{ background: "var(--oc-primary)" }}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {workspaces
                .filter((w) => !["provisioning", "starting"].includes(w.state))
                .map((ws) => (
                  <article
                    key={ws.id}
                    className="oc-card oc-provider-card"
                    data-testid="workspace-card"
                    data-workspace-id={ws.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge state={ws.state} />
                          <h2 className="truncate text-md font-semibold">
                            {ws.display_name}
                          </h2>
                        </div>
                        <div className="mt-1 font-mono text-xs text-fg-tertiary">
                          {ws.slug || ws.id.slice(0, 8)} · {ws.host}
                        </div>
                      </div>
                      <span className="oc-badge">
                        {ws.resources
                          ? `${ws.resources.cpu ?? "4"}C${ws.resources.memory ?? "8Gi"}`
                          : "4C8G"}
                      </span>
                    </div>

                    <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-2xs text-fg-tertiary">存储</dt>
                        <dd className="mt-0.5 font-medium">
                          {ws.storage?.size || ws.pvc_size || "20Gi"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-fg-tertiary">能力</dt>
                        <dd className="mt-0.5 font-medium">
                          Skill {ws.skill_count ?? 0} · MCP {ws.mcp_count ?? 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-fg-tertiary">最近活动</dt>
                        <dd className="mt-0.5 font-medium">
                          {relativeTime(ws.last_active_at || ws.updated_at)}
                        </dd>
                      </div>
                    </dl>

                    {ws.last_session_title && (
                      <div className="mt-3 rounded-md px-2.5 py-1.5 text-xs" style={{ background: "var(--oc-surface-hover)" }}>
                        上次会话「{ws.last_session_title}」
                      </div>
                    )}

                    <div
                      className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t pt-3"
                      style={{ borderColor: "var(--oc-border)" }}
                    >
                      <Link
                        href={`/workspaces/${ws.id}`}
                        className="oc-btn oc-btn-sm"
                        data-testid="workspace-detail-link"
                      >
                        详情
                      </Link>
                      <Link
                        href={`/workspaces/${ws.id}?open=1`}
                        className="oc-btn oc-btn-primary oc-btn-sm"
                        data-testid="workspace-enter"
                      >
                        打开工作区 ↗
                      </Link>
                    </div>
                  </article>
                ))}
            </div>

            <div
              className="rounded-lg border border-dashed px-4 py-3 text-sm text-fg-secondary"
              style={{ borderColor: "var(--oc-border)" }}
            >
              当前配额 1/1。多工作区为 P2；需要更多可申请提升配额。
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
