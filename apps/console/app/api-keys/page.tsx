"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, type ApiKeyItem } from "@/lib/api";

type Drawer = null | "create" | "rotate" | "revoke" | "plaintext";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [target, setTarget] = useState<ApiKeyItem | null>(null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("workspace:read,workspace:write,model:invoke,usage:read");
  const [plaintext, setPlaintext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listApiKeys();
      setKeys(result.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
      else setError({ message: "加载 API Key 失败" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 2500);
  };

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const result = await api.createApiKey({ name: name.trim(), scopes: scopes.split(",").map((s) => s.trim()).filter(Boolean) });
      setPlaintext(result.plaintext);
      setName("");
      setDrawer("plaintext");
      await load();
      toast("API Key 已创建，请立即复制保存");
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    if (!target) return;
    setBusy(true);
    try {
      const result = await api.rotateApiKey(target.id);
      setPlaintext(result.plaintext);
      setDrawer("plaintext");
      await load();
      toast("API Key 已轮换，旧 Key 已失效");
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!target) return;
    setBusy(true);
    try {
      await api.revokeApiKey(target.id);
      setDrawer(null);
      await load();
      toast("API Key 已吊销");
    } catch (err) {
      if (err instanceof ApiError) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="api-keys-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理</div>
            <h1 className="oc-title">API Key</h1>
            <p className="oc-subtitle">为脚本、CI 与外部应用签发访问凭证；支持轮换与吊销。</p>
          </div>
          <Button variant="primary" data-testid="api-key-create" onClick={() => setDrawer("create")}>
            + 创建 API Key
          </Button>
        </div>

        {error && (
          <div className="mt-4">
            <ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} />
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Skeleton lines={4} />
            <Skeleton lines={4} />
          </div>
        ) : keys.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed p-10 text-center text-sm text-fg-secondary" data-testid="api-keys-empty">
            还没有 API Key，点击右上角创建。
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {keys.filter((key) => !key.revoked_at).map((key) => (
              <div key={key.id} className="oc-card p-5" data-testid="api-key-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{key.name}</div>
                    <div className="mt-1 font-mono text-xs text-fg-tertiary">{key.prefix}••••••••</div>
                  </div>
                  <span className="oc-badge">active</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {key.scopes.map((scope) => (
                    <span key={scope} className="oc-model-chip">{scope}</span>
                  ))}
                </div>
                <div className="mt-3 text-xs text-fg-tertiary">
                  创建：{new Date(key.created_at).toLocaleString("zh-CN")}
                </div>
                <div className="mt-4 flex gap-2 border-t pt-3" style={{ borderColor: "var(--oc-border)" }}>
                  <Button className="oc-btn-sm" data-testid="api-key-rotate" onClick={() => { setTarget(key); setDrawer("rotate"); }}>
                    轮换
                  </Button>
                  <Button className="oc-btn-sm" variant="danger" data-testid="api-key-revoke" onClick={() => { setTarget(key); setDrawer("revoke"); }}>
                    吊销
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setDrawer(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl">
            {drawer === "create" && (
              <>
                <h2 className="text-lg font-semibold">创建 API Key</h2>
                <label className="oc-field-label mt-5" htmlFor="api-key-name">名称</label>
                <input id="api-key-name" className="oc-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} data-testid="api-key-name" placeholder="CI 部署" />
                <label className="oc-field-label mt-4" htmlFor="api-key-scopes">Scopes（逗号分隔）</label>
                <input id="api-key-scopes" className="oc-input mt-1.5" value={scopes} onChange={(e) => setScopes(e.target.value)} />
                <div className="mt-6 flex justify-end gap-2">
                  <Button onClick={() => setDrawer(null)}>取消</Button>
                  <Button variant="primary" loading={busy} onClick={() => void create()} data-testid="api-key-create-submit">创建</Button>
                </div>
              </>
            )}
            {drawer === "plaintext" && (
              <>
                <h2 className="text-lg font-semibold">请立即保存 API Key</h2>
                <p className="mt-2 text-sm text-fg-secondary">明文只显示一次，关闭后无法再次查看。</p>
                <pre className="mt-4 whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 font-mono text-xs" data-testid="api-key-plaintext">{plaintext}</pre>
                <Button className="mt-5" variant="primary" onClick={() => { void navigator.clipboard?.writeText(plaintext); toast("已复制"); }}>复制</Button>
                <Button className="mt-2" onClick={() => setDrawer(null)}>我已保存</Button>
              </>
            )}
            {drawer === "rotate" && target && (
              <>
                <h2 className="text-lg font-semibold">轮换 API Key</h2>
                <p className="mt-2 text-sm text-fg-secondary">轮换后旧 Key 立即失效；请更新所有使用方。</p>
                <div className="mt-3 font-mono text-sm">{target.name}（{target.prefix}…）</div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button onClick={() => setDrawer(null)}>取消</Button>
                  <Button variant="primary" loading={busy} onClick={() => void rotate()} data-testid="api-key-rotate-submit">确认轮换</Button>
                </div>
              </>
            )}
            {drawer === "revoke" && target && (
              <>
                <h2 className="text-lg font-semibold">吊销 API Key</h2>
                <p className="mt-2 text-sm text-fg-secondary">吊销后不可恢复，使用该 Key 的请求会立即失败。</p>
                <div className="mt-3 font-mono text-sm">{target.name}（{target.prefix}…）</div>
                <div className="mt-6 flex justify-end gap-2">
                  <Button onClick={() => setDrawer(null)}>取消</Button>
                  <Button variant="danger" loading={busy} onClick={() => void revoke()} data-testid="api-key-revoke-confirm">确认吊销</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>
      )}
    </AppShell>
  );
}
