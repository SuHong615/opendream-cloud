// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Page } from "../core";
import { ApiError } from "../../../../packages/shared/src/errors.ts";

export { ApiError };

const wfReason = (reason: string): never => reason as never;

export const notFound = (message = "Not found"): ApiError => new ApiError({ code: "not_found", message });

export const badRequest = (message: string, details?: Record<string, unknown>): ApiError =>
  new ApiError({ code: "validation_failed", status: 400, message, details });

export const conflict = (message: string, details?: Record<string, unknown>): ApiError =>
  new ApiError({ code: "conflict", status: 409, message, details });

export const forbidden = (message = "Forbidden"): ApiError => new ApiError({ code: "forbidden", status: 403, message });

export const unauthorized = (message = "Unauthorized"): ApiError => new ApiError({ code: "unauthorized", status: 401, message });

export function preconditionFailed(message: string, reason: string, details?: Record<string, unknown>): ApiError {
  return new ApiError({ code: "precondition_failed", reason: wfReason(reason), status: 409, message, details });
}

export const wfDslInvalid = (errors: string[], warnings: string[] = []): ApiError =>
  new ApiError({
    code: "validation_failed",
    reason: wfReason("wf_dsl_invalid"),
    status: 400,
    message: "workflow DSL validation failed",
    details: { errors, warnings },
  });

export const wfVersionImmutable = (version: string): ApiError =>
  new ApiError({
    code: "conflict",
    reason: wfReason("wf_version_immutable"),
    status: 409,
    message: `workflow version ${version} is immutable`,
    details: { version },
  });

export const wfRunNotFound = (id: string): ApiError =>
  new ApiError({
    code: "not_found",
    reason: wfReason("wf_run_not_found"),
    status: 404,
    message: "workflow instance not found",
    details: { instance_id: id },
  });

export const wfHumanTaskExpired = (id: string): ApiError =>
  new ApiError({
    code: "conflict",
    reason: wfReason("wf_human_task_expired"),
    status: 409,
    message: "human task has expired",
    details: { task_id: id },
  });

export const wfNodeFailed = (nodeId: string, message: string): ApiError =>
  new ApiError({ code: "internal_error", reason: wfReason("wf_node_failed"), status: 500, message, details: { node_id: nodeId } });

export const wfCompensationFailed = (message: string): ApiError =>
  new ApiError({ code: "internal_error", reason: wfReason("wf_compensation_failed"), status: 500, message });

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
