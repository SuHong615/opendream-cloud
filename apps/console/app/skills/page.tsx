"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Banner, Button, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { ApiError, api, relativeTime } from "@/lib/api";
import {
  SKILL_STATUS_LABEL,
  type Skill,
  type SkillDebugResult,
  type SkillInstallation,
  type SkillVersion,
} from "@/lib/skills-usage-types";

type ToastItem = { id: number; tone: "ok" | "err" | "info"; message: string };
type Tab = "content" | "code" | "review" | "debug" | "versions" | "enable";
const PAGE_SIZE = 9;
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "content", label: "内容" },
  { id: "code", label: "代码" },
  { id: "review", label: "审查" },
  { id: "debug", label: "调试" },
  { id: "versions", label: "版本" },
  { id: "enable", label: "启用" },
];

function versionTone(status?: string) {
  return status === "published"
    ? "ok"
    : status === "yanked"
      ? "err"
      : status === "in_review"
        ? "warn"
        : "muted";
}

function toneStyle(tone: string) {
  return {
    color:
      tone === "ok"
        ? "var(--oc-success-text)"
        : tone === "err"
          ? "var(--oc-danger-text)"
          : tone === "warn"
            ? "var(--oc-warning-text)"
            : "var(--oc-text-secondary)",
    background:
      tone === "ok"
        ? "var(--oc-success-subtle)"
        : tone === "err"
          ? "var(--oc-danger-subtle)"
          : tone === "warn"
            ? "var(--oc-warning-subtle)"
            : "var(--oc-surface-hover)",
  };
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [installations, setInstallations] = useState<SkillInstallation[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    slug: "",
    name: "",
    category: "",
    summary: "",
    visibility: "org",
    version: "0.1.0",
    content: "",
    code: "",
    files: [] as string[],
  });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [detail, setDetail] = useState<Skill | null>(null);
  const [tab, setTab] = useState<Tab>("content");
  const [versions, setVersions] = useState<SkillVersion[]>([]);
  const [versionDetail, setVersionDetail] = useState<SkillVersion | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    name: "",
    summary: "",
    category: "",
    visibility: "org",
  });
  const [reviewComment, setReviewComment] = useState("");
  const [debugInput, setDebugInput] = useState("hello world");
  const [debugResult, setDebugResult] = useState<SkillDebugResult | null>(null);
  const [yankReason, setYankReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [skillResult, installResult] = await Promise.all([
        api.listSkills({ limit: 100 }),
        api.listSkillInstallations(),
      ]);
      setSkills(skillResult.items);
      setInstallations(installResult.items);
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        setError({ message: err.message, requestId: err.requestId });
      } else {
        setError({ message: "Skill 数据加载失败" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((skill) => {
      if (skill.category) set.add(skill.category);
    });
    return [...set].sort();
  }, [skills]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return skills.filter((skill) => {
      if (category && skill.category !== category) return false;
      if (!normalized) return true;
      return `${skill.name} ${skill.slug} ${skill.summary ?? ""} ${skill.category ?? ""}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [category, query, skills]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const installedBySkill = useMemo(() => {
    const map = new Map<string, SkillInstallation[]>();
    installations.forEach((installation) => {
      const list = map.get(installation.skill_id) ?? [];
      list.push(installation);
      map.set(installation.skill_id, list);
    });
    return map;
  }, [installations]);

  async function openDetail(skill: Skill) {
    setDetail(skill);
    setTab("content");
    setEditForm({
      name: skill.name,
      summary: skill.summary ?? "",
      category: skill.category ?? "",
      visibility: skill.visibility ?? "org",
    });
    setReviewComment("");
    setDebugResult(null);
    setYankReason("");
    setDeleteConfirm(false);
    setVersionLoading(true);
    setVersions([]);
    setVersionDetail(null);
    try {
      const result = await api.listSkillVersions(skill.id);
      setVersions(result.items);
      const target =
        result.items.find((item) => item.id === skill.latest_version?.id) ??
        result.items[0];
      if (target) {
        const full = await api.getSkillVersion(skill.id, target.id);
        setVersionDetail(full);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "版本加载失败", "err");
    } finally {
      setVersionLoading(false);
    }
  }

  async function refreshDetail() {
    if (!detail) return;
    try {
      const updated = await api.getSkill(detail.id);
      setDetail(updated);
      setSkills((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      const versionResult = await api.listSkillVersions(detail.id);
      setVersions(versionResult.items);
      const target =
        versionResult.items.find((item) => item.id === updated.latest_version?.id) ??
        versionResult.items[0];
      if (target) {
        setVersionDetail(await api.getSkillVersion(detail.id, target.id));
      }
    } catch {
      // keep existing detail on transient refresh errors
    }
  }

  function closeDetail() {
    setDetail(null);
    setVersionDetail(null);
    setVersions([]);
    setDebugResult(null);
  }

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).slice(0, 20);
    const nextFiles = [...uploadForm.files];
    let content = uploadForm.content;
    let code = uploadForm.code;
    for (const file of files) {
      if (!nextFiles.includes(file.name)) nextFiles.push(file.name);
      const textLike = /\.(md|markdown|txt|ts|tsx|js|jsx|json|ya?ml)$/i.test(file.name);
      if (!textLike) continue;
      const text = await file.text();
      if (/\.md$/i.test(file.name) && !content) content = text;
      else if (!code) code = text;
      if (!uploadForm.name && /\.md$/i.test(file.name)) {
        const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
        if (title) setUploadForm((prev) => ({ ...prev, name: title }));
      }
      if (!uploadForm.slug && /\.md$/i.test(file.name)) {
        const base = file.name.replace(/\.md$/i, "").toLowerCase();
        setUploadForm((prev) => ({
          ...prev,
          slug: base === "skill" ? "" : base.replace(/[^a-z0-9-]+/g, "-"),
        }));
      }
    }
    setUploadForm((prev) => ({ ...prev, files: nextFiles, content, code }));
  }

  async function submitUpload() {
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(uploadForm.slug)) {
      setUploadError("slug 需为小写字母/数字/连字符（2-63 位）");
      return;
    }
    if (!uploadForm.name.trim()) {
      setUploadError("请填写 Skill 名称");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const result = await api.uploadSkill({
        slug: uploadForm.slug.trim(),
        name: uploadForm.name.trim(),
        summary: uploadForm.summary.trim() || undefined,
        category: uploadForm.category.trim() || undefined,
        visibility: uploadForm.visibility,
        version: uploadForm.version.trim() || "0.1.0",
        content: uploadForm.content,
        code: uploadForm.code,
        files: uploadForm.files,
      });
      setUploadOpen(false);
      setUploadForm({
        slug: "",
        name: "",
        category: "",
        summary: "",
        visibility: "org",
        version: "0.1.0",
        content: "",
        code: "",
        files: [],
      });
      setSkills((prev) => [result.skill, ...prev]);
      toast("Skill 已创建（草稿版本）");
      await openDetail(result.skill);
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "上传 Skill 失败",
      );
    } finally {
      setUploading(false);
    }
  }

  async function saveMeta() {
    if (!detail) return;
    setBusy("meta");
    try {
      const updated = await api.updateSkill(detail.id, {
        name: editForm.name.trim(),
        summary: editForm.summary.trim() || null,
        category: editForm.category.trim() || null,
        visibility: editForm.visibility,
      });
      setDetail(updated);
      setSkills((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast("Skill 信息已更新");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "更新失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function submitReview() {
    if (!detail || !versionDetail) return;
    setBusy("submit-review");
    try {
      const updated = await api.submitSkillReview(detail.id, versionDetail.id);
      setVersionDetail({ ...versionDetail, ...updated });
      setVersions((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      toast("已提交审查");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "提交审查失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function review(decision: "approve" | "reject") {
    if (!detail || !versionDetail) return;
    setBusy(`review-${decision}`);
    try {
      const updated = await api.reviewSkillVersion(detail.id, versionDetail.id, {
        decision,
        comment: reviewComment.trim() || undefined,
      });
      setVersionDetail(updated);
      setVersions((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      toast(decision === "approve" ? "审查已通过" : "审查已拒绝", decision === "approve" ? "ok" : "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "审查失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function publishVersion(version: SkillVersion) {
    if (!detail) return;
    setBusy(`publish-${version.id}`);
    try {
      const updated = await api.publishSkillVersion(detail.id, version.id);
      setVersionDetail(updated);
      setVersions((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      await refreshDetail();
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

  async function rollbackVersion(version: SkillVersion) {
    if (!detail) return;
    setBusy(`rollback-${version.id}`);
    try {
      await api.rollbackSkillVersion(detail.id, version.id);
      await refreshDetail();
      toast(`已回滚到 ${version.version}`, "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "回滚失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function yankVersion(version: SkillVersion) {
    if (!detail) return;
    if (yankReason.trim().length < 2) {
      toast("请填写撤回原因", "err");
      return;
    }
    setBusy(`yank-${version.id}`);
    try {
      const updated = await api.yankSkillVersion(detail.id, version.id, yankReason.trim());
      setVersions((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      if (versionDetail?.id === version.id) setVersionDetail(updated);
      setYankReason("");
      toast(`已撤回 ${version.version}`, "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "撤回失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function runDebug() {
    if (!detail) return;
    setBusy("debug");
    try {
      setDebugResult(await api.debugSkill(detail.id, debugInput));
      toast("调试完成");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "调试失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function toggleEnabled(enable: boolean) {
    if (!detail) return;
    setBusy(enable ? "enable" : "disable");
    try {
      if (enable) {
        const result = await api.enableSkill(detail.id);
        setDetail(result.skill);
        setSkills((prev) =>
          prev.map((item) => (item.id === result.skill.id ? result.skill : item)),
        );
        toast("Skill 已启用");
      } else {
        const result = await api.disableSkill(detail.id);
        setDetail(result.skill);
        setSkills((prev) =>
          prev.map((item) => (item.id === result.skill.id ? result.skill : item)),
        );
        toast("Skill 已停用", "info");
      }
      await refreshDetail();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "状态更新失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function installSkill(skill: Skill) {
    setBusy(`install-${skill.id}`);
    try {
      const created = await api.installSkill(skill.id);
      setInstallations((prev) => [created, ...prev]);
      toast(`已安装 ${skill.name} ${created.version}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast("该 Skill 已安装，请刷新", "info");
        await load();
      } else {
        toast(
          err instanceof ApiError
            ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
            : "安装失败",
          "err",
        );
      }
    } finally {
      setBusy(null);
    }
  }

  async function uninstallSkill(installation: SkillInstallation) {
    setBusy(`uninstall-${installation.id}`);
    try {
      await api.uninstallSkill(installation.id);
      setInstallations((prev) => prev.filter((item) => item.id !== installation.id));
      toast(`已卸载 ${installation.skill_name}`, "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "卸载失败", "err");
    } finally {
      setBusy(null);
    }
  }

  async function deleteSkill() {
    if (!detail) return;
    setBusy("delete");
    try {
      await api.deleteSkill(detail.id);
      setSkills((prev) => prev.filter((item) => item.id !== detail.id));
      closeDetail();
      toast("Skill 已删除", "info");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除失败", "err");
    } finally {
      setBusy(null);
    }
  }

  const detailInstallations = detail
    ? installedBySkill.get(detail.id) ?? []
    : [];
  const latestVersion = versionDetail;

  return (
    <AppShell>
      <div data-testid="skills-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">能力</div>
            <h1 className="oc-title">Skill 中心</h1>
            <p className="oc-subtitle">
              上传并管理企业 Skill：版本、审查、调试与启停。内容与代码入库为版本 manifest，
              发布后可在工作区安装使用。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="oc-btn-sm" onClick={() => void load()}>
              刷新
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setUploadError(null);
                setUploadOpen(true);
              }}
              data-testid="skill-create"
            >
              + 新增 Skill
            </Button>
          </div>
        </div>

        {error && (
          <div className="mt-6">
            <ErrorState
              title="Skill 加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            className="oc-input max-w-sm"
            placeholder="搜索 Skill 名称 / slug / 描述…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            aria-label="搜索 Skill"
            data-testid="skill-search"
          />
          <select
            className="oc-input max-w-[180px]"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            aria-label="按分类筛选"
          >
            <option value="">全部分类</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <span className="text-xs text-fg-tertiary">{filtered.length} 个 Skill</span>
        </div>

        {loading ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} lines={5} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={skills.length === 0 ? "还没有 Skill" : "没有匹配的 Skill"}
              description={
                skills.length === 0
                  ? "点击「新增 Skill」上传 SKILL.md 或 .zip 创建第一个版本。"
                  : "调整搜索或分类筛选。"
              }
              action={
                skills.length === 0 ? (
                  <Button variant="primary" onClick={() => setUploadOpen(true)}>
                    新增 Skill
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paged.map((skill) => {
                const installed = (installedBySkill.get(skill.id) ?? []).length > 0;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    className="oc-card flex flex-col p-5 text-left transition-colors hover:bg-hover"
                    onClick={() => void openDetail(skill)}
                    data-testid="skill-card"
                    data-skill-id={skill.id}
                    data-status={skill.status}
                  >
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-md font-semibold">{skill.name}</h2>
                        <p className="mt-1 line-clamp-2 text-sm text-fg-secondary">
                          {skill.summary || "未填写摘要"}
                        </p>
                      </div>
                      <span className="oc-badge" style={toneStyle(versionTone(skill.status) as string)}>
                        {SKILL_STATUS_LABEL[skill.status] ?? skill.status}
                      </span>
                    </div>
                    <div className="mt-3 flex w-full flex-wrap gap-1.5 text-xs">
                      {skill.category && <span className="oc-badge">{skill.category}</span>}
                      <span className="oc-badge">{skill.visibility || "org"}</span>
                      {skill.latest_version && (
                        <span className="oc-badge">v{skill.latest_version.version}</span>
                      )}
                      {installed && (
                        <span className="oc-badge" style={{ color: "var(--oc-success-text)" }}>
                          已安装
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex w-full flex-wrap gap-3 text-xs text-fg-tertiary">
                      <span>安装 {skill.install_count ?? 0}</span>
                      <span>
                        评分{" "}
                        {skill.avg_rating != null
                          ? `${skill.avg_rating.toFixed(1)}（${skill.rating_count ?? 0}）`
                          : "暂无"}
                      </span>
                      <span>{relativeTime(skill.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2" data-testid="skill-pagination">
              <span className="text-xs text-fg-tertiary">
                第 {currentPage} / {totalPages} 页
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  className="oc-btn-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  上一页
                </Button>
                {Array.from({ length: totalPages }).map((_, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`oc-btn oc-btn-sm ${currentPage === index + 1 ? "oc-btn-primary" : ""}`}
                    onClick={() => setPage(index + 1)}
                    aria-current={currentPage === index + 1 ? "page" : undefined}
                  >
                    {index + 1}
                  </button>
                ))}
                <Button
                  className="oc-btn-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Upload drawer */}
        {uploadOpen && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={() => setUploadOpen(false)} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="skill-upload-title"
              className="oc-drawer relative h-full w-full max-w-xl overflow-y-auto p-6"
              data-testid="skill-upload-drawer"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="skill-upload-title" className="text-lg font-semibold">
                    新增 Skill
                  </h2>
                  <p className="mt-1 text-sm text-fg-secondary">
                    上传 SKILL.md / 代码或 .zip；可读取文本内容，非文本仅记录文件名。
                  </p>
                </div>
                <button type="button" className="oc-icon-btn" aria-label="关闭上传" onClick={() => setUploadOpen(false)}>
                  ✕
                </button>
              </div>

              <label
                className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center"
                style={{ borderColor: "var(--oc-border)" }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (event.dataTransfer.files.length > 0) {
                    void handleFiles(event.dataTransfer.files);
                  }
                }}
              >
                <span className="text-sm font-medium">拖入文件或点击选择</span>
                <span className="mt-1 text-xs text-fg-tertiary">
                  支持 SKILL.md、.txt、.ts/.js/.json/.yaml、.zip（zip 只记录文件名）
                </span>
                <input
                  type="file"
                  multiple
                  accept=".md,.markdown,.txt,.ts,.tsx,.js,.jsx,.json,.yaml,.yml,.zip"
                  className="sr-only"
                  onChange={(event) => {
                    if (event.target.files) void handleFiles(event.target.files);
                  }}
                />
              </label>
              {uploadForm.files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {uploadForm.files.map((file) => (
                    <span key={file} className="oc-model-chip">
                      {file}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="oc-field-label">名称</span>
                  <input
                    className="oc-input"
                    value={uploadForm.name}
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="发票抽取"
                  />
                </label>
                <label className="block">
                  <span className="oc-field-label">slug</span>
                  <input
                    className="oc-input font-mono"
                    value={uploadForm.slug}
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, slug: event.target.value }))}
                    placeholder="invoice-extract"
                  />
                </label>
                <label className="block">
                  <span className="oc-field-label">分类</span>
                  <input
                    className="oc-input"
                    value={uploadForm.category}
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, category: event.target.value }))}
                    placeholder="finance"
                  />
                </label>
                <label className="block">
                  <span className="oc-field-label">版本</span>
                  <input
                    className="oc-input font-mono"
                    value={uploadForm.version}
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, version: event.target.value }))}
                    placeholder="0.1.0"
                  />
                </label>
                <label className="block">
                  <span className="oc-field-label">可见性</span>
                  <select
                    className="oc-input"
                    value={uploadForm.visibility}
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, visibility: event.target.value }))}
                  >
                    <option value="org">组织</option>
                    <option value="private">私有</option>
                    <option value="public">公开</option>
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="oc-field-label">简介</span>
                  <input
                    className="oc-input"
                    value={uploadForm.summary}
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, summary: event.target.value }))}
                    placeholder="从发票 OCR 文本抽取金额、税号、日期与明细"
                  />
                </label>
              </div>
              <label className="oc-field-label mt-3" htmlFor="skill-content">
                SKILL.md 内容
              </label>
              <textarea
                id="skill-content"
                className="oc-input h-40 resize-y py-2 font-mono text-xs"
                value={uploadForm.content}
                onChange={(event) => setUploadForm((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="# 发票抽取\n\n使用说明与触发条件…"
              />
              <label className="oc-field-label mt-3" htmlFor="skill-code">
                代码（可选）
              </label>
              <textarea
                id="skill-code"
                className="oc-input h-32 resize-y py-2 font-mono text-xs"
                value={uploadForm.code}
                onChange={(event) => setUploadForm((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="export async function run(input) { ... }"
              />
              {uploadError && (
                <div className="mt-3" role="alert">
                  <Banner tone="err">{uploadError}</Banner>
                </div>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button onClick={() => setUploadOpen(false)}>取消</Button>
                <Button
                  variant="primary"
                  loading={uploading}
                  onClick={() => void submitUpload()}
                  data-testid="skill-save"
                >
                  上传并创建
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Detail drawer with tabs */}
        {detail && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 bg-black/45" onClick={closeDetail} />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="skill-detail-title"
              className="oc-drawer relative flex h-full w-full max-w-3xl flex-col"
              data-testid="skill-detail-drawer"
            >
              <header className="flex items-start justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "var(--oc-border)" }}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="skill-detail-title" className="truncate text-lg font-semibold">
                      {detail.name}
                    </h2>
                    <span className="oc-badge" style={toneStyle(versionTone(detail.status) as string)}>
                      {SKILL_STATUS_LABEL[detail.status] ?? detail.status}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-fg-tertiary">
                    {detail.slug} · {detail.category || "未分类"} · {detail.visibility || "org"}
                  </p>
                </div>
                <button type="button" className="oc-icon-btn" aria-label="关闭详情" onClick={closeDetail}>
                  ✕
                </button>
              </header>

              <div className="flex flex-wrap gap-1.5 border-b px-6 py-3" style={{ borderColor: "var(--oc-border)" }} role="tablist">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === item.id}
                    className={`oc-btn oc-btn-sm ${tab === item.id ? "oc-btn-primary" : ""}`}
                    onClick={() => setTab(item.id)}
                    data-testid={`skill-tab-${item.id}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                {versionLoading ? (
                  <Skeleton lines={7} />
                ) : tab === "content" ? (
                  <div>
                    <h3 className="text-sm font-medium">SKILL.md</h3>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs" style={{ background: "var(--oc-surface-hover)" }}>
                      {latestVersion?.manifest?.content || "（无内容）"}
                    </pre>
                    <h3 className="mt-5 text-sm font-medium">编辑信息</h3>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="oc-field-label">名称</span>
                        <input className="oc-input" value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
                      </label>
                      <label className="block">
                        <span className="oc-field-label">分类</span>
                        <input className="oc-input" value={editForm.category} onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))} />
                      </label>
                      <label className="block sm:col-span-2">
                        <span className="oc-field-label">简介</span>
                        <input className="oc-input" value={editForm.summary} onChange={(event) => setEditForm((prev) => ({ ...prev, summary: event.target.value }))} />
                      </label>
                      <label className="block">
                        <span className="oc-field-label">可见性</span>
                        <select className="oc-input" value={editForm.visibility} onChange={(event) => setEditForm((prev) => ({ ...prev, visibility: event.target.value }))}>
                          <option value="org">组织</option>
                          <option value="private">私有</option>
                          <option value="public">公开</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button className="oc-btn-sm" variant="primary" loading={busy === "meta"} onClick={() => void saveMeta()} data-testid="skill-edit-save">
                        保存信息
                      </Button>
                    </div>
                    {detailInstallations.length > 0 && (
                      <div className="mt-5 rounded-lg p-3 text-xs" style={{ background: "var(--oc-surface-hover)" }}>
                        已安装：{detailInstallations.map((item) => `${item.version}${item.workspace_id ? ` @ ${item.workspace_id}` : "（组织级）"}`).join("、")}
                      </div>
                    )}
                  </div>
                ) : tab === "code" ? (
                  <div>
                    <h3 className="text-sm font-medium">代码</h3>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-xs" style={{ background: "var(--oc-surface-hover)" }}>
                      {latestVersion?.manifest?.code || "（无代码）"}
                    </pre>
                    <h3 className="mt-5 text-sm font-medium">文件</h3>
                    <ul className="mt-2 space-y-1 text-xs">
                      {(latestVersion?.files ?? []).map((file) => (
                        <li key={file.path} className="flex items-center gap-2">
                          <span className="oc-badge">{file.path}</span>
                          <span className="text-fg-tertiary">{file.size} B</span>
                        </li>
                      ))}
                      {(latestVersion?.files?.length ?? 0) === 0 && (
                        <li className="text-fg-tertiary">无文件记录</li>
                      )}
                    </ul>
                  </div>
                ) : tab === "review" ? (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="oc-badge">当前版本 v{latestVersion?.version ?? "—"}</span>
                      <span className="oc-badge" style={toneStyle(versionTone(latestVersion?.status) as string)}>
                        {latestVersion?.status ?? "—"}
                      </span>
                      <span className="oc-badge">
                        审查：{latestVersion?.review_state ?? latestVersion?.status ?? "—"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-fg-secondary">
                      提交审查后由审核人批准/拒绝；批准后方可发布。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="oc-btn-sm"
                        loading={busy === "submit-review"}
                        onClick={() => void submitReview()}
                        data-testid="skill-submit-review"
                      >
                        提交审查
                      </Button>
                    </div>
                    <label className="oc-field-label mt-4" htmlFor="skill-review-comment">
                      审查备注
                    </label>
                    <input
                      id="skill-review-comment"
                      className="oc-input"
                      value={reviewComment}
                      onChange={(event) => setReviewComment(event.target.value)}
                      placeholder="通过/拒绝原因（可选）"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="oc-btn-sm"
                        variant="primary"
                        loading={busy === "review-approve"}
                        onClick={() => void review("approve")}
                        data-testid="skill-review-approve"
                      >
                        审查通过
                      </Button>
                      <Button
                        className="oc-btn-sm"
                        variant="danger"
                        loading={busy === "review-reject"}
                        onClick={() => void review("reject")}
                        data-testid="skill-review-reject"
                      >
                        审查拒绝
                      </Button>
                    </div>
                  </div>
                ) : tab === "debug" ? (
                  <div>
                    <label className="oc-field-label" htmlFor="skill-debug-input">
                      调试输入
                    </label>
                    <textarea
                      id="skill-debug-input"
                      className="oc-input h-24 resize-none py-2 font-mono text-xs"
                      value={debugInput}
                      onChange={(event) => setDebugInput(event.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                      <Button className="oc-btn-sm" variant="primary" loading={busy === "debug"} onClick={() => void runDebug()} data-testid="skill-debug-run">
                        运行调试
                      </Button>
                    </div>
                    {debugResult && (
                      <div className="mt-4 space-y-2">
                        <h3 className="text-sm font-medium">步骤</h3>
                        <ul className="space-y-1 text-xs">
                          {debugResult.steps.map((step) => (
                            <li key={step.step} className="flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5" style={{ background: "var(--oc-surface-hover)" }}>
                              <span className="font-mono">{step.step}</span>
                              <span className="text-fg-tertiary">{step.detail}</span>
                              <span className="oc-badge">{step.status}</span>
                            </li>
                          ))}
                        </ul>
                        <h3 className="text-sm font-medium">输出</h3>
                        <pre className="whitespace-pre-wrap rounded-lg p-3 text-xs" style={{ background: "var(--oc-surface-hover)" }}>
                          {debugResult.output}
                        </pre>
                      </div>
                    )}
                  </div>
                ) : tab === "versions" ? (
                  <div>
                    <ul className="space-y-2">
                      {versions.map((version) => {
                        const isLatest = detail.latest_version?.id === version.id;
                        return (
                          <li
                            key={version.id}
                            className="rounded-lg border p-3"
                            style={{ borderColor: "var(--oc-border)" }}
                            data-testid="skill-version"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm">v{version.version}</span>
                                <span className="oc-badge" style={toneStyle(versionTone(version.status) as string)}>
                                  {version.status}
                                </span>
                                {isLatest && <span className="oc-badge">latest</span>}
                                <span className="text-xs text-fg-tertiary">
                                  {version.review_state ? `审查 ${version.review_state}` : ""}{" "}
                                  {relativeTime(version.created_at)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                <Button
                                  className="oc-btn-sm"
                                  loading={busy === `publish-${version.id}`}
                                  onClick={() => void publishVersion(version)}
                                  data-testid="skill-version-publish"
                                >
                                  发布
                                </Button>
                                <Button
                                  className="oc-btn-sm"
                                  loading={busy === `rollback-${version.id}`}
                                  onClick={() => void rollbackVersion(version)}
                                  data-testid="skill-version-rollback"
                                >
                                  回滚到此版本
                                </Button>
                                <Button
                                  className="oc-btn-sm"
                                  variant="ghost"
                                  style={{ color: "var(--oc-danger-text)" }}
                                  onClick={() => {
                                    setVersionDetail(version);
                                    setYankReason("");
                                  }}
                                  data-testid="skill-version-yank"
                                >
                                  撤回
                                </Button>
                              </div>
                            </div>
                            {versionDetail?.id === version.id && (
                              <div className="mt-2 flex flex-wrap items-end gap-2">
                                <input
                                  className="oc-input max-w-xs"
                                  placeholder="撤回原因（必填）"
                                  value={yankReason}
                                  onChange={(event) => setYankReason(event.target.value)}
                                />
                                <Button
                                  className="oc-btn-sm"
                                  variant="danger"
                                  loading={busy === `yank-${version.id}`}
                                  onClick={() => void yankVersion(version)}
                                >
                                  确认撤回
                                </Button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {versions.length === 0 && (
                        <li className="text-sm text-fg-tertiary">还没有版本</li>
                      )}
                    </ul>
                  </div>
                ) : (
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="oc-badge" style={toneStyle(detail.status === "published" ? "ok" : "muted")}>
                        {SKILL_STATUS_LABEL[detail.status] ?? detail.status}
                      </span>
                      <span className="text-xs text-fg-tertiary">
                        安装量 {detail.install_count ?? 0} · 评分 {detail.avg_rating ?? "暂无"}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        className="oc-btn-sm"
                        variant="primary"
                        loading={busy === "enable"}
                        onClick={() => void toggleEnabled(true)}
                        data-testid="skill-enable"
                      >
                        启用
                      </Button>
                      <Button
                        className="oc-btn-sm"
                        variant="danger"
                        loading={busy === "disable"}
                        onClick={() => void toggleEnabled(false)}
                        data-testid="skill-disable"
                      >
                        停用
                      </Button>
                      {detailInstallations.length === 0 ? (
                        <Button
                          className="oc-btn-sm"
                          loading={busy === `install-${detail.id}`}
                          onClick={() => void installSkill(detail)}
                          data-testid="skill-install"
                        >
                          安装
                        </Button>
                      ) : (
                        detailInstallations.map((installation) => (
                          <Button
                            key={installation.id}
                            className="oc-btn-sm"
                            loading={busy === `uninstall-${installation.id}`}
                            onClick={() => void uninstallSkill(installation)}
                            data-testid="skill-uninstall"
                          >
                            卸载 {installation.version}
                          </Button>
                        ))
                      )}
                    </div>

                    <div className="mt-6 rounded-xl border p-4" style={{ borderColor: "var(--oc-danger-border, var(--oc-border))" }}>
                      <h3 className="text-sm font-medium" style={{ color: "var(--oc-danger-text)" }}>
                        危险操作
                      </h3>
                      <p className="mt-1 text-xs text-fg-tertiary">
                        删除 Skill 会软删除并保留历史版本引用；此操作不可撤销。
                      </p>
                      {deleteConfirm ? (
                        <div className="mt-3 flex gap-2">
                          <Button className="oc-btn-sm" variant="danger" loading={busy === "delete"} onClick={() => void deleteSkill()} data-testid="skill-delete-confirm">
                            确认删除
                          </Button>
                          <Button className="oc-btn-sm" onClick={() => setDeleteConfirm(false)}>
                            取消
                          </Button>
                        </div>
                      ) : (
                        <Button className="oc-btn-sm" variant="ghost" style={{ color: "var(--oc-danger-text)" }} onClick={() => setDeleteConfirm(true)} data-testid="skill-delete">
                          删除 Skill
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
