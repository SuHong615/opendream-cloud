// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export const WORKFLOW_API_VERSION = "workflow.opencode.cloud/v1";
export const WORKFLOW_SCHEMA_VERSION = "workflow-v1";

export type WorkflowDefinitionStatus = "draft" | "published" | "deprecated";
export type WorkflowRunStatus = "pending" | "running" | "waiting_human" | "waiting_timer" | "compensating" | "succeeded" | "failed" | "canceled";
export type StepStatus = "pending" | "ready" | "running" | "waiting" | "succeeded" | "failed" | "skipped" | "compensating" | "compensated";
export type HumanTaskStatus = "pending" | "claimed" | "completed" | "expired" | "canceled";
export type HumanTaskDecision = "approve" | "reject" | "request_changes";

export type JsonObject = Record<string, unknown>;

export interface WorkflowNode extends JsonObject {
  id: string;
  type: string;
  needs?: string[];
  when?: string;
  compensate?: string;
  onError?: string;
  retry?: { maxAttempts?: number };
  [key: string]: unknown;
}

export interface WorkflowDsl extends JsonObject {
  apiVersion: string;
  kind: string;
  metadata: { name: string; version: string; [key: string]: unknown };
  spec: {
    nodes: WorkflowNode[];
    description?: string;
    inputs?: unknown;
    outputs?: unknown;
    trigger?: JsonObject;
    defaults?: JsonObject;
    [key: string]: unknown;
  };
}

export interface WorkflowVersion {
  id: string;
  definition_id: string;
  /** 展示/排序用整数序号（1,2,3…）。 */
  number: number;
  /** 契约字段：语义化版本字符串（1.0.0）。 */
  version: string;
  dsl: WorkflowDsl;
  dsl_hash: string;
  schema_version: string;
  immutable: boolean;
  published_at: string | null;
  created_at: string;
  warnings: string[];
}

export interface WorkflowDefinition {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  category: "sdlc" | "general";
  visibility: string;
  status: WorkflowDefinitionStatus;
  latest_version_id: string | null;
  template_id: string | null;
  versions: WorkflowVersion[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StepState {
  node_id: string;
  type: string;
  status: StepStatus;
  attempts: number;
  output: unknown;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  human_task_id: string | null;
  compensation_for: string | null;
}

export interface RunWaitingOn {
  kind: "human_task" | "webhook" | "timer";
  node_id: string;
  human_task_id?: string;
}

export interface RunCompensation {
  started_at: string;
  completed_at: string | null;
  steps: string[];
}

export interface RunEvent {
  id: string;
  instance_id: string;
  seq: number;
  type: string;
  node_id: string | null;
  payload_hash: string | null;
  created_at: string;
  data: JsonObject;
}

export interface AuditEntry {
  at: string;
  action: string;
  actor: string;
  target: string;
  detail: JsonObject;
}

export interface WorkflowRun {
  id: string;
  org_id: string;
  definition_id: string;
  dsl_version_id: string;
  workflow_key: string;
  workflow_version: string;
  runtime: "state_machine";
  status: WorkflowRunStatus;
  inputs: JsonObject;
  correlation: JsonObject | null;
  input_ref: string | null;
  output_ref: string | null;
  steps: Record<string, StepState>;
  node_order: string[];
  waiting_on: RunWaitingOn | null;
  outputs: unknown;
  error: string | null;
  compensation: RunCompensation | null;
  events: RunEvent[];
  audit: AuditEntry[];
  created_by: string;
  trace_id: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface HumanTask {
  id: string;
  org_id: string;
  scope: "workflow";
  subject_type: "workflow_instance";
  subject_id: string;
  run_id: string;
  definition_id: string;
  workflow_key: string;
  node_id: string;
  title: string;
  description: string | null;
  assignee_type: "user" | "role" | "team";
  assignee_id: string;
  form: unknown;
  status: HumanTaskStatus;
  decision: HumanTaskDecision | null;
  comment: string | null;
  form_data: unknown;
  decided_by: string | null;
  decided_at: string | null;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplate {
  id: string;
  category: string;
  name: string;
  display_name: string;
  description: string;
  dsl: WorkflowDsl;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export function pageOf<T>(items: T[], cursor: string | undefined, limit: number, keyOf: (item: T) => string): Page<T> {
  let start = 0;
  if (cursor) {
    const index = items.findIndex((item) => keyOf(item) === cursor);
    start = index >= 0 ? index + 1 : 0;
  }
  const slice = items.slice(start, start + limit);
  const last = slice[slice.length - 1];
  return { items: slice, next_cursor: start + limit < items.length && last ? keyOf(last) : null };
}

export function definitionView(definition: WorkflowDefinition): JsonObject {
  return {
    id: definition.id,
    org_id: definition.org_id,
    slug: definition.slug,
    name: definition.name,
    category: definition.category,
    visibility: definition.visibility,
    latest_version_id: definition.latest_version_id,
    status: definition.status,
    created_at: definition.created_at,
  };
}

export function versionView(version: WorkflowVersion): JsonObject {
  return {
    id: version.id,
    definition_id: version.definition_id,
    version: version.version,
    dsl: version.dsl,
    dsl_hash: version.dsl_hash,
    schema_version: version.schema_version,
    immutable: version.immutable,
    published_at: version.published_at,
    created_at: version.created_at,
  };
}

export function runStatusView(run: WorkflowRun): WorkflowRunStatus {
  if (run.status === "waiting_human" || run.status === "waiting_timer") return run.status;
  if (run.status === "compensating") return "compensating";
  return run.status;
}

export function instanceView(run: WorkflowRun): JsonObject {
  return {
    id: run.id,
    definition_id: run.definition_id,
    dsl_version_id: run.dsl_version_id,
    runtime: run.runtime,
    status: runStatusView(run),
    input_ref: run.input_ref,
    output_ref: run.output_ref,
    correlation: run.correlation,
    error: run.error,
    started_at: run.started_at,
    finished_at: run.finished_at,
    created_at: run.created_at,
  };
}

export function eventView(event: RunEvent): JsonObject {
  return {
    id: event.id,
    instance_id: event.instance_id,
    seq: event.seq,
    type: event.type,
    node_id: event.node_id,
    payload_hash: event.payload_hash,
    created_at: event.created_at,
  };
}

export function taskView(task: HumanTask): JsonObject {
  return {
    id: task.id,
    scope: task.scope,
    subject_type: task.subject_type,
    subject_id: task.subject_id,
    title: task.title,
    form: task.form,
    assignee_type: task.assignee_type,
    assignee_id: task.assignee_id,
    sla_due_at: task.sla_due_at,
    status: task.status,
    decision: task.decision,
    comment: task.comment,
    created_at: task.created_at,
  };
}

export function parseDurationToMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value.trim());
  if (!match) return 24 * 60 * 60 * 1000;
  const amount = Number(match[1] ?? "0");
  const unit = match[2] ?? "h";
  const multipliers: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return amount * (multipliers[unit] ?? 60_000);
}
