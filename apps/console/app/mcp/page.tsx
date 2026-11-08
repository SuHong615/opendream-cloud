"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockMcpChannels,
  mockMcpServers,
  mockMcpTools,
  mockMcpVersions,
} from "@/lib/mcp-mock";
import {
  MCP_RISK_LABEL,
  MCP_VERSION_STATUS,
  type McpChannel,
  type McpServer,
  type McpTool,
  type McpVersion,
} from "@/lib/mcp-types";

type Tab = "versions" | "channels" | "tools";
type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

function versionTone(status: string): "ok" | "info" | "warn" | "err" | "muted" {
  return status === "published"
    ? "ok"
    : status === "pending_review"
      ? "warn"
      : status === "yanked" || status === "rejected"
        ? "err"
        : "muted";
}

function toneStyle(tone: "ok" | "info" | "warn" | "err" | "muted") {
  return {
    color:
      tone === "ok"
        ? "var(--oc-success-text)"
        : tone === "err"
          ? "var(--oc-danger-text)"
          : tone === "warn"
            ? "var(--oc-warning-text)"
            : tone === "info"
              ? "var(--oc-info-text)"
              : "var(--oc-text-secondary)",
    background:
      tone === "ok"
        ? "var(--oc-success-subtle)"
        : tone === "err"
          ? "var(--oc-danger-subtle)"
          : tone === "warn"
            ? "var(--oc-warning-subtle)"
            : tone === "info"
              ? "var(--oc-info-subtle)"
              : "var(--oc-surface-hover)",
  };
}

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [versions, setVersions] = useState<McpVersion[]>([]);
  const [channels, setChannels] = useState<McpChannel[]>([]);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [tab, setTab] = useState<Tab>("versions");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [demo, setDemo] = useState(false);
  const [forceDemo, setForceDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [review, setReview] = useState<{ version: McpVersion; decision: "approve" | "reject" } | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [yankTarget, setYankTarget] = useState<McpVersion | null>(null);
  const [yankReason, setYankReason] = useState("");
  const [channelDraft, setChannelDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4000);
  }, []);

  const loadServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (forceDemo) {
      setDemo(true);
      setServers(mockMcpServers);
      setSelectedId(null);
      setLoading(false);
      return;
    }
    try {
      const result = await api.listMcpServers();
      setServers(result.items);
      setSelectedId(null);
      setDemo(false);
    } catch (err) {
      if (
        isUnavailable(err) ||
        (err instanceof ApiError &&
          (err.status === 404 || err.status === 403))
      ) {
        setDemo(true);
        setServers(mockMcpServers);
        setSelectedId(null);
      } else if (err instanceof ApiError && err.status !== 401) {
        setError({ message: err.message, requestId: err.requestId });
      }
    } finally {
      setLoading(false);
    }
  }, [forceDemo]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  const loadDetail = useCallback(
    async (serverId: string) => {
      setDetailLoading(true);
      if (demo) {
        setVersions(mockMcpVersions[serverId] ?? []);
        setChannels(mockMcpChannels[serverId] ?? []);
        setTools(mockMcpTools[serverId] ?? []);
        setChannelDraft(
          Object.fromEntries(
            (mockMcpChannels[serverId] ?? []).map((item) => [item.channel, item.version_id]),
          ),
        );
        setDetailLoading(false);
        return;
      }
      try {
        const [versionResult, channelResult, toolResult] = await Promise.allSettled([
          api.listMcpVersions(serverId),
          api.getMcpChannels(serverId),
          api.listMcpTools(serverId),
        ]);
        if (versionResult.status === "fulfilled") {
          setVersions(versionResult.value.items);
        } else {
          setVersions([]);
        }
        if (channelResult.status === "fulfilled") {
          const raw = channelResult.value as unknown as
            | McpChannel[]
            | { items?: McpChannel[]; stable?: string | null; canary?: string | null };
          let items: McpChannel[] = [];
          if (Array.isArray(raw)) {
            items = raw;
          } else if (raw && Array.isArray(raw.items)) {
            items = raw.items;
          } else if (raw && (raw.stable || raw.canary)) {
            if (raw.stable) items.push({ channel: "stable", version_id: raw.stable } as McpChannel);
            if (raw.canary) items.push({ channel: "canary", version_id: raw.canary } as McpChannel);
          }
          setChannels(items);
          setChannelDraft(
            Object.fromEntries(items.map((item) => [item.channel, item.version_id])),
          );
        } else {
          setChannels([]);
          setChannelDraft({});
        }
        if (toolResult.status === "fulfilled") {
          setTools(toolResult.value.items);
        } else {
          setTools([]);
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const selected = servers.find((server) => server.id === selectedId) ?? null;

  async function decideReview() {
    if (!review || !selected) return;
    const { version, decision } = review;
    setBusy(`review-${version.id}`);
    try {
      let updated: McpVersion;
      if (demo) {
        updated = {
          ...version,
          status: decision === "approve" ? "pending_review" : "rejected",
          reviewed_by: "李雷",
        };
      } else {
        updated = await api.reviewMcpVersion(
          selected.id,
          version.id,
          decision,
          reviewComment || undefined,
        );
      }
      setVersions((prev) =>
        prev.map((item) => (item.id === version.id ? updated : item)),
      );
      setReview(null);
      setReviewComment("");
      toast(
        decision === "approve"
          ? `已审核通过 ${version.version}，等待发布`
          : `已拒绝 ${version.version}`,
        decision === "approve" ? "ok" : "info",
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "审核失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function publish(version: McpVersion) {
    if (!selected) return;
    setBusy(`publish-${version.id}`);
    try {
      let updated: McpVersion;
      if (demo) {
        updated = { ...version, status: "published", published_at: new Date().toISOString() };
      } else {
        updated = await api.publishMcpVersion(selected.id, version.id);
      }
      setVersions((prev) =>
        prev.map((item) => (item.id === version.id ? updated : item)),
      );
      toast(`已发布 ${version.version}`);
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "发布失败",
        "err",
      );
    } finally {
      setBusy(null);
    }
  }

  async function yank() {
    if (!selected || !yankTarget) return;
    setBusy(`yank-${yankTarget.id}`);
    try {
      let updated: McpVersion;
      if (demo) {
        updated = { ...yankTarget, status: "yanked", yanked_at: new Date().toISOString() };
      } else {
        updated = await api.yankMcpVersion(
          selected.id,
          yankTarget.id,
          yankReason || undefined,
        );
      }
      setVersions((prev) =>
        prev.map((item) => (item.id === yankTarget.id ? updated : item)),
      );
      setYankTarget(null);
      setYankReason("");
      toast(`已撤回 ${updated.version}`, "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "撤回失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function saveChannels() {
    if (!selected) return;
    const payload = ["stable", "canary"]
      .filter((channel) => channelDraft[channel])
      .map((channel) => ({ channel, version_id: channelDraft[channel] }));
    setBusy("channels");
    try {
      if (demo) {
        const versionByid = new Map(versions.map((version) => [version.id, version.version]));
        setChannels(
          payload.map((item) => ({
            channel: item.channel,
            version_id: item.version_id,
            version: versionByid.get(item.version_id),
            effective_at: new Date().toISOString(),
          })),
        );
      } else {
        const result = await api.updateMcpChannels(selected.id, payload);
        setChannels(result.items);
      }
      toast("渠道指针已更新");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "渠道更新失败", "err");
    } finally {
      setBusy(null);
    }
  }

  const publishedVersions = versions.filter((version) => version.status === "published");

  return (
    <AppShell>
      <div data-testid="mcp-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力</div>
            <h1 className="oc-title">MCP 中心</h1>
            <p className="oc-subtitle">
              管理企业 MCP 服务的版本生命周期：审核 → 发布 → 渠道指针（stable/canary）
              → 撤回；工具目录可审计、按风险授权。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="oc-btn-sm"
              variant="secondary"
              onClick={() => {
                setForceDemo(true);
                setDemo(true);
                setServers(mockMcpServers);
                setSelectedId(mockMcpServers[0].id);
              }}
              data-testid="mcp-demo"
            >
              示例数据
            </Button>
            <Button className="oc-btn-sm" onClick={() => void loadServers()}>
              刷新
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              MCP 管理 API 尚未就绪或不可达，当前展示示例数据（DEV）。审核/发布/撤回/渠道
              操作仅本地模拟。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="MCP 数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void loadServers()}
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <Skeleton lines={6} />
            <div className="lg:col-span-2">
              <Skeleton lines={8} />
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-3">
            <div className="space-y-3">
              {servers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  className={`oc-card w-full p-4 text-left transition-colors ${
                    selectedId === server.id ? "ring-1" : ""
                  }`}
                  style={{
                    borderColor:
                      selectedId === server.id ? "var(--oc-primary)" : "var(--oc-border)",
                  }}
                  onClick={() => setSelectedId(server.id)}
                  data-testid="mcp-server"
                  data-server-id={server.id}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{server.name}</span>
                    <span className="oc-badge" style={toneStyle(server.status === "active" ? "ok" : "muted")}>
                      {server.status === "active" ? "启用" : server.status || "未知"}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-fg-secondary">
                    {server.description || "未填写描述"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-fg-tertiary">
                    <span>最新 {server.latest_version || "—"}</span>
                    <span>渠道 {server.channel || "—"}</span>
                    <span>{server.tools_count ?? 0} 工具</span>
                  </div>
                </button>
              ))}
              {servers.length === 0 && (
                <EmptyState
                  title="还没有 MCP 服务"
                  description="先在 MCP Hub 注册并绑定企业服务；也可以先查看示例数据了解版本生命周期。"
                  action={
                    <Button
                      variant="primary"
                      onClick={() => {
                        setDemo(true);
                        setServers(mockMcpServers);
                        setSelectedId(mockMcpServers[0].id);
                      }}
                    >
                      查看示例数据
                    </Button>
                  }
                />
              )}
            </div>

            <section className="oc-card min-h-[520px] p-5 lg:col-span-2" data-testid="mcp-detail">
              <button
                type="button"
                className="mb-3 oc-btn oc-btn-sm oc-btn-ghost"
                data-testid="mcp-back"
                onClick={() => setSelectedId(null)}
              >
                ← 返回 MCP 列表
              </button>
              {selected ? (
                <>
                  <header className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{selected.name}</h2>
                      <p className="mt-1 font-mono text-xs text-fg-tertiary">
                        {selected.slug || selected.id} · {selected.transport || "http"} ·{" "}
                        {selected.url || "—"}
                      </p>
                    </div>
                    <span className="oc-badge">
                      stable:{" "}
                      {channels.find((item) => item.channel === "stable")?.version || "—"}
                    </span>
                  </header>

                  <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="MCP 详情">
                    {[
                      { id: "versions" as const, label: "版本" },
                      { id: "channels" as const, label: "渠道" },
                      { id: "tools" as const, label: "工具目录" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === item.id}
                        className={`oc-btn oc-btn-sm ${tab === item.id ? "oc-btn-primary" : ""}`}
                        onClick={() => setTab(item.id)}
                        data-testid={`mcp-tab-${item.id}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {detailLoading ? (
                    <Skeleton lines={6} />
                  ) : tab === "versions" ? (
                    <ul className="mt-4 space-y-2">
                      {versions.map((version) => (
                        <li
                          key={version.id}
                          className="rounded-lg border p-3"
                          style={{ borderColor: "var(--oc-border)" }}
                          data-testid="mcp-version"
                          data-status={version.status}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{version.version}</span>
                              <span className="oc-badge" style={toneStyle(versionTone(version.status))}>
                                {MCP_VERSION_STATUS[version.status] ?? version.status}
                              </span>
                              <span className="text-xs text-fg-tertiary">
                                {version.tools_count ?? 0} 工具 · {relativeTime(version.created_at)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {version.status === "pending_review" && (
                                <>
                                  <Button
                                    className="oc-btn-sm"
                                    variant="primary"
                                    onClick={() => {
                                      setReview({ version, decision: "approve" });
                                      setReviewComment("");
                                    }}
                                    data-testid="mcp-review-approve"
                                  >
                                    审核通过
                                  </Button>
                                  <Button
                                    className="oc-btn-sm"
                                    variant="danger"
                                    onClick={() => {
                                      setReview({ version, decision: "reject" });
                                      setReviewComment("");
                                    }}
                                    data-testid="mcp-review-reject"
                                  >
                                    拒绝
                                  </Button>
                                </>
                              )}
                              {version.status === "draft" && (
                                <Button
                                  className="oc-btn-sm"
                                  onClick={() => void publish(version)}
                                  loading={busy === `publish-${version.id}`}
                                  data-testid="mcp-publish"
                                >
                                  发布
                                </Button>
                              )}
                              {version.status === "published" && (
                                <Button
                                  className="oc-btn-sm"
                                  variant="ghost"
                                  style={{ color: "var(--oc-danger-text)" }}
                                  onClick={() => {
                                    setYankTarget(version);
                                    setYankReason("");
                                  }}
                                  data-testid="mcp-yank"
                                >
                                  撤回
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="mt-1.5 text-xs text-fg-secondary">
                            {version.changelog || "无变更说明"}
                          </p>
                        </li>
                      ))}
                      {versions.length === 0 && (
                        <li className="text-sm text-fg-tertiary">还没有版本</li>
                      )}
                    </ul>
                  ) : tab === "channels" ? (
                    <div className="mt-4 space-y-4">
                      <p className="text-sm text-fg-secondary">
                        渠道指针决定 opencode/工作流默认使用的版本；canary 用于灰度验证，
                        切换后立即生效并写入审计。
                      </p>
                      {["stable", "canary"].map((channel) => (
                        <label key={channel} className="block">
                          <span className="oc-field-label">{channel}</span>
                          <select
                            className="oc-input"
                            value={channelDraft[channel] || ""}
                            onChange={(event) =>
                              setChannelDraft((prev) => ({
                                ...prev,
                                [channel]: event.target.value,
                              }))
                            }
                            data-testid={`mcp-channel-${channel}`}
                          >
                            <option value="">未设置</option>
                            {versions
                              .filter((version) => version.status === "published")
                              .map((version) => (
                                <option key={version.id} value={version.id}>
                                  {version.version}
                                </option>
                              ))}
                          </select>
                        </label>
                      ))}
                      <div className="flex justify-end">
                        <Button
                          variant="primary"
                          loading={busy === "channels"}
                          onClick={() => void saveChannels()}
                          data-testid="mcp-channel-save"
                        >
                          保存渠道指针
                        </Button>
                      </div>
                      <ul className="mt-3 space-y-1 text-xs text-fg-tertiary">
                        {channels.map((item) => (
                          <li key={item.channel}>
                            {item.channel} → {item.version || item.version_id} ·{" "}
                            {relativeTime(item.effective_at)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <caption className="sr-only">已发布工具目录</caption>
                        <thead>
                          <tr style={{ background: "var(--oc-surface-hover)" }}>
                            <th className="px-3 py-2 text-left font-medium">工具</th>
                            <th className="px-3 py-2 text-left font-medium">说明</th>
                            <th className="px-3 py-2 text-left font-medium">风险</th>
                            <th className="px-3 py-2 text-left font-medium">属性</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tools.map((tool) => (
                            <tr
                              key={tool.name}
                              className="border-t"
                              style={{ borderColor: "var(--oc-border)" }}
                              data-testid="mcp-tool"
                            >
                              <td className="px-3 py-2 font-mono text-xs">{tool.name}</td>
                              <td className="px-3 py-2 text-xs text-fg-secondary">
                                {tool.description || "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className="oc-badge"
                                  style={toneStyle(
                                    tool.risk === "high"
                                      ? "err"
                                      : tool.risk === "medium"
                                        ? "warn"
                                        : "ok",
                                  )}
                                >
                                  {MCP_RISK_LABEL[tool.risk ?? "low"] ?? tool.risk}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-fg-tertiary">
                                {tool.read_only ? "只读" : "写"}
                                {tool.destructive ? " · 破坏性" : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {tools.length === 0 && (
                        <p className="mt-3 text-sm text-fg-tertiary">暂无已发布工具</p>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <EmptyState title="选择一个 MCP 服务" description="查看版本、渠道与工具目录。" />
              )}
            </section>
          </div>
        )}

        {review && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setReview(null)} />
            <div role="dialog" aria-modal="true" aria-labelledby="mcp-review-title" className="oc-card relative w-full max-w-md p-6" data-testid="mcp-review-dialog">
              <h2 id="mcp-review-title" className="text-lg font-semibold">
                {review.decision === "approve" ? "审核通过" : "拒绝"} {review.version.version}
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                审核结果会写入审计；通过后还需发布才会进入渠道。
              </p>
              <label className="oc-field-label mt-4" htmlFor="mcp-review-comment">备注（可选）</label>
              <textarea id="mcp-review-comment" className="oc-input h-20 resize-none py-2" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} />
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setReview(null)}>取消</Button>
                <Button variant={review.decision === "approve" ? "primary" : "danger"} loading={busy === `review-${review.version.id}`} onClick={() => void decideReview()} data-testid="mcp-review-confirm">
                  确认{review.decision === "approve" ? "通过" : "拒绝"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {yankTarget && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setYankTarget(null)} />
            <div role="dialog" aria-modal="true" aria-labelledby="mcp-yank-title" className="oc-card relative w-full max-w-md p-6" data-testid="mcp-yank-dialog">
              <h2 id="mcp-yank-title" className="text-lg font-semibold">
                撤回 {yankTarget.version}
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                撤回后该版本不可再被渠道引用；已绑定应用需要重新选择版本。
              </p>
              <label className="oc-field-label mt-4" htmlFor="mcp-yank-reason">原因</label>
              <textarea id="mcp-yank-reason" className="oc-input h-20 resize-none py-2" value={yankReason} onChange={(event) => setYankReason(event.target.value)} />
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setYankTarget(null)}>取消</Button>
                <Button variant="danger" loading={busy === `yank-${yankTarget.id}`} onClick={() => void yank()} data-testid="mcp-yank-confirm">
                  确认撤回
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
