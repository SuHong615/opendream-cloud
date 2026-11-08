// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/** 契约常量（与 packages/shared/src/constants.ts、openapi.yaml 对齐；MVP 内联以避免跨包依赖） */
export const API_PREFIX = "/api/v1";
export const API_KEY_PREFIX = "ock_";
export const SESSION_COOKIE = "__Host-oc_session";
export const CSRF_COOKIE = "oc_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const HEADER_REQUEST_ID = "x-request-id";
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const WORKSPACE_SPEC = { cpu: "4", memory: "8Gi", pvc: "20Gi", serverPort: 4096 } as const;
export const DESTROY_COOLDOWN = { default: 5, min: 5, max: 1440 } as const;
export const ACCESS_TICKET_TTL_SECONDS = 60;
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const CONTROL_PLANE_PORT = 4000;

export const ORG_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const WORKSPACE_STATES = [
  "provisioning",
  "starting",
  "ready",
  "idle",
  "stopping",
  "stopped",
  "error",
  "deleting",
  "deleted",
] as const;
export type WorkspaceState = (typeof WORKSPACE_STATES)[number];

export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "conflict",
  "idempotency_conflict",
  "precondition_failed",
  "quota_exceeded",
  "rate_limited",
  "unsupported_media_type",
  "payload_too_large",
  "internal_error",
  "database_unavailable",
  "orchestrator_unavailable",
  "model_gateway_unavailable",
  "upstream_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ERROR_REASONS = [
  "auth_session_expired",
  "authz_forbidden",
  "workspace_not_ready",
  "workspace_not_found",
  "workspace_limit_reached",
  "ws_quota_exceeded",
  "ws_launch_timeout",
  "ws_image_pull_failed",
  "ws_storage_full",
  "ws_storage_attach_failed",
  "model_not_authorized",
  "model_budget_exceeded",
  "skill_permission_denied",
  "gate_blocked",
  "share_link_expired",
  "mcp_health_down",
  "mcp_auth_required",
  "app_build_failed",
  "config_stale",
  "idp_unavailable",
  "workspace_destroy_cooldown",
  "ticket_reused",
  "tenant_context_missing",
] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];
