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
  "x-oc-user-id": "00000000-0000-4000-8000-000000000002",
  "x-oc-roles": "owner,admin",
};

export function setupHarness(overrides: Partial<Env> = {}): Harness {
  const env = testEnv(overrides);
  const { app, ctx } = buildApp({ env });
  return { app, ctx, env, close: () => app.close() };
}

export function agentNode(id: string, needs: string[] = [], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: "agent", needs, model_ref: "default-coding", input: { prompt: `run ${id}` }, ...extra };
}

export function mcpNode(id: string, needs: string[] = [], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: "mcp_tool", needs, input: { server: "crm", tool: id, args: {} }, ...extra };
}

export function humanNode(id: string, needs: string[] = [], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    type: "human_approval",
    needs,
    assignee: { type: "role", value: "manager" },
    sla: { due: "1h" },
    input: { title: `approve ${id}` },
    ...extra,
  };
}

export function timerNode(id: string, needs: string[] = [], duration = "1h"): Record<string, unknown> {
  return { id, type: "timer", needs, duration };
}

export function workflowDoc(name: string, nodes: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    apiVersion: "workflow.opencode.cloud/v1",
    kind: "Workflow",
    metadata: { name, version: "1.0.0", displayName: name, description: "test workflow" },
    spec: { description: "test workflow", nodes, ...extra },
  };
}

export async function createDefinition(app: FastifyInstance, slug = `wf-${crypto.randomUUID().slice(0, 8)}`): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/workflow-definitions",
    headers: TENANT_HEADERS,
    payload: { slug, name: slug, category: "general" },
  });
  if (response.statusCode !== 200) throw new Error(`createDefinition ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function createVersion(app: FastifyInstance, definitionId: string, dsl: unknown, version = "1.0.0"): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/workflow-definitions/${definitionId}/versions`,
    headers: TENANT_HEADERS,
    payload: { version, dsl },
  });
  if (response.statusCode !== 200) throw new Error(`createVersion ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function createPublishedWorkflow(app: FastifyInstance, dsl: unknown): Promise<{ definition: Record<string, unknown>; version: Record<string, unknown> }> {
  const definition = await createDefinition(app);
  const version = await createVersion(app, String(definition.id), dsl);
  return { definition, version };
}

export async function startInstance(app: FastifyInstance, definitionId: string, input: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/workflow-instances",
    headers: TENANT_HEADERS,
    payload: { definition_id: definitionId, input },
  });
  if (response.statusCode !== 200) throw new Error(`startInstance ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}

export async function listTasks(app: FastifyInstance, query = "status=pending"): Promise<Array<Record<string, unknown>>> {
  const response = await app.inject({ method: "GET", url: `/api/v1/human-tasks?${query}`, headers: TENANT_HEADERS });
  if (response.statusCode !== 200) throw new Error(`listTasks ${response.statusCode} ${response.body}`);
  return (response.json() as { items: Array<Record<string, unknown>> }).items;
}
