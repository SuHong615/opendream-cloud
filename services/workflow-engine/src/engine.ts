// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { createHash, randomUUID } from "node:crypto";
import type { WorkflowTemplate } from "./core";
import type { AppContext, Principal } from "./context";
import {
  WORKFLOW_SCHEMA_VERSION,
  definitionView,
  eventView,
  instanceView,
  parseDurationToMs,
  taskView,
  versionView,
  type JsonObject,
  type WorkflowDefinition,
  type WorkflowDsl,
  type WorkflowNode,
  type WorkflowRun,
  type WorkflowVersion,
} from "./core";
import { evalExpression, isCompensationNode, nodeMap, nodesOf, validateDsl, validateInputs, type ExpressionContext } from "./dsl";
import { badRequest, conflict, notFound, preconditionFailed, wfDslInvalid, wfRunNotFound, wfVersionImmutable } from "./lib/errors";

export interface CreateDefinitionInput {
  slug?: string;
  name?: string;
  category?: "sdlc" | "general";
  visibility?: string;
  /** MVP alias 扩展：直接带 DSL / 模板创建并发布初始版本。 */
  dsl?: unknown;
  template_id?: string;
  description?: string;
}

export interface CreateVersionInput {
  version?: string;
  dsl: unknown;
  schema_version?: string;
}

export interface StartInstanceInput {
  definition_id: string;
  dsl_version_id?: string | null;
  input?: JsonObject;
  correlation?: JsonObject | null;
}

export interface AliasStartInput {
  inputs?: JsonObject;
  version?: number | string;
  correlation?: JsonObject | null;
}

export interface AdvanceInput {
  node_id?: string;
  payload_?: JsonObject;
}

const TENANT_ORDER: Record<string, number> = { sdlc: 0, general: 1 };

