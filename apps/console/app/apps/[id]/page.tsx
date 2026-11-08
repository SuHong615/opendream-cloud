"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, ErrorState, Skeleton } from "@/components/ui";
import { PermissionPanel } from "@/components/apps/permission-panel";
import { SharePanel } from "@/components/apps/share-panel";
import { VersionList } from "@/components/apps/version-list";
import { CollabDrawer } from "@/components/apps/collab-drawer";
import { ApiError, api, formatTime, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockApps,
  mockAuditEvents,
  mockCollabSession,
  mockMembers,
  mockShares,
  mockVersions,
} from "@/lib/app-collab-mock";
import {
  APP_STATE_LABEL,
  ROLE_LABEL,
  can,
  type AppAuditEvent,
  type AppMember,
  type AppRole,
  type AppShare,
  type AppSummary,
  type AppVersion,
} from "@/lib/app-collab-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

const STATE_TONE: Record<string, "ok" | "info" | "warn" | "err" | "muted"> = {
  running: "ok",
  building: "info",
  deploying: "info",
  sleeping: "muted",
  failed: "err",
  stopped: "muted",
};

export default function AppDetailPage() {
  const params = useParams<{ id: string }>();
  const appId = params.id;
  const [app, setApp] = useState<AppSummary | null>(null);
  const [role, setRole] = useState<AppRole>("viewer");
  const [members, setMembers] = useState<AppMember[]>([]);
  const [shares, setShares] = useState<AppShare[]>([]);
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [audit, setAudit] = useState<AppAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [collabOpen, setCollabOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<AppVersion | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

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
    try {
      const detail = await api.getApp(appId);
      setApp(detail);
      setDemo(false);
      const [memberResult, shareResult, versionResult, auditResult, permissionResult] =
        await Promise.allSettled([
          api.listAppMembers(appId),
          api.listAppShares(appId),
          api.listAppVersions(appId),
          api.listAppAudit(appId),
          api.getAppPermissions(appId),
        ]);
      if (memberResult.status === "fulfilled") setMembers(memberResult.value.items);
      if (shareResult.status === "fulfilled") setShares(shareResult.value.items);
      if (versionResult.status === "fulfilled") {
        setVersions(
          versionResult.value.items.map((item, index) => ({
            ...item,
            is_current:
              item.is_current ||
              item.status === "active" ||
              (!detail.current_version && index === 0),
            status: item.status ?? (index === 0 ? "active" : "superseded"),
          })),
        );
      }
      if (auditResult.status === "fulfilled") setAudit(auditResult.value.items);
      setRole(
        permissionResult.status === "fulfilled"
          ? permissionResult.value.role
          : detail.my_role ?? "viewer",
      );
    } catch (err) {
      if (
        isUnavailable(err) ||
        (err instanceof ApiError && (err.status === 404 || err.status === 403))
      ) {
        const fallback =
          mockApps.find((item) => item.id === appId) ?? mockApps[0];
        setApp({ ...fallback, id: appId });
        setDemo(true);
        setRole(fallback.my_role ?? "owner");
        setMembers(mockMembers);
        setShares(mockShares);
        setVersions(mockVersions);
        setAudit(mockAuditEvents);
      } else if (err instanceof ApiError) {
        if (err.status !== 401) {
          setError({ message: err.message, requestId: err.requestId });
        }
      } else {
        setError({ message: "加载应用详情失败" });
      }
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onVersionCreated(version: AppVersion) {
    setVersions((prev) => [
      { ...version, is_current: true, status: "active" },
      ...prev.map((item) => ({ ...item, is_current: false, status: "superseded" })),
    ]);
    setApp((prev) =>
      prev ? { ...prev, current_version: version.version, updated_at: new Date().toISOString() } : prev,
    );
  }

  async function rollback() {
    if (!rollbackTarget) return;
    setRolling(rollbackTarget.id);
    try {
      let next: AppVersion;
      if (demo) {
        const currentNumber =
          Number((app?.current_version || "v0").replace(/\D/g, "")) + 1;
        next = {
          id: `ver-${Date.now()}`,
          app_id: appId,
          version: `v${currentNumber}`,
          status: "active",
          is_current: true,
          hash: Math.random().toString(16).slice(2, 10),
          summary: `回滚到 ${rollbackTarget.version}：${rollbackTarget.summary ?? ""}`,
          created_by_name: "李雷",
          created_at: new Date().toISOString(),
          build_state: "succeeded",
        };
      } else {
        const result = await api.rollbackAppVersion(appId, rollbackTarget.id);
        next = result.version;
      }
      onVersionCreated(next);
      toast(`已回滚到 ${rollbackTarget.version}，生成 ${next.version}`);
      setRollbackTarget(null);
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "回滚失败",
        "err",
      );
    } finally {
      setRolling(null);
    }
  }

  const tone = app ? STATE_TONE[app.state] ?? "muted" : "muted";
  const currentVersion =
    app?.current_version ||
    versions.find((version) => version.is_current)?.version ||
    versions[0]?.version ||
    "v1";

  return (
    <AppShell>
      <div data-testid="app-detail" className="oc-page">
        {loading && !app ? (
          <div className="space-y-4">
            <Skeleton lines={4} />
            <Skeleton lines={8} />
          </div>
        ) : error ? (
          <ErrorState
            title="应用详情加载失败"
            description={error.message}
            requestId={error.requestId}
            onRetry={() => void load()}
          />
        ) : app ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="/apps" className="oc-btn oc-btn-ghost oc-btn-sm">
                    ← 应用中心
                  </Link>
                  <span
                    className="oc-badge"
                    data-testid="app-state"
                    data-state={app.state}
                    style={{
                      color:
                        tone === "ok"
                          ? "var(--oc-success-text)"
                          : tone === "err"
                            ? "var(--oc-danger-text)"
                            : tone === "info"
                              ? "var(--oc-info-text)"
                              : "var(--oc-text-secondary)",
                      background:
                        tone === "ok"
                          ? "var(--oc-success-subtle)"
                          : tone === "err"
                            ? "var(--oc-danger-subtle)"
                            : tone === "info"
                              ? "var(--oc-info-subtle)"
                              : "var(--oc-surface-hover)",
                    }}
                  >
                    {APP_STATE_LABEL[app.state] ?? app.state}
                  </span>
                  <span className="oc-badge oc-badge-primary" data-testid="app-role-badge">
                    我的角色：{ROLE_LABEL[role]}
                  </span>
                </div>
                <h1 className="mt-2 text-2xl font-semibold">{app.name}</h1>
                <p className="mt-1 text-sm text-fg-secondary">
                  <span className="font-mono">{app.host}</span> · {currentVersion} · 1C2G · 最近更新{" "}
                  {relativeTime(app.updated_at || app.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={app.url || `http://${app.host}`}
                  target="_blank"
                  rel="noreferrer"
                  className="oc-btn"
                  data-testid="app-open"
                >
                  打开应用 ↗
                </a>
                <Button
                  variant="primary"
                  onClick={() => setCollabOpen(true)}
                  disabled={!can(role, "edit")}
                  title={!can(role, "edit") ? "需要编辑者及以上角色" : undefined}
                  data-testid="app-collab-open"
                >
                  对话式修改
                </Button>
              </div>
            </div>

            {demo && (
              <div className="mt-4" data-testid="demo-banner">
                <Banner tone="warn">
                  应用/协同 API 尚未就绪，当前展示示例数据（DEV）。权限、分享与提案操作仅本地模拟。
                </Banner>
              </div>
            )}

            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <div className="space-y-5 lg:col-span-2">
                <PermissionPanel
                  appId={appId}
                  orgId={app.org_id}
                  role={role}
                  members={members}
                  onChange={setMembers}
                  demo={demo}
                  toast={toast}
                />
                <SharePanel
                  appId={appId}
                  orgId={app.org_id}
                  appUrl={app.url}
                  host={app.host}
                  role={role}
                  shares={shares}
                  onChange={setShares}
                  demo={demo}
                  toast={toast}
                />
                <VersionList
                  versions={versions}
                  canRollback={can(role, "rollback")}
                  rollingId={rolling}
                  onRollback={(version) => setRollbackTarget(version)}
                />
              </div>

              <div className="space-y-5">
                <section className="oc-card p-5">
                  <h2 className="text-md font-semibold">对话式修改</h2>
                  <p className="mt-1 text-sm text-fg-secondary">
                    基于 opencode 会话描述修改，AI 生成 patch 提案；预览 diff 后批准，
                    自动生成新版本。
                  </p>
                  <div className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ background: "var(--oc-surface-hover)" }}>
                    会话 {mockCollabSession.session_id.slice(0, 16)} · base {currentVersion} ·
                    待审批 0
                  </div>
                  <Button
                    className="mt-3 w-full"
                    variant="primary"
                    onClick={() => setCollabOpen(true)}
                    disabled={!can(role, "edit")}
                    data-testid="app-collab-open-side"
                  >
                    打开协同面板
                  </Button>
                  {!can(role, "edit") && (
                    <p className="mt-2 text-xs text-fg-tertiary">
                      需要编辑者/管理员/所有者角色才能发起修改。
                    </p>
                  )}
                </section>

                <section className="oc-card p-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-md font-semibold">审计</h2>
                    <Link
                      href={`/audit?resource_type=app&resource_id=${appId}`}
                      className="oc-link text-sm"
                      data-testid="audit-link"
                    >
                      查看全部 →
                    </Link>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {audit.slice(0, 3).map((event) => (
                      <li key={event.id} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs">{event.action}</span>
                          <span className="text-xs text-fg-tertiary">
                            {formatTime(event.created_at)}
                          </span>
                        </div>
                        <div className="text-xs text-fg-secondary">
                          {event.actor_name || "系统"} · {event.resource_name || "应用"}
                        </div>
                      </li>
                    ))}
                    {audit.length === 0 && (
                      <li className="text-sm text-fg-tertiary">暂无审计记录</li>
                    )}
                  </ul>
                </section>

                <section className="oc-card p-5">
                  <h2 className="text-md font-semibold">应用信息</h2>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-tertiary">模板</dt>
                      <dd>{app.template || "node"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-tertiary">资源</dt>
                      <dd>1C2G（固定）</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-tertiary">来源工作区</dt>
                      <dd className="max-w-[60%] truncate font-mono text-xs">
                        {app.source_workspace_id || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-fg-tertiary">创建时间</dt>
                      <dd>{app.created_at ? formatTime(app.created_at) : "—"}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </div>
          </>
        ) : null}

        {collabOpen && app && (
          <CollabDrawer
            open={collabOpen}
            appId={appId}
            appName={app.name}
            currentVersion={currentVersion}
            role={role}
            canEdit={can(role, "edit")}
            demo={demo}
            onClose={() => setCollabOpen(false)}
            onVersionCreated={onVersionCreated}
            onOpenAudit={() => {
              window.location.href = `/audit?resource_type=app&resource_id=${appId}`;
            }}
            toast={toast}
          />
        )}

        {rollbackTarget && (
          <div className="fixed inset-0 z-[70] grid place-items-center p-4">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 bg-black/45"
              onClick={() => setRollbackTarget(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="rollback-title"
              className="oc-card relative w-full max-w-md p-6"
              data-testid="version-confirm"
            >
              <h2 id="rollback-title" className="text-lg font-semibold">
                回滚到 {rollbackTarget.version}？
              </h2>
              <p className="mt-2 text-sm text-fg-secondary">
                将发布一个新版本指向该历史构建并重新部署；已存在的分享链接仍指向本应用，
                访问权限不变。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setRollbackTarget(null)}>取消</Button>
                <Button
                  variant="primary"
                  loading={rolling === rollbackTarget.id}
                  onClick={() => void rollback()}
                  data-testid="version-rollback-confirm"
                >
                  确认回滚
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-6 right-6 z-[80] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((item) => (
            <div
              key={item.id}
              className="oc-toast"
              data-testid="toast"
              data-tone={item.tone}
              style={{
                borderLeftColor:
                  item.tone === "ok"
                    ? "var(--oc-success)"
                    : item.tone === "err"
                      ? "var(--oc-danger)"
                      : "var(--oc-info)",
              }}
            >
              <span aria-hidden="true">
                {item.tone === "ok" ? "✓" : item.tone === "err" ? "!" : "i"}
              </span>
              <span>{item.message}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
