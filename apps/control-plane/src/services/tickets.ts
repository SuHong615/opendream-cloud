// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "../env";
import type { Principal } from "../types";
import { signTicket, verifyTicket, type TicketClaims } from "../lib/crypto";
import { ACCESS_TICKET_TTL_SECONDS } from "../lib/constants";
import { ApiError } from "../lib/errors";

const USED = new Map<string, number>();

export interface IssuedTicket {
  token: string;
  claims: TicketClaims;
  expiresIn: number;
}

export function issueWorkspaceTicket(env: Env, principal: Principal, workspaceId: string): IssuedTicket {
  const issued = signTicket(
    env.TICKET_SECRET,
    {
      iss: env.PUBLIC_BASE_URL,
      aud: `workspace:${workspaceId}`,
      sub: principal.userId,
      tenant: principal.orgId,
      ws: workspaceId,
    },
    ACCESS_TICKET_TTL_SECONDS,
  );
  USED.set(issued.claims.jti, issued.claims.exp);
  return { token: issued.token, claims: issued.claims, expiresIn: ACCESS_TICKET_TTL_SECONDS };
}

/** Gateway 侧行为：验签 + aud 校验 + jti 一次性消费。 */
export function verifyAndConsumeWorkspaceTicket(env: Env, token: string, expectedWorkspaceId?: string): TicketClaims {
  const claims = verifyTicket(env.TICKET_SECRET, token);
  if (!claims) throw new ApiError({ code: "unauthorized", message: "invalid or expired ticket", reason: "auth_session_expired" });
  if (!claims.aud.startsWith("workspace:")) throw new ApiError({ code: "forbidden", message: "invalid ticket audience" });
  if (expectedWorkspaceId && claims.aud !== `workspace:${expectedWorkspaceId}`) {
    throw new ApiError({ code: "forbidden", message: "ticket audience mismatch" });
  }
  if (!USED.delete(claims.jti)) {
    throw new ApiError({ code: "forbidden", message: "ticket already used", reason: "ticket_reused" });
  }
  return claims;
}

/** 测试用：清除一次性票据状态。 */
export function resetTicketStore(): void {
  USED.clear();
}
