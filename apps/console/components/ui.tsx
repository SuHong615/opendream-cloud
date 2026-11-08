"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { ReactNode } from "react";
import type { WorkspaceState } from "@/lib/types";

export function Button({
  children,
  variant = "secondary",
  loading,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  "data-testid"?: string;
}) {
  const cls =
    variant === "primary"
      ? "oc-btn oc-btn-primary"
      : variant === "danger"
        ? "oc-btn oc-btn-danger"
        : variant === "ghost"
          ? "oc-btn oc-btn-ghost"
          : "oc-btn";
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={`${cls} ${className}`}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}

const STATE_META: Record<
  WorkspaceState,
  { label: string; tone: "ok" | "info" | "warn" | "err" | "muted"; pulse?: boolean }
> = {
  provisioning: { label: "创建中", tone: "info", pulse: true },
  starting: { label: "启动中", tone: "info", pulse: true },
  ready: { label: "就绪", tone: "ok" },
  idle: { label: "空闲", tone: "ok" },
  stopping: { label: "休眠中", tone: "warn", pulse: true },
  stopped: { label: "已休眠", tone: "muted" },
  error: { label: "异常", tone: "err" },
  deleting: { label: "销毁中", tone: "warn", pulse: true },
  deleted: { label: "已销毁", tone: "muted" },
};

export function StatusBadge({ state }: { state: WorkspaceState }) {
  const meta = STATE_META[state] ?? {
    label: state,
    tone: "muted" as const,
  };
  const color =
    meta.tone === "ok"
      ? "var(--oc-success-text)"
      : meta.tone === "info"
        ? "var(--oc-info-text)"
        : meta.tone === "warn"
          ? "var(--oc-warning-text)"
          : meta.tone === "err"
            ? "var(--oc-danger-text)"
            : "var(--oc-text-secondary)";
  const bg =
    meta.tone === "ok"
      ? "var(--oc-success-subtle)"
      : meta.tone === "info"
        ? "var(--oc-info-subtle)"
        : meta.tone === "warn"
          ? "var(--oc-warning-subtle)"
          : meta.tone === "err"
            ? "var(--oc-danger-subtle)"
            : "var(--oc-surface-hover)";
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium"
      style={{ color, background: bg }}
      data-testid="workspace-status"
      data-state={state}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${meta.pulse ? "animate-pulse" : ""}`}
        style={{ background: "currentColor" }}
      />
      工作区状态：{meta.label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  testId = "empty-state",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="oc-card flex flex-col items-center gap-3 px-6 py-14 text-center"
      data-testid={testId}
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, var(--oc-border) 1px, transparent 0)",
        backgroundSize: "18px 18px",
      }}
    >
      <div
        aria-hidden="true"
        className="grid h-16 w-16 place-items-center rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, var(--oc-primary-subtle), rgba(122,90,248,.12))",
          color: "var(--oc-primary)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h4l2 2h5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9z" />
          <path d="M9 13h6M12 10v6" />
        </svg>
      </div>
      <h2 className="text-md font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-fg-secondary">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "加载失败",
  description,
  requestId,
  onRetry,
  testId = "error-state",
}: {
  title?: string;
  description: string;
  requestId?: string;
  onRetry?: () => void;
  testId?: string;
}) {
  return (
    <div className="oc-card px-6 py-10" role="alert" data-testid={testId}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
          style={{
            background: "var(--oc-danger-subtle)",
            color: "var(--oc-danger-text)",
          }}
        >
          !
        </span>
        <div>
          <h2 className="text-md font-semibold" style={{ color: "var(--oc-danger-text)" }}>
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-fg-secondary">{description}</p>
          {requestId && (
            <p className="mt-2 font-mono text-xs text-fg-tertiary">
              request_id: {requestId}
            </p>
          )}
          {onRetry && (
            <Button className="mt-4" onClick={onRetry} data-testid="retry-button">
              重试
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="oc-card space-y-3 p-6" aria-busy="true" data-testid="skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded"
          style={{
            background: "var(--oc-surface-hover)",
            width: `${90 - i * 12}%`,
          }}
        />
      ))}
    </div>
  );
}

export function Banner({
  tone = "info",
  children,
  testId,
}: {
  tone?: "info" | "warn" | "err" | "ok";
  children: ReactNode;
  testId?: string;
}) {
  const map = {
    info: ["var(--oc-info-subtle)", "var(--oc-info-text)"],
    warn: ["var(--oc-warning-subtle)", "var(--oc-warning-text)"],
    err: ["var(--oc-danger-subtle)", "var(--oc-danger-text)"],
    ok: ["var(--oc-success-subtle)", "var(--oc-success-text)"],
  } as const;
  const [bg, color] = map[tone];
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm"
      style={{ background: bg, color, borderColor: "var(--oc-border)" }}
      data-testid={testId}
    >
      {children}
    </div>
  );
}
