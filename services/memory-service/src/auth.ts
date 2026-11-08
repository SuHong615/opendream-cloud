// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors";

const sha256 = (value: string): Buffer => createHash("sha256").update(value, "utf8").digest();

/** 内部数据面鉴权：`Authorization: Bearer <MEMORY_API_KEY>`；缺失/错误 → 401 `unauthorized`。 */
export function requireApiKey(request: FastifyRequest, expectedKey: string): void {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) throw unauthorized();
  const provided = header.slice("Bearer ".length).trim();
  if (!provided) throw unauthorized();
  const expected = sha256(expectedKey);
  const actual = sha256(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw unauthorized();
}

/** 门面透传的租户头；无头时回退开发默认。 */
export function tenantOf(request: FastifyRequest, env: { DEFAULT_ORG_ID: string; DEFAULT_USER_ID: string }): { orgId: string; userId: string } {
  const org = request.headers["x-oc-org-id"];
  const user = request.headers["x-oc-user-id"];
  return {
    orgId: typeof org === "string" && org.length > 0 ? org : env.DEFAULT_ORG_ID,
    userId: typeof user === "string" && user.length > 0 ? user : env.DEFAULT_USER_ID,
  };
}
