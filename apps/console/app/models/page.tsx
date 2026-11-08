"use client";

// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@/components/ui";
import { ApiError, api, isUnavailable, relativeTime } from "@/lib/api";
import {
  mockModelProviders,
  mockProviderPresets,
} from "@/lib/mock";
import type {
  ModelProvider,
  ModelProviderPreset,
  ProviderHealth,
  ProviderModel,
  ProviderTestResult,
} from "@/lib/types";

type FormState = {
  presetId: string;
  name: string;
  kind: string;
  baseUrl: string;
  apiKey: string;
  modelsText: string;
  defaultModel: string;
  enabled: boolean;
};

type ToastItem = {
  id: number;
  tone: "ok" | "err" | "info";
  message: string;
};

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "openai_compatible", label: "OpenAI 兼容" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "通义千问" },
  { value: "kimi", label: "Kimi" },
  { value: "glm", label: "智谱 GLM" },
  { value: "ollama", label: "Ollama" },
  { value: "vllm", label: "vLLM" },
  { value: "custom", label: "自定义" },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(
  KIND_OPTIONS.map((k) => [k.value, k.label]),
);

const HEALTH_META: Record<
  string,
  { label: string; tone: "ok" | "warn" | "err" | "muted" }
> = {
  healthy: { label: "健康", tone: "ok" },
  unhealthy: { label: "异常", tone: "err" },
  unknown: { label: "未检测", tone: "muted" },
};

function healthMeta(health: ProviderHealth) {
  return (
    HEALTH_META[health] ?? { label: health || "未知", tone: "muted" as const }
  );
}

function healthColor(tone: "ok" | "warn" | "err" | "muted"): string {
  return tone === "ok"
    ? "var(--oc-success)"
    : tone === "warn"
      ? "var(--oc-warning)"
      : tone === "err"
        ? "var(--oc-danger)"
        : "var(--oc-text-tertiary)";
}

