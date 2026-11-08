"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import { mockRuns, mockSchedules, mockSquads } from "@/lib/workforce-mock";
import {
  ORCHESTRATION_LABEL,
  RUN_STATUS_LABEL,
  TASK_STATUS_LABEL,
  type AgentRun,
  type AgentSchedule,
  type AgentSquad,
} from "@/lib/workforce-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

function statusTone(status: string) {
  return status === "completed"
    ? "ok"
    : status === "failed"
      ? "err"
      : status === "waiting_human"
        ? "warn"
        : status === "canceled"
          ? "muted"
          : "info";
}

function toneStyle(tone: string) {
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

export default function SquadsPage() {
  const [squads, setSquads] = useState<AgentSquad[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    name: "",
    squad_id: "",
    goal: "",
    interval_minutes: "60",
    enabled: true,
  });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [startSquad, setStartSquad] = useState<AgentSquad | null>(null);
  const [goal, setGoal] = useState("");
  const [appId, setAppId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [squadResult, runResult, scheduleResult] = await Promise.allSettled([
      api.listAgentSquads(),
      api.listAgentRuns(),
      api.listAgentSchedules(),
    ]);
    const allFailed = [squadResult, runResult, scheduleResult].every(
      (result) => result.status === "rejected",
    );
    const unavailable =
      allFailed &&
      [squadResult, runResult, scheduleResult].some(
        (result) =>
          result.status === "rejected" &&
          (isUnavailable(result.reason) ||
            (result.reason instanceof ApiError && result.reason.status === 404)),
      );
    if (unavailable) {
      setDemo(true);
      setSquads(mockSquads);
      setRuns(mockRuns);
                setSchedules(mockSchedules);
      setSchedules(mockSchedules);
    } else {
      setDemo(false);
      if (squadResult.status === "fulfilled") setSquads(squadResult.value.items);
      if (runResult.status === "fulfilled") setRuns(runResult.value.items);
      if (scheduleResult.status === "fulfilled")
        setSchedules(scheduleResult.value.items);
      const failed = [squadResult, runResult, scheduleResult].find(
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

  const openRun = useCallback(
    async (runId: string) => {
      setSelectedRunId(runId);
      setDetailLoading(true);
      try {
        if (demo) {
          setRunDetail(mockRuns.find((run) => run.id === runId) ?? null);
        } else {
          setRunDetail(await api.getAgentRun(runId));
        }
      } catch {
        setRunDetail(mockRuns.find((run) => run.id === runId) ?? null);
      } finally {
        setDetailLoading(false);
      }
    },
    [demo],
  );

  // Poll active runs so task/message/approval changes show up.
  useEffect(() => {
    if (!selectedRunId || demo) return;
    if (!runDetail || !["running", "waiting_human"].includes(runDetail.status)) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.getAgentRun(selectedRunId);
        setRunDetail(next);
        setRuns((prev) => prev.map((run) => (run.id === next.id ? next : run)));
      } catch {
        // ignore transient polling errors
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [demo, runDetail, selectedRunId]);

  function openStart(squad: AgentSquad) {
    setStartSquad(squad);
    setGoal("");
    setAppId(squad.app_ids[0] ?? "");
    setFormError(null);
    setStartOpen(true);
  }

  async function startRun() {
    if (!startSquad) return;
    if (goal.trim().length < 3) {
      setFormError("请描述小队要达成的目标（至少 3 个字符）");
      return;
    }
    setBusy("start");
    setFormError(null);
    try {
      let run: AgentRun;
      if (demo) {
        const now = new Date().toISOString();
        run = {
          id: `run-${Date.now()}`,
          squad_id: startSquad.id,
          squad_name: startSquad.name,
          goal: goal.trim(),
          app_id: appId || null,
          status: "running",
          created_at: now,
          tasks: [
            ...(startSquad.lead
              ? [
                  {
                    id: `task-${Date.now()}`,
                    employee_id: startSquad.lead.id,
                    employee_name: startSquad.lead.name,
                    title: `拆解目标并分派：${goal.trim().slice(0, 40)}`,
                    status: "completed",
                    output: "已拆解目标并分派给成员，等待执行。",
                    started_at: now,
                    finished_at: now,
                  },
                ]
              : []),
            ...(startSquad.members ?? []).map((member) => ({
              id: `task-${member.id}`,
              employee_id: member.id,
              employee_name: member.name,
              title: "完成专业任务并提交产物",
              status: "queued" as const,
              output: null,
              started_at: null,
              finished_at: null,
            })),
          ],
          messages: startSquad.lead
            ? [
                {
                  id: `msg-${Date.now()}`,
                  employee_id: startSquad.lead.id,
                  employee_name: startSquad.lead.name,
                  role: "lead",
                  content: `收到目标「${goal.trim()}」，开始编排小队。`,
                  created_at: now,
                },
              ]
            : [],
          artifacts: [],
          approvals: startSquad.human_gates.map((gate) => ({
            gate,
            requested_at: now,
            decided_at: null,
            decision: null,
          })),
          usage: { tokens: 0, cost_usd: 0 },
        };
        setRuns((prev) => [run, ...prev]);
      } else {
        run = await api.startAgentSquadRun(startSquad.id, {
          goal: goal.trim(),
          app_id: appId || undefined,
        });
        setRuns((prev) => [run, ...prev]);
      }
      setStartOpen(false);
      setSelectedRunId(run.id);
      setRunDetail(run);
      toast("小队运行已启动");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "启动小队失败");
    } finally {
      setBusy(null);
    }
  }

  function openSchedule() {
    setScheduleForm({
      name: "",
      squad_id: squads[0]?.id ?? "",
      goal: "",
      interval_minutes: "60",
      enabled: true,
    });
    setFormError(null);
    setScheduleOpen(true);
  }

  async function createSchedule() {
    if (!scheduleForm.name.trim() || !scheduleForm.squad_id || scheduleForm.goal.trim().length < 3) {
      setFormError("请填写名称、选择小队并描述目标");
      return;
    }
    setBusy("schedule-create");
    setFormError(null);
    try {
      let created: AgentSchedule;
      if (demo) {
        const interval = Number(scheduleForm.interval_minutes) || 60;
        created = {
          id: `sch-${Date.now()}`,
          name: scheduleForm.name.trim(),
          squad_id: scheduleForm.squad_id,
          goal: scheduleForm.goal.trim(),
          interval_minutes: interval,
          enabled: scheduleForm.enabled,
          next_run_at: new Date(Date.now() + interval * 60_000).toISOString(),
          last_run_at: null,
          last_run_id: null,
          created_at: new Date().toISOString(),
        };
      } else {
        created = await api.createAgentSchedule({
          name: scheduleForm.name.trim(),
          squad_id: scheduleForm.squad_id,
          goal: scheduleForm.goal.trim(),
          interval_minutes: Number(scheduleForm.interval_minutes) || 60,
          enabled: scheduleForm.enabled,
        });
      }
      setSchedules((prev) => [created, ...prev]);
      setScheduleOpen(false);
      toast("定时排班已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建排班失败");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSchedule(schedule: AgentSchedule) {
    setBusy(`schedule-toggle-${schedule.id}`);
    try {
      let updated: AgentSchedule;
      if (demo) {
        updated = { ...schedule, enabled: !schedule.enabled };
      } else {
        updated = await api.updateAgentSchedule(schedule.id, {
          enabled: !schedule.enabled,
        });
      }
      setSchedules((prev) =>
        prev.map((item) => (item.id === schedule.id ? updated : item)),
      );
      toast(updated.enabled ? "排班已启用" : "排班已暂停", "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "更新排班失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function runScheduleNow(schedule: AgentSchedule) {
    setBusy(`schedule-run-${schedule.id}`);
    try {
      let nextSchedule = schedule;
      let run: AgentRun;
      if (demo) {
        const now = new Date().toISOString();
        const squad = squads.find((item) => item.id === schedule.squad_id);
        run = {
          id: `run-${Date.now()}`,
          squad_id: schedule.squad_id,
          squad_name: squad?.name ?? schedule.squad_id,
          goal: schedule.goal,
          status: "running",
          created_at: now,
          tasks: (squad?.lead ? [squad.lead] : []).map((member) => ({
            id: `task-${Date.now()}`,
            employee_id: member.id,
            employee_name: member.name,
            title: "拆解目标并分派",
            status: "completed",
            output: "已开始执行。",
            started_at: now,
            finished_at: now,
          })),
          messages: [],
          artifacts: [],
          approvals: [],
          usage: { tokens: 0, cost_usd: 0 },
        };
        nextSchedule = {
          ...schedule,
          last_run_at: now,
          last_run_id: run.id,
          next_run_at: new Date(
            Date.now() + schedule.interval_minutes * 60_000,
          ).toISOString(),
        };
        setSchedules((prev) =>
          prev.map((item) => (item.id === schedule.id ? nextSchedule : item)),
        );
        setRuns((prev) => [run, ...prev]);
      } else {
        const result = await api.runAgentSchedule(schedule.id);
        nextSchedule = result.schedule;
        run = result.run;
        setSchedules((prev) =>
          prev.map((item) => (item.id === schedule.id ? nextSchedule : item)),
        );
        setRuns((prev) => [run, ...prev]);
      }
      setRunDetail(run);
      setSelectedRunId(run.id);
      toast("已立即运行排班");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "立即运行失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSchedule(schedule: AgentSchedule) {
    setBusy(`schedule-delete-${schedule.id}`);
    try {
      if (!demo) await api.deleteAgentSchedule(schedule.id);
      setSchedules((prev) => prev.filter((item) => item.id !== schedule.id));
      toast("排班已删除", "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除排班失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function decide(run: AgentRun, approvalIndex: number, decision: "approved" | "rejected") {    const approval = run.approvals[approvalIndex];
    setBusy(`decision-${run.id}-${approval.gate}`);
    try {
      let next: AgentRun;
      if (demo) {
        const approvals = run.approvals.map((item, index) =>
          index === approvalIndex
            ? { ...item, decision, decided_at: new Date().toISOString() }
            : item,
        );
        next = {
          ...run,
          approvals,
          status: decision === "rejected" ? "failed" : "running",
          messages: [
            ...run.messages,
            {
              id: `msg-${Date.now()}`,
              employee_id: "human",
              employee_name: "人工审批人",
              role: "human",
              content: `${decision === "approved" ? "通过" : "拒绝"}审批：${approval.gate}`,
              created_at: new Date().toISOString(),
            },
          ],
        };
      } else {
        next = await api.decideAgentRun(run.id, {
          gate: approval.gate,
          decision,
        });
      }
      setRunDetail(next);
      setRuns((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      toast(decision === "approved" ? "人工审批已通过" : "人工审批已拒绝", decision === "approved" ? "ok" : "err");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "人工审批失败", "err");
    } finally {
      setBusy(null);
    }
  }

  const selectedSquad = useMemo(
    () => squads.find((squad) => squad.id === runDetail?.squad_id) ?? null,
    [runDetail, squads],
  );
  const pendingApprovals = runDetail?.approvals.filter((approval) => !approval.decision) ?? [];

  return (
    <AppShell>
      <div data-testid="squads-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">Agent 团队</div>
            <h1 className="oc-title">专家小队</h1>
            <p className="oc-subtitle">
              由 lead + 专家组成、可编排/委派/评审的 Agent 团队。发起运行后按目标拆解任务，
              关键节点走人工门禁，全程留消息、产物与审计。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="oc-btn-sm"
              variant="secondary"
              onClick={() => {
                setDemo(true);
                setSquads(mockSquads);
                setRuns(mockRuns);
                setSchedules(mockSchedules);
              }}
              data-testid="squads-demo"
            >
              示例数据
            </Button>
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              当前展示示例数据（DEV）。运行/审批仅本地模拟，不会写入真实组织。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="专家小队加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton lines={5} />
            <Skeleton lines={7} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {squads.map((squad) => (
                <article
                  key={squad.id}
                  className="oc-card flex flex-col p-5"
                  data-testid="squad-card"
                  data-squad-id={squad.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-md font-semibold">{squad.name}</h2>
                    <span className="oc-badge">{ORCHESTRATION_LABEL[squad.orchestration] ?? squad.orchestration}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-fg-secondary">{squad.mission}</p>
                  <div className="mt-3 space-y-1 text-xs text-fg-tertiary">
                    <div>负责人：{squad.lead?.name ?? squad.lead_id}</div>
                    <div>
                      成员：
                      {(squad.members ?? []).map((member) => member.name).join("、") || "—"}
                    </div>
                    <div>
                      应用绑定：
                      {squad.app_ids.length ? squad.app_ids.join("、") : "未绑定"}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {squad.human_gates.map((gate) => (
                      <span key={gate} className="oc-badge" style={toneStyle("warn")}>
                        人工门禁 · {gate}
                      </span>
                    ))}
                    <span className="oc-badge">SLA {squad.sla_minutes} 分钟</span>
                  </div>
                  <div className="mt-4 flex justify-end border-t pt-3" style={{ borderColor: "var(--oc-border)" }}>
                    <Button
                      variant="primary"
                      className="oc-btn-sm"
                      onClick={() => openStart(squad)}
                      data-testid="squad-start"
                    >
                      发起运行
                    </Button>
                  </div>
                </article>
              ))}
              {squads.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-3">
                  <EmptyState
                    title="还没有专家小队"
                    description="小队由数字员工组成；可先载入示例数据体验完整运行时间线。"
                    action={
                      <Button
                        variant="primary"
                        onClick={() => {
                          setDemo(true);
                          setSquads(mockSquads);
                          setRuns(mockRuns);
                setSchedules(mockSchedules);
                        }}
                      >
                        载入示例数据
                      </Button>
                    }
                  />
                </div>
              )}
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <h2 className="text-md font-semibold">运行记录</h2>
                <div className="oc-card mt-2 overflow-hidden">
                  <ul className="divide-y" style={{ borderColor: "var(--oc-border)" }}>
                    {runs.map((run) => (
                      <li key={run.id}>
                        <button
                          type="button"
                          className={`w-full px-4 py-3 text-left hover:bg-hover ${selectedRunId === run.id ? "bg-hover" : ""}`}
                          onClick={() => void openRun(run.id)}
                          data-testid="squad-run"
                          data-run-id={run.id}
                          data-status={run.status}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{run.squad_name}</span>
                            <span className="oc-badge" style={toneStyle(statusTone(run.status))}>
                              {RUN_STATUS_LABEL[run.status] ?? run.status}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs text-fg-secondary">{run.goal}</p>
                          <p className="mt-1 text-xs text-fg-tertiary">
                            {relativeTime(run.created_at)} · {run.tasks.filter((task) => task.status === "completed").length}/
                            {run.tasks.length} 任务
                          </p>
                        </button>
                      </li>
                    ))}
                    {runs.length === 0 && (
                      <li className="px-4 py-6 text-center text-sm text-fg-tertiary">
                        暂无运行，先从小队卡片发起。
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="lg:col-span-3">
                {!selectedRunId ? (
                  <EmptyState
                    title="选择一个运行"
                    description="查看任务委派、成员消息、产物与人工审批节点。"
                  />
                ) : detailLoading || !runDetail ? (
                  <Skeleton lines={8} />
                ) : (
                  <section className="oc-card p-5" data-testid="squad-run-detail">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="oc-badge" style={toneStyle(statusTone(runDetail.status))}>
                            {RUN_STATUS_LABEL[runDetail.status] ?? runDetail.status}
                          </span>
                          <h2 className="text-md font-semibold">{runDetail.squad_name}</h2>
                        </div>
                        <p className="mt-1 font-mono text-xs text-fg-tertiary">
                          {runDetail.id} · {relativeTime(runDetail.created_at)}
                          {runDetail.app_id ? ` · 应用 ${runDetail.app_id}` : ""}
                        </p>
                      </div>
                      <Button
                        className="oc-btn-sm"
                        onClick={() => void openRun(runDetail.id)}
                      >
                        刷新
                      </Button>
                    </div>
                    <p className="mt-3 rounded-lg p-3 text-sm" style={{ background: "var(--oc-surface-hover)" }}>
                      {runDetail.goal}
                    </p>

                    {pendingApprovals.length > 0 && runDetail.status === "waiting_human" && (
                      <div className="mt-3" data-testid="squad-approval">
                        <Banner tone="warn">
                          等待人工审批：{pendingApprovals.map((item) => item.gate).join("、")}
                        </Banner>
                        <div className="mt-2 flex gap-2">
                          <Button
                            className="oc-btn-sm"
                            variant="primary"
                            loading={busy?.startsWith(`decision-${runDetail.id}`)}
                            onClick={() => void decide(runDetail, 0, "approved")}
                            data-testid="squad-approve"
                          >
                            批准
                          </Button>
                          <Button
                            className="oc-btn-sm"
                            variant="danger"
                            loading={busy?.startsWith(`decision-${runDetail.id}`)}
                            onClick={() => void decide(runDetail, 0, "rejected")}
                            data-testid="squad-reject"
                          >
                            拒绝
                          </Button>
                        </div>
                      </div>
                    )}

                    <h3 className="mt-5 text-sm font-medium">任务委派</h3>
                    <ol className="mt-2 space-y-2">
                      {runDetail.tasks.map((task, index) => (
                        <li
                          key={task.id}
                          className="rounded-lg border p-3"
                          style={{ borderColor: "var(--oc-border)" }}
                          data-testid="squad-task"
                          data-status={task.status}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium">
                              {index + 1}. {task.employee_name}
                              <span className="ml-2 text-xs font-normal text-fg-tertiary">{task.title}</span>
                            </span>
                            <span className="oc-badge" style={toneStyle(statusTone(task.status))}>
                              {TASK_STATUS_LABEL[task.status] ?? task.status}
                            </span>
                          </div>
                          {task.output && (
                            <p className="mt-1 text-xs text-fg-secondary">{task.output}</p>
                          )}
                        </li>
                      ))}
                    </ol>

                    {selectedSquad && selectedSquad.human_gates.length > 0 && (
                      <>
                        <h3 className="mt-5 text-sm font-medium">人工门禁</h3>
                        <ul className="mt-2 space-y-1.5">
                          {runDetail.approvals.map((approval, index) => (
                            <li
                              key={`${approval.gate}-${index}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                              style={{ background: "var(--oc-surface-hover)" }}
                            >
                              <span>{approval.gate}</span>
                              <span className="flex items-center gap-2">
                                <span className="oc-badge" style={toneStyle(approval.decision === "approved" ? "ok" : approval.decision === "rejected" ? "err" : "muted")}>
                                  {approval.decision === "approved"
                                    ? "已批准"
                                    : approval.decision === "rejected"
                                      ? "已拒绝"
                                      : "待审批"}
                                </span>
                                {!approval.decision && runDetail.status === "waiting_human" && (
                                  <span className="flex gap-1">
                                    <Button className="oc-btn-sm" variant="primary" onClick={() => void decide(runDetail, index, "approved")} data-testid="squad-approve">
                                      批准
                                    </Button>
                                    <Button className="oc-btn-sm" variant="danger" onClick={() => void decide(runDetail, index, "rejected")} data-testid="squad-reject">
                                      拒绝
                                    </Button>
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    <h3 className="mt-5 text-sm font-medium">成员消息</h3>
                    <ul className="mt-2 max-h-[260px] space-y-2 overflow-y-auto" aria-live="polite">
                      {runDetail.messages.map((message) => (
                        <li
                          key={message.id}
                          className="rounded-lg px-3 py-2 text-sm"
                          style={{
                            background:
                              message.role === "human"
                                ? "var(--oc-warning-subtle)"
                                : message.role === "lead"
                                  ? "var(--oc-primary-subtle)"
                                  : "var(--oc-surface-hover)",
                          }}
                          data-testid="squad-message"
                          data-role={message.role}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-fg-tertiary">
                            <span className="font-medium text-fg-secondary">{message.employee_name}</span>
                            <span>{relativeTime(message.created_at)}</span>
                          </div>
                          <p className="mt-0.5 text-fg-primary">{message.content}</p>
                        </li>
                      ))}
                      {runDetail.messages.length === 0 && (
                        <li className="text-sm text-fg-tertiary">暂无消息</li>
                      )}
                    </ul>

                    <h3 className="mt-5 text-sm font-medium">产物</h3>
                    <ul className="mt-2 space-y-1.5">
                      {runDetail.artifacts.map((artifact) => (
                        <li
                          key={artifact.name}
                          className="flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2 text-xs"
                          style={{ background: "var(--oc-surface-hover)" }}
                        >
                          <span className="oc-badge">{artifact.kind}</span>
                          <span className="min-w-0 flex-1 truncate">{artifact.name}</span>
                        </li>
                      ))}
                      {runDetail.artifacts.length === 0 && (
                        <li className="text-sm text-fg-tertiary">暂无产物</li>
                      )}
                    </ul>

                    {runDetail.usage && (
                      <p className="mt-4 text-xs text-fg-tertiary">
                        用量：{runDetail.usage.tokens} tokens · ${runDetail.usage.cost_usd}
                      </p>
                    )}
                  </section>
                )}
              </div>
            </div>
          </>
        )}

        <section className="oc-card mt-8 p-5" data-testid="schedules-section">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-md font-semibold">定时排班</h2>
              <p className="mt-1 text-xs text-fg-tertiary">
                按固定间隔自动为小队发起运行；可暂停/立即运行，运行记录会进入上方列表。
              </p>
            </div>
            <Button
              className="oc-btn-sm"
              variant="primary"
              onClick={openSchedule}
              data-testid="schedule-create"
            >
              + 新建排班
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {schedules.map((schedule) => {
              const squad = squads.find((item) => item.id === schedule.squad_id);
              return (
                <article
                  key={schedule.id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: "var(--oc-border)" }}
                  data-testid="schedule-card"
                  data-enabled={schedule.enabled ? "true" : "false"}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-medium">{schedule.name}</h3>
                      <p className="mt-0.5 text-xs text-fg-tertiary">
                        {squad?.name ?? schedule.squad_id} · 每 {schedule.interval_minutes} 分钟
                      </p>
                    </div>
                    <span
                      className="oc-badge"
                      style={{
                        color: schedule.enabled
                          ? "var(--oc-success-text)"
                          : "var(--oc-text-secondary)",
                        background: schedule.enabled
                          ? "var(--oc-success-subtle)"
                          : "var(--oc-surface-hover)",
                      }}
                    >
                      {schedule.enabled ? "启用" : "暂停"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs text-fg-secondary">{schedule.goal}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                    <span>下次：{relativeTime(schedule.next_run_at)}</span>
                    <span>上次：{schedule.last_run_at ? relativeTime(schedule.last_run_at) : "从未"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t pt-3" style={{ borderColor: "var(--oc-border)" }}>
                    <Button
                      className="oc-btn-sm"
                      loading={busy === `schedule-toggle-${schedule.id}`}
                      onClick={() => void toggleSchedule(schedule)}
                      data-testid="schedule-toggle"
                    >
                      {schedule.enabled ? "暂停" : "启用"}
                    </Button>
                    <Button
                      className="oc-btn-sm"
                      variant="primary"
                      loading={busy === `schedule-run-${schedule.id}`}
                      onClick={() => void runScheduleNow(schedule)}
                      data-testid="schedule-run"
                    >
                      立即运行
                    </Button>
                    <Button
                      className="oc-btn-sm"
                      variant="ghost"
                      style={{ color: "var(--oc-danger-text)" }}
                      loading={busy === `schedule-delete-${schedule.id}`}
                      onClick={() => void deleteSchedule(schedule)}
                      data-testid="schedule-delete"
                    >
                      删除
                    </Button>
                  </div>
                </article>
              );
            })}
            {schedules.length === 0 && (
              <p className="text-sm text-fg-tertiary sm:col-span-2 xl:col-span-3">
                还没有定时排班，点击「新建排班」按固定间隔自动运行小队。
              </p>
            )}
          </div>
        </section>

        {startOpen && startSquad && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setStartOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="squad-start-title"
              className="oc-card relative w-full max-w-lg p-6"
              data-testid="squad-start-dialog"
            >
              <h2 id="squad-start-title" className="text-lg font-semibold">
                发起小队运行
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                {startSquad.name} · {startSquad.lead?.name ?? "lead"} 负责拆解目标；人工门禁：
                {startSquad.human_gates.join("、") || "无"}。
              </p>
              <label className="oc-field-label mt-4" htmlFor="squad-goal">
                目标
              </label>
              <textarea
                id="squad-goal"
                className="oc-input h-24 resize-none py-2"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="例如：为发票助手增加 CSV 导出与空数据提示，完成测试并发布 staging"
              />
              <label className="oc-field-label mt-3" htmlFor="squad-app">
                绑定应用（可选）
              </label>
              <input
                id="squad-app"
                className="oc-input"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                placeholder="app-invoice-demo"
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
                  data-testid="squad-start-submit"
                >
                  发起运行
                </Button>
              </div>
            </div>
          </div>
        )}

        {scheduleOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setScheduleOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-create-title"
              className="oc-card relative w-full max-w-lg p-6"
              data-testid="schedule-create-dialog"
            >
              <h2 id="schedule-create-title" className="text-lg font-semibold">
                新建定时排班
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                后台按间隔创建小队运行；暂停后不再触发，已启动的运行不受影响。
              </p>
              <label className="oc-field-label mt-4" htmlFor="schedule-name">
                名称
              </label>
              <input
                id="schedule-name"
                className="oc-input"
                value={scheduleForm.name}
                onChange={(event) =>
                  setScheduleForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="每日工单巡检"
              />
              <label className="oc-field-label mt-3" htmlFor="schedule-squad">
                小队
              </label>
              <select
                id="schedule-squad"
                className="oc-input"
                value={scheduleForm.squad_id}
                onChange={(event) =>
                  setScheduleForm((prev) => ({ ...prev, squad_id: event.target.value }))
                }
              >
                {squads.map((squad) => (
                  <option key={squad.id} value={squad.id}>
                    {squad.name}
                  </option>
                ))}
              </select>
              <label className="oc-field-label mt-3" htmlFor="schedule-goal">
                目标
              </label>
              <textarea
                id="schedule-goal"
                className="oc-input h-20 resize-none py-2"
                value={scheduleForm.goal}
                onChange={(event) =>
                  setScheduleForm((prev) => ({ ...prev, goal: event.target.value }))
                }
                placeholder="检查过去 24 小时高优工单，标记超时与需要人工介入的项"
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="oc-field-label">间隔（分钟）</span>
                  <input
                    className="oc-input"
                    type="number"
                    min={1}
                    max={10080}
                    value={scheduleForm.interval_minutes}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({
                        ...prev,
                        interval_minutes: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="mt-7 flex items-center gap-2 text-sm text-fg-secondary">
                  <input
                    type="checkbox"
                    checked={scheduleForm.enabled}
                    onChange={(event) =>
                      setScheduleForm((prev) => ({ ...prev, enabled: event.target.checked }))
                    }
                  />
                  创建后立即启用
                </label>
              </div>
              {formError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{formError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setScheduleOpen(false)}>取消</Button>
                <Button
                  variant="primary"
                  loading={busy === "schedule-create"}
                  onClick={() => void createSchedule()}
                  data-testid="schedule-save"
                >
                  创建排班
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
