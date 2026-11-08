"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime } from "@/lib/api";
import type { RequirementItem, LegionItem, LegionRunItem, ApprovalItem, AgentTemplateItem, RoleItem } from "@/lib/api";
import type { AgentEmployee } from "@/lib/workforce-types";
import type { WorkflowDefinition, WorkflowRun, WorkflowTemplate } from "@/lib/workflow-types";
import type { EvalDataset, EvalRun } from "@/lib/m5-types";
import type { Skill } from "@/lib/skills-usage-types";
import type { McpServer } from "@/lib/mcp-types";

type Tab = "workbench" | "overview" | "sop" | "roles" | "legions" | "requirements" | "deliveries" | "approvals" | "capabilities" | "evaluation" | "governance";
type ChatMessage = { id: string; role: "user" | "assistant" | "system"; content: string; at: string };
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "workbench", label: "工作台" },
  { id: "overview", label: "概览" },
  { id: "sop", label: "SOP" },
  { id: "roles", label: "角色" },
  { id: "legions", label: "军团" },
  { id: "requirements", label: "需求" },
  { id: "deliveries", label: "战役与运行" },
  { id: "approvals", label: "审批" },
  { id: "capabilities", label: "能力" },
  { id: "evaluation", label: "评测" },
  { id: "governance", label: "治理" },
];
const STATUS_LABEL: Record<string, string> = { new: "待编排", in_progress: "执行中", waiting_human: "待审批", delivered: "已交付", blocked: "阻塞" };

