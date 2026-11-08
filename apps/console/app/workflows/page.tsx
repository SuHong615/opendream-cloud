"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockHumanTasks,
  mockRunDetails,
  mockWorkflowDefinitions,
  mockWorkflowRuns,
  mockWorkflowTemplates,
} from "@/lib/workflow-mock";
import {
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_STATUS_TONE,
  type HumanTask,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowTemplate,
} from "@/lib/workflow-types";

type Tab = "definitions" | "runs" | "inbox";
type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

const CATEGORIES = ["SDLC", "通用", "客服", "数据", "自定义"];

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

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className="oc-badge"
      style={toneStyle(WORKFLOW_STATUS_TONE[status] ?? "muted")}
      data-testid="workflow-status"
      data-status={status}
    >
      {WORKFLOW_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function slaText(iso?: string): { text: string; overdue: boolean } {
  if (!iso) return { text: "无 SLA", overdue: false };
  const diff = new Date(iso).getTime() - Date.now();
  const overdue = diff < 0;
  const abs = Math.abs(diff);
  const hours = Math.floor(abs / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  return {
    text: overdue
      ? `已超时 ${hours ? `${hours} 小时 ` : ""}${minutes} 分钟`
      : `剩余 ${hours ? `${hours} 小时 ` : ""}${minutes} 分钟`,
    overdue,
  };
}

export default function WorkflowsPage() {
  const [tab, setTab] = useState<Tab>("definitions");
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [tasks, setTasks] = useState<HumanTask[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<WorkflowRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [decision, setDecision] = useState<{
    task: HumanTask;
    decision: "approve" | "reject";
  } | null>(null);
  const [decisionComment, setDecisionComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    templateId: "",
    name: "",
    display_name: "",
    category: "SDLC",
    description: "",
    is_template: false,
  });
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [startForm, setStartForm] = useState({
    workflowId: "",
    version: "",
    target: "",
    environment: "staging",
    note: "",
  });
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
    const [defResult, runResult, taskResult] = await Promise.allSettled([
      api.listWorkflows(),
      api.listWorkflowRuns(),
      api.listHumanTasks(),
    ]);
    const allFailed = [defResult, runResult, taskResult].every(
      (result) => result.status === "rejected",
    );
    const unavailable =
      allFailed &&
      [defResult, runResult, taskResult].some(
        (result) =>
          result.status === "rejected" &&
          (isUnavailable(result.reason) ||
            (result.reason instanceof ApiError &&
              (result.reason.status === 404 || result.reason.status === 403))),
      );
    if (unavailable) {
      setDemo(true);
      setDefinitions(mockWorkflowDefinitions);
      setRuns(mockWorkflowRuns);
      setTasks(mockHumanTasks);
    } else {
      setDemo(false);
      if (defResult.status === "fulfilled") setDefinitions(defResult.value.items);
      if (runResult.status === "fulfilled") setRuns(runResult.value.items);
      if (taskResult.status === "fulfilled") setTasks(taskResult.value.items);
      const failed = [defResult, runResult, taskResult].find(
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

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    api
      .listWorkflowTemplates()
      .then((result) => {
        if (!cancelled) setTemplates(result.items);
      })
      .catch(() => {
        if (!cancelled) setTemplates(mockWorkflowTemplates);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const openRun = useCallback(
    async (runId: string) => {
      setSelectedRunId(runId);
      setDetailLoading(true);
      try {
        if (demo) {
          setRunDetail(mockRunDetails[runId] ?? mockWorkflowRuns.find((r) => r.id === runId) ?? null);
        } else {
          setRunDetail(await api.getWorkflowRun(runId));
        }
      } catch {
        setRunDetail(mockRunDetails[runId] ?? null);
      } finally {
        setDetailLoading(false);
      }
    },
    [demo],
  );

  async function createWorkflow() {
    if (!form.templateId && (!form.name.trim() || !form.display_name.trim())) {
      setFormError("请选择模板，或填写名称与展示名");
      return;
    }
    setBusy("create");
    setFormError(null);
    try {
      const template = templates.find((item) => item.id === form.templateId);
      const slug = form.name.trim()
        ? form.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64)
        : "";
      const workflowSlug = slug || `workflow-${Date.now().toString(36)}`;
      let created: WorkflowDefinition;
      if (demo) {
        created = {
          id: `wf-${Date.now()}`,
          name: template?.name ?? workflowSlug,
          display_name:
            template?.display_name || form.display_name.trim() || form.name.trim(),
          description: template?.description || form.description.trim() || null,
          category: template?.category || form.category,
          is_template: form.is_template,
          status: template ? "published" : "draft",
          latest_version: template ? "1.0.0" : null,
          node_count: template ? 6 : 3,
          updated_at: new Date().toISOString(),
        };
      } else {
        created = await api.createWorkflow(
          form.templateId
            ? { template_id: form.templateId, visibility: "org" }
            : {
                slug: workflowSlug,
                name: form.display_name.trim() || form.name.trim(),
                display_name: form.display_name.trim() || form.name.trim(),
                description: form.description.trim() || undefined,
                category: form.category === "SDLC" ? "sdlc" : "general",
                is_template: form.is_template,
              },
        );
      }
      setDefinitions((prev) => [created, ...prev]);
      setCreateOpen(false);
      setForm({
        templateId: "",
        name: "",
        display_name: "",
        category: "SDLC",
        description: "",
        is_template: false,
      });
      toast(template ? "已从模板创建工作流（自动发布 1.0.0）" : "工作流草稿已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建工作流失败");
    } finally {
      setBusy(null);
    }
  }

  async function publish(definition: WorkflowDefinition) {
    if (!definition.latest_version) {
      toast("草稿还没有可发布版本", "err");
      return;
    }
    setBusy(`publish-${definition.id}`);
    try {
      if (demo) {
        setDefinitions((prev) =>
          prev.map((item) =>
            item.id === definition.id ? { ...item, status: "published" } : item,
          ),
        );
      } else {
        const updated = await api.publishWorkflow(
          definition.id,
          definition.latest_version,
        );
        setDefinitions((prev) =>
          prev.map((item) => (item.id === definition.id ? updated : item)),
        );
      }
      toast(`已发布 ${definition.display_name || definition.name} ${definition.latest_version}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "发布失败", "err");
    } finally {
      setBusy(null);
    }
  }

  function openStart(definition?: WorkflowDefinition) {
    const target =
      definition ??
      definitions.find((item) => item.status === "published") ??
      definitions[0];
    setStartForm({
      workflowId: target?.id ?? "",
      version: target?.latest_version ?? "",
      target: "",
      environment: "staging",
      note: "",
    });
    setFormError(null);
    setStartOpen(true);
  }

  async function startRun() {
    if (!startForm.workflowId) {
      setFormError("请选择工作流");
      return;
    }
    setBusy("start");
    setFormError(null);
    const definition = definitions.find((item) => item.id === startForm.workflowId);
    try {
      let runId: string;
      if (demo) {
        runId = `run-${Date.now()}`;
        const run: WorkflowRun = {
          id: runId,
          workflow_id: startForm.workflowId,
          workflow_name: definition?.display_name || definition?.name,
          version: startForm.version || definition?.latest_version || "v0.1.0",
          status: "running",
          trigger_type: "manual",
          inputs: {
            target: startForm.target,
            environment: startForm.environment,
            ...(startForm.note ? { note: startForm.note } : {}),
          },
          started_at: new Date().toISOString(),
          steps: [
            {
              node_id: "parse",
              node_type: "script",
              name: "解析输入",
              status: "running",
              attempt: 1,
              started_at: new Date().toISOString(),
            },
          ],
          artifacts: [],
        };
        setRuns((prev) => [run, ...prev]);
      } else {
        const result = await api.startWorkflowRun({
          workflow_id: startForm.workflowId,
          version: startForm.version.trim() || undefined,
          inputs: {
            target: startForm.target,
            environment: startForm.environment,
            ...(startForm.note ? { note: startForm.note } : {}),
          },
          trigger: "manual",
        });
        runId = result.run_id;
      }
      setStartOpen(false);
      toast("运行已启动");
      setTab("runs");
      await openRun(runId);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "启动运行失败");
    } finally {
      setBusy(null);
    }
  }

  async function cancelRun(run: WorkflowRun) {
    setBusy(`cancel-${run.id}`);
    try {
      if (demo) {
        const next = { ...run, status: "canceled" as const, ended_at: new Date().toISOString() };
        setRuns((prev) => prev.map((item) => (item.id === run.id ? next : item)));
        setRunDetail((prev) => (prev && prev.id === run.id ? { ...prev, ...next } : prev));
      } else {
        const updated = await api.cancelWorkflowRun(run.id);
        setRuns((prev) => prev.map((item) => (item.id === run.id ? updated : item)));
        setRunDetail(updated);
      }
      toast("运行已取消");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "取消失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function retryRun(run: WorkflowRun) {
    setBusy(`retry-${run.id}`);
    try {
      if (demo) {
        const next: WorkflowRun = {
          ...run,
          id: `run-${Date.now()}`,
          status: "running",
          started_at: new Date().toISOString(),
          ended_at: null,
          error_reason: null,
        };
        setRuns((prev) => [next, ...prev]);
        toast("已创建重放运行");
        setSelectedRunId(next.id);
        setRunDetail(next);
      } else {
        const result = await api.retryWorkflowRun(run.id);
        toast("已创建重放运行");
        await load();
        await openRun(result.run_id);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "重试失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function submitDecision() {
    if (!decision) return;
    const { task, decision: choice } = decision;
    setBusy(`decision-${task.id}`);
    try {
      if (!demo) {
        await api.decideHumanTask(task.id, choice, decisionComment || undefined);
      }
      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: choice === "approve" ? "approved" : "rejected",
                decision: choice,
                comment: decisionComment || undefined,
              }
            : item,
        ),
      );
      toast(choice === "approve" ? "已批准人工任务" : "已驳回人工任务", choice === "approve" ? "ok" : "info");
      setDecision(null);
      setDecisionComment("");
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "人工决策失败",
        "err",
      );
    } finally {
      setBusy(null);
    }
  }

  const pendingTasks = tasks.filter((task) => task.status === "pending");
  const runningRuns = runs.filter((run) =>
    ["running", "waiting_human", "pending", "compensating"].includes(run.status),
  );

  return (
    <AppShell>
      <div data-testid="workflows-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">自动化</div>
            <h1 className="oc-title">工作流中心</h1>
            <p className="oc-subtitle">
              把 Agent、MCP 工具与人工审批编排成可复用流程；运行可观测、可取消、可重放，
              人工任务统一走收件箱与 SLA。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setFormError(null);
                setCreateOpen(true);
              }}
              data-testid="workflow-create"
            >
              + 新建工作流
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              工作流 API 尚未就绪或不可达，当前展示示例数据（DEV）。发布/运行/审批仅本地模拟。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="工作流数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton lines={4} />
            <Skeleton lines={6} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="oc-stat">
                <span className="oc-stat-label">工作流定义</span>
                <strong className="oc-stat-value">{definitions.length}</strong>
                <span className="oc-stat-hint">
                  已发布 {definitions.filter((item) => item.status === "published").length}
                </span>
              </div>
              <div className="oc-stat">
                <span className="oc-stat-label">活跃运行</span>
                <strong className="oc-stat-value">{runningRuns.length}</strong>
                <span className="oc-stat-hint">运行中 / 等待人工 / 补偿</span>
              </div>
              <div className="oc-stat">
                <span className="oc-stat-label">待办人工任务</span>
                <strong className="oc-stat-value" style={{ color: pendingTasks.length ? "var(--oc-warning-text)" : undefined }}>
                  {pendingTasks.length}
                </strong>
                <span className="oc-stat-hint">含 SLA 超时任务</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-1.5" role="tablist" aria-label="工作流视图">
              {[
                { id: "definitions" as const, label: "模板与定义" },
                { id: "runs" as const, label: "运行" },
                { id: "inbox" as const, label: `人工任务${pendingTasks.length ? `（${pendingTasks.length}）` : ""}` },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  className={`oc-btn oc-btn-sm ${tab === item.id ? "oc-btn-primary" : ""}`}
                  onClick={() => setTab(item.id)}
                  data-testid={`workflow-tab-${item.id}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "definitions" && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {definitions.map((definition) => (
                  <article
                    key={definition.id}
                    className="oc-card oc-provider-card"
                    data-testid="workflow-card"
                    data-workflow-id={definition.id}
                    data-status={definition.status}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-md font-semibold">
                          {definition.display_name || definition.name}
                        </h2>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="oc-badge">{definition.category || "自定义"}</span>
                          {definition.is_template && <span className="oc-badge">模板</span>}
                          <StatusPill status={definition.status} />
                        </div>
                      </div>
                      <span className="text-xs text-fg-tertiary">
                        {definition.latest_version ||
                          (definition.latest_version_id ? "latest" : "无版本")}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm text-fg-secondary">
                      {definition.description || "尚未填写描述"}
                    </p>
                    <div className="mt-3 flex gap-3 text-xs text-fg-tertiary">
                      <span>{definition.node_count ?? "—"} 个节点</span>
                      <span>更新于 {relativeTime(definition.updated_at)}</span>
                    </div>
                    <div
                      className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3"
                      style={{ borderColor: "var(--oc-border)" }}
                    >
                      <Button
                        className="oc-btn-sm"
                        onClick={() => void publish(definition)}
                        loading={busy === `publish-${definition.id}`}
                        disabled={definition.status !== "draft"}
                        data-testid="workflow-publish"
                      >
                        发布
                      </Button>
                      <Button
                        className="oc-btn-sm"
                        variant="primary"
                        onClick={() => openStart(definition)}
                        disabled={
                          !definition.latest_version &&
                          !definition.latest_version_id &&
                          definition.status !== "published"
                        }
                        title={
                          definition.latest_version ||
                          definition.latest_version_id ||
                          definition.status === "published"
                            ? undefined
                            : "该定义还没有可运行版本，请先发布 DSL 版本"
                        }
                        data-testid="workflow-start"
                      >
                        发起运行
                      </Button>
                    </div>
                  </article>
                ))}
                {definitions.length === 0 && (
                  <div className="sm:col-span-2 xl:col-span-3">
                    <EmptyState
                      title="还没有工作流"
                      description="从 SDLC 或通用模板创建第一个工作流，把 Agent、工具与人工审批串起来。"
                      action={
                        <Button variant="primary" onClick={() => setCreateOpen(true)}>
                          新建工作流
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
            )}

            {tab === "runs" && (
              <div className="mt-5 grid gap-5 lg:grid-cols-5">
                <div className="space-y-3 lg:col-span-2">
                  <div className="oc-card overflow-hidden">
                    <ul className="divide-y" style={{ borderColor: "var(--oc-border)" }}>
                      {runs.map((run) => (
                        <li key={run.id}>
                          <button
                            type="button"
                            className={`w-full px-4 py-3 text-left hover:bg-hover ${
                              selectedRunId === run.id ? "bg-hover" : ""
                            }`}
                            onClick={() => void openRun(run.id)}
                            data-testid="workflow-run"
                            data-run-id={run.id}
                            data-status={run.status}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-medium">
                                {run.workflow_name || run.workflow_id}
                              </span>
                              <StatusPill status={run.status} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                              <span className="font-mono">{run.id}</span>
                              <span>{run.version}</span>
                              <span>{relativeTime(run.started_at)}</span>
                            </div>
                          </button>
                        </li>
                      ))}
                      {runs.length === 0 && (
                        <li className="px-4 py-6 text-center text-sm text-fg-tertiary">
                          暂无运行，先从模板发起一次。
                        </li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="lg:col-span-3">
                  {!selectedRunId ? (
                    <EmptyState
                      title="选择一个运行"
                      description="查看节点时间线、状态、产物与错误/补偿信息，并可取消或重放。"
                      action={
                        <Button variant="primary" onClick={() => openStart()}>
                          发起运行
                        </Button>
                      }
                    />
                  ) : detailLoading || !runDetail ? (
                    <Skeleton lines={8} />
                  ) : (
                    <section className="oc-card p-5" data-testid="workflow-run-detail">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <StatusPill status={runDetail.status} />
                            <h2 className="text-md font-semibold">
                              {runDetail.workflow_name || runDetail.workflow_id}
                            </h2>
                          </div>
                          <p className="mt-1 font-mono text-xs text-fg-tertiary">
                            {runDetail.id} · {runDetail.version} ·{" "}
                            {relativeTime(runDetail.started_at)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {["running", "waiting_human", "pending"].includes(runDetail.status) && (
                            <Button
                              className="oc-btn-sm"
                              variant="danger"
                              loading={busy === `cancel-${runDetail.id}`}
                              onClick={() => void cancelRun(runDetail)}
                              data-testid="workflow-cancel"
                            >
                              取消
                            </Button>
                          )}
                          {["failed", "canceled"].includes(runDetail.status) && (
                            <Button
                              className="oc-btn-sm"
                              loading={busy === `retry-${runDetail.id}`}
                              onClick={() => void retryRun(runDetail)}
                              data-testid="workflow-retry"
                            >
                              重放
                            </Button>
                          )}
                        </div>
                      </div>

                      {runDetail.error_reason && (
                        <div className="mt-3">
                          <Banner tone="err">
                            运行失败：{runDetail.error_reason}
                            。可查看下方节点错误并重放；补偿失败会创建人工处置任务。
                          </Banner>
                        </div>
                      )}

                      <h3 className="mt-5 text-sm font-medium">节点时间线</h3>
                      <ol className="mt-3 space-y-0">
                        {(runDetail.steps ?? []).map((step, index) => {
                          const tone = WORKFLOW_STATUS_TONE[step.status] ?? "muted";
                          const style = toneStyle(tone);
                          return (
                            <li
                              key={`${step.node_id}-${index}`}
                              className="relative flex gap-3 pb-4"
                              data-testid="workflow-node"
                              data-status={step.status}
                            >
                              <span className="flex flex-col items-center">
                                <span
                                  className="grid h-6 w-6 place-items-center rounded-full text-2xs font-semibold"
                                  style={style}
                                  aria-hidden="true"
                                >
                                  {index + 1}
                                </span>
                                {index < (runDetail.steps?.length ?? 0) - 1 && (
                                  <span
                                    className="mt-1 w-px flex-1"
                                    style={{ background: "var(--oc-border)" }}
                                  />
                                )}
                              </span>
                              <div className="min-w-0 flex-1 rounded-lg border px-3 py-2" style={{ borderColor: "var(--oc-border)" }}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-medium">
                                    {step.name || step.node_id}
                                    <span className="ml-2 font-mono text-2xs text-fg-tertiary">
                                      {step.node_type}
                                    </span>
                                  </span>
                                  <span className="oc-badge" style={style}>
                                    {WORKFLOW_STATUS_LABEL[step.status] ?? step.status}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                                  {step.attempt ? <span>attempt {step.attempt}</span> : null}
                                  {step.duration_ms != null && (
                                    <span>{Math.round(step.duration_ms / 1000)}s</span>
                                  )}
                                  {step.output && <span>产物：{step.output}</span>}
                                  {step.error_reason && (
                                    <span style={{ color: "var(--oc-danger-text)" }}>
                                      {step.error_reason}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                        {(runDetail.steps?.length ?? 0) === 0 && (
                          <li className="text-sm text-fg-tertiary">暂无节点状态</li>
                        )}
                      </ol>

                      <h3 className="mt-4 text-sm font-medium">产物</h3>
                      <ul className="mt-2 space-y-1.5">
                        {(runDetail.artifacts ?? []).map((artifact) => (
                          <li
                            key={artifact.id}
                            className="flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2 text-xs"
                            style={{ background: "var(--oc-surface-hover)" }}
                          >
                            <span className="oc-badge">{artifact.kind}</span>
                            <span className="min-w-0 flex-1 truncate font-mono">
                              {artifact.uri}
                            </span>
                            {artifact.size != null && (
                              <span className="text-fg-tertiary">
                                {(artifact.size / 1024).toFixed(1)} KB
                              </span>
                            )}
                          </li>
                        ))}
                        {(runDetail.artifacts?.length ?? 0) === 0 && (
                          <li className="text-sm text-fg-tertiary">暂无产物</li>
                        )}
                      </ul>
                    </section>
                  )}
                </div>
              </div>
            )}

            {tab === "inbox" && (
              <div className="mt-5 space-y-3">
                {tasks.map((task) => {
                  const sla = slaText(task.sla_due_at);
                  return (
                    <article
                      key={task.id}
                      className="oc-card p-4"
                      data-testid="human-task"
                      data-task-id={task.id}
                      data-status={task.status}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={task.status} />
                            <h2 className="text-sm font-medium">{task.title}</h2>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                            <span>来源：{task.source || "workflow"}</span>
                            <span>流程：{task.workflow_name || "—"}</span>
                            <span>指派：{task.assignee_name || task.assignee_type || "—"}</span>
                            <span className="font-mono">{task.run_id || task.subject_id || ""}</span>
                          </div>
                          {task.comment && (
                            <p className="mt-2 text-xs text-fg-secondary">决策备注：{task.comment}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span
                            className="oc-badge"
                            style={toneStyle(sla.overdue ? "err" : "warn")}
                          >
                            {sla.text}
                          </span>
                          {task.status === "pending" && (
                            <div className="flex gap-2">
                              <Button
                                className="oc-btn-sm"
                                variant="primary"
                                onClick={() => {
                                  setDecision({ task, decision: "approve" });
                                  setDecisionComment("");
                                }}
                                data-testid="human-approve"
                              >
                                批准
                              </Button>
                              <Button
                                className="oc-btn-sm"
                                variant="danger"
                                onClick={() => {
                                  setDecision({ task, decision: "reject" });
                                  setDecisionComment("");
                                }}
                                data-testid="human-reject"
                              >
                                驳回
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
                {tasks.length === 0 && (
                  <EmptyState
                    title="没有人工待办"
                    description="工作流与协同产生的审批会统一进入这里，并按 SLA 提醒/升级。"
                  />
                )}
              </div>
            )}
          </>
        )}

        {createOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 bg-black/45"
              onClick={() => setCreateOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="workflow-create-title"
              className="oc-card relative w-full max-w-lg p-6"
              data-testid="workflow-create-dialog"
            >
              <h2 id="workflow-create-title" className="text-lg font-semibold">
                新建工作流
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                选择模板会创建并自动发布 1.0.0；也可以从空白草稿开始。
              </p>
              <label className="oc-field-label mt-4" htmlFor="wf-template">
                从模板创建（可选）
              </label>
              <select
                id="wf-template"
                className="oc-input"
                value={form.templateId}
                onChange={(event) => {
                  const template = templates.find((item) => item.id === event.target.value);
                  setForm((prev) => ({
                    ...prev,
                    templateId: event.target.value,
                    name: template?.name ?? prev.name,
                    display_name: template?.display_name ?? prev.display_name,
                    category: template?.category ?? prev.category,
                    description: template?.description ?? prev.description,
                  }));
                }}
              >
                <option value="">不使用模板（空白草稿）</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.category} · {template.display_name}
                  </option>
                ))}
              </select>
              <label className="oc-field-label mt-3" htmlFor="wf-name">
                标识（slug，可选）{form.templateId ? "（模板已填）" : ""}
              </label>
              <input
                id="wf-name"
                className="oc-input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="release-gate"
              />
              <p className="mt-1 text-xs text-fg-tertiary">仅支持小写字母/数字/短横线；留空或中文会自动生成 slug。</p>
              <label className="oc-field-label mt-3" htmlFor="wf-display">
                展示名
              </label>
              <input
                id="wf-display"
                className="oc-input"
                value={form.display_name}
                onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
                placeholder="发布审批门禁"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="oc-field-label">分类</span>
                  <select
                    className="oc-input"
                    value={form.category}
                    onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-7 flex items-center gap-2 text-sm text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={form.is_template}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, is_template: event.target.checked }))
                    }
                  />
                  作为模板
                </label>
              </div>
              <label className="oc-field-label mt-3" htmlFor="wf-desc">
                描述
              </label>
              <textarea
                id="wf-desc"
                className="oc-input h-20 resize-none py-2"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="流程目标、关键节点与人工门禁"
              />
              {formError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{formError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setCreateOpen(false)}>取消</Button>
                <Button
                  variant="primary"
                  loading={busy === "create"}
                  onClick={() => void createWorkflow()}
                  data-testid="workflow-create-submit"
                >
                  创建草稿
                </Button>
              </div>
            </div>
          </div>
        )}

        {startOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 bg-black/45"
              onClick={() => setStartOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="workflow-start-title"
              className="oc-card relative w-full max-w-lg p-6"
              data-testid="workflow-start-dialog"
            >
              <h2 id="workflow-start-title" className="text-lg font-semibold">
                发起工作流运行
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                选择已发布版本并填写 inputs；运行进入后台，可在「运行」页跟踪节点。
              </p>
              <label className="oc-field-label mt-4" htmlFor="wf-select">
                工作流
              </label>
              <select
                id="wf-select"
                className="oc-input"
                value={startForm.workflowId}
                onChange={(event) => {
                  const definition = definitions.find((item) => item.id === event.target.value);
                  setStartForm((prev) => ({
                    ...prev,
                    workflowId: event.target.value,
                    version: definition?.latest_version ?? prev.version,
                  }));
                }}
              >
                {definitions.map((definition) => (
                  <option key={definition.id} value={definition.id}>
                    {definition.display_name || definition.name} · {definition.latest_version || "无版本"}
                  </option>
                ))}
              </select>
              <label className="oc-field-label mt-3" htmlFor="wf-version">
                版本（留空使用最新版本）
              </label>
              <input
                id="wf-version"
                className="oc-input font-mono"
                value={startForm.version}
                onChange={(event) => setStartForm((prev) => ({ ...prev, version: event.target.value }))}
                placeholder="latest"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="oc-field-label">目标</span>
                  <input
                    className="oc-input"
                    value={startForm.target}
                    onChange={(event) => setStartForm((prev) => ({ ...prev, target: event.target.value }))}
                    placeholder="应用 / 仓库 / 工单号"
                  />
                </label>
                <label className="block">
                  <span className="oc-field-label">环境</span>
                  <select
                    className="oc-input"
                    value={startForm.environment}
                    onChange={(event) => setStartForm((prev) => ({ ...prev, environment: event.target.value }))}
                  >
                    <option value="dev">dev</option>
                    <option value="staging">staging</option>
                    <option value="prod">prod</option>
                  </select>
                </label>
              </div>
              <label className="oc-field-label mt-3" htmlFor="wf-note">
                备注（可选）
              </label>
              <input
                id="wf-note"
                className="oc-input"
                value={startForm.note}
                onChange={(event) => setStartForm((prev) => ({ ...prev, note: event.target.value }))}
              />
              {formError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{formError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setStartOpen(false)}>取消</Button>
                <Button
                  variant="primary"
                  loading={busy === "start"}
                  onClick={() => void startRun()}
                  data-testid="workflow-start-submit"
                >
                  发起运行
                </Button>
              </div>
            </div>
          </div>
        )}

        {decision && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 bg-black/45"
              onClick={() => setDecision(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="human-decision-title"
              className="oc-card relative w-full max-w-md p-6"
              data-testid="human-decision-dialog"
            >
              <h2 id="human-decision-title" className="text-lg font-semibold">
                {decision.decision === "approve" ? "批准" : "驳回"}人工任务
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">{decision.task.title}</p>
              <label className="oc-field-label mt-4" htmlFor="decision-comment">
                备注（可选）
              </label>
              <textarea
                id="decision-comment"
                className="oc-input h-20 resize-none py-2"
                value={decisionComment}
                onChange={(event) => setDecisionComment(event.target.value)}
                placeholder="决策依据 / 后续要求"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setDecision(null)}>取消</Button>
                <Button
                  variant={decision.decision === "approve" ? "primary" : "danger"}
                  loading={busy === `decision-${decision.task.id}`}
                  onClick={() => void submitDecision()}
                  data-testid="human-decision-confirm"
                >
                  确认{decision.decision === "approve" ? "批准" : "驳回"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 right-6 z-[80] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((item) => (
            <div
              key={item.id}
              className="oc-toast"
              data-testid="toast"
              data-tone={item.tone}
              style={{
                borderLeftColor:
                  item.tone === "ok"
                    ? "var(--oc-success)"
                    : item.tone === "err"
                      ? "var(--oc-danger)"
                      : "var(--oc-info)",
              }}
            >
              <span aria-hidden="true">
                {item.tone === "ok" ? "✓" : item.tone === "err" ? "!" : "i"}
              </span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
