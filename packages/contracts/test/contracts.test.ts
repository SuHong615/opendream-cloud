// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test } from "bun:test";
import {
  APPROVAL_SOURCE,
  EVENT_TYPES,
  OwnershipViolation,
  PLANES,
  POLICY_ENFORCEMENT_POINT,
  assertEventEnvelope,
  assertOwner,
  canWrite,
  eventOwner,
  isKnownEventType,
  ownerOf,
  type EventEnvelope,
} from "../src";

describe("plane ownership", () => {
  test("each plane owns at least one resource and all owners are valid planes", () => {
    const owners = new Set(PLANES.map((plane) => plane));
    for (const plane of PLANES) expect(owners.has(plane)).toBe(true);
    expect(ownerOf("run")).toBe("agentcore");
    expect(ownerOf("workspace")).toBe("agentcore");
    expect(ownerOf("approval")).toBe("loopforge");
    expect(ownerOf("eval_run")).toBe("agentloop");
    expect(ownerOf("intervention")).toBe("command");
    expect(ownerOf("model")).toBe("foundation");
  });

  test("non-owner write is rejected", () => {
    expect(canWrite("run", "harness")).toBe(false);
    expect(() => assertOwner("run", "loopforge")).toThrow(OwnershipViolation);
    expect(() => assertOwner("approval", "command")).toThrow("owned by loopforge");
    expect(() => assertOwner("eval_run", "loopforge")).toThrow("owned by agentloop");
  });

  test("owner write passes", () => {
    expect(() => assertOwner("run", "agentcore")).not.toThrow();
    expect(() => assertOwner("approval", "loopforge")).not.toThrow();
  });

  test("PEP and approval are single-sourced", () => {
    expect(POLICY_ENFORCEMENT_POINT).toBe("agentcore");
    expect(APPROVAL_SOURCE).toBe("loopforge");
  });
});

describe("event contract", () => {
  test("all event types have owner matching source", () => {
    for (const [type, spec] of Object.entries(EVENT_TYPES)) {
      expect(isKnownEventType(type)).toBe(true);
      expect(eventOwner(type as keyof typeof EVENT_TYPES)).toBe(spec.owner);
    }
  });

  test("valid envelope passes", () => {
    const event: EventEnvelope = {
      specversion: "1.0",
      id: "evt_1",
      type: "loopforge.gate.waiting",
      source: "loopforge",
      subject: "approval/appr_1",
      tenant_id: "org_1",
      time: "2026-11-18T00:00:00Z",
      sequence: 1,
      data: { gate: "review" },
    };
    expect(() => assertEventEnvelope(event)).not.toThrow();
  });

  test("invalid source/unknown type rejected", () => {
    const base = {
      specversion: "1.0",
      id: "evt_1",
      type: "loopforge.gate.waiting",
      source: "agentcore",
      subject: "approval/appr_1",
      tenant_id: "org_1",
      time: "2026-11-18T00:00:00Z",
      sequence: 1,
      data: {},
    };
    expect(() => assertEventEnvelope(base)).toThrow("event.source does not own event type");
    expect(() => assertEventEnvelope({ ...base, source: "agentcore", type: "unknown.event" })).toThrow("unknown event type");
  });
});
