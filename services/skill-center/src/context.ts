// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyRequest } from "fastify";
import type { Env } from "./env";

export interface Principal {
  org_id: string;
  org_slug: string;
  user_id: string;
  roles: string[];
}

/** G5 骨架：租户头模拟；接 G4 控制面后由网关/Session 注入。 */
export function principalOf(request: FastifyRequest, env: Env): Principal {
  const header = (name: string): string | undefined => {
    const value = request.headers[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  };
  return {
    org_id: header("x-oc-org-id") ?? env.DEFAULT_ORG_ID,
    org_slug: header("x-oc-org-slug") ?? env.DEFAULT_ORG_SLUG,
    user_id: header("x-oc-user-id") ?? env.DEFAULT_USER_ID,
    roles: (header("x-oc-roles") ?? "owner,admin,member").split(",").map((r) => r.trim()),
  };
}

export interface AppContext {
  env: Env;
  store: import("./store").Store;
  version: string;
  now: () => Date;
  newId: () => string;
}

export interface BuildOptions {
  env?: Env;
  store?: import("./store").Store;
  now?: () => Date;
  newId?: () => string;
}
