// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong

/**
 * Executor registry（LoopForge 式执行器抽象）。
 *
 * 该模块只负责能力声明与选择，不直接启动宿主进程；真正的执行由
 * workspace / OpenDream Code / 沙箱运行时完成。这样云端与桌面端可以复用同一份
 * 执行器契约，同时避免在控制面里信任任意 CLI。
 */
export interface ExecutorDescriptor {
  id: string;
  label: string;
  kind: "agent-cli" | "sandbox" | "mock";
  command: string | null;
  capabilities: string[];
  requires_host: boolean;
  status: "available" | "configurable";
  description: string;
}

const EXECUTORS: ExecutorDescriptor[] = [
  {
    id: "opencode",
    label: "OpenCode",
    kind: "agent-cli",
    command: "opencode",
    capabilities: ["code", "edit", "test", "git"],
    requires_host: true,
    status: "available",
    description: "OpenDream Code 与云端工作区默认执行器；模型经模型中心代理。",
  },
  {
    id: "codex",
    label: "Codex",
    kind: "agent-cli",
    command: "codex",
    capabilities: ["code", "edit", "test", "patch"],
    requires_host: true,
    status: "configurable",
    description: "通过执行机安装 Codex CLI 后启用；凭证只保存在执行机。",
  },
  {
    id: "claude-code",
    label: "Claude Code",
    kind: "agent-cli",
    command: "claude",
    capabilities: ["code", "edit", "review", "test"],
    requires_host: true,
    status: "configurable",
    description: "通过执行机安装 Claude Code CLI 后启用；按租户策略隔离工作区。",
  },
  {
    id: "codebuddy",
    label: "CodeBuddy",
    kind: "agent-cli",
    command: "codebuddy",
    capabilities: ["code", "edit", "test"],
    requires_host: true,
    status: "configurable",
    description: "腾讯 CodeBuddy 适配位；企业自备许可证与执行机。",
  },
  {
    id: "sandbox",
    label: "OpenDream Sandbox",
    kind: "sandbox",
    command: null,
    capabilities: ["code", "shell", "test", "artifacts"],
    requires_host: false,
    status: "available",
    description: "K8s/容器沙箱执行；SOP 的 script 节点默认使用该执行层。",
  },
  {
    id: "mock",
    label: "Mock Runtime",
    kind: "mock",
    command: null,
    capabilities: ["demo", "eval"],
    requires_host: false,
    status: "available",
    description: "本地演示与评测桩，不执行真实代码。",
  },
];

export function listExecutors(): ExecutorDescriptor[] {
  return EXECUTORS.map((executor) => ({ ...executor }));
}

export function getExecutor(id: string): ExecutorDescriptor | undefined {
  return EXECUTORS.find((executor) => executor.id === id);
}

export function defaultExecutor(): ExecutorDescriptor {
  return EXECUTORS[0]!;
}

export interface ExecutorProbe {
  id: string;
  installed: boolean;
  command: string | null;
  path: string | null;
  probed_at: string;
  message: string;
}

/** 只探测命令是否存在，不启动、不传凭证；真实执行由工作区运行时负责。 */
export function probeExecutor(id: string): ExecutorProbe {
  const executor = getExecutor(id);
  if (!executor) throw Object.assign(new Error("executor not found"), { status: 404 });
  const bun = (globalThis as { Bun?: { which: (command: string) => string | null } }).Bun;
  const path = executor.command && bun ? bun.which(executor.command) : null;
  const installed = !executor.command || Boolean(path) || executor.kind === "sandbox" || executor.kind === "mock";
  return {
    id: executor.id,
    installed,
    command: executor.command,
    path,
    probed_at: new Date().toISOString(),
    message: executor.command ? (installed ? `已检测到 ${executor.command}` : `未检测到 ${executor.command}，需在执行机安装`) : "内置执行层，无需安装",
  };
}
