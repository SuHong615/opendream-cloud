"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, type CommandFront, type InterventionItem } from "@/lib/api";

export default function CommandCenterPage() {
  const [fronts, setFronts] = useState<CommandFront[]>([]);
  const [interventions, setInterventions] = useState<InterventionItem[]>([]);
  const [quality, setQuality] = useState<{ traces: number; eval_runs: number; gates: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [frontList, interventionList, summary] = await Promise.all([
        api.listCommandFronts(),
        api.listCommandInterventions(),
        api.listQualitySummary(),
      ]);
      setFronts(frontList.items);
      setGeneratedAt(frontList.generated_at);
      setInterventions(interventionList.items);
      setQuality(summary);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell>
      <div data-testid="command-center-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">应用平面 · 数字孪生</div>
            <h1 className="oc-title">数字化军团指挥中心</h1>
            <p className="oc-subtitle">态势、风险、干预与复盘。指挥中心只消费投影并发起幂等命令，不直接执行 Agent。</p>
          </div>
          <Button className="oc-btn-sm" onClick={() => void load()}>刷新态势</Button>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}
        {loading ? <div className="mt-5"><Skeleton lines={5} /></div> : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["态势事件", fronts.reduce((sum, front) => sum + front.events, 0)],
                ["等待人工", fronts.reduce((sum, front) => sum + front.waiting_human, 0)],
                ["失败/异常", fronts.reduce((sum, front) => sum + front.failed, 0)],
                ["干预命令", interventions.length],
              ].map(([label, value]) => (
                <div key={String(label)} className="oc-card p-4" data-testid="command-stat"><div className="text-xs text-fg-tertiary">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <section className="oc-card p-5">
                <div className="flex items-center justify-between"><h2 className="text-md font-semibold">战场态势</h2><span className="text-2xs text-fg-tertiary">{generatedAt ? formatTime(generatedAt) : "—"}</span></div>
                <div className="mt-3 space-y-2">
                  {fronts.map((front) => (
                    <div key={front.tenant_id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--oc-border)" }} data-testid="command-front">
                      <div className="flex justify-between gap-2"><span className="font-mono text-xs text-fg-tertiary">{front.tenant_id.slice(0, 8)}</span><span className="oc-badge">{front.events} 事件</span></div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>等待人工 <span className="font-semibold">{front.waiting_human}</span></div>
                        <div>失败 <span className="font-semibold">{front.failed}</span></div>
                        <div>最近 <span className="font-semibold">{front.last_event_at ? formatTime(front.last_event_at) : "—"}</span></div>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-lg bg-surface-2 p-3 text-xs text-fg-tertiary">数字孪生投影：来自 AgentCore/AgentLoop/LoopForge 事件；不反向写运行状态。</div>
                </div>
              </section>

              <section className="oc-card p-5">
                <h2 className="text-md font-semibold">质量平面</h2>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex justify-between"><span>Trace</span><span className="font-semibold">{quality?.traces ?? 0}</span></div>
                  <div className="flex justify-between"><span>Eval Run</span><span className="font-semibold">{quality?.eval_runs ?? 0}</span></div>
                  <div className="flex justify-between"><span>Quality Gate</span><span className="font-semibold">{quality?.gates ?? 0}</span></div>
                </div>
                <h2 className="mt-5 text-md font-semibold">最近干预</h2>
                <div className="mt-2 space-y-2">
                  {interventions.length === 0 ? <p className="text-xs text-fg-tertiary">暂无干预命令。</p> : interventions.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-md bg-surface-2 px-3 py-2 text-xs" data-testid="command-intervention">
                      <div className="flex justify-between"><span className="font-medium">{item.action}</span><span className="oc-badge">{item.status}</span></div>
                      <div className="mt-1 text-fg-tertiary">{item.reason || "无原因"} · {formatTime(item.created_at)}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
