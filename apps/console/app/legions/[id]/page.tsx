"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, type LegionInsights, type LegionItem, type LegionRunItem, type RequirementItem } from "@/lib/api";

export default function LegionDetailPage() {
  const params = useParams<{ id: string }>();
  const legionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [legion, setLegion] = useState<(LegionItem & { runs: LegionRunItem[] }) | null>(null);
  const [insights, setInsights] = useState<LegionInsights | null>(null);
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!legionId) return;
    try {
      const [detail, stat, reqs] = await Promise.all([api.getLegion(legionId), api.getLegionInsights(legionId), api.listRequirements()]);
      setLegion(detail);
      setInsights(stat);
      setRequirements(reqs.items.filter((item) => item.legion_id === legionId));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, [legionId]);
  useEffect(() => { void load(); }, [load]);

  async function dispatch() {
    if (!legion || goal.trim().length < 3) return;
    setBusy(true);
    try {
      await api.dispatchLegion(legion.id, { goal: goal.trim() });
      setOpen(false);
      setGoal("");
      await load();
      setToastMessage("战役已下达");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "下达失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AppShell><div className="oc-page"><Skeleton lines={6} /></div></AppShell>;
  if (!legion) return <AppShell><div className="oc-page"><ErrorState description={error?.message ?? "军团不存在"} requestId={error?.requestId} onRetry={() => void load()} /></div></AppShell>;

  return (
    <AppShell>
      <div data-testid="legion-detail-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <a href="/legions" className="text-xs text-fg-tertiary hover:text-fg">← 返回数字军团</a>
            <div className="oc-eyebrow mt-2">{legion.domain}</div>
            <h1 className="oc-title">{legion.name}</h1>
            <p className="oc-subtitle">{legion.mission}</p>
          </div>
          <div className="flex gap-2">
            <a href="/approvals" className="oc-btn oc-btn-sm">审批中心</a>
            <Button variant="primary" data-testid="legion-detail-dispatch" onClick={() => setOpen(true)}>下达战役</Button>
          </div>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["SOP", legion.process_ref || "未绑定"],
            ["小队", `${legion.squad_ids.length} 支`],
            ["战役", String(insights?.dispatches ?? 0)],
            ["成功率", `${Math.round((insights?.success_rate ?? 0) * 100)}%`],
            ["待人工", String(insights?.waiting_human ?? 0)],
            ["平均交付", insights?.avg_delivery_ms ? `${Math.round(insights.avg_delivery_ms / 60000)} 分钟` : "—"],
            ["Token", (insights?.tokens ?? 0).toLocaleString()],
            ["成本", `$${insights?.cost_usd ?? 0}`],
          ].map(([label, value]) => (
            <div key={label} className="oc-card p-4" data-testid="legion-detail-stat">
              <div className="text-xs text-fg-tertiary">{label}</div>
              <div className="mt-1 text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>

        <section className="oc-card mt-5 p-5">
          <h2 className="text-md font-semibold">关联需求</h2>
          {requirements.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无需求。前往需求中心登记并选择本军团。</p> : (
            <ul className="mt-3 space-y-2">
              {requirements.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.title}</span><span className="oc-badge">{item.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="oc-card mt-5 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-md font-semibold">战役时间线</h2>
            <span className="oc-badge">{legion.runs.length} 个</span>
          </div>
          {legion.runs.length === 0 ? <p className="mt-3 text-sm text-fg-tertiary">还没有战役。</p> : (
            <div className="mt-4 space-y-3">
              {legion.runs.map((run) => (
                <div key={run.id} className="rounded-lg border p-4" style={{ borderColor: "var(--oc-border)" }} data-testid="legion-detail-run">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{run.goal}</div>
                      <div className="mt-1 text-xs text-fg-tertiary">{run.requirement_ref || "无需求编号"} · {formatTime(run.created_at)}</div>
                    </div>
                    <span className="oc-badge">{run.status}</span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {run.squad_runs.map((squadRun) => (
                      <div key={squadRun.run_id} className="rounded-md bg-surface-2 px-3 py-2 text-xs">
                        <div className="font-medium">{squadRun.squad_name}</div>
                        <div className="mt-1 text-fg-tertiary">{squadRun.run_id} · {squadRun.status}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="legion-detail-drawer">
            <h2 className="text-lg font-semibold">下达战役</h2>
            <p className="mt-2 text-sm text-fg-secondary">{legion.name} · {legion.process_ref || "未绑定 SOP"}</p>
            <label className="oc-field-label mt-5" htmlFor="detail-goal">战役目标</label>
            <textarea id="detail-goal" className="oc-input mt-1.5" rows={5} value={goal} onChange={(e) => setGoal(e.target.value)} data-testid="legion-detail-goal" />
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button variant="primary" loading={busy} onClick={() => void dispatch()} data-testid="legion-detail-submit">下达</Button>
            </div>
          </div>
        </div>
      )}
      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
