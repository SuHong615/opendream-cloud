// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Provisioner, ProvisionerHooks } from "./types";

/**
 * Mock Provisioner：用定时器模拟 Operator 收敛，状态推进必须走同一张迁移表（非法迁移同样 409）。
 * 仅用于 G4 本机纵向切片；真实 K8s 实现见 k8s.ts（编译通过，G5 启用）。
 */
export class MockProvisioner implements Provisioner {
  readonly kind = "mock" as const;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>[]>();

  constructor(
    private readonly hooks: ProvisionerHooks,
    private readonly stepMs: number,
  ) {}

  ensure(workspaceId: string): void {
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["provisioning"], "starting", { type: "state_changed" }), this.stepMs);
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["starting"], "ready", { type: "provisioned" }), this.stepMs * 2);
  }

  start(workspaceId: string): void {
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["stopped", "error"], "starting", { type: "started" }), this.stepMs);
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["starting"], "ready", { type: "started" }), this.stepMs * 2);
  }

  stop(workspaceId: string): void {
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["ready", "idle"], "stopping", { type: "state_changed" }), this.stepMs);
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["stopping"], "stopped", { type: "stopped" }), this.stepMs * 2);
  }

  destroy(workspaceId: string, scheduledAtMs: number): void {
    const delay = Math.max(10, scheduledAtMs - Date.now());
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["stopped", "error", "ready", "idle"], "deleting", { type: "destroy_requested" }), delay);
    this.schedule(workspaceId, () => this.hooks.transition(workspaceId, ["deleting"], "deleted", { type: "destroyed" }), delay + this.stepMs);
  }

  cancelDestroy(workspaceId: string): void {
    this.clear(workspaceId);
  }

  private schedule(workspaceId: string, fn: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      try {
        fn();
      } catch {
        // 状态已被并发改变：Mock 不重试；真实 Operator 会 reconcile
      }
    }, delayMs);
    timer.unref?.();
    const list = this.timers.get(workspaceId) ?? [];
    list.push(timer);
    this.timers.set(workspaceId, list);
  }

  private clear(workspaceId: string): void {
    for (const timer of this.timers.get(workspaceId) ?? []) clearTimeout(timer);
    this.timers.delete(workspaceId);
  }
}
