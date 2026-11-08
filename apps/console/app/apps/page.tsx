"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import { mockApps } from "@/lib/app-collab-mock";
import {
  APP_STATE_LABEL,
  ROLE_LABEL,
  type AppSummary,
} from "@/lib/app-collab-types";

const STATE_TONE: Record<string, "ok" | "info" | "warn" | "err" | "muted"> = {
  running: "ok",
  building: "info",
  deploying: "info",
  sleeping: "muted",
  failed: "err",
  stopped: "muted",
};

function stateTone(state: string) {
  return STATE_TONE[state] ?? "muted";
}

export default function AppsPage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(
    null,
  );
  const [tab, setTab] = useState<"all" | "mine" | "shared">("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listApps();
      setApps(res.items);
      setDemo(false);
      setError(null);
    } catch (err) {
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setDemo(true);
        setApps(mockApps);
      } else if (err instanceof ApiError && err.status === 401) {
        // redirect handled globally
      } else if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "加载应用列表失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      if (tab === "mine" && app.my_role !== "owner") return false;
      if (tab === "shared" && app.my_role === "owner") return false;
      if (
        query &&
        !`${app.name} ${app.slug} ${app.host}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [apps, query, tab]);

  return (
    <AppShell>
      <div data-testid="apps-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力中心</div>
            <h1 className="oc-title">应用中心</h1>
            <p className="oc-subtitle">
              把工作区能力发布为应用：1C2G 运行、链接即域名、SSO 鉴权。
              应用支持协作者角色与在线协同修改，改动经 diff 审批后生成新版本。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/workspaces" className="oc-btn" data-testid="apps-create">
              + 从工作区创建
            </Link>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              应用中心 API 暂不可达或尚未就绪，当前展示示例应用（DEV）。
              权限与协同操作仅在本页模拟，不会写入控制面。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="应用列表加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="应用筛选">
            {[
              { id: "all" as const, label: "全部" },
              { id: "mine" as const, label: "我拥有的" },
              { id: "shared" as const, label: "与我共享" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                data-testid={`apps-tab-${item.id}`}
                className={`oc-btn oc-btn-sm ${
                  tab === item.id ? "oc-btn-primary" : ""
                }`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            className="oc-input max-w-xs"
            placeholder="搜索应用名 / 域名 / slug"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索应用"
            data-testid="apps-search"
          />
        </div>

        {loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="oc-card p-5" aria-busy="true">
                <Skeleton lines={4} />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 && !error ? (
          <div className="mt-8">
            <EmptyState
              title={apps.length ? "没有匹配的应用" : "还没有应用"}
              description={
                apps.length
                  ? "换个关键词或筛选条件试试。"
                  : "从工作区发布你的第一个应用，获得稳定域名与按角色的分享能力。"
              }
              action={
                apps.length ? (
                  <Button
                    onClick={() => {
                      setQuery("");
                      setTab("all");
                    }}
                  >
                    清除筛选
                  </Button>
                ) : (
                  <Link href="/workspaces" className="oc-btn oc-btn-primary">
                    去工作区创建
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((app) => {
              const tone = stateTone(app.state);
              const role = app.my_role;
              return (
                <article
                  key={app.id}
                  className="oc-card oc-provider-card"
                  data-testid="app-card"
                  data-app-id={app.id}
                  data-state={app.state}
                  data-role={role}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background:
                            tone === "ok"
                              ? "var(--oc-success)"
                              : tone === "err"
                                ? "var(--oc-danger)"
                                : tone === "info"
                                  ? "var(--oc-info)"
                                  : "var(--oc-text-tertiary)",
                        }}
                      />
                      <div className="min-w-0">
                        <h2 className="truncate text-md font-semibold">
                          {app.name}
                        </h2>
                        <div className="mt-1 font-mono text-xs text-fg-tertiary">
                          {app.host}
                        </div>
                      </div>
                    </div>
                    <span
                      className="oc-badge"
                      style={{
                        color:
                          tone === "ok"
                            ? "var(--oc-success-text)"
                            : tone === "err"
                              ? "var(--oc-danger-text)"
                              : tone === "info"
                                ? "var(--oc-info-text)"
                                : "var(--oc-text-secondary)",
                        background:
                          tone === "ok"
                            ? "var(--oc-success-subtle)"
                            : tone === "err"
                              ? "var(--oc-danger-subtle)"
                              : tone === "info"
                                ? "var(--oc-info-subtle)"
                                : "var(--oc-surface-hover)",
                      }}
                    >
                      {APP_STATE_LABEL[app.state] ?? app.state}
                    </span>
                  </div>

                  {app.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-fg-secondary">
                      {app.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-fg-tertiary">
                    {role && (
                      <span
                        className="oc-badge oc-badge-primary"
                        data-testid="app-role-badge"
                      >
                        我的角色：{ROLE_LABEL[role]}
                      </span>
                    )}
                    <span>1C2G</span>
                    {app.current_version && <span>{app.current_version}</span>}
                    {app.updated_at && (
                      <span>更新于 {relativeTime(app.updated_at)}</span>
                    )}
                  </div>

                  <div
                    className="mt-4 flex items-center justify-end gap-2 border-t pt-3"
                    style={{ borderColor: "var(--oc-border)" }}
                  >
                    <Link
                      href={`/apps/${app.id}`}
                      className="oc-btn oc-btn-sm"
                      data-testid="app-detail-link"
                    >
                      详情
                    </Link>
                    <a
                      href={app.url || `http://${app.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="oc-btn oc-btn-primary oc-btn-sm"
                      data-testid="app-open"
                    >
                      打开应用 ↗
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