export default function LoopForgePage() {
  const [tab, setTab] = useState<Tab>("workbench");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [definitions, setDefinitions] = useState<WorkflowDefinition[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [legions, setLegions] = useState<LegionItem[]>([]);
  const [legionRuns, setLegionRuns] = useState<LegionRunItem[]>([]);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [employees, setEmployees] = useState<AgentEmployee[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplateItem[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [executors, setExecutors] = useState<Array<{ id: string; label: string; kind: string; status: string; description: string }>>([]);
  const [probes, setProbes] = useState<Record<string, string>>({});
  const [evalRuns, setEvalRuns] = useState<EvalRun[]>([]);
  const [evalDatasets, setEvalDatasets] = useState<EvalDataset[]>([]);
  const [insights, setInsights] = useState<Record<string, { dispatches: number; success_rate: number; waiting_human: number; cost_usd: number }>>({});
  const [reqOpen, setReqOpen] = useState(false);
  const [reqForm, setReqForm] = useState({ title: "", description: "", priority: "P1", legion_id: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [squads, setSquads] = useState<Array<{ id: string; name: string }>>([]);
  const [legionOpen, setLegionOpen] = useState(false);
  const [legionForm, setLegionForm] = useState({ name: "", mission: "", domain: "通用", process_ref: "", squad_ids: [] as string[] });
  const [legionTarget, setLegionTarget] = useState<LegionItem | null>(null);
  const [legionGoal, setLegionGoal] = useState("");
  const [sopTarget, setSopTarget] = useState<WorkflowTemplate | null>(null);
  const [sopBusy, setSopBusy] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [roleTarget, setRoleTarget] = useState<RoleItem | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", system_prompt: "", model_ref: "default-coding", executor: "opencode", color: "#2563eb" });
  const [chat, setChat] = useState<ChatMessage[]>([{ id: "welcome", role: "assistant", content: "我是 Main Bot。告诉我目标和验收标准，我会检查仓库、选择 SOP 与角色，在沙箱中执行，并在人工门禁处暂停。", at: new Date().toISOString() }]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [activeLegionRun, setActiveLegionRun] = useState<LegionRunItem | null>(null);

  const load = useCallback(async () => {
    try {
      const [tpl, defs, wfRuns, legionsRes, legionRunsRes, reqRes, approvalRes, employeeRes, agentTplRes, skillRes, mcpRes, evalRunRes, evalDsRes, squadRes, executorRes, roleRes] = await Promise.all([
        api.listWorkflowTemplates(),
        api.listWorkflows(),
        api.listWorkflowRuns(),
        api.listLegions(),
        api.listLegionRuns(),
        api.listRequirements(),
        api.listApprovals(),
        api.listAgentEmployees(),
        api.listAgentTemplates(),
        api.listSkills({ limit: 50 }),
        api.listMcpServers(),
        api.listEvalRuns(),
        api.listEvalDatasets(),
        api.listAgentSquads(),
        api.listExecutors(),
        api.listRoles(),
      ]);
      setTemplates(tpl.items);
      setDefinitions(defs.items);
      setWorkflowRuns(wfRuns.items);
      setLegions(legionsRes.items);
      setLegionRuns(legionRunsRes.items);
      setRequirements(reqRes.items);
      setApprovals(approvalRes.items);
      setEmployees(employeeRes.items);
      setAgentTemplates(agentTplRes.items);
      setSkills((skillRes.items ?? []).map((item: { skill?: Skill } & Skill) => item.skill ?? item));
      setMcpServers(mcpRes.items ?? []);
      setEvalRuns(evalRunRes.items);
      setEvalDatasets(evalDsRes.items);
      setSquads(squadRes.items.map((squad) => ({ id: squad.id, name: squad.name })));
      setExecutors(executorRes.items);
      setRoles(roleRes.items);
      const statEntries = await Promise.all(legionsRes.items.map(async (legion: LegionItem) => [legion.id, await api.getLegionInsights(legion.id)] as const));
      setInsights(Object.fromEntries(statEntries));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createRequirement() {
    if (reqForm.title.trim().length < 2) return;
    setBusy("requirement");
    try {
      await api.createRequirement({ title: reqForm.title.trim(), description: reqForm.description, priority: reqForm.priority, legion_id: reqForm.legion_id || undefined });
      setReqOpen(false);
      setReqForm({ title: "", description: "", priority: "P1", legion_id: "" });
      await load();
      setToastMessage("需求已登记");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "登记需求失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function dispatchRequirement(item: RequirementItem) {
    setBusy(item.id);
    try {
      await api.dispatchRequirement(item.id);
      await load();
      setToastMessage(`已下达：${item.title}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "下达失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function decideApproval(item: ApprovalItem, decision: "approved" | "rejected") {
    setBusy(`${item.run_id}:${item.gate}`);
    try {
      await api.decideAgentRun(item.run_id, { gate: item.gate, decision });
      await load();
      setToastMessage(decision === "approved" ? "已通过" : "已驳回");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "审批失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  async function sendBack(item: ApprovalItem) {
    setBusy(`${item.run_id}:${item.gate}`);
    try {
      await api.sendBackAgentRun(item.run_id, { gate: item.gate, reason: "请按验收标准重做" });
      await load();
      setToastMessage("已退回重做");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "退回失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  async function createLegion() {
    if (!legionForm.name.trim() || !legionForm.mission.trim() || legionForm.squad_ids.length === 0) return;
    setBusy("legion");
    try {
      await api.createLegion({ name: legionForm.name.trim(), mission: legionForm.mission.trim(), domain: legionForm.domain, process_ref: legionForm.process_ref, squad_ids: legionForm.squad_ids });
      setLegionOpen(false);
      setLegionForm({ name: "", mission: "", domain: "通用", process_ref: "", squad_ids: [] });
      await load();
      setToastMessage("数字军团已组建");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "创建军团失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  async function dispatchLegion() {
    if (!legionTarget || legionGoal.trim().length < 3) return;
    setBusy("dispatch-legion");
    try {
      await api.dispatchLegion(legionTarget.id, { goal: legionGoal.trim() });
      setLegionTarget(null);
      setLegionGoal("");
      await load();
      setToastMessage("战役已下达");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "下达失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  async function createFromSop(template: WorkflowTemplate) {    setSopBusy(template.id);
    try {
      await api.createWorkflow({ template_id: template.id, visibility: "org" });
      await load();
      setToastMessage(`已从 SOP 创建：${template.display_name || template.name}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "创建 SOP 失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setSopBusy(null); }
  }

  async function probe(id: string) {
    setSopBusy(`probe-${id}`);
    try {
      const result = await api.probeExecutor(id);
      setProbes((prev) => ({ ...prev, [id]: `${result.installed ? "可用" : "未安装"} · ${result.message}` }));
    } catch (err) {
      setProbes((prev) => ({ ...prev, [id]: err instanceof ApiError ? err.message : "探测失败" }));
    } finally { setSopBusy(null); }
  }

  function sopNodes(template: WorkflowTemplate): Array<{ id: string; type: string; name?: string; needs?: string[] }> {
    const dsl = template.dsl as { spec?: { nodes?: Array<{ id: string; type: string; name?: string; needs?: string[] }> } } | undefined;
    return dsl?.spec?.nodes ?? [];
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    setChatInput("");
    setChat((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text, at: new Date().toISOString() }]);
    setChatBusy(true);
    try {
      const legion = legions[0];
      if (!legion) {
        setChat((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: "还没有可用的数字军团。请先在「军团」页签组建一个军团，或到需求中心登记需求。", at: new Date().toISOString() }]);
        return;
      }
      const run = await api.dispatchLegion(legion.id, { goal: text });
      setActiveLegionRun(run);
      setChat((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: `已创建沙箱工作区和战役「${text}」。军团「${legion.name}」开始按 SOP 执行；右侧可查看战役状态，或到审批中心处理人工门禁。`, at: new Date().toISOString() }]);
      await load();
    } catch (err) {
      setChat((prev) => [...prev, { id: `e-${Date.now()}`, role: "system", content: err instanceof ApiError ? err.message : "Main Bot 执行失败", at: new Date().toISOString() }]);
    } finally { setChatBusy(false); }
  }

  async function createRole() {
    if (!roleForm.name.trim() || !roleForm.system_prompt.trim()) return;
    setBusy("role");
    try {
      if (roleTarget) {
        await api.updateRole(roleTarget.id, roleForm);
      } else {
        await api.createRole({ ...roleForm, skills: [], mcp_servers: [], rules: [], artifacts: [], human_gates: [] });
      }
      setRoleOpen(false);
      setRoleTarget(null);
      setRoleForm({ name: "", description: "", system_prompt: "", model_ref: "default-coding", executor: "opencode", color: "#2563eb" });
      await load();
      setToastMessage(roleTarget ? "角色已更新" : "角色已创建");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "保存角色失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally { setBusy(null); }
  }

  function openRole(role?: RoleItem) {
    setRoleTarget(role ?? null);
    setRoleForm(role ? { name: role.name, description: role.description, system_prompt: role.system_prompt, model_ref: role.model_ref, executor: role.executor, color: role.color } : { name: "", description: "", system_prompt: "", model_ref: "default-coding", executor: "opencode", color: "#2563eb" });
    setRoleOpen(true);
  }

  return (
    <AppShell>
      <div data-testid="loopforge-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <a href="/workspaces" className="text-xs text-fg-tertiary hover:text-fg">← 控制台</a>
            <div className="oc-eyebrow mt-2">Orchestration · LoopForge</div>
            <h1 className="oc-title">LoopForge 交付工作台</h1>
            <p className="oc-subtitle">SOP 流程、角色、需求、战役、人工审批、能力与评测的统一工作台；所有交付围绕同一条流程链闭环。</p>
          </div>
          <Button className="oc-btn-sm" onClick={() => void load()}>刷新</Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--oc-border)" }} role="tablist">
          {TABS.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} data-testid={`loopforge-tab-${item.id}`} onClick={() => setTab(item.id)} className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === item.id ? "border-[var(--oc-primary)] font-medium text-[var(--oc-primary)]" : "border-transparent text-fg-secondary hover:text-fg"}`}>
              {item.label}
            </button>
          ))}
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}
        {loading ? <div className="mt-5"><Skeleton lines={6} /></div> : (
          <>
            {tab === "workbench" && (
              <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
                <aside className="oc-card p-3">
                  <Button variant="primary" className="oc-btn-sm w-full" onClick={() => { setTab("requirements"); setReqOpen(true); }} data-testid="loopforge-chat-requirement">+ 新需求</Button>
                  <div className="mt-4 text-xs font-medium text-fg-tertiary">最近会话</div>
                  <div className="mt-2 space-y-1">
                    {requirements.slice(0, 6).map((item) => (
                      <button key={item.id} type="button" onClick={() => setTab("requirements")} className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-surface-2">
                        <div className="truncate font-medium">{item.title}</div>
                        <div className="mt-0.5 text-fg-tertiary">{STATUS_LABEL[item.status] ?? item.status}</div>
                      </button>
                    ))}
                    {requirements.length === 0 && <p className="px-2 text-xs text-fg-tertiary">还没有会话，直接在右侧告诉 Main Bot 你要做什么。</p>}
                  </div>
                </aside>

                <section className="oc-card flex min-h-[520px] flex-col">
                  <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--oc-border)" }}>
                    <div><div className="text-sm font-semibold">Main Bot</div><div className="text-2xs text-fg-tertiary">沙箱工作区 · 角色编排 · 人工门禁</div></div>
                    <span className="oc-badge" data-tone="ok">在线</span>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" data-testid="loopforge-chat">
                    {chat.map((message) => (
                      <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-[var(--oc-primary)] px-4 py-3 text-sm text-white" : "max-w-[90%] rounded-xl bg-surface-2 px-4 py-3 text-sm"} data-testid="loopforge-chat-message">
                        <div className={message.role === "user" ? "text-2xs text-white/70" : "text-2xs text-fg-tertiary"}>{message.role === "user" ? "你" : message.role === "assistant" ? "Main Bot" : "系统"}</div>
                        <div className="mt-1 whitespace-pre-wrap leading-6">{message.content}</div>
                      </div>
                    ))}
                    {chatBusy && <div className="text-xs text-fg-tertiary">Main Bot 正在检查仓库并创建沙箱…</div>}
                  </div>
                  <div className="border-t p-3" style={{ borderColor: "var(--oc-border)" }}>
                    <textarea className="oc-input min-h-[72px]" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(); } }} placeholder="描述目标与验收标准，Enter 发送，Shift+Enter 换行" data-testid="loopforge-chat-input" />
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-2xs text-fg-tertiary">将自动创建军团战役；不会直接合并代码。</span>
                      <Button variant="primary" className="oc-btn-sm" loading={chatBusy} onClick={() => void sendChat()} data-testid="loopforge-chat-send">发送</Button>
                    </div>
                  </div>
                </section>

                <aside className="oc-card p-4">
                  <h2 className="text-sm font-semibold">当前上下文</h2>
                  {activeLegionRun ? (
                    <div className="mt-3 text-xs">
                      <div className="font-medium">{activeLegionRun.legion_name}</div>
                      <div className="mt-1 text-fg-tertiary">{activeLegionRun.goal}</div>
                      <div className="mt-2"><span className="oc-badge">{activeLegionRun.status}</span></div>
                      <div className="mt-3 space-y-1">{activeLegionRun.squad_runs.map((squadRun) => <div key={squadRun.run_id} className="rounded-md bg-surface-2 px-2 py-1.5"><div className="font-medium">{squadRun.squad_name}</div><div className="text-2xs text-fg-tertiary">{squadRun.run_id} · {squadRun.status}</div></div>)}</div>
                    </div>
                  ) : <p className="mt-2 text-xs text-fg-tertiary">发送第一条消息后，这里显示战役、小队与沙箱状态。</p>}
                  <div className="mt-5 border-t pt-3 text-xs" style={{ borderColor: "var(--oc-border)" }}>
                    <div className="flex justify-between"><span>角色</span><span>{roles.length}</span></div>
                    <div className="mt-1 flex justify-between"><span>SOP 模板</span><span>{templates.length}</span></div>
                    <div className="mt-1 flex justify-between"><span>待审批</span><span>{approvals.length}</span></div>
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button className="oc-btn-sm" onClick={() => setTab("roles")}>管理角色</Button>
                    <Button className="oc-btn-sm" onClick={() => setTab("sop")}>浏览 SOP</Button>
                  </div>
                </aside>
              </div>
            )}

            {tab === "overview" && (
              <div className="mt-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[["SOP 模板", templates.length], ["需求", requirements.length], ["待审批", approvals.length], ["战役", legionRuns.length]].map(([label, value]) => (
                    <div key={String(label)} className="oc-card p-4" data-testid="loopforge-stat"><div className="text-xs text-fg-tertiary">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <section className="oc-card p-5">
                    <h2 className="text-md font-semibold">交付飞轮</h2>
                    <p className="mt-2 text-sm text-fg-secondary">需求 → 军团/SOP → 人工审批 → 交付 → 评测与洞察 → SOP/Skill 沉淀。</p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-fg-tertiary">
                      <div>军团：{legions.length}</div><div>数字员工：{employees.length}</div><div>Skill：{skills.length}</div><div>MCP：{mcpServers.length}</div><div>评测运行：{evalRuns.length}</div><div>工作流运行：{workflowRuns.length}</div>
                    </div>
                  </section>
                  <section className="oc-card p-5">
                    <h2 className="text-md font-semibold">最近需求</h2>
                    {requirements.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无需求</p> : (
                      <ul className="mt-3 space-y-2">
                        {requirements.slice(0, 5).map((item) => <li key={item.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{item.title}</span><span className="oc-badge">{STATUS_LABEL[item.status] ?? item.status}</span></li>)}
                      </ul>
                    )}
                  </section>
                </div>
              </div>
            )}

            {tab === "sop" && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section className="oc-card p-5">
                  <div className="flex items-center justify-between"><h2 className="text-md font-semibold">SOP 模板</h2><a href="/workflows" className="oc-btn oc-btn-sm">打开工作流中心</a></div>
                  <div className="mt-3 space-y-2">
                    {templates.map((template) => (
                      <div key={template.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--oc-border)" }} data-testid="loopforge-sop-template">
                        <div className="font-medium">{template.display_name || template.name}</div>
                        <div className="mt-1 text-xs text-fg-tertiary">{template.category} · {sopNodes(template).length} 个节点</div>
                        <div className="mt-3 flex gap-2">
                          <Button className="oc-btn-sm" onClick={() => setSopTarget(template)} data-testid="loopforge-sop-view">查看节点</Button>
                          <Button className="oc-btn-sm" variant="primary" loading={sopBusy === template.id} onClick={() => void createFromSop(template)} data-testid="loopforge-sop-create">创建 SOP</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="oc-card p-5">
                  <h2 className="text-md font-semibold">SOP 定义</h2>
                  <div className="mt-3 space-y-2">
                    {definitions.length === 0 ? <p className="text-sm text-fg-tertiary">暂无定义</p> : definitions.slice(0, 10).map((definition) => (
                      <div key={definition.id} className="flex items-center justify-between gap-2 border-b py-2 text-sm last:border-0" style={{ borderColor: "var(--oc-border)" }}>
                        <span>{definition.display_name || definition.name}</span>
                        <span className="flex items-center gap-2"><span className="oc-badge">{definition.status ?? "draft"}</span><a href={`/workflows/${definition.id}/designer`} className="oc-btn oc-btn-sm" data-testid="loopforge-sop-design">设计</a></span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                    {["Agent", "Script", "HumanGate", "SubSOP", "Preview"].map((node) => <span key={node} className="oc-model-chip">{node}</span>)}
                  </div>
                </section>
              </div>
            )}

            {tab === "roles" && (
              <div className="mt-5">
                <div className="flex items-center justify-between"><p className="text-sm text-fg-secondary">可复用角色：Prompt / 模型 / 执行器 / Skills / MCP / Rules / 交付物 / 人工门禁。</p><Button variant="primary" data-testid="loopforge-role-create" onClick={() => openRole()}>+ 新建角色</Button></div>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {roles.map((role) => (
                    <section key={role.id} className="oc-card overflow-hidden" data-testid="loopforge-role-card">
                      <div className="h-1.5" style={{ background: role.color }} />
                      <button type="button" className="w-full p-4 text-left" onClick={() => openRole(role)}>
                        <div className="flex items-start justify-between gap-2"><h2 className="font-semibold">{role.name}</h2><span className="oc-badge">{role.executor}</span></div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-fg-secondary">{role.description}</p>
                        <div className="mt-3 flex flex-wrap gap-1">{role.skills.map((skill) => <span key={skill} className="oc-model-chip">{skill}</span>)}</div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-2xs text-fg-tertiary"><span>模型 · {role.model_ref}</span><span>MCP · {role.mcp_servers.length}</span><span>门禁 · {role.human_gates.length}</span><span>交付物 · {role.artifacts.length}</span></div>
                        <div className="mt-3 line-clamp-2 rounded-md bg-surface-2 p-2 font-mono text-2xs text-fg-tertiary">{role.system_prompt}</div>
                      </button>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {tab === "legions" && (
              <div className="mt-5">
                <div className="flex justify-end"><Button variant="primary" data-testid="loopforge-legion-create" onClick={() => setLegionOpen(true)}>+ 组建军团</Button></div>
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {legions.map((legion) => {
                    const stat = insights[legion.id];
                    return (
                      <section key={legion.id} className="oc-card p-5" data-testid="loopforge-legion-card">
                        <div className="flex items-start justify-between gap-2"><div><div className="oc-badge">{legion.domain}</div><h2 className="mt-2 font-semibold"><a href={`/legions/${legion.id}`} className="hover:text-[var(--oc-primary)]">{legion.name}</a></h2></div><span className="oc-badge">{legion.status}</span></div>
                        <p className="mt-2 text-xs leading-6 text-fg-secondary">{legion.mission}</p>
                        <div className="mt-3 font-mono text-xs text-fg-tertiary">SOP · {legion.process_ref || "未绑定"}</div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-surface-2 py-2"><div className="text-lg font-semibold">{stat?.dispatches ?? 0}</div><div className="text-fg-tertiary">战役</div></div>
                          <div className="rounded-lg bg-surface-2 py-2"><div className="text-lg font-semibold">{Math.round((stat?.success_rate ?? 0) * 100)}%</div><div className="text-fg-tertiary">成功率</div></div>
                          <div className="rounded-lg bg-surface-2 py-2"><div className="text-lg font-semibold">{stat?.waiting_human ?? 0}</div><div className="text-fg-tertiary">待人工</div></div>
                        </div>
                        <div className="mt-4 flex gap-2"><Button className="oc-btn-sm" variant="primary" onClick={() => setLegionTarget(legion)} data-testid="loopforge-legion-dispatch">下达战役</Button><a href={`/legions/${legion.id}`} className="oc-btn oc-btn-sm">详情</a></div>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "requirements" && (
              <div className="mt-5">
                <div className="flex justify-end"><Button variant="primary" data-testid="loopforge-requirement-create" onClick={() => setReqOpen(true)}>+ 登记需求</Button></div>
                <div className="mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "var(--oc-border)" }}>
                  <table className="w-full border-collapse text-sm">
                    <thead><tr className="border-b text-left text-xs text-fg-tertiary" style={{ borderColor: "var(--oc-border)" }}><th className="px-5 py-3">需求</th><th className="px-5 py-3">优先级</th><th className="px-5 py-3">状态</th><th className="px-5 py-3">军团</th><th className="px-5 py-3">操作</th></tr></thead>
                    <tbody>{requirements.map((item) => (
                      <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--oc-border)" }} data-testid="loopforge-requirement-row">
                        <td className="px-5 py-3"><div className="font-medium">{item.title}</div><div className="max-w-[420px] truncate text-xs text-fg-tertiary">{item.description || "—"}</div></td>
                        <td className="px-5 py-3">{item.priority}</td><td className="px-5 py-3">{STATUS_LABEL[item.status] ?? item.status}</td>
                        <td className="px-5 py-3 text-xs">{legions.find((legion) => legion.id === item.legion_id)?.name ?? "—"}</td>
                        <td className="px-5 py-3"><Button className="oc-btn-sm" variant="primary" loading={busy === item.id} onClick={() => void dispatchRequirement(item)} data-testid="loopforge-requirement-dispatch">下达军团</Button></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === "deliveries" && (
              <div className="mt-5 grid gap-4">
                {legionRuns.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary">暂无军团战役。</div> : legionRuns.map((run) => (
                  <section key={run.id} className="oc-card p-5" data-testid="loopforge-delivery-row">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><div className="font-medium">{run.goal}</div><div className="mt-1 text-xs text-fg-tertiary">{run.legion_name} · {run.requirement_ref || "无需求编号"} · {formatTime(run.created_at)}</div></div>
                      <span className="oc-badge">{run.status}</span>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {run.squad_runs.map((squadRun) => <div key={squadRun.run_id} className="rounded-md bg-surface-2 px-3 py-2 text-xs"><div className="font-medium">{squadRun.squad_name}</div><div className="mt-1 text-fg-tertiary">{squadRun.run_id} · {squadRun.status}</div></div>)}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {tab === "approvals" && (
              <div className="mt-5 grid gap-4">
                {approvals.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary">当前没有待审批事项。</div> : approvals.map((item) => (
                  <section key={`${item.run_id}:${item.gate}`} className="oc-card p-5" data-testid="loopforge-approval-row">
                    <div className="flex flex-wrap justify-between gap-2"><div><div className="oc-badge">{item.squad_name}</div><h2 className="mt-2 font-semibold">{item.gate}</h2><p className="mt-1 text-sm text-fg-secondary">{item.goal}</p></div><div className="text-xs text-fg-tertiary">{formatTime(item.requested_at)}</div></div>
                    <div className="mt-4 flex gap-2">
                      <Button variant="primary" loading={busy === `${item.run_id}:${item.gate}`} onClick={() => void decideApproval(item, "approved")}>通过</Button>
                      <Button loading={busy === `${item.run_id}:${item.gate}`} onClick={() => void sendBack(item)}>退回重做</Button>
                      <Button variant="danger" loading={busy === `${item.run_id}:${item.gate}`} onClick={() => void decideApproval(item, "rejected")}>驳回</Button>
                    </div>
                  </section>
                ))}
              </div>
            )}

            {tab === "capabilities" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["数字员工", employees.length, "/employees"],
                  ["Agent 模板", agentTemplates.length, "/agent-templates"],
                  ["Skill", skills.length, "/skills"],
                  ["MCP Server", mcpServers.length, "/mcp"],
                  ["模型中心", null, "/models"],
                  ["凭证", null, "/credentials"],
                  ["执行器", executors.length, "#executors"],
                ].map(([label, count, href]) => (
                  <a key={String(label)} href={String(href)} className="oc-card p-5 hover:border-[var(--oc-primary)]" data-testid="loopforge-capability">
                    <div className="text-sm font-semibold">{label}</div>
                    <div className="mt-2 text-2xl font-semibold">{count ?? "→"}</div>
                    <div className="mt-1 text-xs text-fg-tertiary">进入管理</div>
                  </a>
                ))}
              </div>
            )}
            {tab === "capabilities" && (
              <section id="executors" className="oc-card mt-4 p-5">
                <h2 className="text-md font-semibold">执行器（Executor Registry）</h2>
                <p className="mt-1 text-xs text-fg-tertiary">SOP Agent 节点可绑定执行器；CLI 执行器需在执行机安装，凭证不进入控制面。</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {executors.map((executor) => (
                    <div key={executor.id} className="rounded-lg border p-3" style={{ borderColor: "var(--oc-border)" }} data-testid="loopforge-executor">
                      <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{executor.label}</span><span className="oc-badge">{executor.status}</span></div>
                      <div className="mt-1 text-xs text-fg-tertiary">{executor.kind} · {executor.id}</div>
                      <p className="mt-2 text-xs leading-5 text-fg-secondary">{executor.description}</p>
                      <div className="mt-2 flex items-center gap-2"><Button className="oc-btn-sm" loading={sopBusy === `probe-${executor.id}`} onClick={() => void probe(executor.id)} data-testid="loopforge-executor-probe">探测</Button>{probes[executor.id] && <span className="text-2xs text-fg-tertiary" data-testid="loopforge-executor-probe-result">{probes[executor.id]}</span>}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === "evaluation" && (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <section className="oc-card p-5"><h2 className="text-md font-semibold">评测运行</h2>{evalRuns.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无评测运行</p> : <ul className="mt-3 space-y-2 text-sm">{evalRuns.slice(0, 8).map((run) => <li key={run.id} className="flex justify-between gap-2"><span>{run.name || run.id}</span><span className="oc-badge">{run.status}</span></li>)}</ul>}<a href="/eval" className="oc-btn oc-btn-sm mt-4">打开评测中心</a></section>
                <section className="oc-card p-5"><h2 className="text-md font-semibold">数据集</h2>{evalDatasets.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无数据集</p> : <ul className="mt-3 space-y-2 text-sm">{evalDatasets.slice(0, 8).map((dataset) => <li key={dataset.id} className="flex justify-between gap-2"><span>{dataset.name}</span><span className="text-xs text-fg-tertiary">{dataset.cases_count ?? "—"} 用例</span></li>)}</ul>}</section>
              </div>
            )}

            {tab === "governance" && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[["审计日志", "/audit"], ["事件与 DLQ", "/outbox"], ["凭证管理", "/credentials"], ["API Key", "/api-keys"], ["组织与配额", "/org"], ["可观测", "/observability"]].map(([label, href]) => (
                  <a key={label} href={href} className="oc-card p-5 hover:border-[var(--oc-primary)]" data-testid="loopforge-governance"><div className="text-sm font-semibold">{label}</div><div className="mt-2 text-xs text-fg-tertiary">打开治理模块</div></a>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {sopTarget && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setSopTarget(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="loopforge-sop-drawer">
            <h2 className="text-lg font-semibold">{sopTarget.display_name || sopTarget.name}</h2>
            <p className="mt-2 text-sm text-fg-secondary">{sopTarget.description || "SOP 节点流程"}</p>
            <div className="mt-5 space-y-3">
              {sopNodes(sopTarget).map((node, index) => (
                <div key={node.id} className="rounded-lg border p-3" style={{ borderColor: "var(--oc-border)" }} data-testid="loopforge-sop-node">
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-fg-tertiary">{index + 1}. {node.id}</span><span className="oc-badge">{node.type}</span></div>
                  <div className="mt-1 text-sm font-medium">{node.name || node.id}</div>
                  {node.needs?.length ? <div className="mt-1 text-xs text-fg-tertiary">依赖：{node.needs.join(", ")}</div> : null}
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setSopTarget(null)}>关闭</Button>
              <Button variant="primary" loading={sopBusy === sopTarget.id} onClick={() => void createFromSop(sopTarget)} data-testid="loopforge-sop-drawer-create">由此创建 SOP</Button>
            </div>
          </div>
        </div>
      )}

      {legionOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setLegionOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="loopforge-legion-drawer">
            <h2 className="text-lg font-semibold">组建数字军团</h2>
            <label className="oc-field-label mt-5" htmlFor="lf-legion-name">军团名称</label>
            <input id="lf-legion-name" className="oc-input mt-1.5" value={legionForm.name} onChange={(e) => setLegionForm((p) => ({ ...p, name: e.target.value }))} data-testid="loopforge-legion-name" />
            <label className="oc-field-label mt-4" htmlFor="lf-legion-mission">使命</label>
            <textarea id="lf-legion-mission" className="oc-input mt-1.5" rows={3} value={legionForm.mission} onChange={(e) => setLegionForm((p) => ({ ...p, mission: e.target.value }))} />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="oc-field-label">业务域<input className="oc-input mt-1.5" value={legionForm.domain} onChange={(e) => setLegionForm((p) => ({ ...p, domain: e.target.value }))} /></label>
              <label className="oc-field-label">SOP<select className="oc-input mt-1.5" value={legionForm.process_ref} onChange={(e) => setLegionForm((p) => ({ ...p, process_ref: e.target.value }))} data-testid="loopforge-legion-process"><option value="">未绑定</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.display_name || template.name}</option>)}</select></label>
            </div>
            <div className="oc-field-label mt-4">专家小队</div>
            <div className="mt-2 grid gap-2">{squads.map((squad) => <label key={squad.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={legionForm.squad_ids.includes(squad.id)} onChange={(e) => setLegionForm((p) => ({ ...p, squad_ids: e.target.checked ? [...p.squad_ids, squad.id] : p.squad_ids.filter((id) => id !== squad.id) }))} data-testid="loopforge-legion-squad" />{squad.name}</label>)}</div>
            <div className="mt-6 flex justify-end gap-2"><Button onClick={() => setLegionOpen(false)}>取消</Button><Button variant="primary" loading={busy === "legion"} onClick={() => void createLegion()} data-testid="loopforge-legion-submit">组建</Button></div>
          </div>
        </div>
      )}

      {legionTarget && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setLegionTarget(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="loopforge-dispatch-drawer">
            <h2 className="text-lg font-semibold">下达军团战役</h2>
            <p className="mt-2 text-sm text-fg-secondary">{legionTarget.name} · {legionTarget.mission}</p>
            <label className="oc-field-label mt-5" htmlFor="lf-legion-goal">战役目标</label>
            <textarea id="lf-legion-goal" className="oc-input mt-1.5" rows={5} value={legionGoal} onChange={(e) => setLegionGoal(e.target.value)} data-testid="loopforge-dispatch-goal" />
            <div className="mt-6 flex justify-end gap-2"><Button onClick={() => setLegionTarget(null)}>取消</Button><Button variant="primary" loading={busy === "dispatch-legion"} onClick={() => void dispatchLegion()} data-testid="loopforge-dispatch-submit">下达</Button></div>
          </div>
        </div>
      )}

      {roleOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setRoleOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="loopforge-role-drawer">
            <h2 className="text-lg font-semibold">{roleTarget ? "编辑角色" : "新建角色"}</h2>
            <label className="oc-field-label mt-5" htmlFor="lf-role-name">角色名称</label>
            <input id="lf-role-name" className="oc-input mt-1.5" value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} data-testid="loopforge-role-name" />
            <label className="oc-field-label mt-4" htmlFor="lf-role-desc">描述</label>
            <input id="lf-role-desc" className="oc-input mt-1.5" value={roleForm.description} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} />
            <label className="oc-field-label mt-4" htmlFor="lf-role-prompt">System Prompt</label>
            <textarea id="lf-role-prompt" className="oc-input mt-1.5" rows={5} value={roleForm.system_prompt} onChange={(e) => setRoleForm((p) => ({ ...p, system_prompt: e.target.value }))} data-testid="loopforge-role-prompt" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="oc-field-label">模型
                <input className="oc-input mt-1.5" value={roleForm.model_ref} onChange={(e) => setRoleForm((p) => ({ ...p, model_ref: e.target.value }))} placeholder="default-coding" />
              </label>
              <label className="oc-field-label">执行器
                <select className="oc-input mt-1.5" value={roleForm.executor} onChange={(e) => setRoleForm((p) => ({ ...p, executor: e.target.value }))}>
                  {executors.map((executor) => <option key={executor.id} value={executor.id}>{executor.label}</option>)}
                </select>
              </label>
            </div>
            <label className="oc-field-label mt-4" htmlFor="lf-role-color">识别色</label>
            <input id="lf-role-color" type="color" className="oc-input mt-1.5 h-10 w-20" value={roleForm.color} onChange={(e) => setRoleForm((p) => ({ ...p, color: e.target.value }))} />
            <div className="mt-6 flex justify-end gap-2"><Button onClick={() => setRoleOpen(false)}>取消</Button><Button variant="primary" loading={busy === "role"} onClick={() => void createRole()} data-testid="loopforge-role-submit">保存</Button></div>
          </div>
        </div>
      )}

      {reqOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setReqOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="loopforge-requirement-drawer">
            <h2 className="text-lg font-semibold">登记需求</h2>
            <label className="oc-field-label mt-5" htmlFor="lf-req-title">标题</label>
            <input id="lf-req-title" className="oc-input mt-1.5" value={reqForm.title} onChange={(e) => setReqForm((p) => ({ ...p, title: e.target.value }))} data-testid="loopforge-requirement-title" />
            <label className="oc-field-label mt-4" htmlFor="lf-req-desc">描述 / 验收标准</label>
            <textarea id="lf-req-desc" className="oc-input mt-1.5" rows={5} value={reqForm.description} onChange={(e) => setReqForm((p) => ({ ...p, description: e.target.value }))} />
            <label className="oc-field-label mt-4" htmlFor="lf-req-legion">军团</label>
            <select id="lf-req-legion" className="oc-input mt-1.5" value={reqForm.legion_id} onChange={(e) => setReqForm((p) => ({ ...p, legion_id: e.target.value }))}>
              <option value="">稍后选择</option>
              {legions.map((legion) => <option key={legion.id} value={legion.id}>{legion.name}</option>)}
            </select>
            <div className="mt-6 flex justify-end gap-2"><Button onClick={() => setReqOpen(false)}>取消</Button><Button variant="primary" loading={busy === "requirement"} onClick={() => void createRequirement()} data-testid="loopforge-requirement-submit">登记</Button></div>
          </div>
        </div>
      )}
      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
