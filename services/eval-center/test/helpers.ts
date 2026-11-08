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
};

export function setupHarness(overrides: Partial<Env> = {}): Harness {
  const env = testEnv(overrides);
  const { app, ctx } = buildApp({ env });
  return { app, ctx, env, close: () => app.close() };
}

export async function createDataset(app: FastifyInstance, cases = 10): Promise<{ dataset: Record<string, unknown>; version: Record<string, unknown> }> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/eval-datasets",
    headers: TENANT_HEADERS,
    payload: { slug: `ds-${crypto.randomUUID().slice(0, 8)}`, name: "Baseline", cases_count: cases },
  });
  if (response.statusCode !== 201) throw new Error(`createDataset ${response.statusCode} ${response.body}`);
  const dataset = response.json() as Record<string, unknown>;
  const versions = await app.inject({ method: "GET", url: `/api/v1/eval-datasets/${dataset.id}/versions`, headers: TENANT_HEADERS });
  const version = (versions.json() as { items: Array<Record<string, unknown>> }).items[0]!;
  return { dataset, version };
}

export async function createRun(app: FastifyInstance, datasetVersionId: string, target: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/eval-runs",
    headers: TENANT_HEADERS,
    payload: { dataset_version_id: datasetVersionId, target_type: "skill", target_ref: target },
  });
  if (response.statusCode !== 202) throw new Error(`createRun ${response.statusCode} ${response.body}`);
  return response.json() as Record<string, unknown>;
}
