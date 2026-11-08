"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, type OutboxEventItem } from "@/lib/api";

export default function OutboxPage() {
  const [items, setItems] = useState<OutboxEventItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<string>("failed");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.listOutboxEvents(status || undefined);
      setItems(result.items);
      setStats(result.stats);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { void load(); }, [load]);

  async function replay(event: OutboxEventItem) {
    setBusy(event.id);
    try {
      await api.replayOutboxEvent(event.id);
      await load();
      setToastMessage(`已重新入队：${event.topic}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "重放失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div data-testid="outbox-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理</div>
            <h1 className="oc-title">事件与 DLQ</h1>
            <p className="oc-subtitle">Outbox 事务事件、投递状态与失败重放；接入 NATS 后可查看 DLQ 与消费进度。</p>
          </div>
          <Button className="oc-btn-sm" onClick={() => void load()}>刷新</Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {["pending", "publishing", "published", "failed"].map((key) => (
            <div key={key} className="oc-card p-4" data-testid="outbox-stat">
              <div className="text-xs text-fg-tertiary">{key}</div>
              <div className="mt-1 text-2xl font-semibold">{stats[key] ?? 0}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="text-xs text-fg-tertiary" htmlFor="outbox-status">状态</label>
          <select id="outbox-status" className="oc-input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="outbox-status">
            <option value="failed">failed</option>
            <option value="pending">pending</option>
            <option value="publishing">publishing</option>
            <option value="published">published</option>
            <option value="">全部</option>
          </select>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        {loading ? <div className="mt-4"><Skeleton lines={5} /></div> : items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary" data-testid="outbox-empty">当前状态下没有事件。</div>
        ) : (
          <div className="oc-card mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <caption className="sr-only">Outbox 事件列表</caption>
              <thead>
                <tr className="border-b text-left text-xs text-fg-tertiary" style={{ borderColor: "var(--oc-border)" }}>
                  <th className="px-5 py-3 font-medium">Topic</th><th className="px-5 py-3 font-medium">状态</th><th className="px-5 py-3 font-medium">尝试</th><th className="px-5 py-3 font-medium">时间</th><th className="px-5 py-3 font-medium">错误</th><th className="px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((event) => (
                  <tr key={event.id} className="border-b last:border-0" style={{ borderColor: "var(--oc-border)" }} data-testid="outbox-row">
                    <td className="px-5 py-3 font-mono text-xs">{event.topic}</td>
                    <td className="px-5 py-3"><span className="oc-badge">{event.status}</span></td>
                    <td className="px-5 py-3">{event.attempts}</td>
                    <td className="px-5 py-3 text-xs">{formatTime(event.created_at)}</td>
                    <td className="max-w-[260px] truncate px-5 py-3 text-xs text-fg-tertiary" title={event.last_error ?? ""}>{event.last_error ?? "—"}</td>
                    <td className="px-5 py-3">
                      <Button className="oc-btn-sm" loading={busy === event.id} onClick={() => void replay(event)} data-testid="outbox-replay">重放</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
