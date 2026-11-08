"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, type QualityEvalRun, type QualityGate, type QualityTrace } from "@/lib/api";

export default function QualityPage() {
  const [traces, setTraces] = useState<QualityTrace[]>([]);
  const [evalRuns, setEvalRuns] = useState<QualityEvalRun[]>([]);
  const [gates, setGates] = useState<QualityGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [traceList, evalList, gateList] = await Promise.all([api.listQualityTraces(), api.listQualityEvalRuns(), api.listQualityGates()]);
      setTraces(traceList.items);
      setEvalRuns(evalList.items);
      setGates(gateList.items);
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
      <div data-testid="quality-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">质量平面 · AgentLoop</div>
            <h1 className="oc-title">评测与观测</h1>
            <p className="oc-subtitle">Trace → EvalRun → QualityGate。质量平面只给 verdict，不写审批；发布门禁由编排层消费。</p>
          </div>
          <Button className="oc-btn-sm" onClick={() => void load()}>刷新</Button>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}
        {loading ? <div className="mt-5"><Skeleton lines={5} /></div> : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[["Trace", traces.length], ["Eval Run", evalRuns.length], ["Quality Gate", gates.length]].map(([label, value]) => (
                <div key={String(label)} className="oc-card p-4" data-testid="quality-stat"><div className="text-xs text-fg-tertiary">{label}</div><div className="mt-1 text-2xl font-semibold">{value}</div></div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <section className="oc-card p-5">
                <h2 className="text-md font-semibold">最近 Eval Run</h2>
                {evalRuns.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无评测运行。</p> : (
                  <div className="mt-3 space-y-2">
                    {evalRuns.slice(0, 8).map((run) => (
                      <div key={run.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--oc-border)" }} data-testid="quality-eval">
                        <div className="flex justify-between gap-2"><span className="font-medium">{run.name}</span><span className="oc-badge">{run.status}</span></div>
                        <div className="mt-1 text-xs text-fg-tertiary">score {run.score} · {run.passed}/{run.total} · {formatTime(run.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="oc-card p-5">
                <h2 className="text-md font-semibold">Quality Gates</h2>
                {gates.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无门禁。</p> : (
                  <div className="mt-3 space-y-2">
                    {gates.map((gate) => (
                      <div key={gate.id} className="flex items-center justify-between rounded-lg border p-3 text-sm" style={{ borderColor: "var(--oc-border)" }} data-testid="quality-gate">
                        <span>{gate.name}</span><span className="text-xs text-fg-tertiary">min {gate.min_score} · {gate.active ? "active" : "off"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="oc-card mt-4 p-5">
              <h2 className="text-md font-semibold">最近 Trace</h2>
              {traces.length === 0 ? <p className="mt-2 text-sm text-fg-tertiary">暂无 Trace。运行 AgentCore/Harness 后可上报。</p> : (
                <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: "var(--oc-border)" }}>
                  <table className="w-full border-collapse text-sm">
                    <thead><tr className="border-b text-left text-xs text-fg-tertiary" style={{ borderColor: "var(--oc-border)" }}><th className="px-4 py-2">Trace</th><th className="px-4 py-2">Run</th><th className="px-4 py-2">状态</th><th className="px-4 py-2">Spans</th><th className="px-4 py-2">时间</th></tr></thead>
                    <tbody>{traces.slice(0, 12).map((trace) => (
                      <tr key={trace.id} className="border-b last:border-0" style={{ borderColor: "var(--oc-border)" }} data-testid="quality-trace">
                        <td className="px-4 py-2 font-mono text-xs">{trace.trace_id}</td>
                        <td className="px-4 py-2 font-mono text-xs">{trace.run_id}</td>
                        <td className="px-4 py-2">{trace.status}</td>
                        <td className="px-4 py-2">{trace.spans.length}</td>
                        <td className="px-4 py-2 text-xs text-fg-tertiary">{formatTime(trace.created_at)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
