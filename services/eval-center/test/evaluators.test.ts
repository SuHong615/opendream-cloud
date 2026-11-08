// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDataset, setupHarness, TENANT_HEADERS, type Harness } from "./helpers";

let harness: Harness;
beforeAll(() => {
  harness = setupHarness();
});
afterAll(async () => {
  await harness.close();
});

describe("Eval evaluators（M5-1）", () => {
  test("EVAL-EV-01 seed 4 个预置评估器（correctness/faithfulness/task-completion/tool-usage）", async () => {
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/eval-evaluators", headers: TENANT_HEADERS });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: Array<{ name: string; is_preset: boolean; org_id: string | null }> }).items;
    expect(items.filter((item) => item.is_preset).map((item) => item.name).sort()).toEqual([
      "correctness",
      "faithfulness",
      "task-completion",
      "tool-usage",
    ]);
    expect(items.every((item) => item.org_id === null)).toBe(true);
  });

  test("EVAL-EV-02 自定义 evaluator CRUD；预置只读（PATCH/DELETE 403）", async () => {
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/v1/eval-evaluators",
      headers: TENANT_HEADERS,
      payload: {
        name: `custom-${crypto.randomUUID().slice(0, 6)}`,
        display_name: "自定义评分器",
        metric: "custom",
        prompt: "Score the answer against the rubric.",
        rubric: "0-1",
        config: { threshold: 0.7 },
      },
    });
    expect(created.statusCode).toBe(201);
    const evaluator = created.json() as { id: string; org_id: string; is_preset: boolean };
    expect(evaluator.is_preset).toBe(false);
    expect(evaluator.org_id).toBe(TENANT_HEADERS["x-oc-org-id"]);

    const patched = await harness.app.inject({
      method: "PATCH",
      url: `/api/v1/eval-evaluators/${evaluator.id}`,
      headers: TENANT_HEADERS,
      payload: { display_name: "更新后的评分器" },
    });
    expect(patched.statusCode).toBe(200);
    expect((patched.json() as { display_name: string }).display_name).toBe("更新后的评分器");

    const preset = (await harness.app.inject({ method: "GET", url: "/api/v1/eval-evaluators", headers: TENANT_HEADERS })).json() as {
      items: Array<{ id: string; is_preset: boolean }>;
    };
    const presetId = preset.items.find((item) => item.is_preset)?.id ?? "";
    const patchPreset = await harness.app.inject({ method: "PATCH", url: `/api/v1/eval-evaluators/${presetId}`, headers: TENANT_HEADERS, payload: { display_name: "x" } });
    expect(patchPreset.statusCode).toBe(403);
    const deletePreset = await harness.app.inject({ method: "DELETE", url: `/api/v1/eval-evaluators/${presetId}`, headers: TENANT_HEADERS });
    expect(deletePreset.statusCode).toBe(403);

    const deleted = await harness.app.inject({ method: "DELETE", url: `/api/v1/eval-evaluators/${evaluator.id}`, headers: TENANT_HEADERS });
    expect(deleted.statusCode).toBe(204);
    const gone = await harness.app.inject({ method: "GET", url: `/api/v1/eval-evaluators/${evaluator.id}`, headers: TENANT_HEADERS });
    expect(gone.statusCode).toBe(404);
  });

  test("EVAL-EV-03 run evaluator_ids：按评估器维度输出 results/report", async () => {
    const { version } = await createDataset(harness.app, 10);
    const evaluators = (await harness.app.inject({ method: "GET", url: "/api/v1/eval-evaluators", headers: TENANT_HEADERS })).json() as {
      items: Array<{ id: string; name: string }>;
    };
    const correctness = evaluators.items.find((item) => item.name === "correctness");
    const faithfulness = evaluators.items.find((item) => item.name === "faithfulness");
    const response = await harness.app.inject({
      method: "POST",
      url: "/api/v1/eval-runs",
      headers: TENANT_HEADERS,
      payload: {
        dataset_version_id: version.id,
        target_type: "skill",
        target_ref: { version_id: "svk-1" },
        evaluator_ids: [correctness?.id, faithfulness?.id],
      },
    });
    expect(response.statusCode).toBe(202);
    const run = response.json() as { id: string; evaluator_ids: string[]; evaluator_summary: Array<{ name: string; avg_score: number }> };
    expect(run.evaluator_ids).toEqual([correctness?.id, faithfulness?.id].filter((id): id is string => typeof id === "string"));
    expect(run.evaluator_summary.map((item) => item.name)).toEqual(["correctness", "faithfulness"]);

    const results = await harness.app.inject({ method: "GET", url: `/api/v1/eval-runs/${run.id}/results`, headers: TENANT_HEADERS });
    const first = (results.json() as { items: Array<{ evaluator_scores: Record<string, { score: number }> }> }).items[0]!;
    expect(Object.keys(first.evaluator_scores).sort()).toEqual(["correctness", "faithfulness"]);

    const report = await harness.app.inject({ method: "GET", url: `/api/v1/eval-runs/${run.id}/report`, headers: TENANT_HEADERS });
    expect(report.statusCode).toBe(200);
    const reportBody = report.json() as { evaluators: Array<{ name: string; pass_rate: number }> };
    expect(reportBody.evaluators).toHaveLength(2);
  });

  test("EVAL-EV-04 未知 evaluator_id → 404；跨租户不可见", async () => {
    const { version } = await createDataset(harness.app, 10);
    const missing = await harness.app.inject({
      method: "POST",
      url: "/api/v1/eval-runs",
      headers: TENANT_HEADERS,
      payload: { dataset_version_id: version.id, evaluator_ids: ["00000000-0000-4000-8000-000000000099"] },
    });
    expect(missing.statusCode).toBe(404);
    const crossTenant = await harness.app.inject({
      method: "GET",
      url: "/api/v1/eval-evaluators",
      headers: { ...TENANT_HEADERS, "x-oc-org-id": "00000000-0000-4000-8000-000000000098" },
    });
    const items = (crossTenant.json() as { items: Array<{ is_preset: boolean }> }).items;
    expect(items.every((item) => item.is_preset)).toBe(true);
  });
});
