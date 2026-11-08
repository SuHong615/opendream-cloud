// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong

import type { Plane } from "./ownership";

export const EVENT_SPEC_VERSION = "1.0";
export const EVENT_SCHEMA_VERSION = "v1";

export interface EventEnvelope<T = Record<string, unknown>> {
  specversion: typeof EVENT_SPEC_VERSION;
  id: string;
  type: EventType;
  source: Plane;
  subject: string;
  tenant_id: string;
  time: string;
  sequence: number;
  trace_id?: string;
  data: T;
}

export const EVENT_TYPES = {
  "agent.run.started": { owner: "agentcore", subject: "run" },
  "agent.step.completed": { owner: "agentcore", subject: "run" },
  "agent.tool.called": { owner: "agentcore", subject: "run" },
  "harness.permission.decided": { owner: "harness", subject: "harness_session" },
  "loopforge.run.started": { owner: "loopforge", subject: "legion_run" },
  "loopforge.gate.waiting": { owner: "loopforge", subject: "approval" },
  "loopforge.approval.decided": { owner: "loopforge", subject: "approval" },
  "quality.eval.completed": { owner: "agentloop", subject: "eval_run" },
  "quality.backtest.completed": { owner: "agentloop", subject: "backtest" },
  "command.intervention.issued": { owner: "command", subject: "intervention" },
  "command.risk.raised": { owner: "command", subject: "mission" },
} as const;

export type EventType = keyof typeof EVENT_TYPES;

export function isKnownEventType(type: string): type is EventType {
  return Object.hasOwn(EVENT_TYPES, type);
}

export function eventOwner(type: EventType): Plane {
  return EVENT_TYPES[type].owner;
}

export function eventSubject(type: EventType): string {
  return EVENT_TYPES[type].subject;
}

/** 事件信封最小校验；不替代 JSON Schema 校验。 */
export function assertEventEnvelope(value: unknown): asserts value is EventEnvelope {
  if (typeof value !== "object" || value === null) throw new Error("event must be an object");
  const event = value as Partial<EventEnvelope>;
  const required = ["specversion", "id", "type", "source", "subject", "tenant_id", "time", "sequence", "data"] as const;
  for (const key of required) {
    if (event[key] === undefined || event[key] === null || event[key] === "") throw new Error(`event.${key} is required`);
  }
  if (event.specversion !== EVENT_SPEC_VERSION) throw new Error("unsupported event specversion");
  if (!isKnownEventType(String(event.type))) throw new Error(`unknown event type: ${String(event.type)}`);
  if (event.source !== eventOwner(event.type as EventType)) throw new Error("event.source does not own event type");
  if (typeof event.sequence !== "number" || event.sequence < 0) throw new Error("event.sequence must be >= 0");
}
