// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { OrgRole } from "./lib/constants";

/** 每请求身份（AsyncLocalStorage / request 装饰器） */
export interface Principal {
  kind: "session" | "api_key";
  userId: string;
  orgId: string;
  role: OrgRole;
  scopes: string[];
  sessionId?: string;
  apiKeyId?: string;
}

export interface SessionPayload {
  sub: string;
  org: string;
  sid: string;
  exp: number;
}

export interface RequestMeta {
  requestId: string;
  principal?: Principal;
}
