// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type {
  EvalDataset,
  EvalEvaluator,
  EvalRun,
  ExperienceItem,
  MemoryItem,
  ObsOverview,
  OrgInfo,
  OrgMember,
  OrgQuota,
  TimeSeriesPoint,
} from "@/lib/m5-types";

const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const mockEvalDatasets: EvalDataset[] = [
  {
    id: "ds-coding-100",
    name: "代码修复基线（100 例）",
    description: "来自真实仓库的缺陷修复任务，含单测断言",
    cases_count: 100,
    version: "v3",
    updated_at: iso(60 * 6),
  },
  {
    id: "ds-skill-30",
    name: "Skill 基线（30 例）",
    description: "Skill 上架准入使用的标准用例集",
    cases_count: 30,
    version: "v2",
    updated_at: iso(60 * 24),
  },
  {
    id: "ds-rag-50",
    name: "知识库问答（50 例）",
    description: "企业知识库检索与引用准确性",
    cases_count: 50,
    version: "v1",
    updated_at: iso(60 * 50),
  },
];

export const mockEvalEvaluators: EvalEvaluator[] = [
  {
    id: "ev-rule",
    name: "规则评分器",
    kind: "rule",
    version: "v1.0",
    status: "active",
    description: "关键词/正则/JSON Schema 断言",
  },
  {
    id: "ev-llm-judge",
    name: "LLM-as-judge",
    kind: "llm",
    version: "v1.2",
    status: "active",
    description: "使用评审模型对答案打分（0-1）",
  },
  {
    id: "ev-semantic",
    name: "语义相似度",
    kind: "embedding",
    version: "v0.9",
    status: "beta",
    description: "向量相似度与引用覆盖",
  },
];

export const mockEvalRuns: EvalRun[] = [
  {
    id: "eval-run-20261108-01",
    name: "code-review v1.4 基线",
    status: "succeeded",
    dataset_id: "ds-skill-30",
    dataset_name: "Skill 基线（30 例）",
    evaluator_name: "规则评分器 + LLM-as-judge",
    pass_rate: 0.92,
    cost_usd: "1.20",
    started_at: iso(60 * 2),
    finished_at: iso(60 * 1.8),
    cases: 30,
    failures: 2,
  },
  {
    id: "eval-run-20261108-02",
    name: "invoice-helper 回归",
    status: "running",
    dataset_id: "ds-coding-100",
    dataset_name: "代码修复基线（100 例）",
    evaluator_name: "LLM-as-judge",
    pass_rate: 0.68,
    cost_usd: null,
    started_at: iso(5),
    cases: 100,
    failures: null,
  },
  {
    id: "eval-run-20261107-09",
    name: "qwen3-coder 对比",
    status: "failed",
    dataset_id: "ds-rag-50",
    dataset_name: "知识库问答（50 例）",
    evaluator_name: "语义相似度",
    pass_rate: 0.41,
    cost_usd: "2.30",
    started_at: iso(60 * 20),
    finished_at: iso(60 * 19),
    cases: 50,
    failures: 29,
  },
];

export const mockEvalReport = {
  summary: "通过率 92%，较基线 +4pp；失败集中在空值与边界条件。",
  cases: [
    { name: "修复登录超时", status: "passed", duration: "6.1s", detail: "通过全部断言" },
    { name: "空指针边界", status: "failed", duration: "9.4s", detail: "缺少空值检查（期望返回 400）" },
    { name: "中文表头导出", status: "passed", duration: "7.2s", detail: "CSV BOM 正确" },
    { name: "并发限流", status: "failed", duration: "12.0s", detail: "超出 QPS 时未返回 429" },
  ],
};

export const mockMemories: MemoryItem[] = [
  {
    id: "mem-1",
    text: "发票助手使用 CSV + UTF-8 BOM 导出，避免 Excel 中文乱码。",
    scope: "app",
    user_id: "u-lilei",
    created_at: iso(30),
    metadata: { source: "collab" },
  },
  {
    id: "mem-2",
    text: "发布审批门禁要求：测试通过率 ≥90%，否则需要 owner 人工批准。",
    scope: "org",
    user_id: "u-lilei",
    created_at: iso(60 * 5),
  },
  {
    id: "mem-3",
    text: "本地 Ollama 音色在 RTC 未连接时降级为文本回复。",
    scope: "user",
    user_id: "u-wangfang",
    created_at: iso(60 * 26),
  },
];

export const mockExperiences: ExperienceItem[] = [
  {
    id: "exp-1",
    title: "把导出从 xlsx 迁移到 CSV 的注意点",
    content: "需要 BOM、显式表头、空数据不生成文件；测试要覆盖中文与超大行数。",
    tags: ["export", "csv", "app"],
    source: "workflow",
    created_at: iso(60 * 8),
  },
  {
    id: "exp-2",
    title: "工作流人工任务的 SLA 设计",
    content: "默认 4 小时；超时升级到团队负责人；critical 流程 30 分钟。",
    tags: ["workflow", "sla"],
    source: "manual",
    created_at: iso(60 * 30),
  },
];

export const mockObsOverview: ObsOverview = {
  workspaces: 12,
  tokens: 12_480_000,
  cost_usd: "86.20",
  error_rate: 0.004,
  mcp_servers: 5,
  eval_runs: 42,
  updated_at: new Date().toISOString(),
  services: [
    { name: "control-plane", status: "ok", latency_ms: 18 },
    { name: "workspace-operator", status: "ok", latency_ms: 22 },
    { name: "model-gateway", status: "ok", latency_ms: 42 },
    { name: "mcp-hub", status: "degraded", latency_ms: 320 },
    { name: "eval-center", status: "ok", latency_ms: 35 },
    { name: "workflow-engine", status: "ok", latency_ms: 27 },
    { name: "digital-human", status: "ok", latency_ms: 51 },
  ],
};

export const mockTimeseries: TimeSeriesPoint[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: Math.floor(Date.now() / 1000) - (23 - i) * 3600,
  value: Math.round(180 + 120 * Math.sin(i / 3) + (i > 16 ? 180 : 0) + Math.random() * 60),
}));

export const mockOrgInfo: OrgInfo = {
  id: "org-1",
  name: "星云科技",
  slug: "xingyun",
  plan: "Enterprise",
  created_at: iso(60 * 24 * 90),
};

export const mockOrgQuota: OrgQuota = {
  workspaces: 50,
  members: 200,
  budget_usd: 5000,
  mcp_servers: 20,
  workspaces_used: 12,
  members_used: 68,
  budget_used_usd: 1240.5,
  mcp_servers_used: 5,
};

export const mockOrgMembers: OrgMember[] = [
  {
    id: "m-1",
    member_id: "m-1",
    user_id: "u-lilei",
    display_name: "李雷",
    email: "lilei@xingyun.example",
    role: "owner",
    status: "active",
    created_at: iso(60 * 24 * 90),
  },
  {
    id: "m-2",
    member_id: "m-2",
    user_id: "u-zhangwei",
    display_name: "张伟",
    email: "zhangwei@xingyun.example",
    role: "admin",
    status: "active",
    created_at: iso(60 * 24 * 60),
  },
  {
    id: "m-3",
    member_id: "m-3",
    user_id: "u-wangfang",
    display_name: "王芳",
    email: "wangfang@xingyun.example",
    role: "member",
    status: "active",
    created_at: iso(60 * 24 * 20),
  },
  {
    id: "m-4",
    member_id: "m-4",
    user_id: "u-chenchen",
    display_name: "陈晨",
    email: "chenchen@xingyun.example",
    role: "viewer",
    status: "active",
    created_at: iso(60 * 24 * 5),
  },
];
