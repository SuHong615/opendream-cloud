"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, isUnavailable, relativeTime } from "@/lib/api";
import { mockExperiences, mockMemories } from "@/lib/m5-mock";
import type { ExperienceItem, MemoryItem } from "@/lib/m5-types";

type Tab = "memory" | "experience";
type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

export default function MemoryPage() {
  const [tab, setTab] = useState<Tab>("memory");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [experiences, setExperiences] = useState<ExperienceItem[]>([]);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [experienceQuery, setExperienceQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newText, setNewText] = useState("");
  const [newScope, setNewScope] = useState("user");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [memoryResult, experienceResult] = await Promise.allSettled([
      api.listMemory(),
      api.listExperiences(),
    ]);
    const allFailed = [memoryResult, experienceResult].every(
      (result) => result.status === "rejected",
    );
    const unavailable =
      allFailed &&
      [memoryResult, experienceResult].some(
        (result) =>
          result.status === "rejected" &&
          (isUnavailable(result.reason) ||
            (result.reason instanceof ApiError &&
              (result.reason.status === 404 || result.reason.status === 403))),
      );
    if (unavailable) {
      setDemo(true);
      setMemories(mockMemories);
      setExperiences(mockExperiences);
    } else {
      setDemo(false);
      if (memoryResult.status === "fulfilled") setMemories(memoryResult.value.items);
      if (experienceResult.status === "fulfilled")
        setExperiences(experienceResult.value.items);
      const failed = [memoryResult, experienceResult].find(
        (result) => result.status === "rejected",
      );
      if (failed && failed.status === "rejected") {
        const reason = failed.reason;
        if (reason instanceof ApiError && reason.status !== 401) {
          setError({ message: reason.message, requestId: reason.requestId });
        }
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function searchMemory() {
    if (!memoryQuery.trim()) {
      await load();
      return;
    }
    try {
      if (demo) {
        setMemories(
          mockMemories.filter((item) =>
            item.text.toLowerCase().includes(memoryQuery.toLowerCase()),
          ),
        );
      } else {
        const result = await api.listMemory(memoryQuery.trim());
        setMemories(result.items);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "搜索失败", "err");
    }
  }

  async function searchExperience() {
    if (!experienceQuery.trim()) {
      await load();
      return;
    }
    try {
      if (demo) {
        setExperiences(
          mockExperiences.filter((item) =>
            `${item.title} ${item.content} ${(item.tags ?? []).join(" ")}`
              .toLowerCase()
              .includes(experienceQuery.toLowerCase()),
          ),
        );
      } else {
        const result = await api.listExperiences(experienceQuery.trim());
        setExperiences(result.items);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "搜索失败", "err");
    }
  }

  async function addMemory() {
    if (!newText.trim()) return;
    setBusy(true);
    try {
      if (demo) {
        setMemories((prev) => [
          {
            id: `mem-${Date.now()}`,
            text: newText.trim(),
            scope: newScope,
            user_id: "u-lilei",
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      } else {
        await api.addMemory(newText.trim(), newScope);
        await load();
      }
      setAddOpen(false);
      setNewText("");
      toast("记忆已添加");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "添加失败", "err");
    } finally {
      setBusy(false);
    }
  }

  async function removeMemory(item: MemoryItem) {
    setDeleting(item.id);
    try {
      if (!demo) await api.deleteMemory(item.id);
      setMemories((prev) => prev.filter((memory) => memory.id !== item.id));
      toast("记忆已删除");
    } catch (err) {
      toast(
        err instanceof ApiError ? `${err.message}${err.reason ? `（${err.reason}）` : ""}` : "删除失败",
        "err",
      );
    } finally {
      setDeleting(null);
    }
  }

  return (
    <AppShell>
      <div data-testid="memory-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">知识与记忆</div>
            <h1 className="oc-title">记忆与经验</h1>
            <p className="oc-subtitle">
              Memory 记录用户/应用/组织的长期偏好与事实；Experience 沉淀可复用的经验条目，
              可被工作流、协同与数字人检索使用。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button
              variant="primary"
              onClick={() => setAddOpen(true)}
              disabled={tab !== "memory"}
              data-testid="memory-add"
            >
              + 添加记忆
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              Memory/Experience API 尚未就绪或不可达，当前展示示例数据（DEV）。
              新增/删除仅本地模拟。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="记忆数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-1.5" role="tablist" aria-label="记忆视图">
          {[
            { id: "memory" as const, label: "Memory" },
            { id: "experience" as const, label: "Experience" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`oc-btn oc-btn-sm ${tab === item.id ? "oc-btn-primary" : ""}`}
              onClick={() => setTab(item.id)}
              data-testid={`memory-tab-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mt-6 space-y-3">
            <Skeleton lines={4} />
            <Skeleton lines={5} />
          </div>
        ) : tab === "memory" ? (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              <input
                className="oc-input max-w-md"
                placeholder="搜索记忆内容…"
                value={memoryQuery}
                onChange={(event) => setMemoryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchMemory();
                }}
                data-testid="memory-search"
                aria-label="搜索记忆"
              />
              <Button onClick={() => void searchMemory()}>搜索</Button>
            </div>
            <div className="mt-4 space-y-3">
              {memories.map((item) => (
                <article
                  key={item.id}
                  className="oc-card p-4"
                  data-testid="memory-row"
                  data-memory-id={item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-sm">{item.text}</p>
                    <Button
                      className="oc-btn-sm"
                      variant="ghost"
                      loading={deleting === item.id}
                      onClick={() => void removeMemory(item)}
                      style={{ color: "var(--oc-danger-text)" }}
                    >
                      删除
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                    <span className="oc-badge">{item.scope || "user"}</span>
                    {item.user_id && <span>{item.user_id}</span>}
                    <span>{relativeTime(item.created_at)}</span>
                    {item.score != null && <span>相关度 {(item.score * 100).toFixed(0)}%</span>}
                  </div>
                </article>
              ))}
              {memories.length === 0 && (
                <EmptyState
                  title="还没有记忆"
                  description="记录一条长期事实或偏好，让工作流与数字人下次能记住。"
                  action={<Button variant="primary" onClick={() => setAddOpen(true)}>添加记忆</Button>}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              <input
                className="oc-input max-w-md"
                placeholder="搜索经验标题/内容/标签…"
                value={experienceQuery}
                onChange={(event) => setExperienceQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchExperience();
                }}
                data-testid="experience-search"
                aria-label="搜索经验"
              />
              <Button onClick={() => void searchExperience()}>搜索</Button>
            </div>
            <div className="mt-4 space-y-3">
              {experiences.map((item) => (
                <article
                  key={item.id}
                  className="oc-card p-4"
                  data-testid="experience-row"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-sm font-medium">{item.title}</h2>
                    <span className="oc-badge">{item.source || "manual"}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-fg-secondary">{item.content}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-tertiary">
                    {(item.tags ?? []).map((tag) => (
                      <span key={tag} className="oc-badge">#{tag}</span>
                    ))}
                    <span>{formatTime(item.created_at)}</span>
                  </div>
                </article>
              ))}
              {experiences.length === 0 && (
                <EmptyState
                  title="还没有经验条目"
                  description="工作流或协同结束后可把可复用做法沉淀为 Experience。"
                />
              )}
            </div>
          </>
        )}

        {addOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setAddOpen(false)} />
            <div role="dialog" aria-modal="true" aria-labelledby="memory-add-title" className="oc-card relative w-full max-w-lg p-6" data-testid="memory-add-dialog">
              <h2 id="memory-add-title" className="text-lg font-semibold">添加记忆</h2>
              <p className="mt-1 text-sm text-fg-secondary">
                Memory 会按 scope 隔离；敏感字段写入前会被脱敏。
              </p>
              <label className="oc-field-label mt-4" htmlFor="memory-text">内容</label>
              <textarea id="memory-text" className="oc-input h-24 resize-none py-2" value={newText} onChange={(event) => setNewText(event.target.value)} placeholder="例如：本团队发布审批要求通过率 ≥90%" />
              <label className="oc-field-label mt-3" htmlFor="memory-scope">作用域</label>
              <select id="memory-scope" className="oc-input" value={newScope} onChange={(event) => setNewScope(event.target.value)}>
                <option value="user">用户</option>
                <option value="app">应用</option>
                <option value="org">组织</option>
              </select>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setAddOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy} disabled={!newText.trim()} onClick={() => void addMemory()} data-testid="memory-add-submit">添加</Button>
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
