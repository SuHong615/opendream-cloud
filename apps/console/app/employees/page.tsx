"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import { mockEmployees } from "@/lib/workforce-mock";
import {
  AGENT_ROLE_LABEL,
  AUTONOMY_LABEL,
  MEMORY_SCOPE_LABEL,
  type AgentEmployee,
  type AgentEmployeeVersion,
  type AgentGuardrails,
} from "@/lib/workforce-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };
const ROLES = ["lead", "specialist", "reviewer", "operator"];

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<AgentEmployee[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [detail, setDetail] = useState<AgentEmployee | null>(null);
  const [guardrails, setGuardrails] = useState<AgentGuardrails | null>(null);
  const [versions, setVersions] = useState<AgentEmployeeVersion[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [guardForm, setGuardForm] = useState({
    allowed_tools: "",
    forbidden_actions: "",
    max_autonomy: "execute_with_approval",
    require_approval_for: "",
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    title: "",
    role: "specialist",
    mission: "",
    skills: "",
    mcp_servers: "",
    memory_scope: "team",
    autonomy: "execute_with_approval",
    avatar_color: "#2563eb",
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
      const result = await api.listAgentEmployees();
      setEmployees(result.items);
      setDemo(false);
    } catch (err) {
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setDemo(true);
        setEmployees(mockEmployees);
      } else if (err instanceof ApiError && err.status !== 401) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "数字员工加载失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    const employee = detail;
    setGovernanceLoading(true);
    setVersions([]);
    const apply = (value: AgentGuardrails) => {
      setGuardrails(value);
      setGuardForm({
        allowed_tools: value.allowed_tools.join(", "),
        forbidden_actions: value.forbidden_actions.join(", "),
        max_autonomy: value.max_autonomy,
        require_approval_for: value.require_approval_for.join(", "),
      });
    };
    if (demo) {
      apply({
        allowed_tools: employee.mcp_servers,
        forbidden_actions: [],
        max_autonomy: employee.autonomy,
        require_approval_for: [],
      });
      setGovernanceLoading(false);
      return;
    }
    Promise.allSettled([
      api.getAgentGuardrails(employee.id),
      api.listAgentEmployeeVersions(employee.id),
    ]).then(([guardResult, versionResult]) => {
      if (cancelled) return;
      if (guardResult.status === "fulfilled") {
        apply(guardResult.value);
      } else {
        apply({
          allowed_tools: [],
          forbidden_actions: [],
          max_autonomy: employee.autonomy,
          require_approval_for: [],
        });
      }
      if (versionResult.status === "fulfilled") {
        setVersions(versionResult.value.items);
      }
      setGovernanceLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [demo, detail?.id]);

  function parseList(value: string): string[] {
    return value
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function saveGuardrails() {
    if (!detail) return;
    const payload: AgentGuardrails = {
      allowed_tools: parseList(guardForm.allowed_tools),
      forbidden_actions: parseList(guardForm.forbidden_actions),
      max_autonomy: guardForm.max_autonomy,
      require_approval_for: parseList(guardForm.require_approval_for),
    };
    setBusy(true);
    try {
      let saved = payload;
      if (!demo) saved = await api.updateAgentGuardrails(detail.id, payload);
      setGuardrails(saved);
      toast("治理策略已保存");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "保存治理策略失败", "err");
    } finally {
      setBusy(false);
    }
  }

  async function snapshotVersion() {
    if (!detail) return;
    setBusy(true);
    try {
      let created: AgentEmployeeVersion;
      if (demo) {
        const index = versions.length + 1;
        created = {
          id: `empver-${Date.now()}`,
          employee_id: detail.id,
          version: `1.0.${index}`,
          snapshot: { ...detail },
          created_at: new Date().toISOString(),
        };
      } else {
        created = await api.snapshotAgentEmployeeVersion(detail.id);
      }
      setVersions((prev) => [...prev, created]);
      toast(`已创建快照 ${created.version}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "创建快照失败", "err");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackVersion(version: AgentEmployeeVersion) {
    if (!detail) return;
    setBusy(true);
    try {
      let updated: AgentEmployee;
      if (demo) {
        updated = { ...version.snapshot };
      } else {
        updated = await api.rollbackAgentEmployeeVersion(detail.id, version.id);
        const nextVersions = await api.listAgentEmployeeVersions(detail.id);
        setVersions(nextVersions.items);
      }
      setDetail(updated);
      setEmployees((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast(`已回滚到 ${version.version}`, "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "回滚失败", "err");
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return employees.filter((employee) => {
      if (roleFilter !== "all" && employee.role !== roleFilter) return false;
      if (!normalized) return true;
      return `${employee.name} ${employee.title} ${employee.mission} ${employee.skills.join(" ")}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [employees, query, roleFilter]);

  async function saveEmployee() {
    if (!form.name.trim() || !form.title.trim() || !form.mission.trim()) {
      setFormError("请填写姓名、岗位与使命");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        title: form.title.trim(),
        role: form.role,
        mission: form.mission.trim(),
        skills: form.skills
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        mcp_servers: form.mcp_servers
          .split(/[，,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        memory_scope: form.memory_scope,
        autonomy: form.autonomy,
        avatar_color: form.avatar_color,
      };
      let created: AgentEmployee;
      if (demo) {
        created = {
          ...payload,
          id: `emp-${Date.now()}`,
          status: "active",
          created_at: new Date().toISOString(),
        };
        setEmployees((prev) => [created, ...prev]);
      } else {
        created = await api.createAgentEmployee(payload);
        setEmployees((prev) => [created, ...prev]);
      }
      setCreateOpen(false);
      setForm({
        name: "",
        title: "",
        role: "specialist",
        mission: "",
        skills: "",
        mcp_servers: "",
        memory_scope: "team",
        autonomy: "execute_with_approval",
        avatar_color: "#2563eb",
      });
      setDetail(created);
      toast("数字员工已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建数字员工失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(employee: AgentEmployee) {
    const nextStatus = employee.status === "active" ? "paused" : "active";
    setBusy(true);
    try {
      let updated: AgentEmployee;
      if (demo) {
        updated = { ...employee, status: nextStatus };
      } else {
        updated = await api.updateAgentEmployee(employee.id, { status: nextStatus });
      }
      setEmployees((prev) =>
        prev.map((item) => (item.id === employee.id ? updated : item)),
      );
      setDetail(updated);
      toast(nextStatus === "active" ? "已启用数字员工" : "已暂停数字员工", "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "更新状态失败", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="employees-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">AI 同事</div>
            <h1 className="oc-title">数字员工</h1>
            <p className="oc-subtitle">
              有岗位、技能、MCP 工具、记忆范围与自治级别的 AI 同事。员工可单独执行任务，
              也可加入专家小队协作；所有动作留审计。
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
              data-testid="employee-create"
            >
              + 创建数字员工
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              当前展示示例数据（DEV）。创建/修改仅本地模拟，不会写入真实组织。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="数字员工加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            className="oc-input max-w-sm"
            placeholder="搜索姓名 / 岗位 / 技能…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索数字员工"
          />
          <select
            className="oc-input max-w-[160px]"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            aria-label="按角色筛选"
          >
            <option value="all">全部角色</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {AGENT_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <span className="text-xs text-fg-tertiary">{filtered.length} 位员工</span>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton lines={5} />
            <Skeleton lines={5} />
            <Skeleton lines={5} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={employees.length === 0 ? "还没有数字员工" : "没有匹配的员工"}
              description={
                employees.length === 0
                  ? "创建第一位 AI 同事，配置岗位、技能与自治级别。"
                  : "调整搜索或角色筛选。"
              }
              action={
                employees.length === 0 ? (
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>
                      创建数字员工
                    </Button>
                    <Button
                      onClick={() => {
                        setDemo(true);
                        setEmployees(mockEmployees);
                      }}
                    >
                      载入示例数据
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((employee) => (
              <article
                key={employee.id}
                className="oc-card flex flex-col p-5"
                data-testid="employee-card"
                data-employee-id={employee.id}
                data-role={employee.role}
                data-status={employee.status}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-semibold text-white"
                    style={{ background: employee.avatar_color || "var(--oc-primary)" }}
                  >
                    {employee.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-md font-semibold">{employee.name}</h2>
                      <span className="oc-badge">{AGENT_ROLE_LABEL[employee.role] ?? employee.role}</span>
                      <span
                        className="oc-badge"
                        style={{
                          color:
                            employee.status === "active"
                              ? "var(--oc-success-text)"
                              : "var(--oc-text-secondary)",
                          background:
                            employee.status === "active"
                              ? "var(--oc-success-subtle)"
                              : "var(--oc-surface-hover)",
                        }}
                      >
                        {employee.status === "active" ? "在岗" : "暂停"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-fg-secondary">{employee.title}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-fg-secondary">{employee.mission}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {employee.skills.slice(0, 4).map((skill) => (
                    <span key={skill} className="oc-badge">
                      {skill}
                    </span>
                  ))}
                  {employee.skills.length > 4 && (
                    <span className="oc-badge">+{employee.skills.length - 4}</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-fg-tertiary">
                  <span>自治：{AUTONOMY_LABEL[employee.autonomy] ?? employee.autonomy}</span>
                  <span>记忆：{MEMORY_SCOPE_LABEL[employee.memory_scope] ?? employee.memory_scope}</span>
                  <span>MCP：{employee.mcp_servers.length} 个</span>
                  <span>加入于 {relativeTime(employee.created_at)}</span>
                </div>
                <div className="mt-4 flex justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--oc-border)" }}>
                  <Button className="oc-btn-sm" onClick={() => setDetail(employee)}>
                    详情
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setDetail(null)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="employee-detail-title"
              className="oc-drawer relative h-full w-full max-w-xl overflow-y-auto p-6"
              data-testid="employee-detail"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-12 w-12 place-items-center rounded-full text-lg font-semibold text-white"
                    style={{ background: detail.avatar_color || "var(--oc-primary)" }}
                  >
                    {detail.name.slice(0, 1)}
                  </span>
                  <div>
                    <h2 id="employee-detail-title" className="text-lg font-semibold">
                      {detail.name}
                    </h2>
                    <p className="text-xs text-fg-secondary">
                      {detail.title} · {AGENT_ROLE_LABEL[detail.role] ?? detail.role}
                    </p>
                  </div>
                </div>
                <button type="button" className="oc-icon-btn" aria-label="关闭详情" onClick={() => setDetail(null)}>
                  ✕
                </button>
              </div>

              <div className="mt-5 rounded-lg border p-4" style={{ borderColor: "var(--oc-border)" }}>
                <h3 className="text-xs font-medium text-fg-tertiary">使命</h3>
                <p className="mt-1 text-sm">{detail.mission}</p>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg p-3" style={{ background: "var(--oc-surface-hover)" }}>
                  <dt className="text-xs text-fg-tertiary">自治级别</dt>
                  <dd className="mt-1 font-medium">{AUTONOMY_LABEL[detail.autonomy] ?? detail.autonomy}</dd>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--oc-surface-hover)" }}>
                  <dt className="text-xs text-fg-tertiary">记忆范围</dt>
                  <dd className="mt-1 font-medium">{MEMORY_SCOPE_LABEL[detail.memory_scope] ?? detail.memory_scope}</dd>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--oc-surface-hover)" }}>
                  <dt className="text-xs text-fg-tertiary">状态</dt>
                  <dd className="mt-1 font-medium">{detail.status === "active" ? "在岗" : "暂停"}</dd>
                </div>
                <div className="rounded-lg p-3" style={{ background: "var(--oc-surface-hover)" }}>
                  <dt className="text-xs text-fg-tertiary">创建时间</dt>
                  <dd className="mt-1 font-medium">{relativeTime(detail.created_at)}</dd>
                </div>
              </dl>

              <h3 className="mt-5 text-sm font-medium">技能</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.skills.map((skill) => (
                  <span key={skill} className="oc-badge">
                    {skill}
                  </span>
                ))}
                {detail.skills.length === 0 && <span className="text-xs text-fg-tertiary">未配置</span>}
              </div>

              <h3 className="mt-5 text-sm font-medium">MCP 工具</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detail.mcp_servers.map((server) => (
                  <span key={server} className="oc-model-chip">
                    {server}
                  </span>
                ))}
                {detail.mcp_servers.length === 0 && <span className="text-xs text-fg-tertiary">未绑定</span>}
              </div>

              <section
                className="mt-6 rounded-xl border p-4"
                style={{ borderColor: "var(--oc-border)" }}
                data-testid="employee-guardrails"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">治理与 Guardrails</h3>
                  <span className="text-xs text-fg-tertiary">
                    {governanceLoading ? "加载中…" : "运行时生效"}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="oc-field-label">允许工具（逗号分隔）</span>
                    <input
                      className="oc-input"
                      value={guardForm.allowed_tools}
                      onChange={(event) =>
                        setGuardForm((prev) => ({ ...prev, allowed_tools: event.target.value }))
                      }
                      placeholder="git, ci, knowledge-base"
                    />
                  </label>
                  <label className="block">
                    <span className="oc-field-label">禁止动作（逗号分隔）</span>
                    <input
                      className="oc-input"
                      value={guardForm.forbidden_actions}
                      onChange={(event) =>
                        setGuardForm((prev) => ({ ...prev, forbidden_actions: event.target.value }))
                      }
                      placeholder="transfer_funds, delete_repo"
                    />
                  </label>
                  <label className="block">
                    <span className="oc-field-label">最大自治级别</span>
                    <select
                      className="oc-input"
                      value={guardForm.max_autonomy}
                      onChange={(event) =>
                        setGuardForm((prev) => ({ ...prev, max_autonomy: event.target.value }))
                      }
                    >
                      {Object.entries(AUTONOMY_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="oc-field-label">需审批动作（逗号分隔）</span>
                    <input
                      className="oc-input"
                      value={guardForm.require_approval_for}
                      onChange={(event) =>
                        setGuardForm((prev) => ({ ...prev, require_approval_for: event.target.value }))
                      }
                      placeholder="refund, deploy_prod"
                    />
                  </label>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    className="oc-btn-sm"
                    variant="primary"
                    loading={busy}
                    onClick={() => void saveGuardrails()}
                    data-testid="guardrails-save"
                  >
                    保存治理策略
                  </Button>
                </div>
              </section>

              <section className="mt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">版本快照</h3>
                  <Button
                    className="oc-btn-sm"
                    onClick={() => void snapshotVersion()}
                    loading={busy}
                    data-testid="employee-version-snapshot"
                  >
                    创建快照
                  </Button>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {versions.map((version) => (
                    <li
                      key={version.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                      style={{ background: "var(--oc-surface-hover)" }}
                      data-testid="employee-version"
                    >
                      <span>
                        <span className="font-mono">{version.version}</span>
                        <span className="ml-2 text-xs text-fg-tertiary">
                          {relativeTime(version.created_at)}
                        </span>
                      </span>
                      <Button
                        className="oc-btn-sm"
                        onClick={() => void rollbackVersion(version)}
                        data-testid="employee-version-rollback"
                      >
                        回滚
                      </Button>
                    </li>
                  ))}
                  {versions.length === 0 && (
                    <li className="text-xs text-fg-tertiary">还没有版本快照</li>
                  )}
                </ul>
              </section>

              <div className="mt-6 flex justify-between gap-2 border-t pt-4" style={{ borderColor: "var(--oc-border)" }}>
                <Button
                  className="oc-btn-sm"
                  onClick={() => void toggleStatus(detail)}
                  loading={busy}
                  data-testid="employee-toggle-status"
                >
                  {detail.status === "active" ? "暂停员工" : "启用员工"}
                </Button>
                <Button className="oc-btn-sm" onClick={() => setDetail(null)}>
                  关闭
                </Button>
              </div>
            </div>
          </div>
        )}

        {createOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setCreateOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="employee-create-title"
              className="oc-card relative max-h-[88vh] w-full max-w-xl overflow-y-auto p-6"
              data-testid="employee-create-dialog"
            >
              <h2 id="employee-create-title" className="text-lg font-semibold">
                创建数字员工
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                员工加入小队后由 lead 分派任务；高风险动作遵守自治级别与人工门禁。
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="oc-field-label">姓名</span>
                  <input className="oc-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="林研" />
                </label>
                <label className="block">
                  <span className="oc-field-label">岗位</span>
                  <input className="oc-input" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="研发交付负责人" />
                </label>
                <label className="block">
                  <span className="oc-field-label">角色</span>
                  <select className="oc-input" value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}>
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {AGENT_ROLE_LABEL[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="oc-field-label">自治级别</span>
                  <select className="oc-input" value={form.autonomy} onChange={(event) => setForm((prev) => ({ ...prev, autonomy: event.target.value }))}>
                    {Object.entries(AUTONOMY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">使命</span>
                  <textarea className="oc-input h-16 resize-none py-2" value={form.mission} onChange={(event) => setForm((prev) => ({ ...prev, mission: event.target.value }))} placeholder="拆解需求、编排小队、守住交付质量" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">技能（逗号分隔）</span>
                  <input className="oc-input" value={form.skills} onChange={(event) => setForm((prev) => ({ ...prev, skills: event.target.value }))} placeholder="需求拆解, 技术方案, code review" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">MCP 服务（逗号分隔）</span>
                  <input className="oc-input" value={form.mcp_servers} onChange={(event) => setForm((prev) => ({ ...prev, mcp_servers: event.target.value }))} placeholder="git, ci, issue-tracker" />
                </label>
                <label className="block">
                  <span className="oc-field-label">记忆范围</span>
                  <select className="oc-input" value={form.memory_scope} onChange={(event) => setForm((prev) => ({ ...prev, memory_scope: event.target.value }))}>
                    {Object.entries(MEMORY_SCOPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="oc-field-label">头像色</span>
                  <input type="color" className="oc-input h-9 p-1" value={form.avatar_color} onChange={(event) => setForm((prev) => ({ ...prev, avatar_color: event.target.value }))} />
                </label>
              </div>
              {formError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{formError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setCreateOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy} onClick={() => void saveEmployee()} data-testid="employee-save">
                  创建
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
