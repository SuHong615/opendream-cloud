// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 跨包共享常量。
 * 这些值是平台契约的一部分：改动必须同步 docs/02-architecture/openapi.yaml 与 deploy/DEPLOYMENT.md。
 */

/** 控制面 API 版本前缀（所有端点） */
export const API_PREFIX = "/api/v1" as const;

/** 平台 API Key 前缀（明文仅创建时返回一次，库中只存哈希） */
export const API_KEY_PREFIX = "ock_" as const;

/** 控制面 SSO 会话 Cookie（host-only、无 Domain） */
export const SESSION_COOKIE = "__Host-oc_session" as const;

/** 工作区入口 Cookie；实际名称追加 workspaceId（host-only） */
export const WORKSPACE_COOKIE_PREFIX = "__Host-oc_ws" as const;

/** 应用入口 Cookie；实际名称追加 appId（host-only） */
export const APP_COOKIE_PREFIX = "__Host-oc_app" as const;

/** 请求追踪头；每个响应都必须带，与 error.request_id 一致 */
export const HEADER_REQUEST_ID = "x-request-id" as const;

/** 写操作幂等键（仅控制面写操作；模型调用不适用） */
export const HEADER_IDEMPOTENCY_KEY = "idempotency-key" as const;

/** 游标分页默认值与上限（与 openapi.yaml 一致） */
export const DEFAULT_PAGE_SIZE = 20 as const;
export const MAX_PAGE_SIZE = 100 as const;

/** 工作区规格（PLAN C1：4C8G，requests=limits；PVC 默认 20GiB） */
export const WORKSPACE_SPEC = {
  cpu: 4,
  memoryGiB: 8,
  pvcGiB: 20,
  pvcGiBMax: 500,
  serverPort: 4096,
  agentHealthPort: 8081,
} as const;

/** 应用规格（PLAN C3：每应用 1C2G） */
export const APP_SPEC = {
  cpu: 1,
  memoryGiB: 2,
  port: 3000,
} as const;

/** 显式销毁冷却期（lead D17：默认 5min，可配 5–1440min；不允许 0） */
export const DESTROY_COOLDOWN_MINUTES = {
  default: 5,
  min: 5,
  max: 1440,
} as const;

/** access-ticket：ed25519 JWT，60s，一次性（jti） */
export const ACCESS_TICKET_TTL_SECONDS = 60 as const;

/** 工作区/应用入口 Cookie 有效期（小时） */
export const ACCESS_COOKIE_TTL_HOURS = 12 as const;

/** 控制面默认端口（dev）/控制台默认端口 */
export const DEFAULT_PORTS = {
  controlPlane: 4000,
  console: 3000,
} as const;
