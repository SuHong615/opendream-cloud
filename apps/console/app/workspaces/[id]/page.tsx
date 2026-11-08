"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, ErrorState, Skeleton, StatusBadge } from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import { mockWorkspace } from "@/lib/mock";
import type { Workspace } from "@/lib/types";

function DetailInner() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const [ws, setWs] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [workspaceOptions, setWorkspaceOptions] = useState<Workspace[]>([]);
  const [destroyTargetId, setDestroyTargetId] = useState("");
  const [ack, setAck] = useState(false);
  const [destroyPending, setDestroyPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpened = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getWorkspace(id);
      setWs(data);
      setDemo(false);
      setError(null);
      if (["provisioning", "starting", "stopping", "idle"].includes(data.state)) {
        timer.current = setTimeout(load, 3000);
      }
    } catch (err) {
      if (isUnavailable(err)) {
        setDemo(true);
        setWs({ ...mockWorkspace, id });
        setError(null);
      } else if (err instanceof ApiError) {
        if (err.status === 401) return;
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "加载工作区详情失败" });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  useEffect(() => {
    if (!ws) return;
    let cancelled = false;
    api
      .listWorkspaces()
      .then((result) => {
        if (!cancelled) {
          setWorkspaceOptions(result.items);
          setDestroyTargetId((current) => current || ws.id);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkspaceOptions([ws]);
      });
    return () => {
      cancelled = true;
    };
  }, [ws?.id]);

  const openWorkspace = useCallback(async () => {
    if (!ws) return;
    setBusy("open");
    setError(null);
    try {
      if (demo) {
        window.open(ws.url || `https://${ws.host}`, "_blank", "noopener");
        setNotice("示例模式：已模拟在新标签页打开工作区（接入控制面后使用一次性 ticket）。");
        return;
      }
      const ticket = await api.accessTicket(ws.id);
      const target = ticket.url || ticket.base_url;
      if (!target) {
        setNotice("未获取到工作区地址，请重试。");
        return;
      }
      const win = window.open(target, "_blank", "noopener");
      if (!win) {
        setNotice("浏览器拦截了新标签页，请允许弹窗后重试。");
      } else {
        setNotice("已在新标签页打开工作区；本页保留状态，关闭浏览器不会销毁工作区。");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setNotice("工作区尚未就绪（workspace_not_ready），请稍后重试。");
        } else {
          setError({ message: err.message, requestId: err.requestId });
        }
      } else {
        setError({ message: "打开工作区失败" });
      }
    } finally {
      setBusy(null);
    }
  }, [demo, ws]);

  useEffect(() => {
    if (search.get("open") === "1" && ws && !autoOpened.current) {
      autoOpened.current = true;
      void openWorkspace();
    }
  }, [openWorkspace, search, ws]);

  async function start() {
    if (!ws) return;
    setBusy("start");
    try {
      if (!demo) {
        const next = await api.startWorkspace(ws.id);
        setWs(next);
      } else {
        setWs({ ...ws, state: "starting" });
      }
      setNotice("正在唤醒工作区（约 20 秒），就绪后可打开。");
      void load();
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      }
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    if (!ws) return;
    const target = workspaceOptions.find((item) => item.id === destroyTargetId) ?? ws;
    setBusy("destroy");
    try {
      if (!demo) {
        const next = await api.destroyWorkspace(target.id, target.display_name.trim());
        if (target.id === ws.id) setWs(next);
      } else if (target.id === ws.id) {
        setWs({ ...ws, state: "deleted" });
      }
      setDestroyPending(true);
      setDestroyOpen(false);
      setDestroyTargetId("");
      setAck(false);
      setNotice(
        target.id === ws.id
          ? "已进入销毁冷却期（默认 5 分钟，期间可撤销）。系统会先创建快照；个人不可直接删除 PVC。"
          : `已对工作区「${target.display_name}」发起销毁（冷却期内可撤销）。`,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      }
    } finally {
      setBusy(null);
    }
  }

  async function cancelDestroy() {
    if (!ws) return;
    setBusy("cancel");
    try {
      if (!demo) {
        const next = await api.cancelDestroy(ws.id);
        setWs(next);
      } else {
        setWs({ ...ws, state: "ready" });
      }
      setDestroyPending(false);
      setNotice("已撤销销毁，工作区保留。");
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ message: err.message, requestId: err.requestId });
      }
    } finally {
      setBusy(null);
    }
  }

  const destroyTarget = workspaceOptions.find((item) => item.id === destroyTargetId) ?? ws;
  const confirmed = Boolean(destroyTarget) && ack;

  return (
    <AppShell>
      <div data-testid="workspace-detail">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/workspaces" className="oc-btn oc-btn-ghost" data-testid="back-to-list">
              ← 工作区
            </Link>
            {ws && <StatusBadge state={ws.state} />}
            <h1 className="text-xl font-semibold">{ws?.display_name || "工作区详情"}</h1>
            {ws && (
              <span className="font-mono text-xs text-fg-tertiary">
                {ws.slug || ws.id.slice(0, 8)}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {ws?.state === "stopped" && (
              <Button onClick={start} loading={busy === "start"} data-testid="workspace-start">
                唤醒并打开
              </Button>
            )}
            <Button
              variant="primary"
              onClick={openWorkspace}
              loading={busy === "open"}
              disabled={!ws || ws.state === "deleted" || ws.state === "deleting"}
              data-testid="workspace-open"
            >
              打开工作区 ↗
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-4" data-testid="demo-banner">
            <Banner tone="warn">
              控制面 API 暂不可达，当前为示例数据（DEV）；操作仅本地模拟。
            </Banner>
          </div>
        )}
        {notice && (
          <div className="mt-4" data-testid="detail-notice">
            <Banner tone="info">{notice}</Banner>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <ErrorState
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading && !ws ? (
          <div className="mt-6 space-y-4">
            <Skeleton lines={5} />
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <section className="oc-card p-5 lg:col-span-2">
                <h2 className="text-md font-semibold">状态</h2>
                <p className="mt-1 text-sm text-fg-secondary">
                  进入 opencode 使用新标签页 + 一次性 access-ticket（60s）；控制台不复制
                  opencode UI。
                </p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-fg-tertiary">规格</dt>
                    <dd className="mt-0.5 text-md font-semibold">4C8G</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-tertiary">最近活动</dt>
                    <dd className="mt-0.5 text-md font-semibold">
                      {relativeTime(ws?.last_active_at || ws?.updated_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-tertiary">PVC</dt>
                    <dd className="mt-0.5 text-md font-semibold">
                      {ws?.pvc_size || "20Gi"}
                    </dd>
                  </div>
                </dl>
                {ws?.state === "error" && (
                  <div className="mt-4">
                    <Banner tone="err">
                      工作区异常{ws.state_reason ? `（${ws.state_reason}）` : ""}
                      ：可重试或联系管理员；重试不会重复扣减配额。
                    </Banner>
                  </div>
                )}
              </section>

              <section className="oc-card p-5">
                <h2 className="text-md font-semibold">最近会话</h2>
                <p className="mt-2 text-sm text-fg-secondary">
                  {ws?.last_session_title || "暂无会话记录"}
                </p>
                <Button
                  className="mt-4 w-full"
                  onClick={openWorkspace}
                  data-testid="workspace-resume"
                >
                  继续上次会话 ↗
                </Button>
                {destroyPending && (
                  <Button
                    className="mt-2 w-full"
                    onClick={cancelDestroy}
                    loading={busy === "cancel"}
                    data-testid="destroy-cancel"
                  >
                    撤销销毁
                  </Button>
                )}
              </section>
            </div>

            <section
              className="oc-card mt-4 p-5"
              style={{ borderColor: "var(--oc-danger)" }}
            >
              <h2 className="text-md font-semibold" style={{ color: "var(--oc-danger-text)" }}>
                危险区
              </h2>
              <p className="mt-1 text-sm text-fg-secondary">
                销毁工作区会停止实例；系统先创建快照再删除，PVC 默认保留 24h（可配），个人不可直接删除
                PVC。冷却默认 5 分钟（可配 5–1440），期间可撤销。
              </p>
              <Button
                variant="danger"
                className="mt-4"
                onClick={() => {
                  setDestroyTargetId(ws?.id ?? "");
                  setDestroyOpen(true);
                }}
                disabled={!ws}
                data-testid="destroy-open"
              >
                销毁工作区
              </Button>
              {demo && (
                <p className="mt-2 text-xs text-fg-tertiary">
                  示例模式：可打开确认对话框，提交后仅本地模拟，不执行真实销毁。
                </p>
              )}
            </section>
          </>
        )}

        {destroyOpen && ws && (
          <div
            className="fixed inset-0 z-40 grid place-items-center p-4"
            style={{ background: "rgba(15,23,42,.45)" }}
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDestroyOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="destroy-title"
              className="oc-card w-full max-w-lg p-6"
              data-testid="destroy-dialog"
            >
              <h2 id="destroy-title" className="text-lg font-semibold">
                销毁工作区「{ws.display_name}」？
              </h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-secondary">
                <li>实例立即停止，未提交的终端进程会结束</li>
                <li>系统先创建快照后删除（默认，不可取消）</li>
                <li>PVC 保留 24h（可配）；个人不可直接删除 PVC</li>
                <li>冷却默认 5min（可配 5–1440），期间可撤销销毁</li>
              </ul>
              <label className="mt-4 block text-sm font-medium" htmlFor="destroy-workspace">
                选择要销毁的工作区（按名称）
              </label>
              <select
                id="destroy-workspace"
                className="oc-input mt-1.5"
                value={destroyTargetId}
                onChange={(e) => setDestroyTargetId(e.target.value)}
                data-testid="destroy-workspace-select"
              >
                {workspaceOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name}（{item.slug || item.id.slice(0, 8)}）
                  </option>
                ))}
                {workspaceOptions.length === 0 && ws && (
                  <option value={ws.id}>{ws.display_name}</option>
                )}
              </select>
              <label className="mt-3 flex items-start gap-2 text-sm text-fg-secondary">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  data-testid="destroy-ack"
                />
                我已知晓：销毁后数据按快照/PVC 策略处理，冷却期后可恢复方式有限。
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  onClick={() => {
                    setDestroyOpen(false);
                    setDestroyTargetId("");
                    setAck(false);
                  }}
                  autoFocus
                  data-testid="destroy-cancel-button"
                >
                  取消
                </Button>
                <Button
                  variant="danger"
                  disabled={!confirmed}
                  loading={busy === "destroy"}
                  onClick={destroy}
                  data-testid="destroy-submit"
                >
                  销毁工作区
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function WorkspaceDetailPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <Skeleton lines={5} />
        </AppShell>
      }
    >
      <DetailInner />
    </Suspense>
  );
}
