// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { PromptAsset } from "@/lib/prompt-types";

const iso = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString();

export const mockPrompts: PromptAsset[] = [
  {
    id: "prompt-system-invoice",
    name: "发票抽取",
    description: "从发票文本/OCR 结果中抽取金额、税号、日期与明细",
    content:
      "你是财务票据抽取助手。请从输入中抽取以下字段并严格输出 JSON：\n- invoice_no: 发票号码\n- amount: 含税金额（数字）\n- tax_no: 纳税人识别号\n- date: 开票日期（YYYY-MM-DD）\n- items: 明细数组（name, quantity, price）\n\n输入：{{document}}\n若字段缺失返回 null，不要编造。",
    variables: ["document"],
    tags: ["finance", "extract", "json"],
    model_ref: "deepseek-v3",
    system: true,
    created_at: iso(30),
    updated_at: iso(2),
  },
  {
    id: "prompt-system-support",
    name: "客服分诊",
    description: "判断客户问题的类别、优先级并给出处理建议",
    content:
      "你是企业客服分诊助手。阅读客户消息后输出 JSON：\n- category: 退款/物流/产品/账号/其他\n- priority: P0/P1/P2\n- summary: 一句话摘要\n- suggested_action: 建议动作\n- need_human: 是否需要人工\n\n客户消息：{{message}}\n历史工单：{{history}}",
    variables: ["message", "history"],
    tags: ["support", "triage"],
    model_ref: "qwen-max",
    system: true,
    created_at: iso(28),
    updated_at: iso(3),
  },
  {
    id: "prompt-system-codereview",
    name: "代码审查",
    description: "对 diff 做风险审查，输出阻塞项与建议",
    content:
      "你是资深代码评审。基于以下 diff 做审查，优先找正确性、安全、并发与数据一致性问题。\n输出：\n1. 阻塞项（文件:行 + 问题 + 修复建议）\n2. 非阻塞建议\n3. 测试缺口\n\ndiff：\n{{diff}}\n上下文：{{context}}",
    variables: ["diff", "context"],
    tags: ["engineering", "review"],
    model_ref: "deepseek-v3",
    system: true,
    created_at: iso(26),
    updated_at: iso(3),
  },
  {
    id: "prompt-system-sql",
    name: "SQL 生成",
    description: "按自然语言与 schema 生成只读 SQL，并解释查询",
    content:
      "你是数据分析 SQL 助手。根据用户问题与 schema 生成 PostgreSQL 只读查询。\n\nschema：\n{{schema}}\n\n问题：{{question}}\n\n要求：\n- 只生成 SELECT\n- 使用参数化占位符\n- 输出 SQL 与一句话解释",
    variables: ["schema", "question"],
    tags: ["data", "sql"],
    model_ref: "deepseek-v3",
    system: true,
    created_at: iso(24),
    updated_at: iso(4),
  },
  {
    id: "prompt-custom-invoice-v2",
    name: "发票抽取（内部增强版）",
    description: "在系统 Prompt 基础上增加中文表头与多币种处理",
    content:
      "你是财务票据抽取助手（内部增强版）。除标准字段外，额外抽取 currency（币种，默认 CNY）与 tax_rate。\n输入：{{document}}\n输出严格 JSON，不要解释。",
    variables: ["document"],
    tags: ["finance", "extract"],
    model_ref: "deepseek-v3",
    system: false,
    created_at: iso(5),
    updated_at: iso(1),
  },
];
