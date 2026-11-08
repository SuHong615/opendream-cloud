"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockExperimentResults,
  mockExperiments,
} from "@/lib/experiment-mock";
import {
  EXPERIMENT_STATUS_LABEL,
  type Experiment,
  type ExperimentMetric,
  type ExperimentResults,
} from "@/lib/experiment-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };
type VariantDraft = {
  name: string;
  model: string;
  prompt_ref: string;
  weight: string;
};

const EMPTY_VARIANT: VariantDraft = {
  name: "",
  model: "deepseek-v3",
  prompt_ref: "",
  weight: "0.5",
};

function statusTone(status: string): "ok" | "info" | "warn" | "err" | "muted" {
  return status === "completed"
    ? "ok"
    : status === "running"
      ? "info"
      : status === "failed"
        ? "err"
        : "muted";
}

function toneStyle(tone: "ok" | "info" | "warn" | "err" | "muted") {
  return {
    color:
      tone === "ok"
        ? "var(--oc-success-text)"
        : tone === "err"
          ? "var(--oc-danger-text)"
          : tone === "warn"
            ? "var(--oc-warning-text)"
            : tone === "info"
              ? "var(--oc-info-text)"
              : "var(--oc-text-secondary)",
    background:
      tone === "ok"
        ? "var(--oc-success-subtle)"
        : tone === "err"
          ? "var(--oc-danger-subtle)"
          : tone === "warn"
            ? "var(--oc-warning-subtle)"
            : tone === "info"
              ? "var(--oc-info-subtle)"
              : "var(--oc-surface-hover)",
  };
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [resultsFor, setResultsFor] = useState<Experiment | null>(null);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Experiment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    dataset_id: "",
    evaluator_id: "",
    variants: [EMPTY_VARIANT, EMPTY_VARIANT] as VariantDraft[],
  });

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listExperiments();
      setExperiments(result.items);
      setDemo(false);
    } catch (err) {
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setDemo(true);
        setExperiments(mockExperiments);
      } else if (err instanceof ApiError && err.status !== 401) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "实验数据加载失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const variantName = useCallback(
    (experiment: Experiment, variantId?: string | null) =>
      experiment.variants.find((variant) => variant.id === variantId)?.name ?? "—",
    [],
  );

  async function openResults(experiment: Experiment) {
    setResultsFor(experiment);
    setResultsLoading(true);
    setResults(null);
    try {
      if (demo) {
        const mock = mockExperimentResults[experiment.id];
        if (mock) {
          setResults(mock);
        } else {
          setResults({
            experiment_id: experiment.id,
            status: "completed",
            winner_variant_id: experiment.variants[0]?.id ?? null,
            metrics: experiment.variants.map((variant, index) => ({
              variant_id: variant.id,
              accuracy: 0.9 - index * 0.04,
              avg_latency_ms: 700 + index * 120,
              avg_cost_usd: 0.002,
              samples: 100,
            })),
          });
        }
      } else if (experiment.metrics.length > 0) {
        setResults({
          experiment_id: experiment.id,
          status: experiment.status,
          winner_variant_id: experiment.winner_variant_id,
          metrics: experiment.metrics,
        });
      } else {
        setResults(await api.getExperimentResults(experiment.id));
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "结果加载失败", "err");
    } finally {
      setResultsLoading(false);
    }
  }

  async function startExperiment(experiment: Experiment) {
    setBusy(`start-${experiment.id}`);
    try {
      let updated: Experiment;
      if (demo) {
        const rows = experiment.variants.map((variant, index) => ({
          variant_id: variant.id,
          accuracy: Number((0.88 + index * 0.03).toFixed(3)),
          avg_latency_ms: 700 + index * 130,
          avg_cost_usd: 0.002 + index * 0.0004,
          samples: 200,
        }));
        updated = {
          ...experiment,
          status: "completed",
          metrics: rows,
          winner_variant_id: [...rows].sort((a, b) => b.accuracy - a.accuracy)[0]?.variant_id,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        };
        setExperiments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setResultsFor(updated);
        setResults({
          experiment_id: updated.id,
          status: "completed",
          winner_variant_id: updated.winner_variant_id,
          metrics: rows,
        });
      } else {
        updated = await api.startExperiment(experiment.id);
        setExperiments((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        await openResults(updated);
      }
      toast("实验已启动并完成评估");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "启动实验失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function saveExperiment() {
    if (!form.name.trim() || !form.dataset_id.trim()) {
      setFormError("请填写实验名称与数据集");
      return;
    }
    const variants = form.variants
      .map((variant) => ({
        name: variant.name.trim(),
        model: variant.model.trim(),
        prompt_ref: variant.prompt_ref.trim() || undefined,
        weight: Number(variant.weight) || 0.5,
      }))
      .filter((variant) => variant.name && variant.model);
    if (variants.length < 2) {
      setFormError("至少配置 2 个有效变体（名称 + 模型）");
      return;
    }
    if (variants.length > 8) {
      setFormError("最多 8 个变体");
      return;
    }
    setBusy("create");
    setFormError(null);
    try {
      let created: Experiment;
      if (demo) {
        created = {
          id: `exp-${Date.now()}`,
          name: form.name.trim(),
          description: form.description.trim(),
          dataset_id: form.dataset_id.trim(),
          evaluator_id: form.evaluator_id.trim() || null,
          status: "draft",
          variants: variants.map((variant, index) => ({
            id: `var-${Date.now()}-${index}`,
            ...variant,
          })),
          metrics: [],
          winner_variant_id: null,
          created_at: new Date().toISOString(),
        };
        setExperiments((prev) => [created, ...prev]);
      } else {
        created = await api.createExperiment({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          dataset_id: form.dataset_id.trim(),
          evaluator_id: form.evaluator_id.trim() || null,
          variants,
        });
        setExperiments((prev) => [created, ...prev]);
      }
      setCreateOpen(false);
      setForm({ name: "", description: "", dataset_id: "", evaluator_id: "", variants: [EMPTY_VARIANT, EMPTY_VARIANT] });
      toast("实验草稿已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建实验失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteExperiment() {
    if (!deleteTarget) return;
    setBusy(`delete-${deleteTarget.id}`);
    try {
      if (!demo) await api.deleteExperiment(deleteTarget.id);
      setExperiments((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("实验已删除");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除失败", "err");
    } finally {
      setBusy(null);
    }
  }

  const resultRows = useMemo(() => {
    if (!resultsFor || !results) return [];
    return results.metrics.map((metric: ExperimentMetric) => ({
      metric,
      variant: resultsFor.variants.find((variant) => variant.id === metric.variant_id),
    }));
  }, [results, resultsFor]);
  const winner = resultsFor && results
    ? resultsFor.variants.find((variant) => variant.id === results.winner_variant_id)
    : null;

  return (
    <AppShell>
      <div data-testid="experiments-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">质量 · 实验</div>
            <h1 className="oc-title">实验中心</h1>
            <p className="oc-subtitle">
              对模型 / Prompt / Agent 版本做 A/B 对比：按数据集评估准确率、延迟与成本，
              自动选出 winner，结果可复现。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="oc-btn-sm"
              variant="secondary"
              onClick={() => {
                setDemo(true);
                setExperiments(mockExperiments);
              }}
              data-testid="experiments-demo"
            >
              示例数据
            </Button>
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
              data-testid="experiment-create"
            >
              + 创建实验
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              当前展示示例实验（DEV）。创建/启动/删除仅本地模拟，不会写入真实组织。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="实验加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton lines={5} />
            <Skeleton lines={5} />
            <Skeleton lines={5} />
          </div>
        ) : experiments.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title="还没有实验"
              description="创建实验，对比 2-8 个模型/Prompt 变体的准确率、延迟与成本。"
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    创建实验
                  </Button>
                  <Button
                    onClick={() => {
                      setDemo(true);
                      setExperiments(mockExperiments);
                    }}
                  >
                    载入示例数据
                  </Button>
                </div>
              }
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {experiments.map((experiment) => (
              <article
                key={experiment.id}
                className="oc-card flex flex-col p-5"
                data-testid="experiment-card"
                data-experiment-id={experiment.id}
                data-status={experiment.status}
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-md font-semibold">{experiment.name}</h2>
                  <span className="oc-badge" style={toneStyle(statusTone(experiment.status))}>
                    {EXPERIMENT_STATUS_LABEL[experiment.status] ?? experiment.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">
                  {experiment.description || "未填写描述"}
                </p>
                <dl className="mt-3 space-y-1 text-xs text-fg-tertiary">
                  <div className="flex gap-2">
                    <dt>数据集：</dt>
                    <dd className="font-mono">{experiment.dataset_id}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>评估器：</dt>
                    <dd className="font-mono">{experiment.evaluator_id || "默认"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>变体：</dt>
                    <dd>{experiment.variants.length} 个</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt>Winner：</dt>
                    <dd>
                      {experiment.winner_variant_id
                        ? variantName(experiment, experiment.winner_variant_id)
                        : "未运行"}
                    </dd>
                  </div>
                  <div>创建于 {relativeTime(experiment.created_at)}</div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {experiment.variants.map((variant) => (
                    <span
                      key={variant.id}
                      className="oc-model-chip"
                      style={
                        experiment.winner_variant_id === variant.id
                          ? { borderColor: "var(--oc-success)", color: "var(--oc-success-text)" }
                          : undefined
                      }
                    >
                      {variant.name} · {variant.model}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--oc-border)" }}>
                  <Button
                    className="oc-btn-sm"
                    onClick={() => void openResults(experiment)}
                    data-testid="experiment-results"
                  >
                    结果
                  </Button>
                  <Button
                    className="oc-btn-sm"
                    variant="primary"
                    loading={busy === `start-${experiment.id}`}
                    onClick={() => void startExperiment(experiment)}
                    data-testid="experiment-start"
                  >
                    {experiment.status === "completed" ? "重跑" : "启动"}
                  </Button>
                  <Button
                    className="oc-btn-sm"
                    variant="ghost"
                    style={{ color: "var(--oc-danger-text)" }}
                    onClick={() => setDeleteTarget(experiment)}
                    data-testid="experiment-delete"
                  >
                    删除
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {createOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setCreateOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="experiment-create-title"
              className="oc-card relative max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6"
              data-testid="experiment-create-dialog"
            >
              <h2 id="experiment-create-title" className="text-lg font-semibold">
                创建实验
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                配置 2-8 个变体；权重用于流量分配，不影响离线评测结果。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">实验名称</span>
                  <input className="oc-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="发票抽取：DeepSeek vs 通义" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">描述</span>
                  <input className="oc-input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="对比目标与验收口径" />
                </label>
                <label className="block">
                  <span className="oc-field-label">数据集 ID</span>
                  <input className="oc-input font-mono" value={form.dataset_id} onChange={(event) => setForm((prev) => ({ ...prev, dataset_id: event.target.value }))} placeholder="ds_invoice_gold" />
                </label>
                <label className="block">
                  <span className="oc-field-label">评估器 ID（可选）</span>
                  <input className="oc-input font-mono" value={form.evaluator_id} onChange={(event) => setForm((prev) => ({ ...prev, evaluator_id: event.target.value }))} placeholder="ev_correctness" />
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <h3 className="text-sm font-medium">变体（{form.variants.length}/8）</h3>
                <Button
                  className="oc-btn-sm"
                  disabled={form.variants.length >= 8}
                  onClick={() => setForm((prev) => ({ ...prev, variants: [...prev.variants, EMPTY_VARIANT] }))}
                  data-testid="experiment-add-variant"
                >
                  + 添加变体
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {form.variants.map((variant, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-12"
                    style={{ borderColor: "var(--oc-border)" }}
                    data-testid="experiment-variant-input"
                  >
                    <label className="block sm:col-span-3">
                      <span className="oc-field-label">名称</span>
                      <input
                        className="oc-input"
                        value={variant.name}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item, i) =>
                              i === index ? { ...item, name: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="DeepSeek-V3"
                      />
                    </label>
                    <label className="block sm:col-span-3">
                      <span className="oc-field-label">模型</span>
                      <input
                        className="oc-input font-mono"
                        value={variant.model}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item, i) =>
                              i === index ? { ...item, model: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="deepseek-v3"
                      />
                    </label>
                    <label className="block sm:col-span-4">
                      <span className="oc-field-label">Prompt ref（可选）</span>
                      <input
                        className="oc-input font-mono"
                        value={variant.prompt_ref}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item, i) =>
                              i === index ? { ...item, prompt_ref: event.target.value } : item,
                            ),
                          }))
                        }
                        placeholder="prompt-invoice-extract"
                      />
                    </label>
                    <label className="block sm:col-span-1">
                      <span className="oc-field-label">权重</span>
                      <input
                        className="oc-input"
                        value={variant.weight}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            variants: prev.variants.map((item, i) =>
                              i === index ? { ...item, weight: event.target.value } : item,
                            ),
                          }))
                        }
                      />
                    </label>
                    <div className="flex items-end sm:col-span-1">
                      <Button
                        className="oc-btn-sm w-full"
                        variant="ghost"
                        disabled={form.variants.length <= 2}
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            variants: prev.variants.filter((_, i) => i !== index),
                          }))
                        }
                        aria-label={`删除变体 ${index + 1}`}
                      >
                        ✕
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {formError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{formError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setCreateOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy === "create"} onClick={() => void saveExperiment()} data-testid="experiment-save">
                  创建草稿
                </Button>
              </div>
            </div>
          </div>
        )}

        {resultsFor && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setResultsFor(null)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="experiment-results-title"
              className="oc-card relative max-h-[88vh] w-full max-w-3xl overflow-y-auto"
              data-testid="experiment-results-panel"
            >
              <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--oc-border)" }}>
                <div>
                  <h2 id="experiment-results-title" className="text-lg font-semibold">
                    {resultsFor.name}
                  </h2>
                  <p className="mt-1 text-xs text-fg-tertiary">
                    {resultsFor.dataset_id} · {resultsFor.evaluator_id || "默认评估器"} ·{" "}
                    {EXPERIMENT_STATUS_LABEL[resultsFor.status] ?? resultsFor.status}
                  </p>
                </div>
                <button type="button" className="oc-icon-btn" aria-label="关闭结果" onClick={() => setResultsFor(null)}>
                  ✕
                </button>
              </header>
              <div className="px-5 py-4">
                {winner && (
                  <div
                    className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm"
                    style={{ background: "var(--oc-success-subtle)", color: "var(--oc-success-text)" }}
                    data-testid="experiment-winner"
                  >
                    <span aria-hidden="true">🏆</span>
                    <span className="font-medium">Winner：{winner.name}</span>
                    <span className="text-xs">{winner.model}</span>
                    {winner.prompt_ref && <span className="text-xs">· {winner.prompt_ref}</span>}
                  </div>
                )}
                {resultsLoading ? (
                  <div className="mt-4">
                    <Skeleton lines={5} />
                  </div>
                ) : resultRows.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState
                      title="还没有结果"
                      description="启动实验后生成各变体的 accuracy / latency / cost 对比。"
                      action={
                        <Button
                          variant="primary"
                          onClick={() => void startExperiment(resultsFor)}
                        >
                          启动实验
                        </Button>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[620px] border-collapse text-sm">
                      <caption className="sr-only">实验结果对比</caption>
                      <thead>
                        <tr style={{ background: "var(--oc-surface-hover)" }}>
                          <th className="px-3 py-2 text-left font-medium">变体</th>
                          <th className="px-3 py-2 text-left font-medium">模型</th>
                          <th className="px-3 py-2 text-right font-medium">Accuracy</th>
                          <th className="px-3 py-2 text-right font-medium">延迟</th>
                          <th className="px-3 py-2 text-right font-medium">成本</th>
                          <th className="px-3 py-2 text-right font-medium">样本</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultRows.map(({ metric, variant }) => {
                          const isWinner = results?.winner_variant_id === metric.variant_id;
                          return (
                            <tr
                              key={metric.variant_id}
                              className="border-t"
                              style={{
                                borderColor: "var(--oc-border)",
                                background: isWinner ? "var(--oc-success-subtle)" : undefined,
                              }}
                              data-testid="experiment-variant"
                              data-winner={isWinner ? "true" : "false"}
                            >
                              <td className="px-3 py-2 font-medium">
                                {variant?.name ?? metric.variant_id}
                                {isWinner && <span className="ml-1 text-xs">🏆</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-fg-secondary">
                                {variant?.model ?? "—"}
                              </td>
                              <td className="px-3 py-2 text-right">{Math.round(metric.accuracy * 1000) / 10}%</td>
                              <td className="px-3 py-2 text-right">{metric.avg_latency_ms} ms</td>
                              <td className="px-3 py-2 text-right">${metric.avg_cost_usd}</td>
                              <td className="px-3 py-2 text-right">{metric.samples}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setDeleteTarget(null)} />
            <div role="dialog" aria-modal="true" aria-labelledby="experiment-delete-title" className="oc-card relative w-full max-w-md p-6" data-testid="experiment-delete-dialog">
              <h2 id="experiment-delete-title" className="text-lg font-semibold">
                删除实验
              </h2>
              <p className="mt-2 text-sm text-fg-secondary">
                确定删除「{deleteTarget.name}」？历史结果将一并删除，操作不可撤销。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setDeleteTarget(null)}>取消</Button>
                <Button variant="danger" loading={busy === `delete-${deleteTarget.id}`} onClick={() => void deleteExperiment()} data-testid="experiment-delete-confirm">
                  确认删除
                </Button>
              </div>
            </div>
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
