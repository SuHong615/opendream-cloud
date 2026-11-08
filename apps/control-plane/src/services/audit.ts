// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Sqlite } from "../db/client";
import type { Principal } from "../types";
import { randomId } from "../lib/crypto";
import type { FastifyRequest } from "fastify";
import { clientIp } from "../lib/http";

export interface AuditInput {
  orgId: string | null;
  actorType: "user" | "service" | "system";
  actorId?: string | null;
  actorIp?: string | null;
  userAgent?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: "success" | "denied" | "error";
  detail?: Record<string, unknown>;
  requestId?: string | null;
}

export function writeAudit(sqlite: Sqlite, input: AuditInput): void {
  sqlite
    .query(
      `INSERT INTO audit_logs (id, org_id, actor_type, actor_id, actor_ip, user_agent, action, resource_type,
        resource_id, outcome, detail, request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomId(),
      input.orgId,
      input.actorType,
      input.actorId ?? null,
      input.actorIp ?? null,
      input.userAgent ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.outcome,
      JSON.stringify(input.detail ?? {}),
      input.requestId ?? null,
      Date.now(),
    );
}

export function auditFromRequest(
  sqlite: Sqlite,
  input: {
    principal?: Principal;
    request: FastifyRequest;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    outcome: "success" | "denied" | "error";
    orgId?: string | null;
    detail?: Record<string, unknown>;
  },
): void {
  writeAudit(sqlite, {
    orgId: input.orgId ?? input.principal?.orgId ?? null,
    actorType: input.principal ? "user" : "system",
    actorId: input.principal?.userId ?? null,
    actorIp: clientIp(input.request),
    userAgent: typeof input.request.headers["user-agent"] === "string" ? input.request.headers["user-agent"] : null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: input.outcome,
    detail: input.detail,
    requestId: typeof input.request.headers["x-request-id"] === "string" ? input.request.headers["x-request-id"] : null,
  });
}
