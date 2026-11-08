// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong

/** 所有平面 API 必须使用的头部。 */
export const PLANE_HEADERS = {
  tenant: "X-OC-Tenant",
  idempotency: "Idempotency-Key",
  requestId: "X-Request-Id",
  authorization: "Authorization",
} as const;

export const ERROR_CODES = {
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "not_found",
  conflict: "conflict",
  validation_failed: "validation_failed",
  idempotency_conflict: "idempotency_conflict",
  ownership_violation: "ownership_violation",
  policy_denied: "policy_denied",
  upstream_error: "upstream_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface PlaneErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    request_id: string;
    details?: Record<string, unknown>;
  };
}
