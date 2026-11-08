"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, type ApprovalItem } from "@/lib/api";

export default function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listApprovals();
      setItems(result.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(item: ApprovalItem, decision: "approved" | "rejected") {
    setBusy(`${item.run_id}:${item.gate}`);
    try {
      await api.decideAgentRun(item.run_id, { gate: item.gate, decision });
      await load();
      setToastMessage(decision === "approved" ? `已通过：${item.gate}` : `已驳回：${item.gate}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "审批失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(null);
    }
  }

  async function sendBack(item: ApprovalItem) {
    setBusy(`${item.run_id}:${item.gate}`);
    try {
      await api.sendBackAgentRun(item.run_id, { gate: item.gate, reason: "审批退回：请按验收标准重做" });
      await load();
      setToastMessage(`已退回重做：${item.gate}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "退回失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div data-testid="approvals-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理</div>
            <h1 className="oc-title">审批中心</h1>
            <p className="oc-subtitle">所有数字员工 / 军团运行中的人工门禁统一收件；审批后继续同一战役，支持驳回。</p>
          </div>
          <Button className="oc-btn-sm" onClick={() => void load()}>刷新</Button>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        {loading ? <div className="mt-4"><Skeleton lines={4} /></div> : items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary" data-testid="approvals-empty">当前没有待审批事项。</div>
        ) : (
          <div className="mt-5 grid gap-4">
            {items.map((item) => (
              <section key={`${item.run_id}:${item.gate}`} className="oc-card p-5" data-testid="approval-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="oc-badge">{item.squad_name}</div>
                    <h2 className="mt-2 font-semibold">{item.gate}</h2>
                    <p className="mt-1 text-sm text-fg-secondary">{item.goal}</p>
                  </div>
                  <div className="text-xs text-fg-tertiary">{formatTime(item.requested_at)}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="primary" loading={busy === `${item.run_id}:${item.gate}`} onClick={() => void decide(item, "approved")} data-testid="approval-approve">通过</Button>
                  <Button loading={busy === `${item.run_id}:${item.gate}`} onClick={() => void sendBack(item)} data-testid="approval-send-back">退回重做</Button>
                  <Button variant="danger" loading={busy === `${item.run_id}:${item.gate}`} onClick={() => void decide(item, "rejected")} data-testid="approval-reject">驳回</Button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
