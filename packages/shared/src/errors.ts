// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 两层错误模型（与 docs/02-architecture/openapi.yaml 一致）：
 * - `code`：HTTP/传输层稳定枚举，客户端用于分支；
 * - `reason`：领域原因（openapi `ErrorReason`），用于产品文案与埋点；
 * - `WorkspaceErrorCode`：operator 写入 `status.error.code` 的枚举（openapi `WorkspaceError`）。
 *
 * 响应体统一：`{ "error": { code, reason?, message, details?, request_id } }`
 */
import { HEADER_REQUEST_ID } from "./constants";

/** 传输层/HTTP 语义错误码（稳定，不可随意增删） */
export const API_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "validation_failed",
  "rate_limited",
  "payload_too_large",
  "idempotency_conflict",
  "precondition_failed",
  "orchestrator_unavailable",
  "database_unavailable",
  "model_gateway_unavailable",
  "service_unavailable",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** 领域原因（openapi `ErrorReason` 枚举）。新增必须同步 openapi 并评审。 */
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

/**
 * operator `status.error.code` 枚举（openapi `WorkspaceError.code`）。
 * 注意：快照失败不新增 reason，使用 `internal` + `details.phase="snapshot"`（G2-02）。
 */
export const WORKSPACE_ERROR_CODES = [
  "provision_timeout",
  "scheduling_failed",
  "image_pull_failed",
  "start_timeout",
  "unhealthy",
  "storage_full",
  "storage_attach_failed",
  "quota_exceeded",
  "internal",
] as const;

export type WorkspaceErrorCode = (typeof WORKSPACE_ERROR_CODES)[number];

export interface ApiErrorPayload {
  code: ApiErrorCode;
  reason?: ErrorReason;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorPayload;
}

/** 平台统一错误对象；服务端 throw，客户端按 code/reason 分支。 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly reason?: ErrorReason;
  readonly details?: Record<string, unknown>;
  readonly requestId: string;
  readonly status: number;

  constructor(input: {
    code: ApiErrorCode;
    message?: string;
    reason?: ErrorReason;
    details?: Record<string, unknown>;
    requestId?: string;
    status?: number;
  }) {
    super(input.message ?? input.code);
    this.name = "ApiError";
    this.code = input.code;
    this.reason = input.reason;
    this.details = input.details;
    this.requestId = input.requestId ?? "";
    this.status = input.status ?? defaultStatus(input.code);
  }

  toJSON(): ApiErrorEnvelope {
    const error: ApiErrorPayload = {
      code: this.code,
      message: this.message,
      request_id: this.requestId,
    };
    if (this.reason !== undefined) error.reason = this.reason;
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }

  /** HTTP 响应头（含请求追踪） */
  headers(): Record<string, string> {
    return { [HEADER_REQUEST_ID]: this.requestId };
  }
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

export function isErrorReason(value: unknown): value is ErrorReason {
  return typeof value === "string" && (ERROR_REASONS as readonly string[]).includes(value);
}

export function isWorkspaceErrorCode(value: unknown): value is WorkspaceErrorCode {
  return typeof value === "string" && (WORKSPACE_ERROR_CODES as readonly string[]).includes(value);
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function defaultStatus(code: ApiErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
    case "idempotency_conflict":
      return 409;
    case "validation_failed":
    case "precondition_failed":
      return 422;
    case "rate_limited":
      return 429;
    case "payload_too_large":
      return 413;
    case "orchestrator_unavailable":
    case "database_unavailable":
    case "model_gateway_unavailable":
    case "service_unavailable":
      return 503;
    default:
      return 500;
  }
}