function parseModels(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function emptyForm(): FormState {
  return {
    presetId: "",
    name: "",
    kind: "openai_compatible",
    baseUrl: "",
    apiKey: "",
    modelsText: "",
    defaultModel: "",
    enabled: true,
  };
}

function providerModels(provider: ModelProvider): ProviderModel[] {
  if (provider.models?.length) return provider.models;
  if (provider.default_model) {
    return [{ id: provider.default_model, name: provider.default_model }];
  }
  return [];
}

export default function ModelsPage() {
  const [providers, setProviders] = useState<ModelProvider[]>([]);
  const [providerPage, setProviderPage] = useState(1);
  const providersPerPage = 6;
  const providerPageCount = Math.max(1, Math.ceil(providers.length / providersPerPage));
  const safeProviderPage = Math.min(providerPage, providerPageCount);
  const pagedProviders = providers.slice((safeProviderPage - 1) * providersPerPage, safeProviderPage * providersPerPage);
  const [presets, setPresets] = useState<ModelProviderPreset[]>([]);
  const [presetsFallback, setPresetsFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [demo, setDemo] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [error, setError] = useState<{
    message: string;
    requestId?: string;
  } | null>(null);
  const [drawer, setDrawer] = useState<{
    mode: "create" | "edit";
    provider?: ModelProvider;
  } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingForm, setTestingForm] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [testingCard, setTestingCard] = useState<string | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelProvider | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const drawerRef = useRef<HTMLFormElement | null>(null);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);
  const drawerBusyRef = useRef(false);
  drawerBusyRef.current = saving || testingForm;
  const drawerOpen = drawer !== null;

  useEffect(() => {
    if (!drawerOpen) return;
    if (!drawerTriggerRef.current) {
      drawerTriggerRef.current = document.activeElement as HTMLElement | null;
    }
    const panel = drawerRef.current;
    if (!panel) return;

    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

    const initial =
      panel.querySelector<HTMLElement>('[data-testid="provider-preset"]') ??
      focusables()[0] ??
      panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!drawerBusyRef.current) {
          event.preventDefault();
          setDrawer(null);
        }
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const trigger = drawerTriggerRef.current;
      drawerTriggerRef.current = null;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleteBusy) {
        event.preventDefault();
        setDeleteTarget(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, deleteBusy]);

  useEffect(() => {
    if (!previewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPreviewOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previewOpen]);

  const toast = useCallback(
    (message: string, tone: ToastItem["tone"] = "ok") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4000);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReadonly(false);

    const [presetResult, providerResult] = await Promise.allSettled([
      api.listProviderPresets(),
      api.listModelProviders(),
    ]);

    if (presetResult.status === "fulfilled") {
      setPresets(presetResult.value.items);
      setPresetsFallback(false);
    } else {
      setPresets(mockProviderPresets);
      setPresetsFallback(true);
    }

    if (providerResult.status === "fulfilled") {
      setProviders(providerResult.value.items);
      setDemo(false);
    } else {
      const err = providerResult.reason;
      if (isUnavailable(err) || (err instanceof ApiError && err.status === 404)) {
        setDemo(true);
        setProviders(mockModelProviders);
      } else if (err instanceof ApiError && err.status === 403) {
        setReadonly(true);
        setProviders([]);
      } else if (err instanceof ApiError) {
        if (err.status !== 401) {
          setError({ message: err.message, requestId: err.requestId });
        }
      } else {
        setError({ message: "加载模型供应商失败" });
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const healthy = providers.filter((p) => p.health === "healthy").length;
    const active = providers.find((p) => p.is_active);
    return {
      total: providers.length,
      healthy,
      activeName: active?.name ?? "未设置",
      activeModel: active?.default_model ?? active?.default_model_id ?? "—",
    };
  }, [providers]);

  const parsedModels = useMemo(() => parseModels(form.modelsText), [form.modelsText]);

  function openCreate(trigger?: HTMLElement) {
    drawerTriggerRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    setForm(emptyForm());
    setFormError(null);
    setTestResult(null);
    setDrawer({ mode: "create" });
  }

  function openEdit(provider: ModelProvider, trigger?: HTMLElement) {
    drawerTriggerRef.current =
      trigger ?? (document.activeElement as HTMLElement | null);
    const models = providerModels(provider);
    setForm({
      presetId: provider.preset_id ?? "",
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.base_url,
      apiKey: "",
      modelsText: models.map((m) => m.id).join(", "),
      defaultModel:
        provider.default_model ?? provider.default_model_id ?? models[0]?.id ?? "",
      enabled: provider.enabled,
    });
    setFormError(null);
    setTestResult(null);
    setDrawer({ mode: "edit", provider });
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    setForm((prev) => {
      if (!preset) return { ...prev, presetId };
      const defaults = preset.default_models ?? [];
      return {
        ...prev,
        presetId,
        name: prev.name || preset.name,
        kind: preset.kind,
        baseUrl:
          prev.baseUrl && prev.baseUrl !== "https://" ? prev.baseUrl : preset.base_url,
        modelsText: prev.modelsText || defaults.join(", "),
        defaultModel: prev.defaultModel || defaults[0] || "",
      };
    });
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return "请填写供应商名称";
    if (!form.kind) return "请选择协议类型";
    if (!/^https?:\/\//i.test(form.baseUrl.trim())) {
      return "Base URL 必须以 http:// 或 https:// 开头";
    }
    return null;
  }

  async function persistForm(
    opts: { close?: boolean; keepForTest?: boolean } = {},
  ): Promise<ModelProvider | null> {
    const invalid = validateForm();
    if (invalid) {
      setFormError(invalid);
      return null;
    }
    setSaving(true);
    setFormError(null);
    const models = parseModels(form.modelsText);
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      base_url: form.baseUrl.trim(),
      models,
      default_model: form.defaultModel || models[0] || undefined,
      preset_id: form.presetId || undefined,
      enabled: form.enabled,
      ...(form.apiKey.trim() ? { api_key: form.apiKey.trim() } : {}),
    };

    try {
      if (demo) {
        const existing = drawer?.provider;
        const next: ModelProvider = {
          id: existing?.id ?? `demo-${Date.now()}`,
          name: payload.name,
          kind: payload.kind,
          base_url: payload.base_url,
          enabled: payload.enabled,
          is_active: existing?.is_active ?? false,
          health: existing?.health ?? "unknown",
          last_check_at: existing?.last_check_at ?? null,
          models_count: models.length,
          models: models.map((id) => ({ id, name: id })),
          default_model_id: payload.default_model ?? null,
          default_model: payload.default_model ?? null,
          api_key_masked: form.apiKey
            ? `sk-****${form.apiKey.slice(-4)}`
            : (existing?.api_key_masked ?? null),
          preset_id: payload.preset_id ?? null,
        };
        setProviders((prev) =>
          existing
            ? prev.map((p) => (p.id === existing.id ? next : p))
            : [next, ...prev],
        );
        if (!opts.keepForTest) {
          toast(existing ? "供应商已更新（示例）" : "供应商已添加（示例）");
          if (opts.close !== false) setDrawer(null);
        }
        return next;
      }

      const saved =
        drawer?.mode === "edit" && drawer.provider
          ? await api.updateModelProvider(drawer.provider.id, payload)
          : await api.createModelProvider(payload);
      await load();
      if (!opts.keepForTest) {
        toast(drawer?.mode === "edit" ? "供应商已更新" : "供应商已添加");
        if (opts.close !== false) setDrawer(null);
      }
      return saved;
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "保存失败，请稍后重试";
      setFormError(message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function testProvider(target: "form" | ModelProvider) {
    if (readonly) return;
    if (target === "form") {
      if (!drawer) return;
      if (drawer.mode === "create") {
        const created = await persistForm({ close: false, keepForTest: true });
        if (!created) return;
        setDrawer({ mode: "edit", provider: created });
        setTestingForm(true);
        try {
          const result = demo
            ? demoTest(form, parsedModels)
            : await api.testModelProvider(created.id);
          applyTestResult(result, true);
        } catch (err) {
          setTestResult({
            ok: false,
            message: err instanceof ApiError ? err.message : "测试连通失败",
          });
        } finally {
          setTestingForm(false);
        }
        return;
      }
    }

    const provider = target === "form" ? drawer?.provider : target;
    if (!provider) return;
    if (target === "form") setTestingForm(true);
    else setTestingCard(provider.id);
    try {
      const result = demo
        ? demoTest(form, parsedModels)
        : await api.testModelProvider(provider.id);
      if (target === "form") {
        applyTestResult(result, true);
      } else {
        applyTestResult(result, false);
        if (result.ok) {
          toast(
            `连通成功 · ${result.latency_ms ?? "-"}ms · ${result.models?.length ?? 0} 个模型`,
            "ok",
          );
        } else {
          toast(result.message || "连通失败", "err");
        }
        await load();
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "测试连通失败";
      if (target === "form") setTestResult({ ok: false, message });
      else toast(message, "err");
    } finally {
      setTestingForm(false);
      setTestingCard(null);
    }
  }

  function demoTest(
    current: FormState,
    models: string[],
  ): ProviderTestResult {
    const ids = models.length ? models : parseModels(current.modelsText);
    return {
      ok: true,
      latency_ms: 42,
      models: ids.map((id) => ({ id, name: id })),
      message: "示例模式：连通测试通过（DEV）",
    };
  }

  function applyTestResult(result: ProviderTestResult, fillForm: boolean) {
    setTestResult(result);
    if (result.ok && fillForm && result.models?.length) {
      const ids = result.models.map((m) => m.id);
      setForm((prev) => ({
        ...prev,
        modelsText: ids.join(", "),
        defaultModel: prev.defaultModel || ids[0] || "",
      }));
    }
  }

  async function activate(provider: ModelProvider) {
    if (readonly) return;
    setActivating(provider.id);
    try {
      if (demo) {
        setProviders((prev) =>
          prev.map((p) => ({ ...p, is_active: p.id === provider.id })),
        );
      } else {
        await api.activateModelProvider(provider.id);
        await load();
      }
      toast(`已将「${provider.name}」设为默认供应商`);
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "设为默认失败",
        "err",
      );
    } finally {
      setActivating(null);
    }
  }

  async function removeProvider() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      if (demo) {
        setProviders((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      } else {
        await api.deleteModelProvider(deleteTarget.id);
        await load();
      }
      toast(`已删除供应商「${deleteTarget.name}」`);
      setDeleteTarget(null);
    } catch (err) {
      toast(
        err instanceof ApiError
          ? `${err.message}${err.reason ? `（${err.reason}）` : ""}`
          : "删除失败",
        "err",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function openPreview() {
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const config = await api.modelConfigPreview();
      setPreview(JSON.stringify(config, null, 2));
    } catch {
      setPreview(
        JSON.stringify(
          {
            $schema: "https://opencode.ai/config.json",
            model: `${providers.find((p) => p.is_active)?.id.slice(0, 8) ?? "provider"}/${
              providers.find((p) => p.is_active)?.default_model ?? "model"
            }`,
            providers: Object.fromEntries(
              providers.map((p) => [
                p.id.slice(0, 8),
                {
                  name: p.name,
                  package: "@opencode/ai/providers/openai-compatible",
                  settings: { baseURL: p.base_url, apiKey: "****" },
                  models: Object.fromEntries(
                    providerModels(p).map((m) => [m.id, { name: m.name }]),
                  ),
                },
              ]),
            ),
          },
          null,
          2,
        ),
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <AppShell>
      <div data-testid="models-page" className="oc-page">
        <div className="oc-page-header">
          <div>
            <div className="oc-eyebrow">模型与推理</div>
            <h1 className="oc-title">模型中心</h1>
            <p className="oc-subtitle">
              opencode 不依赖内置模型。接入企业或第三方模型供应商，统一管理 Base URL、
              密钥、模型列表与默认模型，配置将自动下发到工作区。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={openPreview} data-testid="config-preview">
              配置预览
            </Button>
            <Button
              variant="primary"
              onClick={(event) => openCreate(event.currentTarget)}
              disabled={readonly}
              data-testid="provider-add"
            >
              + 添加供应商
            </Button>
          </div>
        </div>

        {providers.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="oc-stat">
              <span className="oc-stat-label">已接入供应商</span>
              <strong className="oc-stat-value">{stats.total}</strong>
              <span className="oc-stat-hint">企业 / 第三方 / 自建</span>
            </div>
            <div className="oc-stat">
              <span className="oc-stat-label">当前默认</span>
              <strong className="oc-stat-value truncate" title={stats.activeName}>
                {stats.activeName}
              </strong>
              <span className="oc-stat-hint font-mono">{stats.activeModel}</span>
            </div>
            <div className="oc-stat">
              <span className="oc-stat-label">连通健康</span>
              <strong className="oc-stat-value">
                {stats.healthy}
                <span className="text-sm text-fg-tertiary"> / {stats.total}</span>
              </strong>
              <span className="oc-stat-hint">最近一次检测结果</span>
            </div>
          </div>
        )}

        {demo && (
          <div className="mt-6" data-testid="demo-banner">
            <Banner tone="warn">
              模型中心后端接口尚未就绪，当前展示示例供应商（DEV）。
              添加、编辑、测试与删除仅在本页模拟，不会写入控制面。
            </Banner>
          </div>
        )}
        {presetsFallback && !demo && (
          <div className="mt-6">
            <Banner tone="info">
              服务端预设接口暂不可用，下拉中的预设为内置示例；已保存的供应商仍可正常管理。
            </Banner>
          </div>
        )}
        {readonly && (
          <div className="mt-6" data-testid="models-readonly">
            <Banner tone="info">
              当前账号没有模型中心的管理权限（需要组织 owner/admin）。
              你可以查看配置，但添加、编辑、测试、删除与设为默认均不可用。
            </Banner>
          </div>
        )}
        {error && (
          <div className="mt-6">
            <ErrorState
              title="模型供应商加载失败"
              description={error.message}
              requestId={error.requestId}
              onRetry={() => void load()}
            />
          </div>
        )}

        {loading ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="oc-card p-5" aria-busy="true">
                <Skeleton lines={5} />
              </div>
            ))}
          </div>
        ) : !providers.length && !error ? (
          <div className="mt-8">
            <EmptyState
              title="还没有接入模型供应商"
              description="opencode 不会自带模型。接入企业网关、云厂商或自建推理服务后，工作区才能使用模型对话与工具调用。"
              action={
                <Button
                  variant="primary"
                  onClick={(event) => openCreate(event.currentTarget)}
                  disabled={readonly}
                  data-testid="provider-empty-add"
                >
                  接入第一个供应商
                </Button>
              }
            />
          </div>
        ) : (
          <>
          <div
            className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
            data-testid="provider-grid"
          >
            {pagedProviders.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                readonly={readonly}
                testing={testingCard === provider.id}
                activating={activating === provider.id}
                onTest={() => void testProvider(provider)}
                onActivate={() => void activate(provider)}
                onEdit={(trigger) => openEdit(provider, trigger)}
                onDelete={() => setDeleteTarget(provider)}
              />
            ))}
          </div>
          {providers.length > providersPerPage && (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm" data-testid="provider-pagination">
              <span className="text-xs text-fg-tertiary">
                第 {safeProviderPage} / {providerPageCount} 页 · 共 {providers.length} 个供应商
              </span>
              <div className="flex gap-2">
                <Button
                  className="oc-btn-sm"
                  disabled={safeProviderPage <= 1}
                  onClick={() => setProviderPage((value) => Math.max(1, value - 1))}
                  data-testid="provider-page-prev"
                >
                  上一页
                </Button>
                <Button
                  className="oc-btn-sm"
                  disabled={safeProviderPage >= providerPageCount}
                  onClick={() => setProviderPage((value) => Math.min(providerPageCount, value + 1))}
                  data-testid="provider-page-next"
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
          </>
        )}

        {drawer && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
              onClick={() => {
                if (!saving && !testingForm) setDrawer(null);
              }}
            />
            <form
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="provider-drawer-title"
              aria-describedby="provider-drawer-desc"
              tabIndex={-1}
              data-testid="provider-form"
              className="oc-drawer relative flex h-full w-full max-w-[560px] flex-col outline-none"
              onSubmit={(event) => {
                event.preventDefault();
                void persistForm();
              }}
            >
              <header className="flex items-start justify-between gap-4 border-b px-6 py-5">
                <div>
                  <h2 id="provider-drawer-title" className="text-lg font-semibold">
                    {drawer.mode === "edit" ? "编辑供应商" : "添加模型供应商"}
                  </h2>
                  <p id="provider-drawer-desc" className="mt-1 text-sm text-fg-secondary">
                    {drawer.mode === "edit"
                      ? "修改后保存，配置将重新下发到工作区。API Key 留空表示保持不变。"
                      : "选择预设可快速填入 Base URL 与常用模型；保存后建议测试连通。"}
                  </p>
                </div>
                <button
                  type="button"
                  className="oc-icon-btn"
                  aria-label="关闭"
                  onClick={() => setDrawer(null)}
                  disabled={saving || testingForm}
                >
                  ✕
                </button>
              </header>

              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <Field label="预设" hint="选择后自动填充协议类型与 Base URL">
                  <select
                    className="oc-input"
                    value={form.presetId}
                    data-testid="provider-preset"
                    onChange={(event) => applyPreset(event.target.value)}
                  >
                    <option value="">选择预设（可选）</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="供应商名称" required>
                  <input
                    className="oc-input"
                    value={form.name}
                    data-testid="provider-name"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="例如：企业模型网关 / DeepSeek 生产"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="协议类型" required>
                    <select
                      className="oc-input"
                      value={form.kind}
                      data-testid="provider-kind"
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, kind: event.target.value }))
                      }
                    >
                      {KIND_OPTIONS.map((kind) => (
                        <option key={kind.value} value={kind.value}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="启用" hint="停用后不参与配置下发">
                    <label className="oc-switch-row">
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        data-testid="provider-enabled"
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      <span>{form.enabled ? "已启用" : "已停用"}</span>
                    </label>
                  </Field>
                </div>

                <Field
                  label="Base URL"
                  required
                  hint="OpenAI 兼容地址通常以 /v1 结尾；Azure 使用 /openai"
                >
                  <input
                    className="oc-input font-mono text-sm"
                    value={form.baseUrl}
                    data-testid="provider-base-url"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, baseUrl: event.target.value }))
                    }
                    placeholder="https://api.example.com/v1"
                  />
                </Field>

                <Field
                  label="API Key"
                  hint={
                    drawer.mode === "edit"
                      ? "留空表示不修改；服务端仅保存密文，不回显明文"
                      : "仅保存密文；无鉴权的本地服务可留空"
                  }
                >
                  <input
                    className="oc-input font-mono text-sm"
                    type="password"
                    autoComplete="new-password"
                    value={form.apiKey}
                    data-testid="provider-api-key"
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, apiKey: event.target.value }))
                    }
                    placeholder={
                      drawer.mode === "edit"
                        ? "留空表示不修改"
                        : "sk-..."
                    }
                  />
                </Field>

                <Field
                  label="模型列表"
                  hint="逗号或换行分隔；可先「测试连通」自动拉取模型"
                >
                  <textarea
                    className="oc-input h-24 resize-y py-2 font-mono text-sm"
                    value={form.modelsText}
                    data-testid="provider-models"
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        modelsText: event.target.value,
                      }))
                    }
                    placeholder={"gpt-4o-mini\ndeepseek-chat"}
                  />
                </Field>

                <Field label="默认模型" hint="供应商启用后作为工作区默认模型">
                  <select
                    className="oc-input"
                    value={form.defaultModel}
                    data-testid="provider-default-model"
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        defaultModel: event.target.value,
                      }))
                    }
                  >
                    <option value="">未设置</option>
                    {parsedModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                    {form.defaultModel &&
                      !parsedModels.includes(form.defaultModel) && (
                        <option value={form.defaultModel}>{form.defaultModel}</option>
                      )}
                  </select>
                </Field>

                {formError && (
                  <div
                    role="alert"
                    className="rounded-md px-3 py-2 text-sm"
                    style={{
                      background: "var(--oc-danger-subtle)",
                      color: "var(--oc-danger-text)",
                    }}
                    data-testid="provider-form-error"
                  >
                    {formError}
                  </div>
                )}

                {testResult && (
                  <div
                    className="rounded-md border px-3 py-2 text-sm"
                    style={{
                      borderColor: "var(--oc-border)",
                      background: testResult.ok
                        ? "var(--oc-success-subtle)"
                        : "var(--oc-danger-subtle)",
                      color: testResult.ok
                        ? "var(--oc-success-text)"
                        : "var(--oc-danger-text)",
                    }}
                    data-testid="provider-test-result"
                  >
                    <div className="font-medium">
                      {testResult.ok ? "连通成功" : "连通失败"}
                      {testResult.latency_ms != null &&
                        ` · ${testResult.latency_ms}ms`}
                      {testResult.models &&
                        ` · ${testResult.models.length} 个模型`}
                    </div>
                    {testResult.message && (
                      <div className="mt-0.5 text-xs opacity-90">
                        {testResult.message}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t px-6 py-4">
                <Button
                  type="button"
                  onClick={() => void testProvider("form")}
                  loading={testingForm}
                  disabled={readonly || saving}
                  data-testid="provider-test"
                >
                  测试连通
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setDrawer(null)}
                    disabled={saving || testingForm}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={saving}
                    disabled={readonly || testingForm}
                    data-testid="provider-save"
                  >
                    {drawer.mode === "edit" ? "保存修改" : "保存供应商"}
                  </Button>
                </div>
              </footer>
            </form>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button
              type="button"
              aria-label="取消删除"
              className="absolute inset-0 bg-black/45"
              onClick={() => {
                if (!deleteBusy) setDeleteTarget(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-title"
              className="oc-card relative w-full max-w-md p-6"
              data-testid="provider-delete-dialog"
            >
              <h2 id="delete-title" className="text-lg font-semibold">
                删除供应商「{deleteTarget.name}」？
              </h2>
              <p className="mt-2 text-sm text-fg-secondary">
                删除后其模型将从配置中移除，已引用该供应商的工作区会回退到默认策略。
                该操作不可撤销。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteBusy}
                  autoFocus
                >
                  取消
                </Button>
                <Button
                  variant="danger"
                  loading={deleteBusy}
                  onClick={() => void removeProvider()}
                  data-testid="provider-delete-confirm"
                >
                  删除
                </Button>
              </div>
            </div>
          </div>
        )}

        {previewOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4">
            <button
              type="button"
              aria-label="关闭配置预览"
              className="absolute inset-0 bg-black/45"
              onClick={() => setPreviewOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="preview-title"
              className="oc-card relative flex max-h-[85vh] w-full max-w-3xl flex-col"
              data-testid="config-preview-modal"
            >
              <header className="flex items-center justify-between border-b px-5 py-4">
                <div>
                  <h2 id="preview-title" className="text-lg font-semibold">
                    opencode 配置预览
                  </h2>
                  <p className="mt-1 text-xs text-fg-secondary">
                    将下发的配置（密钥已脱敏）；opencode 通过该配置使用你接入的模型。
                  </p>
                </div>
                <button
                  type="button"
                  className="oc-icon-btn"
                  aria-label="关闭"
                  onClick={() => setPreviewOpen(false)}
                >
                  ✕
                </button>
              </header>
              <pre className="flex-1 overflow-auto px-5 py-4 font-mono text-xs leading-relaxed">
                {previewLoading ? "加载中…" : preview}
              </pre>
            </div>
          </div>
        )}

        <div
          className="fixed bottom-6 right-6 z-[60] flex w-full max-w-sm flex-col gap-2"
          aria-live="polite"
        >
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

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="oc-field-label">
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: "var(--oc-danger)" }}>
            {" "}
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span className="oc-field-hint">{hint}</span>}
    </label>
  );
}

