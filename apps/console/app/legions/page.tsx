"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, type LegionInsights, type LegionItem, type LegionRunItem } from "@/lib/api";

export default function LegionsPage() {
  const [legions, setLegions] = useState<LegionItem[]>([]);
  const [runs, setRuns] = useState<LegionRunItem[]>([]);
  const [insights, setInsights] = useState<Record<string, LegionInsights>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [target, setTarget] = useState<LegionItem | null>(null);
  const [goal, setGoal] = useState("");
  const [requirement, setRequirement] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [squads, setSquads] = useState<Array<{ id: string; name: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; display_name?: string }>>([]);
  const [form, setForm] = useState({ name: "", mission: "", domain: "通用", process_ref: "", squad_ids: [] as string[] });

  const load = useCallback(async () => {
    try {
      const [list, runList, squadList, templateList] = await Promise.all([
        api.listLegions(),
        api.listLegionRuns(),
        api.listAgentSquads(),
        api.listWorkflowTemplates(),
      ]);
      setLegions(list.items);
      setRuns(runList.items);
      setSquads(squadList.items.map((squad) => ({ id: squad.id, name: squad.name })));
      setTemplates(templateList.items.map((template) => ({ id: template.id, name: template.name, display_name: template.display_name })));
      const entries = await Promise.all(list.items.map(async (legion) => [legion.id, await api.getLegionInsights(legion.id)] as const));
      setInsights(Object.fromEntries(entries));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createLegion() {
    if (!form.name.trim() || !form.mission.trim() || form.squad_ids.length === 0) return;
    setBusy(true);
    try {
      await api.createLegion({ name: form.name.trim(), mission: form.mission.trim(), domain: form.domain, process_ref: form.process_ref, squad_ids: form.squad_ids });
      setCreateOpen(false);
      setForm({ name: "", mission: "", domain: "通用", process_ref: "", squad_ids: [] });
      await load();
      setToastMessage("数字军团已组建");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "创建军团失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function dispatch() {
    if (!target || goal.trim().length < 3) return;
    setBusy(true);
    try {
      const run = await api.dispatchLegion(target.id, { goal: goal.trim(), requirement_ref: requirement.trim() || undefined });
      setTarget(null);
      setGoal("");
      setRequirement("");
      await load();
      setToastMessage(`已下达战役：${run.legion_name}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "下达失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="legions-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力</div>
            <h1 className="oc-title">数字军团</h1>
            <p className="oc-subtitle">以流程为编制，把多支专家小队编成军团；需求进入即按 SOP 调度、人工门禁与交付度量，形成业务飞轮。</p>
          </div>
          <div className="flex gap-2">
            <Button className="oc-btn-sm" onClick={() => void load()}>刷新</Button>
            <Button variant="primary" data-testid="legion-create" onClick={() => setCreateOpen(true)}>+ 新建军团</Button>
          </div>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        {loading ? <div className="mt-4"><Skeleton lines={4} /></div> : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {legions.map((legion) => {
              const stat = insights[legion.id];
              return (
                <section key={legion.id} className="oc-card p-5" data-testid="legion-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="oc-badge">{legion.domain}</div>
                      <h2 className="mt-2 font-semibold">
                        <a href={`/legions/${legion.id}`} className="hover:text-[var(--oc-primary)]" data-testid="legion-open">{legion.name}</a>
                      </h2>
                    </div>
                    <span className="oc-badge">{legion.status}</span>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-fg-secondary">{legion.mission}</p>
                  <div className="mt-3 font-mono text-xs text-fg-tertiary">SOP · {legion.process_ref || "未绑定"}</div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-surface-2 py-2"><div className="text-lg font-semibold">{stat?.dispatches ?? 0}</div><div className="text-2xs text-fg-tertiary">战役</div></div>
                    <div className="rounded-lg bg-surface-2 py-2"><div className="text-lg font-semibold">{Math.round((stat?.success_rate ?? 0) * 100)}%</div><div className="text-2xs text-fg-tertiary">成功率</div></div>
                    <div className="rounded-lg bg-surface-2 py-2"><div className="text-lg font-semibold">{stat?.waiting_human ?? 0}</div><div className="text-2xs text-fg-tertiary">待人工</div></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-fg-tertiary">
                    <span>{legion.squad_ids.length} 支小队</span>
                    <span>${stat?.cost_usd ?? 0} · {(stat?.tokens ?? 0).toLocaleString()} tokens</span>
                  </div>
                  <Button className="oc-btn-sm mt-4" variant="primary" onClick={() => { setTarget(legion); setGoal(""); setRequirement(""); }} data-testid="legion-dispatch">下达战役</Button>
                </section>
              );
            })}
          </div>
        )}

        <section className="oc-card mt-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold">军团战役</h2>
            <span className="oc-badge">{runs.length} 个</span>
          </div>
          {runs.length === 0 ? <p className="mt-3 text-sm text-fg-tertiary">还没有战役。选择一个军团下达需求。</p> : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--oc-border)" }}>
              {runs.slice(0, 8).map((run) => (
                <li key={run.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" data-testid="legion-run-row">
                  <div><div className="font-medium">{run.goal}</div><div className="mt-0.5 text-xs text-fg-tertiary">{run.legion_name} · {run.requirement_ref || "无需求编号"} · {run.squad_runs.length} 支小队</div></div>
                  <span className="oc-badge">{run.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setTarget(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="legion-dispatch-drawer">
            <h2 className="text-lg font-semibold">下达军团战役</h2>
            <p className="mt-2 text-sm text-fg-secondary">{target.name} · {target.mission}</p>
            <label className="oc-field-label mt-5" htmlFor="legion-goal">战役目标</label>
            <textarea id="legion-goal" className="oc-input mt-1.5" rows={4} value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="legion-goal" placeholder="描述需求、验收标准与期望交付" />
            <label className="oc-field-label mt-4" htmlFor="legion-requirement">需求编号（可选）</label>
            <input id="legion-requirement" className="oc-input mt-1.5" value={requirement} onChange={(e) => setRequirement(e.target.value)} data-testid="legion-requirement" placeholder="REQ-2026-001" />
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setTarget(null)}>取消</Button>
              <Button variant="primary" loading={busy} onClick={() => void dispatch()} data-testid="legion-dispatch-submit">下达</Button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setCreateOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="legion-create-drawer">
            <h2 className="text-lg font-semibold">组建数字军团</h2>
            <p className="mt-2 text-sm text-fg-secondary">以流程为编制，选择一个 SOP 与至少一支专家小队。</p>
            <label className="oc-field-label mt-5" htmlFor="legion-name">军团名称</label>
            <input id="legion-name" className="oc-input mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} data-testid="legion-create-name" />
            <label className="oc-field-label mt-4" htmlFor="legion-mission">使命</label>
            <textarea id="legion-mission" className="oc-input mt-1.5" rows={3} value={form.mission} onChange={(e) => setForm((p) => ({ ...p, mission: e.target.value }))} data-testid="legion-create-mission" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="oc-field-label" htmlFor="legion-domain">业务域
                <input id="legion-domain" className="oc-input mt-1.5" value={form.domain} onChange={(e) => setForm((p) => ({ ...p, domain: e.target.value }))} />
              </label>
              <label className="oc-field-label" htmlFor="legion-process">SOP
                <select id="legion-process" className="oc-input mt-1.5" value={form.process_ref} onChange={(e) => setForm((p) => ({ ...p, process_ref: e.target.value }))} data-testid="legion-create-process">
                  <option value="">未绑定</option>
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.display_name || template.name}</option>)}
                </select>
              </label>
            </div>
            <div className="oc-field-label mt-4">专家小队</div>
            <div className="mt-2 grid gap-2">
              {squads.map((squad) => (
                <label key={squad.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.squad_ids.includes(squad.id)}
                    onChange={(e) => setForm((p) => ({ ...p, squad_ids: e.target.checked ? [...p.squad_ids, squad.id] : p.squad_ids.filter((id) => id !== squad.id) }))}
                    data-testid="legion-create-squad"
                  />
                  {squad.name}
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button variant="primary" loading={busy} onClick={() => void createLegion()} data-testid="legion-create-submit">组建</Button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
