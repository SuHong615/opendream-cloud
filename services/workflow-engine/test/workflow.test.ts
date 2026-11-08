// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test } from "bun:test";
import { validateDsl } from "../src/dsl";
import { agentNode, createDefinition, createPublishedWorkflow, createVersion, humanNode, listTasks, mcpNode, setupHarness, startInstance, TENANT_HEADERS, timerNode, workflowDoc } from "./helpers";

describe("workflow-engine · DSL 校验与发布", () => {
  test("内置模板 11 个且全部通过 workflow-v1 校验", async () => {
    const harness = setupHarness();
    const response = await harness.app.inject({ method: "GET", url: "/api/v1/workflow-templates" });
    expect(response.statusCode).toBe(200);
    const items = (response.json() as { items: Array<Record<string, unknown>> }).items;
    expect(items.length).toBe(11);
    const categories = items.map((item) => item.category);
    expect(categories.filter((category) => category === "sdlc").length).toBe(6);
    for (const item of items) {
      const validation = await validateDsl(item.dsl);
      expect({ id: item.id, errors: validation.errors }).toEqual({ id: item.id, errors: [] });
    }
    await harness.close();
  });

  test("非法 DSL（未知节点/环）返回 400 wf_dsl_invalid", async () => {
    const harness = setupHarness();
    const definition = await createDefinition(harness.app);
    const invalid = workflowDoc("bad-flow", [{ id: "a", type: "quantum_node" }]);
    const response = await harness.app.inject({
      method: "POST",
      url: `/api/v1/workflow-definitions/${definition.id}/versions`,
      headers: TENANT_HEADERS,
      payload: { version: "1.0.0", dsl: invalid },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { reason: string } }).error.reason).toBe("wf_dsl_invalid");
    const cyclic = workflowDoc("cyclic-flow", [agentNode("a", ["b"]), agentNode("b", ["a"])]);
    const cyclicResponse = await harness.app.inject({
      method: "POST",
      url: `/api/v1/workflow-definitions/${definition.id}/versions`,
      headers: TENANT_HEADERS,
      payload: { version: "1.0.0", dsl: cyclic },
    });
    expect(cyclicResponse.statusCode).toBe(400);
    await harness.close();
  });

  test("canonical：定义/版本/详情/列表，版本不可变（重复 version 409）", async () => {
    const harness = setupHarness();
    const definition = await createDefinition(harness.app, "order-flow");
    const dsl = workflowDoc("order-flow", [agentNode("plan")]);
    const version = await createVersion(harness.app, String(definition.id), dsl);
    expect(version.immutable).toBe(true);
    expect(version.definition_id).toBe(definition.id);
    expect(version.version).toBe("1.0.0");
    expect(String(version.dsl_hash)).toStartWith("sha256:");
    const detail = await harness.app.inject({ method: "GET", url: `/api/v1/workflow-definitions/${definition.id}`, headers: TENANT_HEADERS });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { latest_version_id: string }).latest_version_id).toBe(String(version.id));
    const versions = await harness.app.inject({ method: "GET", url: `/api/v1/workflow-definitions/${definition.id}/versions`, headers: TENANT_HEADERS });
    expect((versions.json() as { items: Array<Record<string, unknown>> }).items.length).toBe(1);
    const duplicate = await harness.app.inject({
      method: "POST",
      url: `/api/v1/workflow-definitions/${definition.id}/versions`,
      headers: TENANT_HEADERS,
      payload: { version: "1.0.0", dsl: workflowDoc("order-flow", [agentNode("plan")]) },
    });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { reason: string } }).error.reason).toBe("wf_version_immutable");
    await harness.close();
  });

  test("MVP alias：模板创建 + publish（创建新不可变版本）", async () => {
    const harness = setupHarness();
    const created = await harness.app.inject({
      method: "POST",
      url: "/api/v1/workflows",
      headers: TENANT_HEADERS,
      payload: { template_id: "cs-approval", name: "alias-approval" },
    });
    expect(created.statusCode).toBe(200);
    const definition = created.json() as Record<string, unknown>;
    expect(definition.status).toBe("published");
    const published = await harness.app.inject({ method: "POST", url: `/api/v1/workflows/${definition.id}/publish`, headers: TENANT_HEADERS, payload: { version: "1.0.1" } });
    expect(published.statusCode).toBe(200);
    const versions = await harness.app.inject({ method: "GET", url: `/api/v1/workflow-definitions/${definition.id}/versions`, headers: TENANT_HEADERS });
    expect((versions.json() as { items: Array<Record<string, unknown>> }).items.length).toBe(2);
    await harness.close();
  });
});

