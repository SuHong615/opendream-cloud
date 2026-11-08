// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { ApiErrorCode, ErrorReason } from "./constants";

/** 两层错误（openapi `ErrorEnvelope`）：`{ error: { code, reason?, message, details?, request_id } }` */
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
    this.status = input.status ?? statusFor(input.code);
  }
}

export function statusFor(code: ApiErrorCode): number {
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
      return 400;
    case "precondition_failed":
      return 412;
    case "quota_exceeded":
      return 429;
    case "rate_limited":
      return 429;
    case "unsupported_media_type":
      return 415;
    case "payload_too_large":
      return 413;
    case "database_unavailable":
    case "orchestrator_unavailable":
    case "model_gateway_unavailable":
      return 503;
    case "upstream_error":
      return 502;
    default:
      return 500;
  }
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError({ code: "validation_failed", message, details });
}

export function unauthorized(message = "Authentication required"): ApiError {
  return new ApiError({ code: "unauthorized", message, reason: "auth_session_expired" });
}

export function forbidden(message = "Forbidden", details?: Record<string, unknown>): ApiError {
  return new ApiError({ code: "forbidden", message, reason: "authz_forbidden", details });
}

export function notFound(message = "Not found", reason?: ErrorReason): ApiError {
  return new ApiError({ code: "not_found", message, reason });
}

export function conflict(message = "Conflict", reason?: ErrorReason): ApiError {
  return new ApiError({ code: "conflict", message, reason });
}
