// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 两层错误模型（与 packages/shared 一致；本服务自包含，避免依赖共享包的改动节奏）：
 * `{ error: { code, reason?, message, details?, request_id } }`
 * - `code`：openapi 通用 16 类传输层错误码子集；
 * - `reason`：openapi `ErrorReason` 中数字人域 `dh_*`（冻结 1.1.0 共 10 个）。
 */

export const DH_REASONS = [
  "dh_session_active",
  "dh_concurrency_exceeded",
  "dh_gpu_budget_exceeded",
  "dh_avatar_unavailable",
  "dh_voice_unauthorized",
  "dh_rtc_unavailable",
  "dh_tts_unavailable",
  "dh_lipsync_failed",
  "dh_content_blocked",
  "dh_embed_token_invalid",
] as const;

export type DhReason = (typeof DH_REASONS)[number];

export type DhErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "precondition_failed"
  | "rate_limited"
  | "model_gateway_unavailable"
  | "orchestrator_unavailable"
  | "service_unavailable"
  | "internal_error";

const DEFAULT_STATUS: Record<DhErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 400,
  precondition_failed: 422,
  rate_limited: 429,
  model_gateway_unavailable: 503,
  orchestrator_unavailable: 503,
  service_unavailable: 503,
  internal_error: 500,
};

export interface DhErrorBody {
  code: DhErrorCode;
  reason?: DhReason;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export class DhError extends Error {
  readonly code: DhErrorCode;
  readonly reason?: DhReason;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: DhErrorCode;
    message?: string;
    reason?: DhReason;
    status?: number;
    details?: Record<string, unknown>;
  }) {
    super(input.message ?? input.code);
    this.name = "DhError";
    this.code = input.code;
    this.reason = input.reason;
    this.status = input.status ?? DEFAULT_STATUS[input.code];
    this.details = input.details;
  }

  toBody(requestId: string): { error: DhErrorBody } {
    const error: DhErrorBody = { code: this.code, message: this.message, request_id: requestId };
    if (this.reason !== undefined) error.reason = this.reason;
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const notFound = (message = "Not found"): DhError => new DhError({ code: "not_found", message });

export const badRequest = (message: string, details?: Record<string, unknown>): DhError =>
  new DhError({ code: "validation_failed", status: 400, message, details });

export const conflict = (message: string, details?: Record<string, unknown>, reason?: DhReason): DhError =>
  new DhError({ code: "conflict", status: 409, message, details, reason });

export const forbidden = (message: string, reason?: DhReason, details?: Record<string, unknown>): DhError =>
  new DhError({ code: "forbidden", status: 403, message, reason, details });

export const sessionUnavailable = (message: string, reason: DhReason, details?: Record<string, unknown>): DhError =>
  new DhError({ code: "model_gateway_unavailable", status: 503, message, reason, details });
