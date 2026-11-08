// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type {
  McpChannel,
  McpServer,
  McpTool,
  McpVersion,
} from "@/lib/mcp-types";

const iso = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

export const mockMcpServers: McpServer[] = [
  {
    id: "srv-orders",
    name: "订单服务",
    slug: "orders",
    description: "订单查询、退款与物流轨迹；凭证由平台托管",
    transport: "http",
    url: "https://mcp.internal/orders",
    status: "active",
    latest_version: "v1.4.0",
    channel: "stable",
    tools_count: 6,
    updated_at: iso(60 * 6),
  },
  {
    id: "srv-kb",
    name: "知识库检索",
    slug: "kb",
    description: "企业知识库混合检索，只读工具",
    transport: "http",
    url: "https://mcp.internal/kb",
    status: "active",
    latest_version: "v2.0.1",
    channel: "canary",
    tools_count: 3,
    updated_at: iso(60 * 20),
  },
];

export const mockMcpVersions: Record<string, McpVersion[]> = {
  "srv-orders": [
    {
      id: "ver-orders-140",
      version: "v1.4.0",
      status: "pending_review",
      changelog: "新增退款原因枚举与幂等键；收紧 order.read 返回字段",
      tools_count: 6,
      created_by: "张伟",
      created_at: iso(60 * 3),
    },
    {
      id: "ver-orders-130",
      version: "v1.3.0",
      status: "published",
      changelog: "物流轨迹工具支持多承运商",
      tools_count: 5,
      created_by: "张伟",
      reviewed_by: "李雷",
      created_at: iso(60 * 24 * 3),
      published_at: iso(60 * 24 * 3),
    },
    {
      id: "ver-orders-120",
      version: "v1.2.0",
      status: "yanked",
      changelog: "退款工具存在越权风险，已撤回",
      tools_count: 5,
      created_by: "王芳",
      reviewed_by: "李雷",
      created_at: iso(60 * 24 * 8),
      published_at: iso(60 * 24 * 8),
      yanked_at: iso(60 * 24 * 2),
    },
  ],
  "srv-kb": [
    {
      id: "ver-kb-201",
      version: "v2.0.1",
      status: "published",
      changelog: "修复空查询返回全部文档的问题",
      tools_count: 3,
      created_by: "王芳",
      reviewed_by: "李雷",
      created_at: iso(60 * 30),
      published_at: iso(60 * 29),
    },
    {
      id: "ver-kb-200",
      version: "v2.0.0",
      status: "published",
      changelog: "迁移到混合检索接口",
      tools_count: 3,
      created_by: "王芳",
      reviewed_by: "李雷",
      created_at: iso(60 * 24 * 5),
      published_at: iso(60 * 24 * 5),
    },
  ],
};

export const mockMcpChannels: Record<string, McpChannel[]> = {
  "srv-orders": [
    { channel: "stable", version_id: "ver-orders-130", version: "v1.3.0", effective_at: iso(60 * 24 * 3) },
    { channel: "canary", version_id: "ver-orders-140", version: "v1.4.0", effective_at: iso(60 * 3) },
  ],
  "srv-kb": [
    { channel: "stable", version_id: "ver-kb-200", version: "v2.0.0", effective_at: iso(60 * 24 * 5) },
    { channel: "canary", version_id: "ver-kb-201", version: "v2.0.1", effective_at: iso(60 * 30) },
  ],
};

export const mockMcpTools: Record<string, McpTool[]> = {
  "srv-orders": [
    { name: "order.get", description: "读取订单详情", risk: "low", read_only: true, input_schema_hash: "sha256:aa11" },
    { name: "order.list", description: "按用户/状态分页查询订单", risk: "medium", read_only: true, input_schema_hash: "sha256:bb22" },
    { name: "order.refund", description: "发起退款（需审批）", risk: "high", read_only: false, destructive: true, input_schema_hash: "sha256:cc33" },
    { name: "logistics.track", description: "查询物流轨迹", risk: "low", read_only: true, input_schema_hash: "sha256:dd44" },
  ],
  "srv-kb": [
    { name: "kb.search", description: "知识库混合检索", risk: "low", read_only: true, input_schema_hash: "sha256:ee55" },
    { name: "kb.read", description: "读取文档片段", risk: "low", read_only: true, input_schema_hash: "sha256:ff66" },
  ],
};
