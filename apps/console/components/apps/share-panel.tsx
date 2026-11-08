"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useEffect, useState } from "react";
import { Banner, Button } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { mockTeamDirectory, mockMemberDirectory } from "@/lib/app-collab-mock";
import { can, type AppRole, type AppShare } from "@/lib/app-collab-types";

type Audience = "public" | "org" | "team" | "user";

const AUDIENCE_LABEL: Record<Audience, string> = {
  public: "公开（平台内已登录用户）",
  org: "组织内",
  team: "指定团队",
  user: "指定用户",
};

const EXPIRY_OPTIONS = [
  { value: "never", label: "永久有效" },
  { value: "24h", label: "24 小时" },
  { value: "7d", label: "7 天" },
  { value: "30d", label: "30 天" },
];

function expiryToIso(value: string): string | null {
  if (value === "never") return null;
  const days = value === "24h" ? 1 : value === "7d" ? 7 : 30;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function SharePanel({
  appId,
  orgId,
  appUrl,
  host,
  role,
  shares,
  onChange,
  demo,
  toast,
}: {
  appId: string;
  orgId?: string;
  appUrl?: string | null;
  host: string;
  role: AppRole;
  shares: AppShare[];
  onChange: (shares: AppShare[]) => void;
  demo: boolean;
  toast: (message: string, tone?: "ok" | "err" | "info") => void;
}) {
  const manage = can(role, "share");
  const [audience, setAudience] = useState<Audience>("org");
  const [subjectType, setSubjectType] = useState<"user" | "team">("team");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ id: string; name: string; email?: string }[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [shareRole, setShareRole] = useState<"view" | "use" | "edit">("use");
  const [expiry, setExpiry] = useState("never");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isSubjectAudience = audience === "team" || audience === "user";

  useEffect(() => {
    if (!isSubjectAudience) return;
    let cancelled = false;
    async function load() {
      const type = audience === "team" ? "team" : "user";
      setSubjectType(type);
      try {
        if (demo) throw new Error("demo");
        const result =
          type === "team"
            ? await api.listOrgTeams(orgId || "org-1", query)
            : await api.listOrgMembers(orgId || "org-1", query);
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
            name: item.name || item.display_name || item.email || item.id,
            email: item.email,
          })),
        );
      } catch {
        if (cancelled) return;
        const fallback = (
          type === "team" ? mockTeamDirectory : mockMemberDirectory
        ) as Array<{ id: string; name: string; email?: string }>;
        setOptions(
          fallback
            .filter((item) => !query || item.name.toLowerCase().includes(query.toLowerCase()))
            .map((item) => ({
              id: item.id,
              name: item.name,
              email: item.email,
            })),
        );
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [audience, demo, isSubjectAudience, query, orgId]);

  function copyLink() {
    const link = appUrl || `http://${host}`;
    void navigator.clipboard?.writeText(link).catch(() => undefined);
    setCopied(true);
    toast("已复制应用链接（链接不含权限，访问仍需 SSO）", "info");
    setTimeout(() => setCopied(false), 1600);
  }

  async function saveShare() {
    if (!manage) return;
    if (isSubjectAudience && !selected) {
      setError("请选择要分享的团队或用户");
      return;
    }
    setSaving(true);
    setError(null);
    const expiresAt = expiryToIso(expiry);
    try {
      let created: AppShare;
      if (demo) {
        created = {
          id: `shr-${Date.now()}`,
          app_id: appId,
          scope:
            audience === "team"
              ? "team"
              : audience === "user"
                ? "users"
                : audience === "org"
                  ? "org"
                  : "public",
          subject_type: audience === "team" ? "team" : audience === "user" ? "user" : null,
          subject_id: selected?.id ?? null,
          subject_name: selected?.name ?? (audience === "org" ? "组织内" : "平台内已登录用户"),
          role: shareRole,
          expires_at: expiresAt,
          created_by: "李雷",
          created_at: new Date().toISOString(),
          share_url: `${appUrl || `http://${host}`}/s/shr-${Date.now()}`,
        };
      } else {
        created = await api.createAppShare(appId, {
          scope:
            audience === "team"
              ? "team"
              : audience === "user"
                ? "users"
                : audience === "org"
                  ? "org"
                  : "public",
          role: shareRole,
          subject_type: audience === "team" ? "team" : audience === "user" ? "user" : undefined,
          subject_id: selected?.id,
          expires_at: expiresAt,
        });
        created = {
          ...created,
          subject_name:
            created.subject_name ||
            selected?.name ||
            (audience === "org" ? "组织内" : undefined),
        };
      }
      onChange([...shares, created]);
      setSelected(null);
      setQuery("");
      toast("分享设置已保存，权限变更 5 秒内生效");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存分享设置失败");
    } finally {
      setSaving(false);
    }
  }

  async function removeShare(share: AppShare) {
    if (!manage) return;
    try {
      if (!demo) await api.deleteAppShare(appId, share.id);
      onChange(shares.filter((item) => item.id !== share.id));
      toast("已移除该分享");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "移除分享失败", "err");
    }
  }

  return (
    <section className="oc-card p-5" data-testid="share-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold">分享设置</h2>
          <p className="mt-1 text-sm text-fg-secondary">
            控制谁能访问应用。所有范围都要求平台 SSO 登录，互联网匿名访问禁止。
          </p>
        </div>
        <Button className="oc-btn-sm" onClick={copyLink} data-testid="share-copy">
          {copied ? "已复制" : "复制链接"}
        </Button>
      </div>

      <div className="mt-4" role="radiogroup" aria-label="访问范围" data-testid="share-audience">
        {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((value) => (
          <label
            key={value}
            className={`mb-2 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${
              audience === value ? "border-primary" : ""
            }`}
            style={
              audience === value
                ? { borderColor: "var(--oc-primary)", background: "var(--oc-primary-subtle)" }
                : { borderColor: "var(--oc-border)" }
            }
          >
            <input
              type="radio"
              name="share-audience"
              value={value}
              checked={audience === value}
              disabled={!manage}
              onChange={() => {
                setAudience(value);
                setSelected(null);
                setError(null);
              }}
              data-testid={`share-audience-${value}`}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{AUDIENCE_LABEL[value]}</span>
              <span className="mt-0.5 block text-xs text-fg-tertiary">
                {value === "public"
                  ? "平台内已登录用户（含其他租户）可发现；需 SSO，建议设置有效期"
                  : value === "org"
                    ? "本组织全体成员可访问"
                    : value === "team"
                      ? "仅指定团队的成员可访问"
                      : "仅指定用户可访问"}
              </span>
            </span>
          </label>
        ))}
      </div>

      {isSubjectAudience && (
        <div className="mt-2">
          <label className="oc-field-label" htmlFor="share-subject-search">
            选择{audience === "team" ? "团队" : "用户"}
          </label>
          <input
            id="share-subject-search"
            className="oc-input"
            placeholder="搜索名称 / 邮箱"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!manage}
          />
          <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--oc-border)" }}>
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid="share-subject-option"
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-hover ${
                  selected?.id === option.id ? "font-medium" : ""
                }`}
                onClick={() => setSelected(option)}
                disabled={!manage}
                aria-pressed={selected?.id === option.id}
              >
                <span className="truncate">{option.name}</span>
                {selected?.id === option.id && <span>✓</span>}
              </button>
            ))}
            {options.length === 0 && (
              <p className="px-3 py-3 text-xs text-fg-tertiary">没有匹配项</p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="oc-field-label">访问权限</span>
          <select
            className="oc-input"
            value={shareRole}
            onChange={(event) =>
              setShareRole(event.target.value as "view" | "use" | "edit")
            }
            disabled={!manage}
            data-testid="share-role"
          >
            <option value="view">查看 view · 只读</option>
            <option value="use">使用 use · 可调用能力</option>
            <option value="edit">编辑 edit · 可改配置</option>
          </select>
        </label>
        <label className="block">
          <span className="oc-field-label">链接有效期</span>
          <select
            className="oc-input"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            disabled={!manage}
            data-testid="share-expiry"
          >
            {EXPIRY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3">
        <Banner tone="info">
          SSO 强制：未登录访问会跳转企业登录；链接本身不携带权限。公开范围 =
          平台内已登录用户可发现，不等同于互联网公开。
        </Banner>
      </div>

      {error && (
        <div className="mt-3" role="alert">
          <Banner tone="err">{error}</Banner>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          loading={saving}
          disabled={!manage}
          onClick={() => void saveShare()}
          data-testid="share-save"
        >
          保存分享设置
        </Button>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-medium">当前生效的分享</h3>
        <ul className="mt-2 divide-y rounded-lg border" style={{ borderColor: "var(--oc-border)" }}>
          {shares.map((share) => (
            <li
              key={share.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
              data-testid="share-row"
            >
              <span className="oc-badge">
                {share.scope === "users"
                  ? "用户"
                  : share.scope === "team"
                    ? "团队"
                    : share.scope === "org"
                      ? "组织"
                      : "公开"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {share.subject_name ||
                  (share.scope === "team"
                    ? `团队 ${share.subject_id || ""}`
                    : share.scope === "users"
                      ? `用户 ${share.subject_id || ""}`
                      : share.scope === "org"
                        ? "组织内成员"
                        : "平台内已登录用户")}
              </span>
              <span className="oc-badge">
                {share.role === "view" ? "查看" : share.role === "use" ? "使用" : "编辑"}
              </span>
              <span className="text-xs text-fg-tertiary">
                {share.expires_at
                  ? `至 ${new Date(share.expires_at).toLocaleDateString("zh-CN")}`
                  : "永久"}
              </span>
              {manage && (
                <Button
                  className="oc-btn-sm"
                  variant="ghost"
                  onClick={() => void removeShare(share)}
                  data-testid="share-remove"
                  style={{ color: "var(--oc-danger-text)" }}
                >
                  移除
                </Button>
              )}
            </li>
          ))}
          {shares.length === 0 && (
            <li className="px-3 py-4 text-sm text-fg-tertiary">
              还没有分享，当前仅协作者可访问。
            </li>
          )}
        </ul>
      </div>

      {!manage && (
        <p className="mt-2 text-xs text-fg-tertiary">
          你当前没有分享权限（需要 owner/admin）；可联系所有者调整。
        </p>
      )}
    </section>
  );
}