function hashDsl(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function isSuccess(status: string): boolean {
  return status === "succeeded" || status === "skipped" || status === "compensated";
}

function isTerminal(status: string): boolean {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : {};
}

function nodeInput(node: WorkflowNode): JsonObject {
  return asObject(node.input);
}

function semverBump(value: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) return "1.0.0";
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function nextSemver(definition: WorkflowDefinition): string {
  const latest = definition.versions[definition.versions.length - 1];
  return latest ? semverBump(latest.version) : "1.0.0";
}

function categoryOf(templateCategory?: string): "sdlc" | "general" {
  return templateCategory === "sdlc" ? "sdlc" : "general";
}

export class WorkflowEngine {
  constructor(private readonly ctx: AppContext) {}

  // ---------------- templates / definitions ----------------

  listTemplates(): WorkflowTemplate[] {
    return this.ctx.store.templates.map((item) => structuredClone(item));
  }

  getTemplate(id: string): WorkflowTemplate | undefined {
    return this.ctx.store.templates.find((item) => item.id === id);
  }

  async createDefinition(principal: Principal, input: CreateDefinitionInput): Promise<JsonObject> {
    let dsl: WorkflowDsl | undefined;
    let templateId: string | null = null;
    if (input.dsl !== undefined) {
      dsl = structuredClone(input.dsl) as WorkflowDsl;
    } else if (input.template_id) {
      const template = this.getTemplate(input.template_id);
      if (!template) throw notFound("workflow template not found");
      dsl = structuredClone(template.dsl);
      templateId = template.id;
    }
    const fallback = `workflow-${this.ctx.newId().slice(0, 8)}`;
    const candidate = input.slug ?? dsl?.metadata?.name ?? fallback;
    const slugPattern = /^[a-z][a-z0-9-]{2,62}$/;
    const slug = slugPattern.test(candidate) ? candidate : fallback;
    if (input.slug !== undefined && !slugPattern.test(input.slug)) throw badRequest("workflow slug must match ^[a-z][a-z0-9-]{2,62}$");
    const duplicate = [...this.ctx.store.workflows.values()].find((item) => item.org_id === principal.org_id && item.slug === slug && item.status !== "deprecated");
    if (duplicate) throw conflict("workflow slug already exists", { definition_id: duplicate.id });
    const now = this.ctx.now().toISOString();
    const definition: WorkflowDefinition = {
      id: this.ctx.newId(),
      org_id: principal.org_id,
      slug,
      name: input.name ?? (typeof dsl?.metadata?.displayName === "string" ? dsl.metadata.displayName : slug),
      category: input.category ?? categoryOf(this.getTemplate(input.template_id ?? "")?.category),
      visibility: input.visibility ?? "private",
      status: "draft",
      latest_version_id: null,
      template_id: templateId,
      versions: [],
      created_by: principal.user_id,
      created_at: now,
      updated_at: now,
    };
    this.ctx.store.workflows.set(definition.id, definition);
    if (dsl) await this.createVersion(principal, definition.id, { version: "1.0.0", dsl });
    return definitionView(definition);
  }

  listDefinitions(principal: Principal, query: { status?: string; category?: string; cursor?: string; limit?: number } = {}): { items: JsonObject[]; next_cursor: string | null } {
    const items = [...this.ctx.store.workflows.values()]
      .filter((item) => item.org_id === principal.org_id)
      .filter((item) => (query.status ? item.status === query.status : true))
      .filter((item) => (query.category ? item.category === query.category : true))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const limit = query.limit ?? 20;
    const start = query.cursor ? Math.max(0, items.findIndex((item) => item.id === query.cursor) + 1) : 0;
    const slice = items.slice(start, start + limit);
    return { items: slice.map(definitionView), next_cursor: start + limit < items.length ? (slice[slice.length - 1]?.id ?? null) : null };
  }

  getDefinition(principal: Principal, id: string): WorkflowDefinition {
    const definition = this.ctx.store.workflows.get(id);
    if (!definition || definition.org_id !== principal.org_id) throw notFound("workflow definition not found");
    return definition;
  }

  updateDefinition(principal: Principal, id: string, input: { name?: string; visibility?: string; description?: string }): JsonObject {
    const definition = this.getDefinition(principal, id);
    if (input.name !== undefined) definition.name = input.name;
    if (input.visibility !== undefined) definition.visibility = input.visibility;
    if (input.description !== undefined) (definition as unknown as JsonObject).description = input.description;
    definition.updated_at = this.ctx.now().toISOString();
    return definitionView(definition);
  }

  async createVersion(principal: Principal, definitionId: string, input: CreateVersionInput): Promise<JsonObject> {
    const definition = this.getDefinition(principal, definitionId);
    const version = input.version ?? nextSemver(definition);
    if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) throw badRequest("version must be semver", { version });
    if (definition.versions.some((item) => item.version === version)) throw wfVersionImmutable(version);
    const validation = await validateDsl(input.dsl);
    if (!validation.valid) throw wfDslInvalid(validation.errors, validation.warnings);
    const now = this.ctx.now().toISOString();
    const record: WorkflowVersion = {
      id: this.ctx.newId(),
      definition_id: definition.id,
      number: definition.versions.length + 1,
      version,
      dsl: structuredClone(input.dsl) as WorkflowDsl,
      dsl_hash: hashDsl(input.dsl),
      schema_version: input.schema_version ?? WORKFLOW_SCHEMA_VERSION,
      immutable: true,
      published_at: now,
      created_at: now,
      warnings: validation.warnings,
    };
    definition.versions.push(record);
    definition.latest_version_id = record.id;
    definition.status = "published";
    definition.updated_at = now;
    return versionView(record);
  }

  listVersions(principal: Principal, definitionId: string): JsonObject[] {
    const definition = this.getDefinition(principal, definitionId);
    return definition.versions.map(versionView).reverse();
  }

  getVersion(principal: Principal, versionId: string): JsonObject {
    for (const definition of this.ctx.store.workflows.values()) {
      if (definition.org_id !== principal.org_id) continue;
      const version = definition.versions.find((item) => item.id === versionId);
      if (version) return versionView(version);
    }
    throw notFound("workflow version not found");
  }

  deleteDefinition(principal: Principal, id: string): void {
    const definition = this.getDefinition(principal, id);
    if (definition.versions.length === 0) {
      this.ctx.store.workflows.delete(id);
      return;
    }
    definition.status = "deprecated";
    definition.updated_at = this.ctx.now().toISOString();
  }

  /** MVP alias `POST /workflows/{id}/publish`：发布 = 创建不可变版本并置 latest。 */
  async publishAlias(principal: Principal, definitionId: string, body: { version?: string; dsl?: unknown }): Promise<JsonObject> {
    const definition = this.getDefinition(principal, definitionId);
    const latest = this.getLatestVersion(definition);
    let dsl = body.dsl;
    if (dsl === undefined) {
      if (!latest) throw badRequest("dsl is required for first publish");
      dsl = latest.dsl;
    }
    const version = body.version ?? nextSemver(definition);
    await this.createVersion(principal, definitionId, { version, dsl });
    return definitionView(definition);
  }

  private getLatestVersion(definition: WorkflowDefinition): WorkflowVersion | undefined {
    if (!definition.latest_version_id) return definition.versions.at(-1);
    return definition.versions.find((item) => item.id === definition.latest_version_id);
  }

  private resolveVersion(definition: WorkflowDefinition, versionRef?: string | null): WorkflowVersion {
    if (versionRef) {
      const version = definition.versions.find((item) => item.id === versionRef || item.version === versionRef);
      if (!version) throw notFound("workflow version not found");
      return version;
    }
    const latest = this.getLatestVersion(definition);
    if (!latest) throw preconditionFailed("workflow has no published version", "workflow_not_published", { definition_id: definition.id });
    return latest;
  }

  // ---------------- instances ----------------

  async startInstance(principal: Principal, input: StartInstanceInput): Promise<JsonObject> {
    const definition = this.getDefinition(principal, input.definition_id);
    const version = this.resolveVersion(definition, input.dsl_version_id);
    return this.createRun(principal, definition, version, asObject(input.input), input.correlation ?? null);
  }

  async startAlias(principal: Principal, definitionId: string, input: AliasStartInput): Promise<JsonObject> {
    const definition = this.getDefinition(principal, definitionId);
    const ref = typeof input.version === "number" ? String(input.version) : input.version;
    const version = this.resolveVersion(definition, ref ?? null);
    return this.createRun(principal, definition, version, asObject(input.inputs), input.correlation ?? null);
  }

  private createRun(principal: Principal, definition: WorkflowDefinition, version: WorkflowVersion, inputs: JsonObject, correlation: JsonObject | null): JsonObject {
    const inputErrors = validateInputs(version.dsl.spec.inputs, inputs);
    if (inputErrors.length > 0) throw badRequest("workflow inputs validation failed", { errors: inputErrors });
    const now = this.ctx.now().toISOString();
    const steps: WorkflowRun["steps"] = {};
    for (const node of nodesOf(version.dsl)) {
      steps[node.id] = {
        node_id: node.id,
        type: node.type,
        status: "pending",
        attempts: 0,
        output: null,
        error: null,
        started_at: null,
        finished_at: null,
        human_task_id: null,
        compensation_for: null,
      };
    }
    const run: WorkflowRun = {
      id: this.ctx.newId(),
      org_id: principal.org_id,
      definition_id: definition.id,
      dsl_version_id: version.id,
      workflow_key: definition.slug,
      workflow_version: version.version,
      runtime: "state_machine",
      status: "pending",
      inputs,
      correlation,
      input_ref: null,
      output_ref: null,
      steps,
      node_order: nodesOf(version.dsl).map((node) => node.id),
      waiting_on: null,
      outputs: null,
      error: null,
      compensation: null,
      events: [],
      audit: [],
      created_by: principal.user_id,
      trace_id: this.ctx.newId(),
      created_at: now,
      started_at: null,
      finished_at: null,
      updated_at: now,
    };
    this.ctx.store.runs.set(run.id, run);
    this.addEvent(run, "run.created", null, { definition_id: definition.id, dsl_version_id: version.id });
    this.audit(run, "workflow_instance.start", principal.user_id, { definition_id: definition.id, dsl_version_id: version.id });
    run.status = "running";
    run.started_at = now;
    this.addEvent(run, "run.started", null, { input: inputs });
    this.drive(principal, run, version.dsl);
    return instanceView(run);
  }

  getInstance(principal: Principal, id: string): JsonObject {
    return instanceView(this.requireRun(principal, id));
  }

  listInstances(principal: Principal, query: { definition_id?: string; status?: string; cursor?: string; limit?: number } = {}): { items: JsonObject[]; next_cursor: string | null } {
    const items = [...this.ctx.store.runs.values()]
      .filter((run) => run.org_id === principal.org_id)
      .filter((run) => (query.definition_id ? run.definition_id === query.definition_id : true))
      .filter((run) => (query.status ? run.status === query.status : true))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const limit = query.limit ?? 20;
    const start = query.cursor ? Math.max(0, items.findIndex((run) => run.id === query.cursor) + 1) : 0;
    const slice = items.slice(start, start + limit);
    return { items: slice.map(instanceView), next_cursor: start + limit < items.length ? (slice[slice.length - 1]?.id ?? null) : null };
  }

  cancel(principal: Principal, id: string, reason?: string): JsonObject {
    const run = this.requireRun(principal, id);
    if (isTerminal(run.status)) throw conflict("workflow instance is already terminal", { status: run.status });
    this.addEvent(run, "run.cancel_requested", null, { reason: reason ?? null });
    if (run.waiting_on?.kind === "human_task" && run.waiting_on.human_task_id) {
      const task = this.ctx.store.humanTasks.get(run.waiting_on.human_task_id);
      if (task && task.status === "pending") {
        task.status = "canceled";
        task.updated_at = this.ctx.now().toISOString();
      }
    }
    this.compensate(run, this.dslOf(run), "canceled", reason ?? "canceled by user");
    return instanceView(run);
  }

  signal(principal: Principal, id: string, body: { name: string; payload?: JsonObject }): JsonObject {
    const run = this.requireRun(principal, id);
    if (isTerminal(run.status)) throw conflict("workflow instance is already terminal", { status: run.status });
    const payload = asObject(body.payload);
    this.addEvent(run, "signal.received", run.waiting_on?.node_id ?? null, { name: body.name, payload });
    if (run.waiting_on?.kind === "human_task") {
      throw preconditionFailed("human task decision required", "human_task_pending", { human_task_id: run.waiting_on.human_task_id });
    }
    if (run.waiting_on) {
      const nodeId = run.waiting_on.node_id;
      const step = run.steps[nodeId];
      if (!step) throw notFound("run step not found");
      step.status = "succeeded";
      step.output = payload;
      step.finished_at = this.ctx.now().toISOString();
      this.addEvent(run, "step.succeeded", nodeId, { resumed: true, signal: body.name });
      run.waiting_on = null;
      run.status = "running";
    }
    this.drive(principal, run, this.dslOf(run));
    return instanceView(run);
  }

  events(principal: Principal, id: string, query: { since_seq?: number; cursor?: string; limit?: number } = {}): { items: JsonObject[]; next_cursor: string | null } {
    const run = this.requireRun(principal, id);
    let items = run.events.map((event) => ({ id: event.id, instance_id: run.id, seq: event.seq, type: event.type, node_id: event.node_id, payload_hash: event.payload_hash, created_at: event.created_at, data: event.data }));
    if (query.since_seq !== undefined) items = items.filter((event) => event.seq > (query.since_seq ?? 0));
    const limit = query.limit ?? 100;
    const start = query.cursor ? Math.max(0, items.findIndex((event) => event.id === query.cursor) + 1) : 0;
    const slice = items.slice(start, start + limit);
    return { items: slice, next_cursor: start + limit < items.length ? (slice[slice.length - 1]?.id ?? null) : null };
  }

  // ---------------- human tasks ----------------

  listHumanTasks(principal: Principal, query: { scope?: string; status?: string; run_id?: string; assignee?: string; cursor?: string; limit?: number } = {}): { items: JsonObject[]; next_cursor: string | null } {
    const items = [...this.ctx.store.humanTasks.values()]
      .filter((task) => task.org_id === principal.org_id)
      .filter((task) => (query.scope ? task.scope === query.scope : true))
      .filter((task) => (query.status ? task.status === query.status : true))
      .filter((task) => (query.run_id ? task.run_id === query.run_id : true))
      .filter((task) => (query.assignee ? task.assignee_id === query.assignee : true))
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
    const limit = query.limit ?? 20;
    const start = query.cursor ? Math.max(0, items.findIndex((task) => task.id === query.cursor) + 1) : 0;
    const slice = items.slice(start, start + limit);
    return { items: slice.map(taskView), next_cursor: start + limit < items.length ? (slice[slice.length - 1]?.id ?? null) : null };
  }

  decideHumanTask(principal: Principal, taskId: string, input: { decision: "approve" | "reject" | "request_changes"; comment?: string }): JsonObject {
    const task = this.ctx.store.humanTasks.get(taskId);
    if (!task || task.org_id !== principal.org_id) throw notFound("human task not found");
    if (task.status !== "pending") throw conflict("human task is already decided", { status: task.status });
    const run = this.requireRun(principal, task.run_id);
    const step = run.steps[task.node_id];
    if (!step || step.human_task_id !== task.id) throw conflict("human task is not pending on this instance");
    const now = this.ctx.now().toISOString();
    task.decision = input.decision;
    task.comment = input.comment ?? null;
    task.decided_by = principal.user_id;
    task.decided_at = now;
    task.updated_at = now;
    task.status = "completed";
    this.addEvent(run, "human_task.decided", task.node_id, { task_id: task.id, decision: input.decision });
    this.audit(run, "human_task.decide", principal.user_id, { task_id: task.id, decision: input.decision });
    const dsl = this.dslOf(run);
    if (input.decision === "approve") {
      step.status = "succeeded";
      step.output = { decision: "approve", comment: input.comment ?? null };
      step.finished_at = now;
      run.waiting_on = null;
      run.status = "running";
      this.addEvent(run, "step.succeeded", task.node_id, { human_task_id: task.id });
      this.drive(principal, run, dsl);
    } else {
      step.status = "failed";
      step.error = input.decision === "reject" ? "human task rejected" : "human task requested changes";
      step.finished_at = now;
      run.waiting_on = null;
      this.addEvent(run, "step.failed", task.node_id, { human_task_id: task.id, decision: input.decision });
      this.failRun(run, dsl, step.error, principal.user_id);
    }
    return taskView(task);
  }

  // ---------------- internal advance ----------------

  advance(principal: Principal, id: string, input: { node_id?: string; payload?: JsonObject }): JsonObject {
    const run = this.requireRun(principal, id);
    if (isTerminal(run.status)) throw conflict("workflow instance is already terminal", { status: run.status });
    if (run.waiting_on?.kind === "human_task") throw preconditionFailed("human task decision required", "human_task_pending", { human_task_id: run.waiting_on.human_task_id });
    if (run.waiting_on) {
      const nodeId = input.node_id ?? run.waiting_on.node_id;
      if (nodeId !== run.waiting_on.node_id) throw badRequest("node_id does not match waiting node", { waiting_on: run.waiting_on.node_id });
      const step = run.steps[nodeId];
      if (!step) throw notFound("run step not found");
      step.status = "succeeded";
      step.output = input.payload ?? { ok: true };
      step.finished_at = this.ctx.now().toISOString();
      this.addEvent(run, "step.succeeded", nodeId, { resumed: true });
      run.waiting_on = null;
      run.status = "running";
    }
    this.drive(principal, run, this.dslOf(run));
    return instanceView(run);
  }

  // ---------------- engine internals ----------------

  private requireRun(principal: Principal, id: string): WorkflowRun {
    const run = this.ctx.store.runs.get(id);
    if (!run || run.org_id !== principal.org_id) throw wfRunNotFound(id);
    return run;
  }

  private dslOf(run: WorkflowRun): WorkflowDsl {
    const definition = this.ctx.store.workflows.get(run.definition_id);
    const version = definition?.versions.find((item) => item.id === run.dsl_version_id);
    if (!version) throw notFound("workflow version not found");
    return version.dsl;
  }

  private addEvent(run: WorkflowRun, type: string, nodeId: string | null, data: JsonObject = {}): void {
    const last = run.events[run.events.length - 1];
    const now = this.ctx.now().toISOString();
    run.events.push({
      id: this.ctx.newId(),
      instance_id: run.id,
      seq: (last?.seq ?? 0) + 1,
      type,
      node_id: nodeId,
      payload_hash: `sha256:${createHash("sha256").update(JSON.stringify(data)).digest("hex")}`,
      created_at: now,
      data,
    });
    run.updated_at = now;
  }

  private audit(run: WorkflowRun, action: string, actor: string, detail: JsonObject = {}): void {
    run.audit.push({ at: this.ctx.now().toISOString(), action, actor, target: run.id, detail });
    run.updated_at = this.ctx.now().toISOString();
  }

  private expressionContext(run: WorkflowRun): ExpressionContext {
    const steps: Record<string, { output?: unknown; status?: string }> = {};
    for (const [id, step] of Object.entries(run.steps)) steps[id] = { output: step.output, status: step.status };
    return { inputs: run.inputs, steps, run: { id: run.id, tenantId: run.org_id } };
  }

  private drive(principal: Principal, run: WorkflowRun, dsl: WorkflowDsl): void {
    if (isTerminal(run.status)) return;
    const nodes = nodeMap(dsl);
    const compensationOnly = isCompensationNode(dsl);
    let iterations = 0;
    while (iterations < this.ctx.env.MAX_STEPS_PER_ADVANCE) {
      iterations += 1;
      if (run.status === "waiting_human" || run.status === "waiting_timer" || run.status === "failed" || run.status === "canceled" || run.status === "succeeded") break;
      this.settleParallels(run, nodes);
      const ready = this.readyNodes(run, nodes, compensationOnly);
      if (ready.length === 0) break;
      for (const node of ready) {
        if (run.status !== "running" && run.status !== "pending") break;
        this.executeNode(principal, run, node, dsl);
      }
      this.settleParallels(run, nodes);
    }
    this.finalizeIfDone(run, dsl);
  }

  private readyNodes(run: WorkflowRun, nodes: Map<string, WorkflowNode>, compensationOnly: Set<string>): WorkflowNode[] {
    return [...nodes.values()].filter((node) => {
      if (compensationOnly.has(node.id)) return false;
      const step = run.steps[node.id];
      if (!step || step.status !== "pending") return false;
      return (node.needs ?? []).every((dependency) => {
        const dependencyStep = run.steps[dependency];
        return !dependencyStep || isSuccess(dependencyStep.status);
      });
    });
  }

  private executeNode(principal: Principal, run: WorkflowRun, node: WorkflowNode, dsl: WorkflowDsl): void {
    const step = run.steps[node.id];
    if (!step) return;
    if (node.when && !evalExpression(node.when, this.expressionContext(run))) {
      step.status = "skipped";
      step.finished_at = this.ctx.now().toISOString();
      this.addEvent(run, "step.skipped", node.id, { when: node.when });
      return;
    }
    step.status = "running";
    step.started_at = this.ctx.now().toISOString();
    step.attempts += 1;
    this.addEvent(run, "step.started", node.id, { type: node.type, attempt: step.attempts });
    const retry = asObject(node.retry);
    const maxAttempts = Math.min(10, Math.max(1, typeof retry.maxAttempts === "number" ? retry.maxAttempts : 1));
    const input = nodeInput(node);
    if (input.simulate_failure === true || input.fail === true) {
      if (step.attempts < maxAttempts) {
        this.addEvent(run, "step.retrying", node.id, { attempt: step.attempts, max_attempts: maxAttempts });
        step.status = "pending";
        return;
      }
      this.handleFailure(run, node, dsl, "simulated node failure", principal.user_id);
      return;
    }
    switch (node.type) {
      case "human_approval": {
        this.createHumanTask(principal, run, node);
        return;
      }
      case "timer":
      case "wait":
      case "webhook":
      case "signal": {
        step.status = "waiting";
        run.waiting_on = { kind: node.type === "timer" || node.type === "wait" ? "timer" : "webhook", node_id: node.id };
        run.status = run.waiting_on.kind === "timer" ? "waiting_timer" : "waiting_timer";
        this.addEvent(run, "step.waiting", node.id, { kind: run.waiting_on.kind });
        return;
      }
      case "condition": {
        const cases = Array.isArray(node.cases) ? (node.cases as Array<JsonObject>) : [];
        let chosen: string | undefined;
        for (const item of cases) {
          if (typeof item.when === "string" && evalExpression(item.when, this.expressionContext(run))) {
            chosen = typeof item.next === "string" ? item.next : undefined;
            break;
          }
        }
        chosen = chosen ?? (typeof node.else === "string" ? node.else : undefined) ?? (typeof node.then === "string" ? node.then : undefined);
        if (!chosen) throw new Error("condition has no matching branch");
        for (const item of cases) {
          const target = typeof item.next === "string" ? item.next : undefined;
          if (target && target !== chosen) {
            const targetStep = run.steps[target];
            if (targetStep && targetStep.status === "pending") {
              targetStep.status = "skipped";
              targetStep.finished_at = this.ctx.now().toISOString();
              this.addEvent(run, "step.skipped", target, { reason: "condition_not_selected", via: node.id });
            }
          }
        }
        if (typeof node.else === "string" && node.else !== chosen) {
          const elseStep = run.steps[node.else];
          if (elseStep && elseStep.status === "pending") {
            elseStep.status = "skipped";
            elseStep.finished_at = this.ctx.now().toISOString();
            this.addEvent(run, "step.skipped", node.else, { reason: "condition_not_selected", via: node.id });
          }
        }
        step.status = "succeeded";
        step.output = { chosen };
        step.finished_at = this.ctx.now().toISOString();
        this.addEvent(run, "step.succeeded", node.id, { chosen });
        return;
      }
      case "parallel": {
        step.status = "waiting";
        this.addEvent(run, "step.parallel_started", node.id, { branches: node.branches ?? [] });
        return;
      }
      default: {
        step.status = "succeeded";
        step.output = { ok: true, node_id: node.id, type: node.type, synthetic: true };
        step.finished_at = this.ctx.now().toISOString();
        this.addEvent(run, "step.succeeded", node.id, { type: node.type });
        return;
      }
    }
  }

  private createHumanTask(principal: Principal, run: WorkflowRun, node: WorkflowNode): void {
    const step = run.steps[node.id];
    if (!step) return;
    const input = nodeInput(node);
    const assignee = asObject(node.assignee);
    const sla = asObject(node.sla);
    const due = typeof sla.due === "string" ? sla.due : this.ctx.env.HUMAN_TASK_SLA_DEFAULT;
    const created = this.ctx.now();
    const task: import("./core").HumanTask = {
      id: this.ctx.newId(),
      org_id: run.org_id,
      scope: "workflow",
      subject_type: "workflow_instance",
      subject_id: run.id,
      run_id: run.id,
      definition_id: run.definition_id,
      workflow_key: run.workflow_key,
      node_id: node.id,
      title: typeof input.title === "string" ? input.title : `审批：${node.id}`,
      description: typeof input.description === "string" ? input.description : null,
      assignee_type: assignee.type === "user" || assignee.type === "team" ? assignee.type : "role",
      assignee_id: typeof assignee.value === "string" ? assignee.value : "manager",
      form: input.form ?? null,
      status: "pending",
      decision: null,
      comment: null,
      form_data: null,
      decided_by: null,
      decided_at: null,
      sla_due_at: new Date(created.getTime() + parseDurationToMs(due)).toISOString(),
      created_at: created.toISOString(),
      updated_at: created.toISOString(),
    };
    this.ctx.store.humanTasks.set(task.id, task);
    step.status = "waiting";
    step.human_task_id = task.id;
    run.waiting_on = { kind: "human_task", node_id: node.id, human_task_id: task.id };
    run.status = "waiting_human";
    this.addEvent(run, "human_task.created", node.id, { task_id: task.id, assignee: `${task.assignee_type}:${task.assignee_id}`, sla_due_at: task.sla_due_at });
    this.audit(run, "human_task.create", principal.user_id, { task_id: task.id, node_id: node.id });
  }

  private settleParallels(run: WorkflowRun, nodes: Map<string, WorkflowNode>): void {
    for (const [id, step] of Object.entries(run.steps)) {
      if (step.type !== "parallel" || step.status !== "waiting") continue;
      const node = nodes.get(id);
      if (!node) continue;
      const branches = (Array.isArray(node.branches) ? node.branches : [])
        .map((branch) => (typeof branch === "string" ? branch : typeof asObject(branch).id === "string" ? (asObject(branch).id as string) : null))
        .filter((branch): branch is string => branch !== null);
      if (branches.length === 0) {
        step.status = "succeeded";
        continue;
      }
      const statuses = branches.map((branch) => run.steps[branch]?.status ?? "pending");
      const succeeded = statuses.filter((status) => isSuccess(status)).length;
      const failed = statuses.filter((status) => status === "failed").length;
      const join = typeof node.join === "string" ? node.join : "all";
      const n = typeof node.n === "number" ? node.n : branches.length;
      const done = join === "any" ? succeeded > 0 || failed === branches.length : join === "n_of_m" ? succeeded + failed >= n : succeeded + failed === branches.length;
      if (!done) continue;
      const ok = join === "any" ? succeeded > 0 : succeeded >= (join === "n_of_m" ? n : branches.length);
      step.finished_at = this.ctx.now().toISOString();
      if (!ok) {
        step.status = "failed";
        step.error = "parallel join failed";
        run.status = "failed";
        run.error = "parallel join failed";
        this.addEvent(run, "step.failed", id, { branches: statuses });
        this.compensate(run, this.dslOf(run), "failed", "parallel join failed");
        return;
      }
      step.status = "succeeded";
      step.output = { branches: statuses };
      this.addEvent(run, "step.succeeded", id, { branches: statuses });
    }
  }

  private handleFailure(run: WorkflowRun, node: WorkflowNode, dsl: WorkflowDsl, message: string, actor: string): void {
    const step = run.steps[node.id];
    if (!step) return;
    step.status = "failed";
    step.error = message;
    step.finished_at = this.ctx.now().toISOString();
    this.addEvent(run, "step.failed", node.id, { error: message });
    const onError = typeof node.onError === "string" ? node.onError : "fail";
    if (onError === "continue") {
      step.status = "skipped";
      this.addEvent(run, "step.failed_continued", node.id, { error: message });
      return;
    }
    if (onError.startsWith("route:")) {
      const target = onError.slice(6);
      if (run.steps[target]) {
        run.steps[target].status = "pending";
        this.addEvent(run, "step.routed", node.id, { target });
        return;
      }
    }
    this.failRun(run, dsl, message, actor);
  }

  private failRun(run: WorkflowRun, dsl: WorkflowDsl, message: string, actor: string): void {
    run.error = message;
    this.addEvent(run, "run.failed", null, { error: message });
    this.audit(run, "workflow_instance.fail", actor, { error: message });
    this.compensate(run, dsl, "failed", message);
  }

  private compensate(run: WorkflowRun, dsl: WorkflowDsl, cause: "failed" | "canceled", reason: string): void {
    const nodes = nodeMap(dsl);
    const compensable = run.node_order
      .filter((id) => {
        const node = nodes.get(id);
        const step = run.steps[id];
        return node && step && step.status === "succeeded" && typeof node.compensate === "string";
      })
      .reverse();
    run.status = "compensating";
    run.compensation = { started_at: this.ctx.now().toISOString(), completed_at: null, steps: [] };
    this.addEvent(run, "run.compensating", null, { steps: compensable, cause, reason });
    for (const id of compensable) {
      const node = nodes.get(id);
      const step = run.steps[id];
      if (!node || !step || typeof node.compensate !== "string") continue;
      const compensationId = node.compensate;
      const compensationStep = run.steps[compensationId];
      if (compensationStep) {
        compensationStep.status = "succeeded";
        compensationStep.started_at = this.ctx.now().toISOString();
        compensationStep.finished_at = this.ctx.now().toISOString();
        compensationStep.compensation_for = id;
        compensationStep.output = { compensated: id, synthetic: true };
      }
      step.status = "compensated";
      run.compensation.steps.push(compensationId);
      this.addEvent(run, "compensation.completed", id, { compensate_node: compensationId });
    }
    run.compensation.completed_at = this.ctx.now().toISOString();
    run.status = cause;
    run.finished_at = run.compensation.completed_at;
    run.waiting_on = null;
    this.addEvent(run, cause === "canceled" ? "run.canceled" : "run.compensated", null, { steps: run.compensation.steps });
    this.audit(run, cause === "canceled" ? "workflow_instance.cancel" : "workflow_instance.compensate", run.created_by, { steps: run.compensation.steps, reason });
  }

  private finalizeIfDone(run: WorkflowRun, dsl: WorkflowDsl): void {
    if (isTerminal(run.status) || run.status === "waiting_human" || run.status === "waiting_timer" || run.status === "compensating") return;
    const nodes = nodeMap(dsl);
    const compensationOnly = isCompensationNode(dsl);
    const pending = [...nodes.keys()].filter((id) => {
      if (compensationOnly.has(id)) return false;
      const step = run.steps[id];
      return step && !isSuccess(step.status) && step.status !== "failed";
    });
    if (pending.length > 0) return;
    const failed = Object.values(run.steps).some((step) => step.status === "failed");
    if (failed) {
      run.status = "failed";
      run.finished_at = this.ctx.now().toISOString();
      return;
    }
    run.status = "succeeded";
    run.outputs = this.computeOutputs(run);
    run.output_ref = `wf://instances/${run.id}/outputs`;
    run.finished_at = this.ctx.now().toISOString();
    run.waiting_on = null;
    this.addEvent(run, "run.succeeded", null, {});
  }

  private computeOutputs(run: WorkflowRun): JsonObject {
    const outputs: JsonObject = {};
    for (const [id, step] of Object.entries(run.steps)) outputs[id] = { status: step.status, output: step.output };
    return outputs;
  }
}
