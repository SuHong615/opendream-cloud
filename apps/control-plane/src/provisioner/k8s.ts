// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { KubeConfig, CustomObjectsApi } from "@kubernetes/client-node";
import type { Provisioner } from "./types";

/**
 * K8s Provisioner（G5 启用；G4 只要求 `tsc` 通过）。
 * 控制面只写 `OpencodeWorkspace.spec`，status 由 Operator 回写；本类不直接建 Pod/PVC。
 */
export class K8sProvisioner implements Provisioner {
  readonly kind = "k8s" as const;
  private readonly api: CustomObjectsApi;
  private readonly namespacePrefix: string;

  constructor(options: { kubeconfig?: string; namespacePrefix?: string } = {}) {
    const config = new KubeConfig();
    if (options.kubeconfig) config.loadFromFile(options.kubeconfig);
    else config.loadFromDefault();
    this.api = config.makeApiClient(CustomObjectsApi);
    this.namespacePrefix = options.namespacePrefix ?? "ws-";
  }

  ensure(_workspaceId: string): void {
    // G5：createNamespacedCustomObject({ group, version, namespace: `${prefix}${orgId}`, plural, body })
    void this.api;
    void this.namespacePrefix;
    throw new Error("K8sProvisioner not enabled in G4 MVP");
  }

  start(workspaceId: string): void {
    void workspaceId;
    throw new Error("K8sProvisioner not enabled in G4 MVP");
  }

  stop(workspaceId: string): void {
    void workspaceId;
    throw new Error("K8sProvisioner not enabled in G4 MVP");
  }

  destroy(workspaceId: string, scheduledAtMs: number): void {
    void workspaceId;
    void scheduledAtMs;
    throw new Error("K8sProvisioner not enabled in G4 MVP");
  }

  cancelDestroy(workspaceId: string): void {
    void workspaceId;
    throw new Error("K8sProvisioner not enabled in G4 MVP");
  }
}
