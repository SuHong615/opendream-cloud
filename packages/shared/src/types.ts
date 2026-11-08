// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 公共 Zod 类型（控制面 API 的 MVP 子集，字段与 openapi.yaml 对齐）。
 * 只放大平台共享的"契约型" schema；服务内部 DTO 各自维护。
 */
import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./constants";

export const zUlid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "expected ULID");
export const zUuid = z.string().uuid();
export const zRfc3339 = z.string().datetime({ offset: true });
export const zOrgId = zUuid;
export const zUserId = zUuid;

/** 组织角色：owner > admin > member > viewer */
export const zOrgRole = z.enum(["owner", "admin", "member", "viewer"]);
export type OrgRole = z.infer<typeof zOrgRole>;

/** 工作区状态（9 态，唯一权威 = workspaces.state） */
export const zWorkspaceState = z.enum([
  "provisioning",
  "starting",
  "ready",
  "idle",
  "stopping",
  "stopped",
  "error",
  "deleting",
  "deleted",
]);
export type WorkspaceState = z.infer<typeof zWorkspaceState>;

/** 游标分页查询（?cursor=<opaque>&limit=1..100，默认 20） */
export const zPaginationQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  include_total: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional()
    .default(false),
});
export type PaginationQuery = z.infer<typeof zPaginationQuery>;

/** 分页响应（next_cursor 为 null 表示结束；默认不返回 total） */
export const zPage = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    next_cursor: z.string().nullable(),
    total: z.number().int().nonnegative().optional(),
  });

export const zUser = z.object({
  id: zUserId,
  email: z.string().email(),
  display_name: z.string().min(1).max(120),
  active_org_id: zOrgId.nullable(),
  created_at: zRfc3339,
});
export type User = z.infer<typeof zUser>;

export const zOrg = z.object({
  id: zOrgId,
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/),
  name: z.string().min(1).max(120),
  role: zOrgRole,
  created_at: zRfc3339,
});
export type Org = z.infer<typeof zOrg>;

/** 工作区摘要（列表用；url 仅 ready/idle/stopped 且已签发时返回） */
export const zWorkspaceSummary = z.object({
  id: zUlid,
  display_name: z.string().min(1).max(64),
  state: zWorkspaceState,
  owner_user_id: zUserId,
  url: z.string().url().nullable(),
  created_at: zRfc3339,
  last_activity_at: zRfc3339.nullable(),
});
export type WorkspaceSummary = z.infer<typeof zWorkspaceSummary>;

/** access-ticket 响应（60s 一次性；URL 带 __ticket=） */
export const zAccessTicket = z.object({
  url: z.string().url(),
  ticket: z.string().min(20),
  expires_in: z.number().int().positive(),
});
export type AccessTicket = z.infer<typeof zAccessTicket>;

/** `POST /workspaces/{id}/destroy` 请求体（二次确认） */
export const zDestroyWorkspaceRequest = z.object({
  confirm_name: z.string().min(1).max(64),
  acknowledge_data_loss: z.literal(true),
  keep_snapshot: z.boolean().default(true),
});
export type DestroyWorkspaceRequest = z.infer<typeof zDestroyWorkspaceRequest>;

/** 健康检查响应 */
export const zHealth = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  checks: z.record(z.enum(["ok", "degraded", "down"])).optional(),
});
export type Health = z.infer<typeof zHealth>;
