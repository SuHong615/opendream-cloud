// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PAGE_SIZE,
  DESTROY_COOLDOWN_MINUTES,
  zAccessTicket,
  zDestroyWorkspaceRequest,
  zHealth,
  zPaginationQuery,
  zUser,
  zWorkspaceState,
  zWorkspaceSummary,
  zOrgRole,
} from "../src";

describe("契约常量", () => {
  test("4C8G / 1C2G / 冷却期与 D17 一致", () => {
    expect(DESTROY_COOLDOWN_MINUTES).toEqual({ default: 5, min: 5, max: 1440 });
    expect(DEFAULT_PAGE_SIZE).toBe(20);
  });
});

describe("Zod 公共类型", () => {
  test("分页默认值与上限", () => {
    const parsed = zPaginationQuery.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.include_total).toBe(false);
    expect(() => zPaginationQuery.parse({ limit: 101 })).toThrow();
  });

  test("工作区 9 态", () => {
    for (const state of zWorkspaceState.options) {
      expect(zWorkspaceState.parse(state)).toBe(state);
    }
    expect(zWorkspaceState.options).toHaveLength(9);
    expect(() => zWorkspaceState.parse("pending")).toThrow();
  });

  test("组织角色", () => {
    expect(zOrgRole.options).toEqual(["owner", "admin", "member", "viewer"]);
  });

  test("销毁请求必须确认数据丢失", () => {
    expect(() =>
      zDestroyWorkspaceRequest.parse({ confirm_name: "alice", acknowledge_data_loss: false }),
    ).toThrow();
    expect(
      zDestroyWorkspaceRequest.parse({ confirm_name: "alice", acknowledge_data_loss: true }),
    ).toMatchObject({ confirm_name: "alice", keep_snapshot: true });
  });

  test("access-ticket / user / workspace 摘要 / health", () => {
    expect(
      zAccessTicket.parse({
        url: "https://w-01H7F3C2A91.ws.example.com/?__ticket=abc",
        ticket: "eyJhbGciOiJFZERTQSJ9.payload.sig",
        expires_in: 60,
      }),
    ).toMatchObject({ expires_in: 60 });

    expect(
      zUser.parse({
        id: "01890f7e-6f2b-7c3a-9d1e-2f3a4b5c6d7e",
        email: "alice@example.com",
        display_name: "Alice",
        active_org_id: null,
        created_at: "2026-11-04T02:00:00Z",
      }),
    ).toMatchObject({ email: "alice@example.com" });

    expect(
      zWorkspaceSummary.parse({
        id: "01H7F3C2A91B2C3D4E5F6G7H8J",
        display_name: "alice-ws",
        state: "ready",
        owner_user_id: "01890f7e-6f2b-7c3a-9d1e-2f3a4b5c6d7e",
        url: null,
        created_at: "2026-11-04T02:00:00Z",
        last_activity_at: null,
      }),
    ).toMatchObject({ state: "ready" });

    expect(zHealth.parse({ status: "ok", version: "0.1.0" })).toMatchObject({ status: "ok" });
  });
});