function ProviderCard({
  provider,
  readonly,
  testing,
  activating,
  onTest,
  onActivate,
  onEdit,
  onDelete,
}: {
  provider: ModelProvider;
  readonly: boolean;
  testing: boolean;
  activating: boolean;
  onTest: () => void;
  onActivate: () => void;
  onEdit: (trigger: HTMLElement) => void;
  onDelete: () => void;
}) {
  const meta = healthMeta(provider.health);
  const models = providerModels(provider);
  return (
    <article
      className={`oc-card oc-provider-card ${
        provider.is_active ? "is-active" : ""
      } ${provider.enabled ? "" : "is-disabled"}`}
      data-testid="provider-card"
      data-provider-id={provider.id}
      data-active={provider.is_active ? "true" : "false"}
      data-health={provider.health}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: healthColor(meta.tone) }}
            aria-label={`连通状态：${meta.label}`}
            title={`连通状态：${meta.label}`}
          />
          <div className="min-w-0">
            <h3 className="truncate text-md font-semibold" title={provider.name}>
              {provider.name}
            </h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="oc-badge">
                {KIND_LABEL[provider.kind] ?? provider.kind}
              </span>
              {provider.is_active && (
                <span className="oc-badge oc-badge-primary" data-testid="provider-active-badge">
                  默认
                </span>
              )}
              {!provider.enabled && <span className="oc-badge">已停用</span>}
            </div>
          </div>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium"
          style={{
            color:
              meta.tone === "ok"
                ? "var(--oc-success-text)"
                : meta.tone === "err"
                  ? "var(--oc-danger-text)"
                  : "var(--oc-text-secondary)",
            background:
              meta.tone === "ok"
                ? "var(--oc-success-subtle)"
                : meta.tone === "err"
                  ? "var(--oc-danger-subtle)"
                  : "var(--oc-surface-hover)",
          }}
        >
          {meta.label}
        </span>
      </div>

      <div
        className="mt-3 break-all rounded-md px-2.5 py-1.5 font-mono text-xs"
        style={{
          background: "var(--oc-surface-hover)",
          color: "var(--oc-text-secondary)",
        }}
      >
        {provider.base_url}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-2xs text-fg-tertiary">模型数</dt>
          <dd className="mt-0.5 font-medium">{provider.models_count ?? models.length}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-2xs text-fg-tertiary">默认模型</dt>
          <dd className="mt-0.5 truncate font-medium" title={provider.default_model ?? ""}>
            {provider.default_model || provider.default_model_id || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-2xs text-fg-tertiary">最近检测</dt>
          <dd className="mt-0.5 font-medium">
            {provider.last_check_at ? relativeTime(provider.last_check_at) : "未检测"}
          </dd>
        </div>
      </dl>

      {models.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {models.slice(0, 4).map((model) => (
            <span
              key={model.id}
              className="oc-model-chip"
              data-testid="model-row"
              title={model.name}
            >
              {model.id}
            </span>
          ))}
          {models.length > 4 && (
            <span className="oc-model-chip">+{models.length - 4}</span>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-fg-tertiary">
        API Key：{provider.api_key_masked || "未设置"}
      </div>

      <div
        className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"
        style={{ borderColor: "var(--oc-border)" }}
      >
        <Button
          className="oc-btn-sm"
          onClick={onTest}
          loading={testing}
          disabled={readonly || !provider.enabled}
          data-testid="provider-test"
          title={!provider.enabled ? "供应商已停用，无法测试" : undefined}
        >
          测试连通
        </Button>
        <Button
          className="oc-btn-sm"
          onClick={onActivate}
          loading={activating}
          disabled={readonly || provider.is_active}
          data-testid="provider-activate"
        >
          {provider.is_active ? "已设为默认" : "设为默认"}
        </Button>
        <Button
          className="oc-btn-sm"
          variant="ghost"
          onClick={(event) => onEdit(event.currentTarget)}
          disabled={readonly}
          data-testid="provider-edit"
        >
          编辑
        </Button>
        <Button
          className="oc-btn-sm"
          variant="ghost"
          onClick={onDelete}
          disabled={readonly}
          data-testid="provider-delete"
          style={{ color: "var(--oc-danger-text)" }}
        >
          删除
        </Button>
      </div>
    </article>
  );
}
