"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable } from "@/lib/api";
import {
  mockObsOverview,
  mockTimeseries,
} from "@/lib/m5-mock";
import type { ObsOverview, TimeSeriesPoint } from "@/lib/m5-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return String(value);
}

function chartPath(points: TimeSeriesPoint[], width = 640, height = 160): string {
  if (points.length === 0) return "";
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value), 0);
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((point.value - min) / span) * (height - 16) - 8;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export default function ObservabilityPage() {
  const [overview, setOverview] = useState<ObsOverview | null>(null);
  const [series, setSeries] = useState<TimeSeriesPoint[]>([]);
  const [metric, setMetric] = useState("tokens");
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResult, seriesResult] = await Promise.all([
        api.getObservabilityOverview(),
        api.getObservabilityTimeseries(metric),
      ]);
      setOverview(overviewResult);
      setSeries(seriesResult.points ?? seriesResult.items ?? []);
      setDemo(false);
    } catch (err) {
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setDemo(true);
        setOverview(mockObsOverview);
        setSeries(
          mockTimeseries.map((point) => ({
            ...point,
            value: Math.round(point.value * (metric === "tokens" ? 120 : metric === "cost" ? 0.4 : 1)),
          })),
        );
      } else if (err instanceof ApiError) {
        if (err.status !== 401) {
          setError({ message: err.message, requestId: err.requestId });
        }
      } else {
        setError({ message: "可观测数据加载失败" });
      }
    } finally {
      setLoading(false);
    }
  }, [metric]);

  useEffect(() => {
    void load();
  }, [load]);

  const path = useMemo(() => chartPath(series), [series]);
  const maxValue = Math.max(...series.map((point) => point.value), 1);

  const cards = overview
    ? [
        { label: "工作区", value: String(overview.workspaces ?? "—"), hint: "运行中 / 常驻" },
        { label: "Token", value: compactNumber(overview.tokens ?? 0), hint: "近 24 小时" },
        { label: "成本", value: `$${overview.cost_usd ?? "0"}`, hint: "近 24 小时" },
        {
          label: "错误率",
          value: `${((overview.error_rate ?? 0) * 100).toFixed(1)}%`,
          hint: "5xx / 总请求",
        },
        { label: "MCP 调用", value: String(overview.mcp_servers ?? "—"), hint: "近 24 小时" },
        { label: "评测运行", value: String(overview.eval_runs ?? "—"), hint: "近 7 天" },
      ]
    : [];

  return (
    <AppShell>
      <div data-testid="observability-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">运行状态</div>
            <h1 className="oc-title">可观测</h1>
            <p className="oc-subtitle">
              平台容量、模型用量、成本、错误率与服务健康的统一视图；数据延迟 ≤5 分钟，
              趋势按小时聚合。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {overview?.updated_at && (
              <span className="text-xs text-fg-tertiary">
                更新于 {new Date(overview.updated_at).toLocaleTimeString("zh-CN")}
              </span>
            )}
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              可观测 API 尚未就绪或不可达，当前展示示例指标（DEV）。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="可观测数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading && !overview ? (
          <div className="mt-6 space-y-4">
            <Skeleton lines={4} />
            <Skeleton lines={8} />
          </div>
        ) : overview ? (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((card) => (
                <div key={card.label} className="oc-stat" data-testid="obs-card">
                  <span className="oc-stat-label">{card.label}</span>
                  <strong className="oc-stat-value">{card.value}</strong>
                  <span className="oc-stat-hint">{card.hint}</span>
                </div>
              ))}
            </div>

            <section className="oc-card mt-5 p-5" data-testid="obs-chart">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-md font-semibold">近 24 小时趋势</h2>
                  <p className="mt-1 text-xs text-fg-tertiary">
                    按小时聚合 · 当前指标：{metric}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {[
                    { value: "tokens", label: "Token" },
                    { value: "requests", label: "请求" },
                    { value: "cost", label: "成本" },
                    { value: "runs", label: "评测运行" },
                  ].map((item) => (
                    <Button
                      key={item.value}
                      className="oc-btn-sm"
                      variant={metric === item.value ? "primary" : "secondary"}
                      onClick={() => setMetric(item.value)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <svg
                  viewBox="0 0 640 176"
                  role="img"
                  aria-label={`${metric} 近 24 小时趋势图`}
                  style={{ width: "100%", minWidth: 480, height: 176 }}
                >
                  <defs>
                    <linearGradient id="obsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--oc-primary)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--oc-primary)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {[0, 1, 2, 3].map((line) => (
                    <line
                      key={line}
                      x1="0"
                      x2="640"
                      y1={24 + line * 36}
                      y2={24 + line * 36}
                      stroke="var(--oc-border)"
                      strokeDasharray="3 4"
                    />
                  ))}
                  {path && (
                    <>
                      <path d={`${path} L640,168 L0,168 Z`} fill="url(#obsFill)" />
                      <path d={path} fill="none" stroke="var(--oc-primary)" strokeWidth="2" />
                    </>
                  )}
                  <text x="0" y="14" fontSize="10" fill="var(--oc-text-tertiary)">
                    {compactNumber(maxValue)}
                  </text>
                  <text x="0" y="172" fontSize="10" fill="var(--oc-text-tertiary)">
                    24h 前
                  </text>
                  <text x="584" y="172" fontSize="10" fill="var(--oc-text-tertiary)">
                    现在
                  </text>
                </svg>
              </div>
            </section>

            <section className="mt-5">
              <h2 className="text-md font-semibold">服务健康</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(overview.services ?? []).map((service) => {
                  const ok = service.status === "ok";
                  const degraded = service.status === "degraded";
                  return (
                    <div
                      key={service.name}
                      className="oc-card flex items-center justify-between gap-3 px-4 py-3"
                      data-testid="obs-service"
                      data-status={service.status}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            background: ok
                              ? "var(--oc-success)"
                              : degraded
                                ? "var(--oc-warning)"
                                : "var(--oc-danger)",
                          }}
                        />
                        <span className="font-mono text-sm">{service.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-fg-tertiary">
                        {service.latency_ms != null && <span>{service.latency_ms}ms</span>}
                        <span className="oc-badge">{ok ? "正常" : degraded ? "降级" : "异常"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

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
