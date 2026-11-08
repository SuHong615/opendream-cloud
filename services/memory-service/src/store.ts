// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "./env";
import { notFound } from "./errors";
import { rankByScore } from "./search";
import type {
  ExperienceRecord,
  ExperienceView,
  MemoryMessage,
  MemoryRecord,
  MemoryView,
  ScoredExperienceView,
  ScoredMemoryView,
  Tenant,
} from "./types";

export interface AddMemoryInput {
  messages: MemoryMessage[];
  user_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ListMemoryFilter {
  user_id?: string;
  agent_id?: string;
  limit?: number;
}

export interface SearchMemoryInput {
  query: string;
  user_id?: string;
  agent_id?: string;
  top_k?: number;
  threshold?: number;
}

export interface CreateExperienceInput {
  title: string;
  content: string;
  tags?: string[];
  source?: string;
}

const MAX_MEMORY_CHARS = 4000;

/**
 * 内存 store（演示级）：mem0 兼容 memory + experience 库。
 * 所有读写以 `tenant.orgId` 过滤，天然不跨租户；`user_id`/`agent_id` 为二级过滤。
 */
export class MemoryStore {
  private readonly memories = new Map<string, MemoryRecord>();
  private readonly experiences = new Map<string, ExperienceRecord>();
  readonly startedAt = Date.now();

  constructor(
    private readonly env: Env,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.seed();
  }

  // ---------------- memories

