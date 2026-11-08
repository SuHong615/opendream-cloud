// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 内置模型供应商预设（GET /model-provider-presets）。
 * kind 与 opencode provider package 映射见 services/opencode-config.ts。
 */
export interface ModelProviderPreset {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  default_models: string[];
  docs_url: string;
}

export const MODEL_PROVIDER_PRESETS: ModelProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai_compatible",
    base_url: "https://api.openai.com/v1",
    default_models: ["gpt-4o-mini", "gpt-4o"],
    docs_url: "https://platform.openai.com/docs",
  },
  {
    id: "azure",
    name: "Azure OpenAI",
    kind: "azure",
    base_url: "https://<resource>.openai.azure.com/openai",
    default_models: ["gpt-4o", "gpt-4o-mini"],
    docs_url: "https://learn.microsoft.com/azure/ai-services/openai/",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    kind: "anthropic",
    base_url: "https://api.anthropic.com/v1",
    default_models: ["claude-sonnet-5", "claude-opus-5"],
    docs_url: "https://docs.anthropic.com",
  },
  {
    id: "google",
    name: "Google Gemini",
    kind: "google",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    default_models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    docs_url: "https://ai.google.dev/gemini-api/docs",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "deepseek",
    base_url: "https://api.deepseek.com/v1",
    default_models: ["deepseek-chat", "deepseek-reasoner"],
    docs_url: "https://api-docs.deepseek.com",
  },
  {
    id: "qwen",
    name: "通义千问 Qwen",
    kind: "qwen",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    default_models: ["qwen2.5-coder-32b", "qwen-max"],
    docs_url: "https://help.aliyun.com/zh/model-studio/",
  },
  {
    id: "kimi",
    name: "Kimi (Moonshot)",
    kind: "kimi",
    base_url: "https://api.moonshot.cn/v1",
    default_models: ["moonshot-v1-128k"],
    docs_url: "https://platform.moonshot.cn/docs",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    kind: "glm",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    default_models: ["glm-4-plus", "glm-4-flash"],
    docs_url: "https://open.bigmodel.cn/dev/api",
  },
  {
    id: "ollama",
    name: "Ollama（本地）",
    kind: "ollama",
    base_url: "http://host.docker.internal:11434/v1",
    default_models: ["llama3.2", "qwen2.5-coder"],
    docs_url: "https://ollama.com",
  },
  {
    id: "vllm",
    name: "vLLM（本地）",
    kind: "vllm",
    base_url: "http://localhost:8000/v1",
    default_models: ["local-model"],
    docs_url: "https://docs.vllm.ai",
  },
  {
    id: "openai-compatible",
    name: "OpenAI 兼容端点",
    kind: "openai_compatible",
    base_url: "https://api.example.com/v1",
    default_models: [],
    docs_url: "https://opencode.ai/docs/providers/",
  },
];

export function findPreset(id: string | null | undefined): ModelProviderPreset | undefined {
  if (!id) return undefined;
  return MODEL_PROVIDER_PRESETS.find((preset) => preset.id === id);
}

/** DB CHECK 只允许基础 kind；扩展 kind 归一化为 `custom`，原始值存 preset_id。 */
const DB_KINDS = new Set(["openai_compatible", "azure", "anthropic", "google", "bedrock", "custom"]);

export function dbKind(kind: string): string {
  return DB_KINDS.has(kind) ? kind : "custom";
}

/** 对外的 effective kind：有 preset 时用 preset.kind，否则用 DB kind。 */
export function effectiveKind(row: { kind: string; preset_id: string | null }): string {
  return findPreset(row.preset_id)?.kind ?? row.kind;
}

/** kind → opencode provider package。 */
export function packageForKind(kind: string): string {
  switch (kind) {
    case "anthropic":
      return "@opencode/ai/providers/anthropic";
    case "google":
      return "@opencode/ai/providers/google";
    default:
      return "@opencode/ai/providers/openai-compatible";
  }
}
