// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong

/**
 * AI Native 平面契约：唯一所有权。
 *
 * 该表是 PLANE-CONTRACT.md 的代码化版本；任何写入口都必须通过 ownerOf/assertOwner
 * 校验，禁止跨平面双写。
 */

export const PLANES = [
  "agentcore",
  "harness",
  "loopforge",
  "agentloop",
  "command",
  "foundation",
] as const;

export type Plane = (typeof PLANES)[number];

export type ResourceKind =
  | "session"
  | "run"
  | "step"
  | "tool_call"
  | "workspace"
  | "sandbox"
  | "snapshot"
  | "policy_decision"
  | "harness_session"
  | "permission_decision"
  | "sop"
  | "sop_version"
  | "role"
  | "squad"
  | "legion"
  | "legion_run"
  | "approval"
  | "gate"
  | "trace"
  | "eval_dataset"
  | "eval_run"
  | "experiment"
  | "backtest"
  | "quality_gate"
  | "mission"
  | "front"
  | "intervention"
  | "review"
  | "twin_projection"
  | "model"
  | "mcp_registry"
  | "skill"
  | "prompt"
  | "identity"
  | "audit"
  | "quota";

export const RESOURCE_OWNER: Readonly<Record<ResourceKind, Plane>> = {
  session: "agentcore",
  run: "agentcore",
  step: "agentcore",
  tool_call: "agentcore",
  workspace: "agentcore",
  sandbox: "agentcore",
  snapshot: "agentcore",
  policy_decision: "agentcore",
  harness_session: "harness",
  permission_decision: "harness",
  sop: "loopforge",
  sop_version: "loopforge",
  role: "loopforge",
  squad: "loopforge",
  legion: "loopforge",
  legion_run: "loopforge",
  approval: "loopforge",
  gate: "loopforge",
  trace: "agentloop",
  eval_dataset: "agentloop",
  eval_run: "agentloop",
  experiment: "agentloop",
  backtest: "agentloop",
  quality_gate: "agentloop",
  mission: "command",
  front: "command",
  intervention: "command",
  review: "command",
  twin_projection: "command",
  model: "foundation",
  mcp_registry: "foundation",
  skill: "foundation",
  prompt: "foundation",
  identity: "foundation",
  audit: "foundation",
  quota: "foundation",
};

export function ownerOf(kind: ResourceKind): Plane {
  return RESOURCE_OWNER[kind];
}

export class OwnershipViolation extends Error {
  readonly code = "ownership_violation";
  constructor(
    readonly kind: ResourceKind,
    readonly writer: Plane,
    readonly owner: Plane,
  ) {
    super(`${writer} cannot write ${kind}; owned by ${owner}`);
    this.name = "OwnershipViolation";
  }
}

/** 写入口必须调用：非 owner 直接拒绝。 */
export function assertOwner(kind: ResourceKind, writer: Plane): void {
  const owner = ownerOf(kind);
  if (owner !== writer) throw new OwnershipViolation(kind, writer, owner);
}

export function canWrite(kind: ResourceKind, writer: Plane): boolean {
  return ownerOf(kind) === writer;
}

/** 单一策略执行点（PEP）与单一审批源。 */
export const POLICY_ENFORCEMENT_POINT: Plane = "agentcore";
export const APPROVAL_SOURCE: Plane = "loopforge";