describe("workflow-engine · 运行 / 人工任务 / 补偿", () => {
  test("agent→human_approval：等待人工，approve 后 succeeded；事件/审计可查", async () => {
    const harness = setupHarness();
    const { definition, version } = await createPublishedWorkflow(harness.app, workflowDoc("approve-flow", [agentNode("prepare"), humanNode("approve", ["prepare"])]));
    const instance = await startInstance(harness.app, String(definition.id));
    expect(instance.status).toBe("waiting_human");
    expect(instance.dsl_version_id).toBe(version.id);
    const tasks = await listTasks(harness.app);
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.scope).toBe("workflow");
    expect(tasks[0]?.status).toBe("pending");
    expect(String(tasks[0]?.sla_due_at)).toBeTruthy();

    const decision = await harness.app.inject({
      method: "POST",
      url: `/api/v1/human-tasks/${tasks[0]?.id}/decision`,
      headers: TENANT_HEADERS,
      payload: { decision: "approve", comment: "ok" },
    });
    expect(decision.statusCode).toBe(200);
    expect((decision.json() as { decision: string }).decision).toBe("approve");
    const detail = await harness.app.inject({ method: "GET", url: `/api/v1/workflow-instances/${instance.id}`, headers: TENANT_HEADERS });
    const body = detail.json() as { status: string };
    expect(body.status).toBe("succeeded");
    const events = await harness.app.inject({ method: "GET", url: `/api/v1/workflow-instances/${instance.id}/events`, headers: TENANT_HEADERS });
    const types = (events.json() as { items: Array<{ type: string }> }).items.map((item) => item.type);
    expect(types).toContain("run.succeeded");
    expect(types).toContain("human_task.decided");
    await harness.close();
  });

  test("human reject → 逆序 Saga 补偿，run failed 且原步骤 compensated", async () => {
    const harness = setupHarness();
    const dsl = workflowDoc("reject-flow", [mcpNode("write", [], { compensate: "undo" }), humanNode("approve", ["write"]), mcpNode("undo")]);
    const { definition } = await createPublishedWorkflow(harness.app, dsl);
    const instance = await startInstance(harness.app, String(definition.id));
    expect(instance.status).toBe("waiting_human");
    const tasks = await listTasks(harness.app);
    const rejected = await harness.app.inject({
      method: "POST",
      url: `/api/v1/human-tasks/${tasks[0]?.id}/decision`,
      headers: TENANT_HEADERS,
      payload: { decision: "reject", comment: "no" },
    });
    expect(rejected.statusCode).toBe(200);
    const detail = (await harness.app.inject({ method: "GET", url: `/api/v1/workflow-instances/${instance.id}`, headers: TENANT_HEADERS })).json() as { status: string };
    expect(detail.status).toBe("failed");
    const run = harness.ctx.store.runs.get(String(instance.id));
    expect(run?.steps.write?.status).toBe("compensated");
    expect(run?.steps.undo?.status).toBe("succeeded");
    expect(run?.compensation?.steps).toContain("undo");
    await harness.close();
  });

  test("节点失败 → 重试后补偿；写工具非 read_only 不重试（retry 需显式）", async () => {
    const harness = setupHarness();
    const failing = workflowDoc("fail-flow", [
      mcpNode("reserve", [], { compensate: "release" }),
      mcpNode("boom", ["reserve"], { input: { server: "crm", tool: "boom", simulate_failure: true } }),
      mcpNode("release"),
    ]);
    const { definition } = await createPublishedWorkflow(harness.app, failing);
    const instance = await startInstance(harness.app, String(definition.id));
    expect(instance.status).toBe("failed");
    const run = harness.ctx.store.runs.get(String(instance.id));
    expect(run?.steps.boom?.status).toBe("failed");
    expect(run?.steps.reserve?.status).toBe("compensated");
    expect(run?.steps.release?.status).toBe("succeeded");
    await harness.close();
  });

  test("运行中 cancel → 逆序补偿并 canceled", async () => {
    const harness = setupHarness();
    const dsl = workflowDoc("cancel-flow", [mcpNode("reserve", [], { compensate: "release" }), timerNode("hold", ["reserve"]), mcpNode("release")]);
    const { definition } = await createPublishedWorkflow(harness.app, dsl);
    const instance = await startInstance(harness.app, String(definition.id));
    expect(instance.status).toBe("waiting_timer");
    const cancelled = await harness.app.inject({ method: "POST", url: `/api/v1/workflow-instances/${instance.id}/cancel`, headers: TENANT_HEADERS, payload: { reason: "user" } });
    expect(cancelled.statusCode).toBe(200);
    expect((cancelled.json() as { status: string }).status).toBe("canceled");
    const run = harness.ctx.store.runs.get(String(instance.id));
    expect(run?.steps.reserve?.status).toBe("compensated");
    expect(run?.steps.release?.status).toBe("succeeded");
    await harness.close();
  });

  test("condition 选中分支，未选分支 skipped；parallel join 后继续", async () => {
    const harness = setupHarness();
    const dsl = workflowDoc(
      "cond-parallel",
      [
        { id: "route", type: "condition", needs: [], cases: [{ when: '${inputs.mode} == "a"', next: "aa" }], else: "bb" },
        agentNode("aa", ["route"]),
        agentNode("bb", ["route"]),
        { id: "fan", type: "parallel", needs: ["aa", "bb"], branches: ["xx", "yy"], join: "all" },
        agentNode("xx"),
        agentNode("yy"),
        agentNode("done", ["fan"]),
      ],
      { inputs: { type: "object", required: ["mode"], properties: { mode: { type: "string" } } } },
    );
    const { definition } = await createPublishedWorkflow(harness.app, dsl);
    const instance = await startInstance(harness.app, String(definition.id), { mode: "a" });
    expect(instance.status).toBe("succeeded");
    const run = harness.ctx.store.runs.get(String(instance.id));
    expect(run?.steps.bb?.status).toBe("skipped");
    expect(run?.steps.aa?.status).toBe("succeeded");
    expect(run?.steps.done?.status).toBe("succeeded");
    await harness.close();
  });

  test("canonical signal 结束 timer；跨租户 404", async () => {
    const harness = setupHarness();
    const { definition } = await createPublishedWorkflow(harness.app, workflowDoc("timer-flow", [timerNode("wait", [])]));
    const instance = await startInstance(harness.app, String(definition.id));
    expect(instance.status).toBe("waiting_timer");
    const signal = await harness.app.inject({
      method: "POST",
      url: `/api/v1/workflow-instances/${instance.id}/signal`,
      headers: TENANT_HEADERS,
      payload: { name: "release", payload: { approved: true } },
    });
    expect(signal.statusCode).toBe(200);
    expect((signal.json() as { status: string }).status).toBe("succeeded");
    const crossTenant = await harness.app.inject({
      method: "GET",
      url: `/api/v1/workflow-instances/${instance.id}`,
      headers: { ...TENANT_HEADERS, "x-oc-org-id": "00000000-0000-4000-8000-000000000099" },
    });
    expect(crossTenant.statusCode).toBe(404);
    await harness.close();
  });
});
