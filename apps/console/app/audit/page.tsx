"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, isUnavailable } from "@/lib/api";
import type { AuditLog } from "@/lib/api";

const DEMO_LOGS: AuditLog[] = [
  {
    id: "demo-1",
    actor_name: "李雷",
    action: "share.update",
    resource_type: "app",
    resource_name: "发票助手",
    outcome: "success",
    request_id: "req_demo_1",
    created_at: new Date(Date.now() - 12 * 60000).toISOString(),
  },
  {
    id: "demo-2",
    actor_name: "李雷",
    action: "workspace.destroy_requested",
    resource_type: "workspace",
    resource_name: "oc-1a02",
    outcome: "success",
    request_id: "req_demo_2",
    created_at: new Date(Date.now() - 26 * 60000).toISOString(),
  },
  {
    id: "demo-3",
    actor_name: "王芳",
    action: "model.policy.update",
    resource_type: "model_policy",
    resource_name: "团队默认策略",
    outcome: "denied",
    request_id: "req_demo_3",
    created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
];

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string; forbidden?: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAuditLogs({ limit: 20 });
      setLogs(res.items);
      setError(null);
      setDemo(false);
    } catch (err) {
      if (isUnavailable(err)) {
        setDemo(true);
        setLogs(DEMO_LOGS);
      } else if (err instanceof ApiError && err.status === 403) {
        setError({
          message: "需要团队负责人及以上角色才能查看审计日志。",
          requestId: err.requestId,
          forbidden: true,
        });
      } else if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "加载审计日志失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AppShell>
      <div data-testid="audit-page">
        <h1 className="text-2xl font-semibold">审计日志</h1>
        <p className="mt-1 text-sm text-fg-secondary">
          留存 180 天；覆盖登录、Key、工作区、发布、分享、MCP 调用。单次查询跨度 ≤90 天。
        </p>
        <div className="mt-3">
          <Button
            className="oc-btn-sm"
            data-testid="audit-export"
            onClick={async () => {
              try {
                const job = await api.createAuditExport();
                window.open(job.download_url, "_blank", "noopener");
              } catch (err) {
                setError({ message: err instanceof ApiError ? err.message : "导出失败", requestId: err instanceof ApiError ? err.requestId : undefined });
              }
            }}
          >
            导出 NDJSON
          </Button>
        </div>

        {demo && (
          <div className="mt-4">
            <Banner tone="warn">控制面 API 暂不可达，展示示例审计记录（DEV）。</Banner>
          </div>
        )}

        <div className="oc-card mt-4 flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[160px] flex-1">
            <label className="text-xs text-fg-tertiary" htmlFor="audit-range">
              时间范围
            </label>
            <select id="audit-range" className="oc-input mt-1" disabled data-testid="audit-range">
              <option>近 7 天</option>
              <option>近 30 天</option>
            </select>
          </div>
          <div className="min-w-[160px] flex-1">
            <label className="text-xs text-fg-tertiary" htmlFor="audit-action">
              动作
            </label>
            <select id="audit-action" className="oc-input mt-1" disabled data-testid="audit-action">
              <option>全部动作</option>
            </select>
          </div>
          <p className="pb-2 text-xs text-fg-tertiary">筛选接入后可用（M5）</p>
        </div>

        {error && (
          <div className="mt-4">
            {error.forbidden ? (
              <EmptyState
                title="没有访问权限"
                description={error.message}
                action={
                  <a href="/workspaces" className="oc-btn">
                    返回工作区
                  </a>
                }
              />
            ) : (
              <ErrorState
                description={error.message}
                requestId={error.requestId}
                onRetry={() => void load()}
              />
            )}
          </div>
        )}

        {loading && !logs.length ? (
          <div className="mt-4">
            <Skeleton lines={6} />
          </div>
        ) : !loading && !logs.length && !error ? (
          <div className="mt-4">
            <EmptyState
              title="没有匹配的审计记录"
              description="调整时间范围或动作筛选；审计写入从登录与工作区生命周期开始。"
            />
          </div>
        ) : (
          <div className="oc-card mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <caption className="sr-only">审计日志列表</caption>
              <thead>
                <tr style={{ background: "var(--oc-surface-hover)" }}>
                  <th className="px-4 py-3 text-left font-medium">时间</th>
                  <th className="px-4 py-3 text-left font-medium">操作者</th>
                  <th className="px-4 py-3 text-left font-medium">动作</th>
                  <th className="px-4 py-3 text-left font-medium">资源</th>
                  <th className="px-4 py-3 text-left font-medium">结果</th>
                  <th className="px-4 py-3 text-left font-medium">request_id</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-t"
                    style={{ borderColor: "var(--oc-border)" }}
                    data-testid="audit-row"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-fg-secondary">
                      {formatTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">{log.actor_name || log.actor_id || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {log.resource_type}
                      {log.resource_name ? ` · ${log.resource_name}` : ""}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          color:
                            log.outcome === "success"
                              ? "var(--oc-success-text)"
                              : log.outcome === "denied"
                                ? "var(--oc-warning-text)"
                                : "var(--oc-danger-text)",
                          background:
                            log.outcome === "success"
                              ? "var(--oc-success-subtle)"
                              : log.outcome === "denied"
                                ? "var(--oc-warning-subtle)"
                                : "var(--oc-danger-subtle)",
                        }}
                      >
                        {log.outcome === "success" ? "成功" : log.outcome === "denied" ? "拒绝" : "失败"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-fg-tertiary">
                      {log.request_id || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