  addMemory(tenant: Tenant, input: AddMemoryInput): MemoryView {
    const nowMs = this.now().getTime();
    const memory = input.messages
      .map((message) => message.content.trim())
      .filter((content) => content.length > 0)
      .join("\n")
      .slice(0, MAX_MEMORY_CHARS);
    const record: MemoryRecord = {
      id: crypto.randomUUID(),
      orgId: tenant.orgId,
      userId: input.user_id ?? tenant.userId,
      agentId: input.agent_id ?? null,
      memory,
      metadata: input.metadata ?? {},
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    this.memories.set(record.id, record);
    return this.memoryView(record);
  }

  listMemories(tenant: Tenant, filter: ListMemoryFilter = {}): MemoryView[] {
    const limit = Math.min(filter.limit ?? this.env.LIST_DEFAULT_LIMIT, this.env.LIST_MAX_LIMIT);
    return [...this.memories.values()]
      .filter((record) => record.orgId === tenant.orgId)
      .filter((record) => (filter.user_id === undefined ? true : record.userId === filter.user_id))
      .filter((record) => (filter.agent_id === undefined ? true : record.agentId === filter.agent_id))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((record) => this.memoryView(record));
  }

  searchMemories(tenant: Tenant, input: SearchMemoryInput): ScoredMemoryView[] {
    const candidates = [...this.memories.values()]
      .filter((record) => record.orgId === tenant.orgId)
      .filter((record) => (input.user_id === undefined ? true : record.userId === input.user_id))
      .filter((record) => (input.agent_id === undefined ? true : record.agentId === input.agent_id));
    return rankByScore(
      candidates,
      input.query,
      (record) => record.memory,
      input.top_k ?? this.env.SEARCH_DEFAULT_TOP_K,
      input.threshold ?? this.env.SEARCH_DEFAULT_THRESHOLD,
    ).map((record) => ({ ...this.memoryView(record), score: record.score }));
  }

  deleteMemory(tenant: Tenant, id: string): void {
    const record = this.memories.get(id);
    if (!record || record.orgId !== tenant.orgId) throw notFound("memory not found");
    this.memories.delete(id);
  }

  // ---------------- experiences

  listExperiences(tenant: Tenant, limit?: number): ExperienceView[] {
    const capped = Math.min(limit ?? this.env.LIST_DEFAULT_LIMIT, this.env.LIST_MAX_LIMIT);
    return [...this.experiences.values()]
      .filter((record) => record.orgId === tenant.orgId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, capped)
      .map((record) => this.experienceView(record));
  }

  createExperience(tenant: Tenant, input: CreateExperienceInput): ExperienceView {
    const nowMs = this.now().getTime();
    const record: ExperienceRecord = {
      id: crypto.randomUUID(),
      orgId: tenant.orgId,
      title: input.title,
      content: input.content,
      tags: input.tags ?? [],
      source: input.source ?? null,
      createdBy: tenant.userId,
      createdAt: nowMs,
      updatedAt: nowMs,
    };
    this.experiences.set(record.id, record);
    return this.experienceView(record);
  }

  searchExperiences(tenant: Tenant, query: string, limit?: number): ScoredExperienceView[] {
    const candidates = [...this.experiences.values()].filter((record) => record.orgId === tenant.orgId);
    return rankByScore(
      candidates,
      query,
      (record) => `${record.title} ${record.content} ${record.tags.join(" ")}`,
      Math.min(limit ?? this.env.SEARCH_DEFAULT_TOP_K, this.env.LIST_MAX_LIMIT),
      this.env.SEARCH_DEFAULT_THRESHOLD,
    ).map((record) => ({ ...this.experienceView(record), score: record.score }));
  }

  counts(): { memories: number; experiences: number } {
    return { memories: this.memories.size, experiences: this.experiences.size };
  }

  // ---------------- internals

  private memoryView(record: MemoryRecord): MemoryView {
    return {
      id: record.id,
      memory: record.memory,
      user_id: record.userId,
      agent_id: record.agentId,
      metadata: record.metadata,
      created_at: new Date(record.createdAt).toISOString(),
      updated_at: new Date(record.updatedAt).toISOString(),
    };
  }

  private experienceView(record: ExperienceRecord): ExperienceView {
    return {
      id: record.id,
      title: record.title,
      content: record.content,
      tags: record.tags,
      source: record.source,
      created_by: record.createdBy,
      created_at: new Date(record.createdAt).toISOString(),
      updated_at: new Date(record.updatedAt).toISOString(),
    };
  }

  /** seed：3 条 memory + 2 条 experience（固定 DEFAULT_ORG_ID 演示租户）。 */
  private seed(): void {
    const base = this.now().getTime() - 60_000;
    const orgId = this.env.DEFAULT_ORG_ID;
    const userId = this.env.DEFAULT_USER_ID;
    const memories: Array<{ id: string; memory: string; metadata: Record<string, unknown> }> = [
      {
        id: "mem_seed_001",
        memory: "用户偏好使用 TypeScript 和 Bun，单元测试使用 bun:test，提交信息使用英文。",
        metadata: { source: "seed", topic: "preferences" },
      },
      {
        id: "mem_seed_002",
        memory: "用户正在建设 OpenDream Cloud 多租户 AI 平台，核心模块包括 MCP 网关、数字人和工作流引擎。",
        metadata: { source: "seed", topic: "project" },
      },
      {
        id: "mem_seed_003",
        memory: "用户要求代码注释与文档使用中文，API 错误使用两层模型 code + reason。",
        metadata: { source: "seed", topic: "conventions" },
      },
    ];
    memories.forEach((item, index) => {
      this.memories.set(item.id, {
        id: item.id,
        orgId,
        userId,
        agentId: null,
        memory: item.memory,
        metadata: item.metadata,
        createdAt: base + index,
        updatedAt: base + index,
      });
    });

    const experiences: Array<{ id: string; title: string; content: string; tags: string[]; source: string }> = [
      {
        id: "exp_seed_001",
        title: "模型中心接入第三方 Provider",
        content: "通过 POST /model-providers 注册 OpenAI 兼容端点；test 连通后 activate；生成配置会原子写入 OPENCODE_CONFIG_OUT 供 workspace 读取。",
        tags: ["model-center", "provider", "config"],
        source: "task-18",
      },
      {
        id: "exp_seed_002",
        title: "数字人 L1 会话联调",
        content: "创建 /api/v1/dh/sessions 后调用 messages 获取 mock 回复；events SSE 支持 Last-Event-ID 回放；错误 reason 使用 dh_* 枚举。",
        tags: ["digital-human", "sse", "webhook"],
        source: "task-39",
      },
    ];
    experiences.forEach((item, index) => {
      this.experiences.set(item.id, {
        id: item.id,
        orgId,
        title: item.title,
        content: item.content,
        tags: item.tags,
        source: item.source,
        createdBy: userId,
        createdAt: base + index,
        updatedAt: base + index,
      });
    });
  }
}
