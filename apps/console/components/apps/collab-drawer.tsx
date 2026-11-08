"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useEffect, useRef, useState } from "react";
import { Banner, Button } from "@/components/ui";
import { ApiError, api, relativeTime } from "@/lib/api";
import {
  buildMockProposal,
  mockCollabMessages,
  mockCollabSession,
} from "@/lib/app-collab-mock";
import {
  ROLE_LABEL,
  type AppRole,
  type AppVersion,
  type CollabMessage,
  type CollabProposal,
  type CollabSession,
} from "@/lib/app-collab-types";
import { DiffModal } from "@/components/apps/diff-view";

const REJECT_REASONS = [
  "修改不符合预期",
  "存在安全或合规风险",
  "需要补充测试",
  "稍后处理 / 重新生成",
];

export function CollabDrawer({
  open,
  appId,
  appName,
  currentVersion,
  role,
  canEdit,
  demo,
  onClose,
  onVersionCreated,
  onOpenAudit,
  toast,
}: {
  open: boolean;
  appId: string;
  appName: string;
  currentVersion: string;
  role: AppRole;
  canEdit: boolean;
  demo: boolean;
  onClose: () => void;
  onVersionCreated: (version: AppVersion) => void;
  onOpenAudit: () => void;
  toast: (message: string, tone?: "ok" | "err" | "info") => void;
}) {
  const [loading, setLoading] = useState(false);
  const [localMode, setLocalMode] = useState(demo);
  const [session, setSession] = useState<CollabSession | null>(null);
  const [messages, setMessages] = useState<CollabMessage[]>([]);
  const [proposal, setProposal] = useState<CollabProposal | null>(null);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setConflict(false);
    setError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!approving && !generating) onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      const trigger = restoreRef.current;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [open, approving, generating, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (demo) throw new Error("demo");
        const [sessionResult, messageResult, proposalResult] = await Promise.all([
          api.getCollabSession(appId),
          api.listCollabMessages(appId),
          api.listCollabProposals(appId, "open"),
        ]);
        if (cancelled) return;
        setSession(sessionResult);
        setMessages(messageResult.items);
        setProposal(
          proposalResult.items.find(
            (item) => item.status === "open" || item.status === "pending",
          ) ?? null,
        );
        setLocalMode(false);
      } catch {
        if (cancelled) return;
        setLocalMode(true);
        setSession(mockCollabSession);
        setMessages(mockCollabMessages);
        setProposal(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [appId, demo, open]);

  function appendMessage(message: CollabMessage) {
    setMessages((prev) => [...prev, message]);
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || generating || !canEdit) return;
    setInput("");
    setError(null);
    setConflict(false);
    const userMessage: CollabMessage = {
      id: `msg-local-${Date.now()}`,
      role: "user",
      sender_name: "李雷",
      content,
      created_at: new Date().toISOString(),
    };
    appendMessage(userMessage);
    setGenerating(true);

    try {
      if (localMode) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        const next = buildMockProposal(content, currentVersion);
        setProposal(next);
        appendMessage({
          id: `msg-ai-${Date.now()}`,
          role: "assistant",
          sender_name: "opencode",
          content: `已根据描述生成 patch 提案（${next.files.length} 个文件，+${next.files.reduce(
            (sum, file) => sum + file.additions,
            0,
          )} −${next.files.reduce((sum, file) => sum + file.deletions, 0)}）。请预览 diff 后批准或拒绝。`,
          created_at: new Date().toISOString(),
          proposal_id: next.id,
        });
      } else {
        await api.sendCollabMessage(appId, content);
        // The backend persists messages/proposals; an AI worker may take a
        // moment to produce the patch proposal. Poll briefly for it.
        let found = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const [messageResult, proposalResult] = await Promise.all([
            api.listCollabMessages(appId),
            api.listCollabProposals(appId, "open"),
          ]);
          setMessages(messageResult.items);
          const next = proposalResult.items.find(
            (item) => item.status === "open" || item.status === "pending",
          );
          if (next) {
            setProposal(next);
            found = true;
            break;
          }
        }
        if (!found) {
          setError(
            "消息已发送，AI 仍在生成提案。可点击「重新检查」获取最新 proposal，无需重复发送。",
          );
        }
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "生成修改提案失败，请重试",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function checkProposal() {
    setError(null);
    setGenerating(true);
    try {
      if (localMode) throw new Error("demo");
      const [messageResult, proposalResult] = await Promise.all([
        api.listCollabMessages(appId),
        api.listCollabProposals(appId, "open"),
      ]);
      setMessages(messageResult.items);
      const next = proposalResult.items.find(
        (item) => item.status === "open" || item.status === "pending",
      );
      if (next) {
        setProposal(next);
      } else {
        setError("还没有可用提案；AI 可能仍在生成，稍后再试。");
      }
    } catch {
      setError("示例模式不轮询远端提案；请继续发送修改描述。");
    } finally {
      setGenerating(false);
    }
  }

  async function approveProposal() {
    if (!proposal || approving) return;
    if (proposal.base_version !== currentVersion) {
      setConflict(true);
      return;
    }
    setApproving(true);
    setError(null);
    try {
      if (localMode) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const versionNumber = Number(currentVersion.replace(/\D/g, "")) + 1 || 1;
        const version: AppVersion = {
          id: `ver-${Date.now()}`,
          app_id: appId,
          version: `v${versionNumber}`,
          status: "active",
          is_current: true,
          hash: Math.random().toString(16).slice(2, 10),
          summary: proposal.summary,
          created_by_name: "李雷",
          created_at: new Date().toISOString(),
          build_state: "succeeded",
        };
        setProposal({ ...proposal, status: "approved" });
        onVersionCreated(version);
        appendMessage({
          id: `msg-ai-approved-${Date.now()}`,
          role: "assistant",
          sender_name: "opencode",
          content: `已批准并生成新版本 ${version.version}。可继续描述下一次修改，或到版本列表回滚。`,
          created_at: new Date().toISOString(),
        });
        toast(`已批准提案，生成 ${version.version}`);
        setDiffOpen(false);
      } else {
        const result = await api.approveCollabProposal(
          appId,
          proposal.id,
          proposal.base_version,
        );
        setProposal(result.proposal ?? { ...proposal, status: "approved" });
        onVersionCreated(result.version);
        appendMessage({
          id: `msg-ai-approved-${Date.now()}`,
          role: "assistant",
          sender_name: "opencode",
          content: `已批准并生成新版本 ${result.version.version}。`,
          created_at: new Date().toISOString(),
        });
        toast(`已批准提案，生成 ${result.version.version}`);
        setDiffOpen(false);
      }
    } catch (err) {
      const isConflict =
        err instanceof ApiError &&
        (err.status === 409 || err.reason === "collab_conflict");
      if (isConflict) {
        setConflict(true);
      } else {
        setError(err instanceof ApiError ? err.message : "批准提案失败");
      }
    } finally {
      setApproving(false);
    }
  }

  async function rejectProposal() {
    if (!proposal) return;
    const reason = rejectNote.trim()
      ? `${rejectReason}：${rejectNote.trim()}`
      : rejectReason;
    try {
      if (!localMode) {
        await api.rejectCollabProposal(appId, proposal.id, reason);
      }
      setProposal({ ...proposal, status: "rejected" });
      appendMessage({
        id: `msg-ai-rejected-${Date.now()}`,
        role: "assistant",
        sender_name: "opencode",
        content: `提案已拒绝（${rejectReason}）。可以补充描述后重新生成。`,
        created_at: new Date().toISOString(),
      });
      toast("已拒绝提案", "info");
      setRejectOpen(false);
      setDiffOpen(false);
      setRejectNote("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "拒绝提案失败");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={() => {
          if (!approving && !generating) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="collab-title"
        className="oc-drawer relative flex h-full w-full max-w-[640px] flex-col"
        data-testid="collab-drawer"
      >
        <header className="border-b px-6 py-4" style={{ borderColor: "var(--oc-border)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="collab-title" className="text-lg font-semibold">
                协同修改「{appName}」
              </h2>
              <p className="mt-1 text-xs text-fg-tertiary">
                基于 opencode 会话 · base {proposal?.base_version || currentVersion} · 我的角色：
                {ROLE_LABEL[role]}
                {localMode && " · 示例模式（DEV）"}
              </p>
            </div>
            <button
              type="button"
              className="oc-icon-btn"
              aria-label="关闭协同修改"
              onClick={onClose}
              data-testid="collab-close"
            >
              ✕
            </button>
          </div>
          {!canEdit && (
            <div className="mt-3">
              <Banner tone="info">
                你当前是{ROLE_LABEL[role]}，不能发起修改；可以查看对话与历史提案。
              </Banner>
            </div>
          )}
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5" aria-live="polite">
          {loading ? (
            <p className="text-sm text-fg-secondary">正在加载协同会话…</p>
          ) : messages.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-fg-secondary" style={{ borderColor: "var(--oc-border)" }}>
              描述你想怎么修改应用，例如「把导出按钮改成 CSV，并加一行说明」。
              AI 会读取代码并生成 patch 提案，经你批准后生成新版本。
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : ""}`}
                data-testid="collab-message"
                data-role={message.role}
              >
                {message.role !== "user" && (
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold"
                    style={{ background: "var(--oc-primary-subtle)", color: "var(--oc-primary)" }}
                  >
                    AI
                  </span>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                    message.role === "user" ? "text-white" : ""
                  }`}
                  style={
                    message.role === "user"
                      ? { background: "var(--oc-primary)" }
                      : { background: "var(--oc-surface-hover)" }
                  }
                >
                  {message.role !== "user" && (
                    <div className="mb-0.5 text-2xs font-medium text-fg-tertiary">
                      {message.sender_name || "opencode"} ·{" "}
                      {relativeTime(message.created_at)}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              </div>
            ))
          )}

          {generating && (
            <div className="flex items-center gap-2 text-sm text-fg-secondary" data-testid="collab-generating">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full" style={{ background: "var(--oc-primary)" }} />
              AI 正在读取应用代码并生成 patch 提案…
            </div>
          )}

          {conflict && (
            <div data-testid="collab-conflict">
              <Banner tone="warn">
                版本冲突：当前应用已是 {currentVersion}，提案基于 {proposal?.base_version}。
                请重新生成提案或刷新后再批准（base_version 乐观锁）。
              </Banner>
            </div>
          )}
          {error && (
            <div role="alert">
              <Banner tone="err">{error}</Banner>
              {!localMode && (
                <div className="mt-2">
                  <Button
                    className="oc-btn-sm"
                    onClick={() => void checkProposal()}
                    loading={generating}
                    data-testid="collab-retry-proposal"
                  >
                    重新检查提案
                  </Button>
                </div>
              )}
            </div>
          )}

          {proposal && proposal.status !== "approved" && proposal.status !== "rejected" && (
            <div
              className="rounded-xl border p-4"
              data-testid="collab-proposal"
              style={{
                borderColor: conflict ? "var(--oc-warning)" : "var(--oc-primary)",
                background: conflict ? "var(--oc-warning-subtle)" : "var(--oc-primary-subtle)",
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="oc-badge oc-badge-primary">
                  {conflict ? "冲突待处理" : "待审批提案"}
                </span>
                <span className="text-xs text-fg-tertiary">
                  基于 {proposal.base_version} ·{" "}
                  {proposal.files.reduce((sum, file) => sum + file.additions, 0)} 增 /{" "}
                  {proposal.files.reduce((sum, file) => sum + file.deletions, 0)} 删
                </span>
              </div>
              <p className="mt-2 text-sm">{proposal.summary}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {proposal.files.map((file) => (
                  <span key={file.path} className="oc-model-chip">
                    {file.path}
                  </span>
                ))}
              </div>
              {proposal.test_suggestions && (
                <p className="mt-2 text-xs text-fg-tertiary">
                  测试建议：{proposal.test_suggestions.join(" · ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  className="oc-btn-sm"
                  onClick={() => setDiffOpen(true)}
                  data-testid="collab-diff-open"
                >
                  查看 diff
                </Button>
                <Button
                  className="oc-btn-sm"
                  variant="primary"
                  loading={approving}
                  disabled={conflict || !canEdit}
                  onClick={() => void approveProposal()}
                  data-testid="collab-approve"
                >
                  批准并生成新版本
                </Button>
                <Button
                  className="oc-btn-sm"
                  variant="ghost"
                  disabled={!canEdit}
                  onClick={() => setRejectOpen(true)}
                  data-testid="collab-reject"
                >
                  拒绝
                </Button>
              </div>
            </div>
          )}

          {proposal && proposal.status === "approved" && (
            <p className="text-sm" style={{ color: "var(--oc-success-text)" }}>
              ✓ 提案已批准，已生成新版本。可继续描述下一次修改。
            </p>
          )}
          {proposal && proposal.status === "rejected" && (
            <p className="text-sm text-fg-secondary">提案已拒绝，可继续对话或重新生成。</p>
          )}
        </div>

        <footer className="border-t px-6 py-4" style={{ borderColor: "var(--oc-border)" }}>
          <label className="sr-only" htmlFor="collab-input">
            描述要修改的内容
          </label>
          <textarea
            id="collab-input"
            ref={inputRef}
            className="oc-input h-20 resize-none py-2"
            placeholder={
              canEdit
                ? "描述要修改的内容，例如：把导出按钮改成 CSV，并加一行说明"
                : `你当前是${ROLE_LABEL[role]}，不能发起修改`
            }
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            disabled={!canEdit || generating}
            data-testid="collab-input"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-fg-tertiary">
              ⌘/Ctrl + Enter 发送 · 每条消息与会审批都会写审计
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="oc-btn-sm"
                onClick={onOpenAudit}
              >
                查看审计
              </Button>
              <Button
                variant="primary"
                className="oc-btn-sm"
                loading={generating}
                disabled={!canEdit || !input.trim()}
                onClick={() => void sendMessage()}
                data-testid="collab-send"
              >
                发送
              </Button>
            </div>
          </div>
        </footer>
      </div>

      {diffOpen && proposal && (
        <DiffModal
          proposal={proposal}
          onClose={() => setDiffOpen(false)}
          onApprove={() => void approveProposal()}
          onReject={() => {
            setDiffOpen(false);
            setRejectOpen(true);
          }}
          approving={approving}
        />
      )}

      {rejectOpen && proposal && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 bg-black/45"
            onClick={() => setRejectOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-title"
            className="oc-card relative w-full max-w-md p-6"
            data-testid="collab-reject-dialog"
          >
            <h2 id="reject-title" className="text-lg font-semibold">
              拒绝这个提案？
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">
              请选择原因，AI 会保留对话上下文，方便你调整描述后重新生成。
            </p>
            <select
              className="oc-input mt-4"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              aria-label="拒绝原因"
            >
              {REJECT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <textarea
              className="oc-input mt-3 h-20 resize-none py-2"
              placeholder="补充说明（可选）"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setRejectOpen(false)}>取消</Button>
              <Button
                variant="danger"
                onClick={() => void rejectProposal()}
                data-testid="collab-reject-confirm"
              >
                确认拒绝
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
