"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, type AgentTemplateItem } from "@/lib/api";

export default function AgentTemplatesPage() {
  const [items, setItems] = useState<AgentTemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [target, setTarget] = useState<AgentTemplateItem | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.listAgentTemplates();
      setItems(result.items);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) setError({ message: err.message, requestId: err.requestId });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function instantiate() {
    if (!target) return;
    setBusy(true);
    try {
      const employee = await api.instantiateAgentTemplate(target.id, name.trim() || undefined);
      setTarget(null);
      setName("");
      setToastMessage(`已从模板创建数字员工：${employee.name}`);
    } catch (err) {
      setError({ message: err instanceof ApiError ? err.message : "创建失败", requestId: err instanceof ApiError ? err.requestId : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="agent-templates-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力</div>
            <h1 className="oc-title">Agent 模板</h1>
            <p className="oc-subtitle">可复用的 Agent 配置模板：岗位、技能、MCP、记忆与自治级别；一键实例化为数字员工。</p>
          </div>
          <a href="/employees" className="oc-btn oc-btn-sm">查看数字员工</a>
        </div>

        {error && <div className="mt-4"><ErrorState description={error.message} requestId={error.requestId} onRetry={() => void load()} /></div>}

        {loading ? <div className="mt-4"><Skeleton lines={4} /></div> : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((template) => (
              <div key={template.id} className="oc-card p-5" data-testid="agent-template-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="oc-badge">{template.category}</span>
                  <span className="oc-badge">{template.config.agent_type ?? "harness"}</span>
                </div>
                <h2 className="mt-3 font-semibold">{template.name}</h2>
                <p className="mt-1 text-xs text-fg-secondary">{template.description}</p>
                <div className="mt-3 text-xs text-fg-tertiary">{template.config.title}</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(template.config.skills ?? []).slice(0, 4).map((skill) => <span key={skill} className="oc-model-chip">{skill}</span>)}
                </div>
                <Button className="oc-btn-sm mt-4" variant="primary" onClick={() => { setTarget(template); setName(`${template.name}副本`); }} data-testid="agent-template-use">使用模板</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {target && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/40" onClick={() => setTarget(null)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="agent-template-drawer">
            <h2 className="text-lg font-semibold">从模板创建数字员工</h2>
            <p className="mt-2 text-sm text-fg-secondary">{target.name} · {target.description}</p>
            <label className="oc-field-label mt-5" htmlFor="template-name">员工名称</label>
            <input id="template-name" className="oc-input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} data-testid="agent-template-name" />
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setTarget(null)}>取消</Button>
              <Button variant="primary" loading={busy} onClick={() => void instantiate()} data-testid="agent-template-submit">创建</Button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="oc-toast" data-testid="toast" data-tone="ok">{toastMessage}</div>}
    </AppShell>
  );
}
