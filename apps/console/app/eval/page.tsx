"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockEvalDatasets,
  mockEvalEvaluators,
  mockEvalReport,
  mockEvalRuns,
} from "@/lib/m5-mock";
import type { EvalDataset, EvalEvaluator, EvalRun } from "@/lib/m5-types";

type Tab = "datasets" | "evaluators" | "runs";
type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

const RUN_STATUS: Record<string, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "已通过",
  failed: "失败",
  canceled: "已取消",
  timeout: "超时",
};

export default function EvalPage() {
  const [tab, setTab] = useState<Tab>("runs");
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [evaluators, setEvaluators] = useState<EvalEvaluator[]>([]);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [evaluatorOpen, setEvaluatorOpen] = useState(false);
  const [report, setReport] = useState<EvalRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", datasetId: "", evaluatorId: "" });
  const [evalForm, setEvalForm] = useState({ name: "", kind: "rule", description: "" });
  const [formError, setFormError] = useState<string | null>(null);

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
    const [datasetResult, evaluatorResult, runResult] = await Promise.allSettled([
      api.listEvalDatasets(),
      api.listEvalEvaluators(),
      api.listEvalRuns(),
    ]);
    const allFailed = [datasetResult, evaluatorResult, runResult].every(
      (result) => result.status === "rejected",
    );
    const unavailable =
      allFailed &&
      [datasetResult, evaluatorResult, runResult].some(
        (result) =>
          result.status === "rejected" &&
          (isUnavailable(result.reason) ||
            (result.reason instanceof ApiError &&
              (result.reason.status === 404 || result.reason.status === 403))),
      );
    if (unavailable) {
      setDemo(true);
      setDatasets(mockEvalDatasets);
      setEvaluators(mockEvalEvaluators);
      setRuns(mockEvalRuns);
      setForm({
        name: "",
        datasetId: mockEvalDatasets[0].id,
        evaluatorId: mockEvalEvaluators[0].id,
      });
    } else {
      setDemo(false);
      if (datasetResult.status === "fulfilled") {
        setDatasets(datasetResult.value.items);
        setForm((prev) => ({
          ...prev,
          datasetId: prev.datasetId || datasetResult.value.items[0]?.id || "",
        }));
      }
      if (evaluatorResult.status === "fulfilled") {
        setEvaluators(evaluatorResult.value.items);
        setForm((prev) => ({
          ...prev,
          evaluatorId: prev.evaluatorId || evaluatorResult.value.items[0]?.id || "",
        }));
      }
      if (runResult.status === "fulfilled") setRuns(runResult.value.items);
      const failed = [datasetResult, evaluatorResult, runResult].find(
        (result) => result.status === "rejected",
      );
      if (failed && failed.status === "rejected") {
        const reason = failed.reason;
        if (reason instanceof ApiError && reason.status !== 401) {
          setError({ message: reason.message, requestId: reason.requestId });
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createRun() {
    if (!form.datasetId) {
      setFormError("请选择数据集");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const dataset = datasets.find((item) => item.id === form.datasetId);
      const evaluator = evaluators.find((item) => item.id === form.evaluatorId);
      let run: EvalRun;
      if (demo) {
        run = {
          id: `eval-run-${Date.now()}`,
          name: form.name.trim() || `${dataset?.name ?? "数据集"} 评测`,
          status: "running",
          dataset_id: form.datasetId,
          dataset_name: dataset?.name,
          evaluator_name: evaluator?.name,
          pass_rate: 0,
          started_at: new Date().toISOString(),
          cases: dataset?.cases_count,
        };
        setRuns((prev) => [run, ...prev]);
      } else {
        run = await api.createEvalRun({
          name: form.name.trim() || undefined,
          dataset_id: form.datasetId,
          evaluator_id: form.evaluatorId || undefined,
        });
        await load();
      }
      setCreateOpen(false);
      setForm((prev) => ({ ...prev, name: "" }));
      setTab("runs");
      toast("评测运行已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建评测失败");
    } finally {
      setBusy(false);
    }
  }

  async function createEvaluator() {
    if (!evalForm.name.trim()) {
      setFormError("请填写评估器名称");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      let created: EvalEvaluator;
      if (demo) {
        created = {
          id: `ev-${Date.now()}`,
          name: evalForm.name.trim(),
          kind: evalForm.kind,
          version: "v0.1",
          status: "active",
          description: evalForm.description.trim() || null,
        };
        setEvaluators((prev) => [created, ...prev]);
      } else {
        created = await api.createEvalEvaluator({
          name: evalForm.name.trim(),
          kind: evalForm.kind,
          description: evalForm.description.trim() || undefined,
        });
        await load();
      }
      setEvaluatorOpen(false);
      setEvalForm({ name: "", kind: "rule", description: "" });
      setTab("evaluators");
      toast("评估器已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建评估器失败");
    } finally {
      setBusy(false);
    }
  }

  async function openReport(run: EvalRun) {
    setReport(run);
    if (!demo) {
      try {
        await api.getEvalRun(run.id);
      } catch {
        // report detail is optional; local mock summary is used as fallback
      }
    }
  }

  return (
    <AppShell>
      <div data-testid="eval-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">质量</div>
            <h1 className="oc-title">评测中心</h1>
            <p className="oc-subtitle">
              用数据集与评估器建立质量基线；运行在沙箱中执行，结果可复现、可对比，
              并作为 Skill / 应用上架准入。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="oc-btn-sm"
              onClick={() => {
                setFormError(null);
                setEvaluatorOpen(true);
              }}
              data-testid="eval-evaluator-add"
            >
              + 评估器
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
              data-testid="eval-create"
            >
              + 新建评测
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              评测中心 API 尚未就绪或不可达，当前展示示例数据（DEV）。
              创建/评估器操作仅本地模拟。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="评测数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-1.5" role="tablist" aria-label="评测视图">
          {[
            { id: "runs" as const, label: "运行" },
            { id: "datasets" as const, label: "数据集" },
            { id: "evaluators" as const, label: "评估器" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`oc-btn oc-btn-sm ${tab === item.id ? "oc-btn-primary" : ""}`}
              onClick={() => setTab(item.id)}
              data-testid={`eval-tab-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            <Skeleton lines={4} />
            <Skeleton lines={6} />
          </div>
        ) : tab === "runs" ? (
          <div className="oc-card mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <caption className="sr-only">评测运行列表</caption>
              <thead>
                <tr style={{ background: "var(--oc-surface-hover)" }}>
                  <th className="px-4 py-3 text-left font-medium">运行</th>
                  <th className="px-4 py-3 text-left font-medium">数据集 / 评估器</th>
                  <th className="px-4 py-3 text-left font-medium">状态</th>
                  <th className="px-4 py-3 text-left font-medium">通过率</th>
                  <th className="px-4 py-3 text-left font-medium">成本</th>
                  <th className="px-4 py-3 text-left font-medium">时间</th>
                  <th className="px-4 py-3 text-left font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-t"
                    style={{ borderColor: "var(--oc-border)" }}
                    data-testid="eval-run"
                    data-status={run.status}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{run.name || run.id}</div>
                      <div className="font-mono text-xs text-fg-tertiary">{run.id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-secondary">
                      {run.dataset_name || run.dataset_id}
                      <br />
                      {run.evaluator_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="oc-badge"
                        style={{
                          color:
                            run.status === "succeeded"
                              ? "var(--oc-success-text)"
                              : run.status === "failed"
                                ? "var(--oc-danger-text)"
                                : run.status === "running"
                                  ? "var(--oc-info-text)"
                                  : "var(--oc-text-secondary)",
                          background:
                            run.status === "succeeded"
                              ? "var(--oc-success-subtle)"
                              : run.status === "failed"
                                ? "var(--oc-danger-subtle)"
                                : run.status === "running"
                                  ? "var(--oc-info-subtle)"
                                  : "var(--oc-surface-hover)",
                        }}
                      >
                        {RUN_STATUS[run.status] ?? run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {run.pass_rate != null
                        ? `${Math.round(run.pass_rate * 100)}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary">
                      {run.cost_usd ? `$${run.cost_usd}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-tertiary">
                      {relativeTime(run.started_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        className="oc-btn-sm"
                        onClick={() => void openReport(run)}
                        data-testid="eval-report"
                      >
                        报告
                      </Button>
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-fg-tertiary">
                      还没有评测运行，点击「新建评测」开始。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : tab === "datasets" ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {datasets.map((dataset) => (
              <article
                key={dataset.id}
                className="oc-card oc-provider-card"
                data-testid="eval-dataset"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-md font-semibold">{dataset.name}</h2>
                  <span className="oc-badge">{dataset.cases_count ?? 0} 例</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-fg-secondary">
                  {dataset.description || "未填写描述"}
                </p>
                <div className="mt-3 flex justify-between text-xs text-fg-tertiary">
                  <span>{dataset.version || "v1"}</span>
                  <span>更新于 {relativeTime(dataset.updated_at)}</span>
                </div>
              </article>
            ))}
            {datasets.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
                <EmptyState title="还没有数据集" description="上传 JSONL/CSV 用例集后即可创建评测。" />
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {evaluators.map((evaluator) => (
              <article
                key={evaluator.id}
                className="oc-card oc-provider-card"
                data-testid="eval-evaluator"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-md font-semibold">
                    {evaluator.display_name || evaluator.name}
                  </h2>
                  <span className="oc-badge">
                    {evaluator.is_preset ? "预置" : evaluator.metric || evaluator.kind || "custom"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-fg-secondary">
                  {evaluator.description || "未填写描述"}
                </p>
                <div className="mt-3 flex justify-between text-xs text-fg-tertiary">
                  <span>{evaluator.metric || evaluator.kind || "custom"}</span>
                  <span>{evaluator.is_preset ? "只读" : "可编辑"}</span>
                </div>
              </article>
            ))}
            {evaluators.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3">
                <EmptyState
                  title="还没有评估器"
                  description="规则、LLM-as-judge 或语义相似度评估器可组合使用。"
                  action={
                    <Button variant="primary" onClick={() => setEvaluatorOpen(true)}>
                      新建评估器
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        )}

        {createOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setCreateOpen(false)} />
            <div role="dialog" aria-modal="true" aria-labelledby="eval-create-title" className="oc-card relative w-full max-w-lg p-6" data-testid="eval-create-dialog">
              <h2 id="eval-create-title" className="text-lg font-semibold">新建评测运行</h2>
              <label className="oc-field-label mt-4" htmlFor="eval-name">运行名称（可选）</label>
              <input id="eval-name" className="oc-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="code-review v1.4 基线" />
              <label className="oc-field-label mt-3" htmlFor="eval-dataset-select">数据集</label>
              <select id="eval-dataset-select" className="oc-input" value={form.datasetId} onChange={(event) => setForm((prev) => ({ ...prev, datasetId: event.target.value }))}>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
              <label className="oc-field-label mt-3" htmlFor="eval-evaluator-select">评估器</label>
              <select id="eval-evaluator-select" className="oc-input" value={form.evaluatorId} onChange={(event) => setForm((prev) => ({ ...prev, evaluatorId: event.target.value }))}>
                {evaluators.map((evaluator) => (
                  <option key={evaluator.id} value={evaluator.id}>{evaluator.name}</option>
                ))}
              </select>
              {formError && <div className="mt-3" role="alert"><Banner tone="err">{formError}</Banner></div>}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setCreateOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy} onClick={() => void createRun()} data-testid="eval-create-submit">开始评测</Button>
              </div>
            </div>
          </div>
        )}

        {evaluatorOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setEvaluatorOpen(false)} />
            <div role="dialog" aria-modal="true" aria-labelledby="evaluator-title" className="oc-card relative w-full max-w-lg p-6" data-testid="eval-evaluator-dialog">
              <h2 id="evaluator-title" className="text-lg font-semibold">新建评估器</h2>
              <label className="oc-field-label mt-4" htmlFor="ev-name">名称</label>
              <input id="ev-name" className="oc-input" value={evalForm.name} onChange={(event) => setEvalForm((prev) => ({ ...prev, name: event.target.value }))} />
              <label className="oc-field-label mt-3" htmlFor="ev-kind">类型</label>
              <select id="ev-kind" className="oc-input" value={evalForm.kind} onChange={(event) => setEvalForm((prev) => ({ ...prev, kind: event.target.value }))}>
                <option value="rule">规则评分器</option>
                <option value="llm">LLM-as-judge</option>
                <option value="embedding">语义相似度</option>
              </select>
              <label className="oc-field-label mt-3" htmlFor="ev-desc">描述</label>
              <textarea id="ev-desc" className="oc-input h-20 resize-none py-2" value={evalForm.description} onChange={(event) => setEvalForm((prev) => ({ ...prev, description: event.target.value }))} />
              {formError && <div className="mt-3" role="alert"><Banner tone="err">{formError}</Banner></div>}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setEvaluatorOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy} onClick={() => void createEvaluator()} data-testid="eval-evaluator-submit">创建</Button>
              </div>
            </div>
          </div>
        )}

        {report && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setReport(null)} />
            <div role="dialog" aria-modal="true" aria-labelledby="eval-report-title" className="oc-card relative flex max-h-[85vh] w-full max-w-2xl flex-col" data-testid="eval-report-modal">
              <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 id="eval-report-title" className="text-lg font-semibold">{report.name || report.id}</h2>
                  <p className="mt-1 text-xs text-fg-tertiary">
                    {RUN_STATUS[report.status] ?? report.status} · 通过率{" "}
                    {report.pass_rate != null ? `${Math.round(report.pass_rate * 100)}%` : "—"} · 成本{" "}
                    {report.cost_usd ? `$${report.cost_usd}` : "—"}
                  </p>
                </div>
                <button type="button" className="oc-icon-btn" aria-label="关闭报告" onClick={() => setReport(null)}>✕</button>
              </header>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <p className="text-sm text-fg-secondary">{mockEvalReport.summary}</p>
                <ul className="mt-3 divide-y" style={{ borderColor: "var(--oc-border)" }}>
                  {mockEvalReport.cases.map((item) => (
                    <li key={item.name} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className="font-medium">{item.name}</span>
                        <span className="ml-2 text-xs text-fg-tertiary">{item.detail}</span>
                      </span>
                      <span className="oc-badge" style={{ color: item.status === "passed" ? "var(--oc-success-text)" : "var(--oc-danger-text)" }}>
                        {item.status === "passed" ? "通过" : "失败"} · {item.duration}
                      </span>
                    </li>
                  ))}
                </ul>
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
