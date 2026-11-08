// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test } from "bun:test";
import {
  API_ERROR_CODES,
  ApiError,
  ERROR_REASONS,
  WORKSPACE_ERROR_CODES,
  isApiError,
  isApiErrorCode,
  isErrorReason,
  isWorkspaceErrorCode,
} from "../src/errors";

describe("ApiError 两层错误模型", () => {
  test("序列化为 openapi 约定 envelope", () => {
    const err = new ApiError({
      code: "precondition_failed",
      reason: "workspace_not_ready",
      message: "workspace is provisioning",
      details: { state: "starting" },
      requestId: "01J00000000000000000000000",
    });

    expect(err.status).toBe(422);
    expect(err.toJSON()).toEqual({
      error: {
        code: "precondition_failed",
        reason: "workspace_not_ready",
        message: "workspace is provisioning",
        details: { state: "starting" },
        request_id: "01J00000000000000000000000",
      },
    });
    expect(err.headers()["x-request-id"]).toBe("01J00000000000000000000000");
  });

  test("未提供 message 时回退到 code", () => {
    const err = new ApiError({ code: "unauthorized" });
    expect(err.message).toBe("unauthorized");
    expect(err.status).toBe(401);
  });

  test("快照失败使用 internal + details.phase=snapshot（不新增 reason，G2-02）", () => {
    const err = new ApiError({
      code: "internal_error",
      message: "snapshot failed",
      details: { phase: "snapshot" },
    });
    expect(err.toJSON().error.details).toEqual({ phase: "snapshot" });
    expect(ERROR_REASONS).not.toContain("snapshot_failed" as never);
  });

  test("枚举守卫", () => {
    expect(isApiError(new ApiError({ code: "not_found" }))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
    expect(isApiErrorCode("rate_limited")).toBe(true);
    expect(isApiErrorCode("nope")).toBe(false);
    expect(isErrorReason("ticket_reused")).toBe(true);
    expect(isErrorReason("nope")).toBe(false);
    expect(isWorkspaceErrorCode("start_timeout")).toBe(true);
    expect(isWorkspaceErrorCode("snapshot_failed")).toBe(false);
  });

  test("错误码表稳定（防误删/误加）", () => {
    expect(API_ERROR_CODES).toContain("orchestrator_unavailable");
    expect(API_ERROR_CODES).toContain("model_gateway_unavailable");
    expect(ERROR_REASONS.length).toBe(23);
    expect(WORKSPACE_ERROR_CODES.length).toBe(9);
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    expect(new Set(ERROR_REASONS).size).toBe(ERROR_REASONS.length);
  });
});
