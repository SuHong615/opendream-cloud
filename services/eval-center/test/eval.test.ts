// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDataset, createRun, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
beforeAll(() => {
  harness = setupHarness();
});
afterAll(async () => {
  await harness.close();
});

describe("Eval 生命周期", () => {
  test("EVAL-01 数据集 → 版本 → run（mock 完成）→ results", async () => {
    const { dataset, version } = await createDataset(harness.app, 10);
    expect(dataset.slug).toBeString();
    expect(version.content_hash).toStartWith("sha256:");

    const run = await createRun(harness.app, String(version.id), { version_id: "skv-demo" });
    expect(run.status).toBe("completed");
    const metrics = run.metrics as { pass_rate: number; total: number };
    expect(metrics.total).toBe(10);
    expect(metrics.pass_rate).toBeCloseTo(0.9, 3);

    const results = await harness.app.inject({ method: "GET", url: `/api/v1/eval-runs/${run.id}/results`, headers: TENANT_HEADERS });
    expect(results.statusCode).toBe(200);
    const body = results.json() as { items: Array<{ case_id: string }>; next_cursor: string | null };
    expect(body.items).toHaveLength(10);
    expect(body.items[0]!.case_id).toBeString();
  });

  test("EVAL-02 报告 + A/B compare_to + baseline", async () => {
    const { version } = await createDataset(harness.app, 10);
    const base = await createRun(harness.app, String(version.id));
    const candidate = await createRun(harness.app, String(version.id));

    const report = await harness.app.inject({
      method: "GET",
      url: `/api/v1/eval-runs/${candidate.id}/report?compare_to=${base.id}`,
      headers: TENANT_HEADERS,
    });
    expect(report.statusCode).toBe(200);
    const body = report.json() as { failed_top5: unknown[]; deltas: { pass_rate: number } };
    expect(Array.isArray(body.failed_top5)).toBe(true);
    expect(body.deltas.pass_rate).toBeCloseTo(0, 4);

    const baseline = await harness.app.inject({
      method: "POST",
      url: `/api/v1/eval-runs/${candidate.id}/baselines`,
      headers: TENANT_HEADERS,
      payload: { name: "v1" },
    });
    expect(baseline.statusCode).toBe(201);

    const list = await harness.app.inject({ method: "GET", url: `/api/v1/eval-runs/${candidate.id}/baselines`, headers: TENANT_HEADERS });
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1);
  });

  test("EVAL-03 门禁：通过/失败（阈值 0.9）", async () => {
    const passDataset = await createDataset(harness.app, 10);
    const passRun = await createRun(harness.app, String(passDataset.version.id), { version_id: "skv-pass" });
    const passGate = await harness.app.inject({
      method: "POST",
      url: "/internal/eval/gates/skill",
      headers: TENANT_HEADERS,
      payload: { version_id: "skv-pass", run_id: passRun.id },
    });
    expect((passGate.json() as { passed: boolean }).passed).toBe(true);

    const failDataset = await createDataset(harness.app, 4);
    const failRun = await createRun(harness.app, String(failDataset.version.id), { version_id: "skv-fail" });
    const failGate = await harness.app.inject({
      method: "POST",
      url: "/internal/eval/gates/skill",
      headers: TENANT_HEADERS,
      payload: { version_id: "skv-fail", run_id: failRun.id },
    });
    const body = failGate.json() as { passed: boolean; reasons: string[] };
    expect(body.passed).toBe(false);
    expect(body.reasons.length).toBeGreaterThan(0);
  });

  test("EVAL-04 cancel 已完成 run → 409；跨租户 404", async () => {
    const { version } = await createDataset(harness.app, 10);
    const run = await createRun(harness.app, String(version.id));
    const canceled = await harness.app.inject({ method: "POST", url: `/api/v1/eval-runs/${run.id}/cancel`, headers: TENANT_HEADERS });
    expect(canceled.statusCode).toBe(409);

    const other = await harness.app.inject({
      method: "GET",
      url: `/api/v1/eval-runs/${run.id}`,
      headers: { "x-oc-org-id": "00000000-0000-4000-8000-000000000099" },
    });
    expect(other.statusCode).toBe(404);
  });
});
