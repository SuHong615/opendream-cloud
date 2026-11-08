"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useEffect, useMemo, useState } from "react";
import { Banner, Button } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { mockMemberDirectory, mockTeamDirectory } from "@/lib/app-collab-mock";
import {
  APP_ROLE_ACTIONS,
  ROLE_DESC,
  ROLE_LABEL,
  can,
  type AppMember,
  type AppRole,
} from "@/lib/app-collab-types";

const ROLES: AppRole[] = ["owner", "admin", "editor", "operator", "viewer"];

function memberName(member: AppMember): string {
  return member.name || member.email || member.subject_id;
}

type DirectoryOption = { id: string; name: string; email?: string };

export function PermissionPanel({
  appId,
  orgId,
  role,
  members,
  onChange,
  demo,
  toast,
}: {
  appId: string;
  orgId?: string;
  role: AppRole;
  members: AppMember[];
  onChange: (members: AppMember[]) => void;
  demo: boolean;
  toast: (message: string, tone?: "ok" | "err" | "info") => void;
}) {
  const manage = role === "owner" || role === "admin";
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [subjectType, setSubjectType] = useState<"user" | "team">("user");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<DirectoryOption[]>([]);
  const [selected, setSelected] = useState<DirectoryOption | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [addBusy, setAddBusy] = useState(false);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!addOpen) return;
    let cancelled = false;
    async function loadDirectory() {
      setAddError(null);
      try {
        if (demo || !orgId) throw new Error("demo");
        const result =
          subjectType === "user"
            ? await api.listOrgMembers(orgId, query)
            : await api.listOrgTeams(orgId, query);
        if (cancelled) return;
        const items = result.items as Array<{
          id: string;
          name?: string;
          display_name?: string;
          email?: string;
        }>;
        setOptions(
          items.map((item) => ({
            id: item.id,
            name: item.display_name || item.name || item.email || item.id,
            email: item.email,
          })),
        );
      } catch {
        if (cancelled) return;
        const fallback = (
          subjectType === "user" ? mockMemberDirectory : mockTeamDirectory
        ) as Array<{ id: string; name: string; email?: string }>;
        setOptions(
          fallback
            .filter(
              (item) =>
                !query ||
                `${item.name} ${item.email ?? ""}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
            )
            .map((item) => ({
              id: item.id,
              name: item.name,
              email: item.email,
            })),
        );
      }
    }
    void loadDirectory();
    return () => {
      cancelled = true;
    };
  }, [addOpen, demo, orgId, query, subjectType]);

  const owners = members.filter((member) => member.role === "owner");
  const existingIds = useMemo(
    () => new Set(members.map((member) => member.subject_id)),
    [members],
  );

  async function changeRole(member: AppMember, nextRole: AppRole) {
    if (!manage) return;
    if (member.role === "owner") return;
    setBusyMember(member.id);
    try {
      if (!demo) await api.updateAppMember(appId, member.id, nextRole);
      onChange(
        members.map((item) =>
          item.id === member.id ? { ...item, role: nextRole } : item,
        ),
      );
      toast(`已将 ${memberName(member)} 设为${ROLE_LABEL[nextRole]}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "修改角色失败", "err");
    } finally {
      setBusyMember(null);
    }
  }

  async function removeMember(member: AppMember) {
    if (!manage) return;
    if (member.role === "owner" && owners.length <= 1) {
      toast("不能移除最后一个所有者", "err");
      return;
    }
    setBusyMember(member.id);
    try {
      if (!demo) await api.removeAppMember(appId, member.id);
      onChange(members.filter((item) => item.id !== member.id));
      setPendingRemove(null);
      toast(`已移除 ${memberName(member)}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "移除协作者失败", "err");
    } finally {
      setBusyMember(null);
    }
  }

  async function addMember() {
    if (!selected) {
      setAddError("请选择要添加的成员或团队");
      return;
    }
    if (existingIds.has(selected.id)) {
      setAddError("该成员已经在协作者列表中");
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      let created: AppMember;
      if (demo) {
        created = {
          id: `mem-${Date.now()}`,
          app_id: appId,
          subject_type: subjectType,
          subject_id: selected.id,
          name: selected.name,
          email: selected.email,
          role: newRole,
          created_at: new Date().toISOString(),
        };
      } else {
        created = await api.addAppMember(appId, {
          subject_type: subjectType,
          subject_id: selected.id,
          role: newRole,
        });
        created = {
          ...created,
          name: created.name || selected.name,
          email: created.email || selected.email,
        };
      }
      onChange([...members, created]);
      setAddOpen(false);
      setSelected(null);
      setQuery("");
      toast(`已添加 ${selected.name}`);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "添加协作者失败");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <section className="oc-card p-5" data-testid="permission-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold">协作者与权限</h2>
          <p className="mt-1 text-sm text-fg-secondary">
            按角色控制查看、使用、编辑、分享、发布与回滚。所有者/管理员可管理成员。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="oc-btn-sm"
            variant="ghost"
            onClick={() => setMatrixOpen((value) => !value)}
            aria-expanded={matrixOpen}
          >
            权限矩阵
          </Button>
          {manage && (
            <Button
              className="oc-btn-sm"
              variant="primary"
              onClick={() => {
                setAddOpen(true);
                setAddError(null);
                setSelected(null);
              }}
              data-testid="member-add"
            >
              + 添加协作者
            </Button>
          )}
        </div>
      </div>

      {matrixOpen && (
        <div className="mt-4 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--oc-border)" }}>
          <table className="w-full min-w-[560px] border-collapse text-xs">
            <caption className="sr-only">应用角色权限矩阵</caption>
            <thead>
              <tr style={{ background: "var(--oc-surface-hover)" }}>
                <th className="px-3 py-2 text-left font-medium">角色</th>
                {(["view", "use", "edit", "share", "deploy", "rollback", "delete"] as const).map(
                  (action) => (
                    <th key={action} className="px-2 py-2 text-center font-medium">
                      {action}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((item) => (
                <tr key={item} className="border-t" style={{ borderColor: "var(--oc-border)" }}>
                  <td className="px-3 py-2">
                    <span className="font-medium">{ROLE_LABEL[item]}</span>
                    <span className="ml-1 text-fg-tertiary">
                      {ROLE_DESC[item]}
                    </span>
                  </td>
                  {(["view", "use", "edit", "share", "deploy", "rollback", "delete"] as const).map(
                    (action) => (
                      <td key={action} className="px-2 py-2 text-center">
                        {APP_ROLE_ACTIONS[item].includes(action) ? (
                          <span style={{ color: "var(--oc-success-text)" }}>✓</span>
                        ) : (
                          <span className="text-fg-tertiary">—</span>
                        )}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className="mt-4 divide-y" style={{ borderColor: "var(--oc-border)" }}>
        {members.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center gap-3 py-3"
            data-testid="member-row"
            data-member-id={member.id}
            data-role={member.role}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold"
              style={{
                background: "var(--oc-primary-subtle)",
                color: "var(--oc-primary)",
              }}
              aria-hidden="true"
            >
              {memberName(member).slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {memberName(member)}
                <span className="ml-2 oc-badge">
                  {member.subject_type === "team" ? "团队" : "成员"}
                </span>
              </div>
              <div className="truncate text-xs text-fg-tertiary">
                {member.email || member.subject_id}
              </div>
            </div>
            <label className="sr-only" htmlFor={`role-${member.id}`}>
              修改 {memberName(member)} 的角色
            </label>
            <select
              id={`role-${member.id}`}
              className="oc-input h-8 w-32 text-xs"
              value={member.role}
              disabled={!manage || member.role === "owner" || busyMember === member.id}
              onChange={(event) =>
                void changeRole(member, event.target.value as AppRole)
              }
              data-testid="member-role"
            >
              {ROLES.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABEL[item]}
                </option>
              ))}
            </select>
            {manage && member.role !== "owner" && (
              <div className="flex items-center gap-1">
                {pendingRemove === member.id ? (
                  <>
                    <Button
                      className="oc-btn-sm"
                      variant="danger"
                      loading={busyMember === member.id}
                      onClick={() => void removeMember(member)}
                      data-testid="member-remove-confirm"
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
                  </>
                ) : (
                  <Button
                    className="oc-btn-sm"
                    variant="ghost"
                    onClick={() => setPendingRemove(member.id)}
                    data-testid="member-remove"
                    style={{ color: "var(--oc-danger-text)" }}
                  >
                    移除
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
        {members.length === 0 && (
          <li className="py-8 text-center text-sm text-fg-secondary">
            还没有协作者，应用仅所有者可访问。
          </li>
        )}
      </ul>

      {!manage && (
        <p className="mt-2 text-xs text-fg-tertiary">
          你当前是{ROLE_LABEL[role]}，只能查看成员与权限；需要管理请邀请 owner/admin。
        </p>
      )}

      {addOpen && manage && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 bg-black/45"
            onClick={() => setAddOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-add-title"
            className="oc-card relative w-full max-w-lg p-6"
            data-testid="member-add-form"
          >
            <h2 id="member-add-title" className="text-lg font-semibold">
              添加协作者
            </h2>
            <p className="mt-1 text-sm text-fg-secondary">
              协作者按角色获得应用访问与操作权限；分享设置另行控制访问范围。
            </p>
            <div className="mt-4 flex gap-2">
              {(["user", "team"] as const).map((type) => (
                <Button
                  key={type}
                  className="oc-btn-sm"
                  variant={subjectType === type ? "primary" : "secondary"}
                  onClick={() => {
                    setSubjectType(type);
                    setSelected(null);
                    setOptions([]);
                  }}
                >
                  {type === "user" ? "成员" : "团队"}
                </Button>
              ))}
            </div>
            <input
              className="oc-input mt-3"
              placeholder={
                subjectType === "user"
                  ? "搜索姓名或邮箱（目录接口）"
                  : "搜索团队名称（目录接口）"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索成员或团队"
            />
            <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--oc-border)" }}>
              {options.length === 0 ? (
                <p className="px-3 py-4 text-sm text-fg-tertiary">
                  没有匹配项；可检查目录或稍后重试。
                </p>
              ) : (
                options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    data-testid="member-option"
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-hover ${
                      selected?.id === option.id ? "font-medium" : ""
                    }`}
                    onClick={() => setSelected(option)}
                    aria-pressed={selected?.id === option.id}
                  >
                    <span className="truncate">
                      {option.name}
                      {option.email ? (
                        <span className="ml-2 text-xs text-fg-tertiary">
                          {option.email}
                        </span>
                      ) : null}
                    </span>
                    {selected?.id === option.id && <span>✓</span>}
                  </button>
                ))
              )}
            </div>
            <label className="oc-field-label mt-4" htmlFor="new-member-role">
              角色
            </label>
            <select
              id="new-member-role"
              className="oc-input"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as AppRole)}
            >
              {ROLES.filter((item) => item !== "owner").map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABEL[item]} · {ROLE_DESC[item]}
                </option>
              ))}
            </select>
            {addError && (
              <div className="mt-3" role="alert">
                <Banner tone="err">{addError}</Banner>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setAddOpen(false)}>取消</Button>
              <Button
                variant="primary"
                loading={addBusy}
                onClick={() => void addMember()}
                data-testid="member-submit"
              >
                添加
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
