"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import { mockPrompts } from "@/lib/prompt-mock";
import type { PromptAsset, PromptInput } from "@/lib/prompt-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };
type FormState = {
  name: string;
  description: string;
  content: string;
  variables: string;
  tags: string;
  model_ref: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  content: "",
  variables: "",
  tags: "",
  model_ref: "",
};

function splitList(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function timeText(value?: string | number): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return relativeTime(date.toISOString());
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptAsset[]>([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PromptAsset | null>(null);
  const [detail, setDetail] = useState<PromptAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromptAsset | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listPrompts();
      setPrompts(result.items);
      setDemo(false);
    } catch (err) {
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setDemo(true);
        setPrompts(mockPrompts);
      } else if (err instanceof ApiError && err.status !== 401) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "Prompt 加载失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    prompts.forEach((prompt) => prompt.tags.forEach((item) => set.add(item)));
    return [...set].sort();
  }, [prompts]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return prompts.filter((prompt) => {
      if (tag && !prompt.tags.includes(tag)) return false;
      if (!normalized) return true;
      return `${prompt.name} ${prompt.description} ${prompt.content} ${prompt.tags.join(" ")}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [prompts, query, tag]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(prompt: PromptAsset) {
    setEditing(prompt);
    setForm({
      name: prompt.name,
      description: prompt.description,
      content: prompt.content,
      variables: prompt.variables.join(", "),
      tags: prompt.tags.join(", "),
      model_ref: prompt.model_ref ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function savePrompt() {
    if (!form.name.trim() || !form.content.trim()) {
      setFormError("请填写名称与内容");
      return;
    }
    const payload: PromptInput = {
      name: form.name.trim(),
      description: form.description.trim(),
      content: form.content,
      variables: splitList(form.variables),
      tags: splitList(form.tags),
      model_ref: form.model_ref.trim() || null,
    };
    setBusy("save");
    setFormError(null);
    try {
      let saved: PromptAsset;
      if (demo) {
        saved = {
          ...payload,
          description: payload.description ?? "",
          variables: payload.variables ?? [],
          tags: payload.tags ?? [],
          model_ref: payload.model_ref ?? null,
          id: editing?.id ?? `prompt-${Date.now()}`,
          system: editing?.system ?? false,
          created_at: editing?.created_at ?? new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else if (editing) {
        saved = await api.updatePrompt(editing.id, payload);
      } else {
        saved = await api.createPrompt(payload);
      }
      setPrompts((prev) => {
        if (editing) {
          return prev.map((item) => (item.id === saved.id ? saved : item));
        }
        return [saved, ...prev];
      });
      setFormOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      toast(editing ? "Prompt 已更新" : "Prompt 已创建");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "保存 Prompt 失败");
    } finally {
      setBusy(null);
    }
  }

  async function removePrompt() {
    if (!deleteTarget) return;
    setBusy(`delete-${deleteTarget.id}`);
    try {
      if (!demo) await api.deletePrompt(deleteTarget.id);
      setPrompts((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast("Prompt 已删除");
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "删除失败",
        "err",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div data-testid="prompts-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力 · Prompt</div>
            <h1 className="oc-title">Prompt 库</h1>
            <p className="oc-subtitle">
              集中管理可复用的系统提示词：变量、标签与模型指向。系统预置只读，组织可创建/编辑
              自己的 Prompt 并用于评测、实验与工作流。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="oc-btn-sm"
              variant="secondary"
              onClick={() => {
                setDemo(true);
                setPrompts(mockPrompts);
              }}
              data-testid="prompts-demo"
            >
              示例数据
            </Button>
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button variant="primary" onClick={openCreate} data-testid="prompt-create">
              + 创建 Prompt
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              当前展示示例 Prompt（DEV）。创建/编辑/删除仅本地模拟，不会写入真实组织。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="Prompt 加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            className="oc-input max-w-sm"
            placeholder="搜索名称 / 描述 / 内容 / 标签…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索 Prompt"
            data-testid="prompt-search"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="按标签筛选">
            <button
              type="button"
              className={`oc-btn oc-btn-sm ${tag === "" ? "oc-btn-primary" : ""}`}
              onClick={() => setTag("")}
            >
              全部
            </button>
            {tags.map((item) => (
              <button
                key={item}
                type="button"
                className={`oc-btn oc-btn-sm ${tag === item ? "oc-btn-primary" : ""}`}
                onClick={() => setTag(tag === item ? "" : item)}
              >
                #{item}
              </button>
            ))}
          </div>
          <span className="text-xs text-fg-tertiary">{filtered.length} 条</span>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Skeleton lines={5} />
            <Skeleton lines={5} />
            <Skeleton lines={5} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={prompts.length === 0 ? "还没有 Prompt" : "没有匹配的 Prompt"}
              description={
                prompts.length === 0
                  ? "创建第一个可复用 Prompt，配置变量与标签。"
                  : "调整搜索或标签筛选。"
              }
              action={
                prompts.length === 0 ? (
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={openCreate}>
                      创建 Prompt
                    </Button>
                    <Button
                      onClick={() => {
                        setDemo(true);
                        setPrompts(mockPrompts);
                      }}
                    >
                      载入示例数据
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((prompt) => (
              <article
                key={prompt.id}
                className="oc-card flex flex-col p-5"
                data-testid="prompt-card"
                data-prompt-id={prompt.id}
                data-system={prompt.system ? "true" : "false"}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-md font-semibold">{prompt.name}</h2>
                    <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">
                      {prompt.description || "未填写描述"}
                    </p>
                  </div>
                  <span className="oc-badge">{prompt.system ? "系统预置" : "自定义"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {prompt.variables.map((variable) => (
                    <span key={variable} className="oc-model-chip font-mono">
                      {`{{${variable}}}`}
                    </span>
                  ))}
                  {prompt.variables.length === 0 && (
                    <span className="text-xs text-fg-tertiary">无变量</span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {prompt.tags.map((item) => (
                    <span key={item} className="oc-badge">
                      #{item}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                  {prompt.model_ref && <span>模型：{prompt.model_ref}</span>}
                  <span>更新于 {timeText(prompt.updated_at)}</span>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--oc-border)" }}>
                  <Button
                    className="oc-btn-sm"
                    onClick={() => setDetail(prompt)}
                    data-testid="prompt-detail"
                  >
                    详情
                  </Button>
                  <Button
                    className="oc-btn-sm"
                    disabled={prompt.system}
                    title={prompt.system ? "系统预置只读" : undefined}
                    onClick={() => openEdit(prompt)}
                    data-testid="prompt-edit"
                  >
                    编辑
                  </Button>
                  <Button
                    className="oc-btn-sm"
                    variant="ghost"
                    disabled={prompt.system}
                    title={prompt.system ? "系统预置不可删除" : undefined}
                    style={prompt.system ? undefined : { color: "var(--oc-danger-text)" }}
                    onClick={() => setDeleteTarget(prompt)}
                    data-testid="prompt-delete"
                  >
                    删除
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}

        {formOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setFormOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="prompt-form-title"
              className="oc-card relative max-h-[88vh] w-full max-w-2xl overflow-y-auto p-6"
              data-testid="prompt-form-dialog"
            >
              <h2 id="prompt-form-title" className="text-lg font-semibold">
                {editing ? "编辑 Prompt" : "创建 Prompt"}
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">名称</span>
                  <input className="oc-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="发票抽取（内部增强版）" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">描述</span>
                  <input className="oc-input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="用途与输出约定" />
                </label>
                <label className="block">
                  <span className="oc-field-label">变量（逗号分隔）</span>
                  <input className="oc-input font-mono" value={form.variables} onChange={(event) => setForm((prev) => ({ ...prev, variables: event.target.value }))} placeholder="document, schema" />
                </label>
                <label className="block">
                  <span className="oc-field-label">标签（逗号分隔）</span>
                  <input className="oc-input" value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="finance, extract" />
                </label>
                <label className="block">
                  <span className="oc-field-label">模型指向（可选）</span>
                  <input className="oc-input font-mono" value={form.model_ref} onChange={(event) => setForm((prev) => ({ ...prev, model_ref: event.target.value }))} placeholder="deepseek-v3" />
                </label>
              </div>
              <label className="oc-field-label mt-3" htmlFor="prompt-content">
                内容
              </label>
              <textarea
                id="prompt-content"
                className="oc-input h-56 resize-y py-2 font-mono text-xs"
                value={form.content}
                onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
                placeholder={"你是...\n输入：{{document}}\n输出 JSON。"}
              />
              <p className="mt-1 text-xs text-fg-tertiary">
                使用 <code>{"{{variable}}"}</code> 引用变量；变量会在执行时替换。
              </p>
              {formError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{formError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setFormOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy === "save"} onClick={() => void savePrompt()} data-testid="prompt-save">
                  {editing ? "保存修改" : "创建"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {detail && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setDetail(null)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="prompt-detail-title"
              className="oc-card relative flex max-h-[88vh] w-full max-w-2xl flex-col"
              data-testid="prompt-detail-panel"
            >
              <header className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--oc-border)" }}>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 id="prompt-detail-title" className="text-lg font-semibold">
                      {detail.name}
                    </h2>
                    <span className="oc-badge">{detail.system ? "系统预置 · 只读" : "自定义"}</span>
                  </div>
                  <p className="mt-1 text-xs text-fg-tertiary">{detail.description || "未填写描述"}</p>
                </div>
                <button type="button" className="oc-icon-btn" aria-label="关闭详情" onClick={() => setDetail(null)}>
                  ✕
                </button>
              </header>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <h3 className="text-sm font-medium">内容</h3>
                <pre
                  className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs"
                  style={{ background: "var(--oc-surface-hover)" }}
                >
                  {detail.content}
                </pre>
                <h3 className="mt-4 text-sm font-medium">变量说明</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.variables.map((variable) => (
                    <li key={variable} className="flex items-center gap-2">
                      <code className="oc-model-chip font-mono">{`{{${variable}}}`}</code>
                      <span className="text-xs text-fg-tertiary">
                        调用时传入的上下文（如文档、diff、schema、用户问题）
                      </span>
                    </li>
                  ))}
                  {detail.variables.length === 0 && (
                    <li className="text-xs text-fg-tertiary">该 Prompt 无变量，可直接使用</li>
                  )}
                </ul>
                <h3 className="mt-4 text-sm font-medium">标签与模型</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detail.tags.map((item) => (
                    <span key={item} className="oc-badge">
                      #{item}
                    </span>
                  ))}
                  {detail.model_ref && <span className="oc-model-chip">{detail.model_ref}</span>}
                  <span className="text-xs text-fg-tertiary">更新于 {timeText(detail.updated_at)}</span>
                </div>
              </div>
              <footer className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--oc-border)" }}>
                {!detail.system && (
                  <Button
                    className="oc-btn-sm"
                    onClick={() => {
                      setDetail(null);
                      openEdit(detail);
                    }}
                    data-testid="prompt-edit"
                  >
                    编辑
                  </Button>
                )}
                <Button className="oc-btn-sm" onClick={() => setDetail(null)}>
                  关闭
                </Button>
              </footer>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setDeleteTarget(null)} />
            <div role="dialog" aria-modal="true" aria-labelledby="prompt-delete-title" className="oc-card relative w-full max-w-md p-6" data-testid="prompt-delete-dialog">
              <h2 id="prompt-delete-title" className="text-lg font-semibold">
                删除 Prompt
              </h2>
              <p className="mt-2 text-sm text-fg-secondary">
                确定删除「{deleteTarget.name}」？引用该 Prompt 的评测/实验不会自动更新。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setDeleteTarget(null)}>取消</Button>
                <Button variant="danger" loading={busy === `delete-${deleteTarget.id}`} onClick={() => void removePrompt()} data-testid="prompt-delete-confirm">
                  确认删除
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 right-6 z-[80] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((item) => (
            <div key={item.id} className="oc-toast" data-testid="toast" data-tone={item.tone} style={{ borderLeftColor: item.tone === "ok" ? "var(--oc-success)" : item.tone === "err" ? "var(--oc-danger)" : "var(--oc-info)" }}>
              <span aria-hidden="true">{item.tone === "ok" ? "✓" : item.tone === "err" ? "!" : "i"}</span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
