// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { WorkspaceState } from "../lib/constants";

export interface ProvisionerHooks {
  transition: (
    workspaceId: string,
    from: WorkspaceState[],
    to: WorkspaceState,
    opts?: { reason?: string; type?: string },
  ) => void;
}

/** Provisioner 抽象：Mock（本机）与 K8s（@kubernetes/client-node）可互换。 */
export interface Provisioner {
  readonly kind: "mock" | "k8s";
  ensure(workspaceId: string): void;
  start(workspaceId: string): void;
  stop(workspaceId: string): void;
  destroy(workspaceId: string, scheduledAtMs: number): void;
  cancelDestroy(workspaceId: string): void;
}
