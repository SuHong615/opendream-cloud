"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, type LegionItem, type RequirementItem } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = { new: "待编排", in_progress: "执行中", waiting_human: "待审批", delivered: "已交付", blocked: "阻塞" };

export default function RequirementsPage() {
  const [items, setItems] = useState<RequirementItem[]>([]);
  const [legions, setLegions] = useState<LegionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "P1", legion_id: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [requirements, legionList] = await Promise.all([api.listRequirements(), api.listLegions()]);
      setItems(requirements.items);
      setLegions(legionList.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (form.title.trim().length < 2) return;
    setBusy("create");
    try {
      await api.createRequirement({ title: form.title.trim(), description: form.description, priority: form.priority, legion_id: form.legion_id || undefined });
      setOpen(false);
      setForm({ title: "", description: "", priority: "P1", legion_id: "" });
      await load();
      setToastMessage("需求已登记");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "创建需求失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function dispatch(item: RequirementItem) {
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

  return (
    <AppShell>
      <div data-testid="requirements-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力</div>
            <h1 className="oc-title">需求中心</h1>
            <p className="oc-subtitle">业务需求统一登记，按优先级编排到数字军团；需求、战役、交付与成本全链路可追溯。</p>
          </div>
          <Button variant="primary" data-testid="requirement-create" onClick={() => setOpen(true)}>+ 登记需求</Button>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        {loading ? <div className="mt-4"><Skeleton lines={4} /></div> : items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary" data-testid="requirements-empty">还没有需求。登记后选择军团下达。</div>
        ) : (
          <div className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: "var(--oc-border)" }}>
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">需求列表</caption>
              <thead><tr className="border-b text-left text-xs text-fg-tertiary" style={{ borderColor: "var(--oc-border)" }}><th className="px-5 py-3 font-medium">需求</th><th className="px-5 py-3 font-medium">优先级</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">军团</th><th className="px-5 py-3 font-medium">操作</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--oc-border)" }} data-testid="requirement-row">
                    <td className="px-5 py-3"><div className="font-medium">{item.title}</div><div className="mt-0.5 max-w-[420px] truncate text-xs text-fg-tertiary">{item.description || "—"}</div></td>
                    <td className="px-5 py-3"><span className="oc-badge">{item.priority}</span></td>
                    <td className="px-5 py-3">{STATUS_LABEL[item.status] ?? item.status}</td>
                    <td className="px-5 py-3 text-xs">{legions.find((legion) => legion.id === item.legion_id)?.name ?? "未选择"}</td>
                    <td className="px-5 py-3">
                      <Button className="oc-btn-sm" variant="primary" loading={busy === item.id} onClick={() => void dispatch(item)} data-testid="requirement-dispatch">下达军团</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="requirement-drawer">
            <h2 className="text-lg font-semibold">登记需求</h2>
            <label className="oc-field-label mt-5" htmlFor="requirement-title">标题</label>
            <input id="requirement-title" className="oc-input mt-1.5" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} data-testid="requirement-title" />
            <label className="oc-field-label mt-4" htmlFor="requirement-desc">描述 / 验收标准</label>
            <textarea id="requirement-desc" className="oc-input mt-1.5" rows={5} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} data-testid="requirement-description" />
            <label className="oc-field-label mt-4" htmlFor="requirement-priority">优先级</label>
            <select id="requirement-priority" className="oc-input mt-1.5" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))}>
              {["P0", "P1", "P2", "P3"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <label className="oc-field-label mt-4" htmlFor="requirement-legion">数字军团</label>
            <select id="requirement-legion" className="oc-input mt-1.5" value={form.legion_id} onChange={(e) => setForm((p) => ({ ...p, legion_id: e.target.value }))} data-testid="requirement-legion">
              <option value="">稍后选择</option>
              {legions.map((legion) => <option key={legion.id} value={legion.id}>{legion.name}</option>)}
            </select>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button variant="primary" loading={busy === "create"} onClick={() => void create()} data-testid="requirement-submit">登记</Button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
