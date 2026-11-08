"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable } from "@/lib/api";
import type { UsageResponse } from "@/lib/skills-usage-types";

type Range = "24h" | "7d";
type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

function rangeToDates(range: Range): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - (range === "24h" ? 24 : 7 * 24) * 3600_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

export default function UsagePage() {
  const [range, setRange] = useState<Range>("24h");
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dates = rangeToDates(range);
      const result = await api.getUsage({
        from: dates.from,
        to: dates.to,
        groupBy: range === "24h" ? "hour" : "day",
      });
      setUsage(result);
    } catch (err) {
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setError({ message: "用量 API 暂不可用，请稍后重试", requestId: undefined });
      } else if (err instanceof ApiError && err.status !== 401) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "用量数据加载失败" });
      }
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);

  const tokens = usage
    ? usage.summary.tokens.input +
      usage.summary.tokens.output +
      usage.summary.tokens.reasoning +
      usage.summary.tokens.cache.read +
      usage.summary.tokens.cache.write
    : 0;

  async function exportUsage() {
    try {
      const job = await api.createUsageExport();
      window.open(job.download_url, "_blank", "noopener");
      toast(`已生成用量导出（${job.rows} 行）`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "导出失败", "err");
    }
  }

  return (
    <AppShell>
      <div data-testid="usage-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理 · 用量</div>
            <h1 className="oc-title">用量与配额</h1>
            <p className="oc-subtitle">
              按组织汇总模型调用量、Token 与成本；数据来自 usage_records，按请求逐条计量。
              明细未写入时只展示汇总，不伪造趋势。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button className="oc-btn-sm" onClick={() => void exportUsage()} data-testid="usage-export">
              导出 NDJSON
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-sm text-fg-secondary">时间范围</span>
          <div className="flex gap-1.5" data-testid="usage-range">
            {(
              [
                { id: "24h" as const, label: "近 24 小时" },
                { id: "7d" as const, label: "近 7 天" },
              ]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`oc-btn oc-btn-sm ${range === item.id ? "oc-btn-primary" : ""}`}
                aria-pressed={range === item.id}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {usage && (
            <span className="text-xs text-fg-tertiary">
              {new Date(usage.from).toLocaleString("zh-CN")} —{" "}
              {new Date(usage.to).toLocaleString("zh-CN")} · {usage.currency}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-6">
            <ErrorState
              title="用量数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading && !usage ? (
          <div className="mt-6 space-y-4">
            <Skeleton lines={4} />
            <Skeleton lines={6} />
          </div>
        ) : usage ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="oc-stat" data-testid="usage-card">
                <span className="oc-stat-label">请求数</span>
                <strong className="oc-stat-value">{compact(usage.summary.requests)}</strong>
                <span className="oc-stat-hint">按 usage_records 计数</span>
              </div>
              <div className="oc-stat" data-testid="usage-card">
                <span className="oc-stat-label">Token</span>
                <strong className="oc-stat-value">{compact(tokens)}</strong>
                <span className="oc-stat-hint">
                  输入 {compact(usage.summary.tokens.input)} · 输出{" "}
                  {compact(usage.summary.tokens.output)}
                </span>
              </div>
              <div className="oc-stat" data-testid="usage-card">
                <span className="oc-stat-label">成本（USD）</span>
                <strong className="oc-stat-value">
                  ${Number(usage.summary.cost_usd).toFixed(4)}
                </strong>
                <span className="oc-stat-hint">按模型价格累计</span>
              </div>
            </div>

            <section className="oc-card mt-5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-md font-semibold">用量明细</h2>
                <span className="oc-badge">group_by: {usage.group_by}</span>
              </div>
              {usage.items.length === 0 ? (
                <p className="mt-3 rounded-lg px-3 py-3 text-sm text-fg-secondary" style={{ background: "var(--oc-surface-hover)" }}>
                  当前时间范围没有按小时的明细数据（usage 接口返回 items 为空）。这里只展示
                  summary 汇总；不会生成或伪造趋势图。接入逐小时聚合后会自动显示明细表。
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <caption className="sr-only">用量明细</caption>
                    <thead>
                      <tr style={{ background: "var(--oc-surface-hover)" }}>
                        <th className="px-3 py-2 text-left font-medium">时间</th>
                        <th className="px-3 py-2 text-left font-medium">分组</th>
                        <th className="px-3 py-2 text-right font-medium">请求</th>
                        <th className="px-3 py-2 text-right font-medium">Token</th>
                        <th className="px-3 py-2 text-right font-medium">成本</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usage.items.map((item, index) => {
                        const row = item as {
                          bucket?: string;
                          timestamp?: string;
                          group?: string;
                          requests?: number;
                          tokens?: number;
                          cost_usd?: number | string;
                        };
                        return (
                          <tr key={index} className="border-t" style={{ borderColor: "var(--oc-border)" }}>
                            <td className="px-3 py-2 text-xs">
                              {row.bucket || row.timestamp || "—"}
                            </td>
                            <td className="px-3 py-2 text-xs">{row.group || usage.group_by}</td>
                            <td className="px-3 py-2 text-right">{row.requests ?? "—"}</td>
                            <td className="px-3 py-2 text-right">
                              {row.tokens != null ? compact(row.tokens) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {row.cost_usd != null ? `$${Number(row.cost_usd).toFixed(4)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="oc-card p-4 text-sm">
                <h3 className="text-xs font-medium text-fg-tertiary">Token 拆分</h3>
                <ul className="mt-2 space-y-1">
                  <li className="flex justify-between">
                    <span className="text-fg-secondary">输入</span>
                    <span>{usage.summary.tokens.input.toLocaleString()}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-fg-secondary">输出</span>
                    <span>{usage.summary.tokens.output.toLocaleString()}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-fg-secondary">推理</span>
                    <span>{usage.summary.tokens.reasoning.toLocaleString()}</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-fg-secondary">缓存读 / 写</span>
                    <span>
                      {usage.summary.tokens.cache.read.toLocaleString()} /{" "}
                      {usage.summary.tokens.cache.write.toLocaleString()}
                    </span>
                  </li>
                </ul>
              </div>
              <div className="oc-card p-4 text-sm">
                <h3 className="text-xs font-medium text-fg-tertiary">说明</h3>
                <p className="mt-2 text-fg-secondary">
                  配额与预算在「组织与配额」页面管理；用量按调用时记录的模型价格计算，
                  与账单口径一致（request_id 幂等）。
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-6">
            <Banner tone="warn">使用范围切换或点击刷新以加载用量。</Banner>
          </div>
        )}

        <div className="fixed bottom-6 right-6 z-[80] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((item) => (
            <div key={item.id} className="oc-toast" data-testid="toast" data-tone={item.tone} style={{ borderLeftColor: item.tone === "ok" ? "var(--oc-success)" : item.tone === "err" ? "var(--oc-danger)" : "var(--oc-info)" }}>
              <span aria-hidden="true">{item.tone === "ok" ? "✓" : item.tone === "err" ? "!" : "i"}</span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
