"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, formatTime, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockOrgInfo,
  mockOrgMembers,
  mockOrgQuota,
} from "@/lib/m5-mock";
import type { OrgInfo, OrgMember, OrgQuota } from "@/lib/m5-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };

const ROLE_LABEL: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "成员",
  viewer: "查看者",
};

export default function OrgPage() {
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [quota, setQuota] = useState<OrgQuota | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ email: "", role: "member" });
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [quotaRequests, setQuotaRequests] = useState<Array<{ id: string; resource: string; amount: number; reason: string; status: string; created_at: string }>>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ resource: "workspaces", amount: "1", reason: "" });

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
    const [orgResult, quotaResult, memberResult] = await Promise.allSettled([
      api.getCurrentOrg(),
      api.getOrgQuotas(),
      api.listOrgMembersCurrent(),
    ]);
    const allFailed = [orgResult, quotaResult, memberResult].every(
      (result) => result.status === "rejected",
    );
    const unavailable =
      allFailed &&
      [orgResult, quotaResult, memberResult].some(
        (result) =>
          result.status === "rejected" &&
          (isUnavailable(result.reason) ||
            (result.reason instanceof ApiError &&
              (result.reason.status === 404 || result.reason.status === 403))),
      );
    if (unavailable) {
      setDemo(true);
      setOrg(mockOrgInfo);
      setQuota(mockOrgQuota);
      setMembers(mockOrgMembers);
    } else {
      setDemo(false);
      if (orgResult.status === "fulfilled") {
        setOrg(orgResult.value.organization);
        setQuota(orgResult.value.quotas);
      }
      if (quotaResult.status === "fulfilled") setQuota(quotaResult.value);
      if (memberResult.status === "fulfilled") setMembers(memberResult.value.items);
      const failed = [orgResult, quotaResult, memberResult].find(
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

  const loadQuotaRequests = useCallback(async () => {
    try {
      const result = await api.listQuotaRequests();
      setQuotaRequests(result.items);
    } catch {
      // 控制面未升级时静默降级
    }
  }, []);

  useEffect(() => {
    void loadQuotaRequests();
  }, [loadQuotaRequests]);

  async function submitQuotaRequest() {
    setBusy("quota-request");
    try {
      await api.createQuotaRequest({ resource: requestForm.resource, amount: Number(requestForm.amount), reason: requestForm.reason });
      setRequestOpen(false);
      setRequestForm({ resource: "workspaces", amount: "1", reason: "" });
      await loadQuotaRequests();
      toast("配额申请已提交");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "提交配额申请失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(member: OrgMember, role: string) {
    const memberId = member.member_id || member.id;
    setBusy(`role-${memberId}`);
    try {
      if (!demo) await api.updateOrgMemberRole(memberId, role);
      setMembers((prev) =>
        prev.map((item) =>
          (item.member_id || item.id) === memberId ? { ...item, role } : item,
        ),
      );
      toast(`已将 ${member.display_name || member.email} 设为${ROLE_LABEL[role] ?? role}`);
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "修改角色失败",
        "err",
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(member: OrgMember) {
    const memberId = member.member_id || member.id;
    setBusy(`remove-${memberId}`);
    try {
      if (!demo) await api.removeOrgMember(memberId);
      setMembers((prev) =>
        prev.filter((item) => (item.member_id || item.id) !== memberId),
      );
      setPendingRemove(null);
      toast("成员已移除");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "移除成员失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function inviteMember() {
    if (!invite.email.includes("@")) {
      toast("请输入正确的邮箱", "err");
      return;
    }
    setBusy("invite");
    try {
      let created: OrgMember;
      if (demo) {
        created = {
          id: `m-${Date.now()}`,
          member_id: `m-${Date.now()}`,
          email: invite.email,
          display_name: invite.email.split("@")[0],
          role: invite.role,
          status: "invited",
          created_at: new Date().toISOString(),
        };
      } else {
        created = await api.inviteOrgMember(invite.email, invite.role);
      }
      setMembers((prev) => [...prev, created]);
      setInviteOpen(false);
      setInvite({ email: "", role: "member" });
      toast("邀请已发送");
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "邀请失败",
        "err",
      );
    } finally {
      setBusy(null);
    }
  }

  const quotaCards = quota
    ? [
        {
          label: "工作区",
          used: quota.workspaces_used ?? 0,
          limit: quota.workspaces,
        },
        {
          label: "成员",
          used: quota.members_used ?? members.length,
          limit: quota.members,
        },
        {
          label: "MCP 服务",
          used: quota.mcp_servers_used ?? 0,
          limit: quota.mcp_servers,
        },
        {
          label: "月度预算",
          used: Math.round(quota.budget_used_usd ?? 0),
          limit: Math.round(quota.budget_usd ?? 0),
          money: true,
        },
      ]
    : [];

  return (
    <AppShell>
      <div data-testid="org-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">治理</div>
            <h1 className="oc-title">组织与配额</h1>
            <p className="oc-subtitle">
              管理组织信息、资源配额与成员角色。配额为硬限制；成员角色按
              owner / admin / member / viewer 生效。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button
              variant="primary"
              onClick={() => setInviteOpen(true)}
              data-testid="org-invite"
            >
              + 邀请成员
            </Button>
          </div>
        </div>

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              组织/配额 API 尚未就绪或不可达，当前展示示例数据（DEV）。
              邀请/改角色/移除仅本地模拟。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="组织数据加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton lines={3} />
            <Skeleton lines={6} />
          </div>
        ) : org ? (
          <>
            <div className="mt-6 grid gap-5 lg:grid-cols-3">
              <section className="oc-card p-5 lg:col-span-1">
                <h2 className="text-md font-semibold">组织信息</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-tertiary">名称</dt>
                    <dd className="font-medium">{org.name}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-tertiary">slug</dt>
                    <dd className="font-mono text-xs">{org.slug}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-tertiary">套餐</dt>
                    <dd>{org.plan || "Enterprise"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-tertiary">创建时间</dt>
                    <dd>{org.created_at ? formatTime(org.created_at) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-fg-tertiary">成员数</dt>
                    <dd>{members.length}</dd>
                  </div>
                </dl>
              </section>

              <section className="lg:col-span-2">
                <h2 className="text-md font-semibold">配额</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {quotaCards.map((item) => {
                    const pct = item.limit
                      ? Math.min(100, Math.round((item.used / item.limit) * 100))
                      : 0;
                    return (
                      <div key={item.label} className="oc-card p-4" data-testid="org-quota">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-xs text-fg-tertiary">
                            {item.money ? `$${item.used} / $${item.limit}` : `${item.used} / ${item.limit}`}
                          </span>
                        </div>
                        <div
                          className="mt-3 h-2 overflow-hidden rounded-full"
                          style={{ background: "var(--oc-surface-hover)" }}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background:
                                pct >= 90
                                  ? "var(--oc-danger)"
                                  : pct >= 70
                                    ? "var(--oc-warning)"
                                    : "var(--oc-primary)",
                            }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-fg-tertiary">使用率 {pct}%</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="oc-card mt-5 p-5" data-testid="quota-requests">
              <header className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-md font-semibold">配额申请</h2>
                  <p className="mt-1 text-xs text-fg-tertiary">提交扩容申请，管理员审批后生效。</p>
                </div>
                <Button className="oc-btn-sm" onClick={() => setRequestOpen(true)} data-testid="quota-request-create">
                  + 申请扩容
                </Button>
              </header>
              {quotaRequests.length === 0 ? (
                <p className="mt-3 text-sm text-fg-tertiary" data-testid="quota-request-empty">暂无申请记录。</p>
              ) : (
                <ul className="mt-3 divide-y" style={{ borderColor: "var(--oc-border)" }}>
                  {quotaRequests.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="quota-request-row">
                      <span>
                        {item.resource} +{item.amount}
                        {item.reason ? <span className="ml-2 text-fg-tertiary">（{item.reason}）</span> : null}
                      </span>
                      <span className="flex items-center gap-2 text-xs text-fg-tertiary">
                        <span className="oc-badge">{item.status}</span>
                        {formatTime(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="oc-card mt-5 overflow-x-auto">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4" style={{ borderColor: "var(--oc-border)" }}>
                <div>
                  <h2 className="text-md font-semibold">成员与角色</h2>
                  <p className="mt-1 text-xs text-fg-tertiary">
                    至少保留一个所有者；移除成员需要二次确认。
                  </p>
                </div>
                <span className="oc-badge">{members.length} 人</span>
              </header>
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <caption className="sr-only">组织成员列表</caption>
                <thead>
                  <tr style={{ background: "var(--oc-surface-hover)" }}>
                    <th className="px-4 py-3 text-left font-medium">成员</th>
                    <th className="px-4 py-3 text-left font-medium">角色</th>
                    <th className="px-4 py-3 text-left font-medium">状态</th>
                    <th className="px-4 py-3 text-left font-medium">加入时间</th>
                    <th className="px-4 py-3 text-left font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const memberId = member.member_id || member.id;
                    return (
                      <tr
                        key={memberId}
                        className="border-t"
                        style={{ borderColor: "var(--oc-border)" }}
                        data-testid="org-member"
                        data-role={member.role}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium">
                            {member.display_name || member.email || member.user_id}
                          </div>
                          <div className="text-xs text-fg-tertiary">{member.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            className="oc-input h-8 w-32 text-xs"
                            value={member.role}
                            disabled={busy === `role-${memberId}`}
                            onChange={(event) => void changeRole(member, event.target.value)}
                            data-testid="org-role"
                          >
                            {Object.entries(ROLE_LABEL).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-xs text-fg-secondary">
                          {member.status || "active"}
                        </td>
                        <td className="px-4 py-3 text-xs text-fg-tertiary">
                          {relativeTime(member.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {pendingRemove === memberId ? (
                            <div className="flex gap-1">
                              <Button
                                className="oc-btn-sm"
                                variant="danger"
                                loading={busy === `remove-${memberId}`}
                                onClick={() => void removeMember(member)}
                                data-testid="org-remove-confirm"
                              >
                                确认移除
                              </Button>
                              <Button
                                className="oc-btn-sm"
                                variant="ghost"
                                onClick={() => setPendingRemove(null)}
                              >
                                取消
                              </Button>
                            </div>
                          ) : (
                            <Button
                              className="oc-btn-sm"
                              variant="ghost"
                              onClick={() => setPendingRemove(memberId)}
                              data-testid="org-remove"
                              style={{ color: "var(--oc-danger-text)" }}
                            >
                              移除
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </>
        ) : null}

        {requestOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button type="button" aria-label="关闭" className="absolute inset-0 bg-black/45" onClick={() => setRequestOpen(false)} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface p-6 shadow-2xl" data-testid="quota-request-drawer">
            <h2 className="text-lg font-semibold">申请配额扩容</h2>
            <p className="mt-1 text-sm text-fg-secondary">提交后进入待审批状态；审批通过后配额自动生效。</p>
            <label className="oc-field-label mt-5" htmlFor="quota-resource">资源</label>
            <select id="quota-resource" className="oc-input mt-1.5" value={requestForm.resource} onChange={(e) => setRequestForm((prev) => ({ ...prev, resource: e.target.value }))} data-testid="quota-request-resource">
              <option value="workspaces">工作区</option>
              <option value="members">成员</option>
              <option value="budget_usd">预算（USD）</option>
              <option value="mcp_servers">MCP Server</option>
            </select>
            <label className="oc-field-label mt-4" htmlFor="quota-amount">增加数量</label>
            <input id="quota-amount" type="number" min="1" className="oc-input mt-1.5" value={requestForm.amount} onChange={(e) => setRequestForm((prev) => ({ ...prev, amount: e.target.value }))} data-testid="quota-request-amount" />
            <label className="oc-field-label mt-4" htmlFor="quota-reason">原因</label>
            <textarea id="quota-reason" className="oc-input mt-1.5" rows={3} value={requestForm.reason} onChange={(e) => setRequestForm((prev) => ({ ...prev, reason: e.target.value }))} data-testid="quota-request-reason" />
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setRequestOpen(false)}>取消</Button>
              <Button variant="primary" loading={busy === "quota-request"} onClick={() => void submitQuotaRequest()} data-testid="quota-request-submit">提交申请</Button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setInviteOpen(false)} />
            <div role="dialog" aria-modal="true" aria-labelledby="org-invite-title" className="oc-card relative w-full max-w-md p-6" data-testid="org-invite-dialog">
              <h2 id="org-invite-title" className="text-lg font-semibold">邀请成员</h2>
              <p className="mt-1 text-sm text-fg-secondary">
                邀请通过 SSO 邮箱匹配；已存在账号会直接加入组织。
              </p>
              <label className="oc-field-label mt-4" htmlFor="invite-email">邮箱</label>
              <input id="invite-email" className="oc-input" value={invite.email} onChange={(event) => setInvite((prev) => ({ ...prev, email: event.target.value }))} placeholder="name@company.com" />
              <label className="oc-field-label mt-3" htmlFor="invite-role">角色</label>
              <select id="invite-role" className="oc-input" value={invite.role} onChange={(event) => setInvite((prev) => ({ ...prev, role: event.target.value }))}>
                <option value="member">成员</option>
                <option value="admin">管理员</option>
                <option value="viewer">查看者</option>
              </select>
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setInviteOpen(false)}>取消</Button>
                <Button variant="primary" loading={busy === "invite"} onClick={() => void inviteMember()} data-testid="org-invite-submit">发送邀请</Button>
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
