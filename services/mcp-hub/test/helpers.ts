// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";
import { testEnv } from "../src/env";
import type { AppContext } from "../src/context";
import type { Env } from "../src/env";

export interface Harness {
  app: FastifyInstance;
  ctx: AppContext;
  env: Env;
  close: () => Promise<void>;
}

export const TENANT_HEADERS = {
  "x-oc-org-id": "00000000-0000-4000-8000-000000000001",
  "x-oc-org-slug": "acme",
  "x-oc-user-id": "00000000-0000-4000-8000-000000000002",
  "x-oc-roles": "owner",
};

export function setupHarness(overrides: Partial<Env> = {}): Harness {
  const env = testEnv(overrides);
  const { app, ctx } = buildApp({ env });
  return { app, ctx, env, close: () => app.close() };
}

export async function createServer(app: FastifyInstance, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  // 测试默认工具显式 destructive:false（API 对字符串 legacy 工具按 fail-safe true；单测 F5 单独覆盖）
  const givenTools = body.tools;
  const tools = Array.isArray(givenTools)
    ? givenTools.map((item) => (typeof item === "string" ? { name: item, destructive: false } : item))
    : [{ name: "search", destructive: false }, { name: "fetch", destructive: false }];
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/mcp-servers",
    headers: TENANT_HEADERS,
    payload: {
      slug: `mcp-${crypto.randomUUID().slice(0, 8)}`,
      name: "Enterprise MCP",
      transport: "streamable_http",
      endpoint: "https://mcp.example.com/mcp",
      auth_type: "none",
      default_tools: ["search", "fetch"],
      ...body,
      tools,
    },
  });
  if (response.statusCode !== 201) throw new Error(`createServer ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function publishServer(app: FastifyInstance, serverId: string): Promise<Record<string, unknown>> {
  await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${serverId}/review`, headers: TENANT_HEADERS, payload: { decision: "approve" } });
  const response = await app.inject({ method: "POST", url: `/api/v1/mcp-servers/${serverId}/publish`, headers: TENANT_HEADERS });
  if (response.statusCode !== 200) throw new Error(`publish ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function createBinding(app: FastifyInstance, serverId: string, allowedTools?: string[]): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/mcp-bindings",
    headers: TENANT_HEADERS,
    payload: {
      mcp_server_id: serverId,
      subject_type: "workspace",
      subject_id: "00000000-0000-4000-8000-0000000000aa",
      ...(allowedTools ? { allowed_tools: allowedTools } : {}),
    },
  });
  if (response.statusCode !== 201) throw new Error(`createBinding ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}
