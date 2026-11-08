// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 两层错误模型（与平台一致）：`{ error: { code, message, details?, request_id } }`。
 * M5 不新增 `reason`（G-V5-CONTRACT §3/§6）：仅 16 类通用 `code`。
 */
export type MemoryErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "precondition_failed"
  | "rate_limited"
  | "internal_error";

const DEFAULT_STATUS: Record<MemoryErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 400,
  precondition_failed: 422,
  rate_limited: 429,
  internal_error: 500,
};

export class MemoryError extends Error {
  readonly code: MemoryErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(input: { code: MemoryErrorCode; message?: string; status?: number; details?: Record<string, unknown> }) {
    super(input.message ?? input.code);
    this.name = "MemoryError";
    this.code = input.code;
    this.status = input.status ?? DEFAULT_STATUS[input.code];
    this.details = input.details;
  }

  toBody(requestId: string): { error: { code: MemoryErrorCode; message: string; details?: Record<string, unknown>; request_id: string } } {
    const error: { code: MemoryErrorCode; message: string; details?: Record<string, unknown>; request_id: string } = {
      code: this.code,
      message: this.message,
      request_id: requestId,
    };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const unauthorized = (message = "invalid or missing API key"): MemoryError =>
  new MemoryError({ code: "unauthorized", message });

export const badRequest = (message: string, details?: Record<string, unknown>): MemoryError =>
  new MemoryError({ code: "validation_failed", message, details });

export const notFound = (message = "Not found"): MemoryError => new MemoryError({ code: "not_found", message });
