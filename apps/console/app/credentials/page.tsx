"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, type CredentialItem } from "@/lib/api";

export default function CredentialsPage() {
  const [items, setItems] = useState<CredentialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [drawer, setDrawer] = useState<null | "create" | "delete">(null);
  const [target, setTarget] = useState<CredentialItem | null>(null);
  const [form, setForm] = useState({ name: "", env_key: "", value: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listCredentials();
      setItems(result.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toast = (message: string) => { setToastMessage(message); window.setTimeout(() => setToastMessage(null), 2500); };

  async function create() {
    if (!form.name.trim() || !form.env_key.trim() || !form.value) return;
    setBusy(true);
    try {
      await api.createCredential({ name: form.name.trim(), env_key: form.env_key.trim().toUpperCase(), value: form.value, description: form.description });
      setForm({ name: "", env_key: "", value: "", description: "" });
      setDrawer(null);
      await load();
      toast("凭证已保存，值已加密");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "保存凭证失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!target) return;
    setBusy(true);
    try {
      await api.deleteCredential(target.id);
      setDrawer(null);
      await load();
      toast("凭证已删除");
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "删除凭证失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="credentials-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理</div>
            <h1 className="oc-title">凭证管理</h1>
            <p className="oc-subtitle">集中保存 Agent / MCP / Skill 访问外部系统所需的 AK/SK 与环境变量；值加密存储，仅返回掩码。</p>
          </div>
          <Button variant="primary" data-testid="credential-create" onClick={() => setDrawer("create")}>+ 新建凭证</Button>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        {loading ? <div className="mt-4"><Skeleton lines={4} /></div> : items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary" data-testid="credentials-empty">还没有凭证。新建后可在 Agent / MCP 中引用环境变量名。</div>
        ) : (
          <div className="oc-card mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <caption className="sr-only">凭证列表</caption>
              <thead>
                <tr className="border-b text-left text-xs text-fg-tertiary" style={{ borderColor: "var(--oc-border)" }}>
                  <th className="px-5 py-3 font-medium">名称</th><th className="px-5 py-3 font-medium">环境变量</th><th className="px-5 py-3 font-medium">值</th><th className="px-5 py-3 font-medium">更新时间</th><th className="px-5 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--oc-border)" }} data-testid="credential-row">
                    <td className="px-5 py-3"><div className="font-medium">{item.name}</div><div className="text-xs text-fg-tertiary">{item.description || "—"}</div></td>
                    <td className="px-5 py-3 font-mono text-xs">{item.env_key}</td>
                    <td className="px-5 py-3 font-mono text-xs">{item.masked}</td>
                    <td className="px-5 py-3 text-xs text-fg-secondary">{formatTime(item.updated_at)}</td>
                    <td className="px-5 py-3"><Button className="oc-btn-sm" variant="danger" onClick={() => { setTarget(item); setDrawer("delete"); }} data-testid="credential-delete">删除</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl">
            {drawer === "create" ? (
              <>
                <h2 className="text-lg font-semibold">新建凭证</h2>
                <p className="mt-2 text-sm text-fg-secondary">值只会加密保存，创建后不可回显。</p>
                <label className="oc-field-label mt-5" htmlFor="credential-name">名称</label>
                <input id="credential-name" className="oc-input mt-1.5" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} data-testid="credential-name" placeholder="GitHub 只读 Token" />
                <label className="oc-field-label mt-4" htmlFor="credential-env-key">环境变量名</label>
                <input id="credential-env-key" className="oc-input mt-1.5 font-mono" value={form.env_key} onChange={(e) => setForm((p) => ({ ...p, env_key: e.target.value.toUpperCase() }))} data-testid="credential-env-key" placeholder="GITHUB_ACCESS_TOKEN" />
                <label className="oc-field-label mt-4" htmlFor="credential-value">值</label>
                <input id="credential-value" type="password" className="oc-input mt-1.5 font-mono" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} data-testid="credential-value" />
                <label className="oc-field-label mt-4" htmlFor="credential-description">说明</label>
                <textarea id="credential-description" className="oc-input mt-1.5" rows={3} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                <div className="mt-6 flex justify-end gap-2">
                  <Button onClick={() => setDrawer(null)}>取消</Button>
                  <Button variant="primary" loading={busy} onClick={() => void create()} data-testid="credential-submit">保存</Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">删除凭证</h2>
                <p className="mt-2 text-sm text-fg-secondary">删除后 Agent / MCP 引用该环境变量会失败，且不可恢复。</p>
                <div className="mt-4 font-mono text-sm">{target?.env_key}</div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button onClick={() => setDrawer(null)}>取消</Button>
                  <Button variant="danger" loading={busy} onClick={() => void remove()} data-testid="credential-delete-confirm">确认删除</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
