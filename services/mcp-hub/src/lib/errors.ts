// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { ApiError } from "../../../../packages/shared/src/errors.ts";
import type { Page } from "../core";

export { ApiError };

export const notFound = (message = "Not found"): ApiError => new ApiError({ code: "not_found", message });

export const badRequest = (message: string, details?: Record<string, unknown>): ApiError =>
  new ApiError({ code: "validation_failed", status: 400, message, details });

export const conflict = (message: string, details?: Record<string, unknown>): ApiError =>
  new ApiError({ code: "conflict", status: 409, message, details });

export const unauthorized = (message = "Authentication required"): ApiError =>
  new ApiError({ code: "unauthorized", reason: "mcp_auth_required", status: 401, message });

export function gateBlocked(details: Record<string, unknown> = {}): ApiError {
  return new ApiError({
    code: "precondition_failed",
    reason: "gate_blocked",
    status: 409,
    message: "MCP publish gate blocked",
    details: { gate_kind: "permission", ...details },
  });
}

export function pageOf<T>(items: T[], cursor: string | undefined, limit: number, keyOf: (item: T) => string): Page<T> {
  let start = 0;
  if (cursor) {
    const index = items.findIndex((item) => keyOf(item) === cursor);
    start = index >= 0 ? index + 1 : 0;
  }
  const slice = items.slice(start, start + limit);
  const last = slice[slice.length - 1];
  return { items: slice, next_cursor: start + limit < items.length && last ? keyOf(last) : null };
}
