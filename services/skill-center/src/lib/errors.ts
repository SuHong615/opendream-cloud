// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { ApiError } from "../../../../packages/shared/src/errors.ts";
import type { Page } from "../types";

export { ApiError };

/** 门禁拒绝：409 + precondition_failed + gate_blocked（冻结契约，不用 412）。 */
export function gateBlocked(input: { gateKind: "eval" | "scan" | "permission"; message?: string; details?: Record<string, unknown> }): ApiError {
  return new ApiError({
    code: "precondition_failed",
    reason: "gate_blocked",
    status: 409,
    message: input.message ?? "release gate blocked",
    details: { gate_kind: input.gateKind, ...(input.details ?? {}) },
  });
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError({ code: "not_found", message });
}

export function badRequest(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError({ code: "validation_failed", status: 400, message, details });
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError({ code: "forbidden", reason: "authz_forbidden", message });
}

export function conflict(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError({ code: "conflict", status: 409, message, details });
}

export function pageOf<T>(items: T[], cursor: string | undefined, limit: number, keyOf: (item: T) => string): Page<T> {
  let start = 0;
  if (cursor) {
    const index = items.findIndex((item) => keyOf(item) === cursor);
    start = index >= 0 ? index + 1 : 0;
  }
  const slice = items.slice(start, start + limit);
  const last = slice[slice.length - 1];
  const next = start + limit < items.length && last !== undefined ? keyOf(last) : null;
  return { items: slice, next_cursor: next };
}

export function createdAt(now: Date): string {
  return now.toISOString();
}
