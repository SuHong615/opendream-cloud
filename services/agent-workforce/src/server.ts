// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * Agent Workforce（数字员工 / 专家小队）MVP。
 *
 * 注意：这不是"短视频数字人 / 虚拟形象 / RTC 音视频"，而是企业应用内的数字员工：
 * - 数字员工 = 有岗位、技能、MCP 工具、记忆、权限与绩效的 AI 同事；
 * - 专家小队 = 由 lead + workers 组成、可编排/委派/评审/人工审批的 Agent 团队；
 * - 可嵌入企业应用（app_id + embed token），7x24 运行并留审计。
 *
 * 服务为内存 store（MVP），生产替换为 PostgreSQL + Temporal（见 AGENT-WORKFORCE.md）。
 */
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";

const VERSION = "0.1.0-m6";
const PORT = Number(process.env.PORT ?? 4106);
const HOST = process.env.HOST ?? "0.0.0.0";
const DEFAULT_ORG = process.env.DEFAULT_ORG_ID ?? "00000000-0000-4000-8000-000000000001";

type EmployeeRole = "lead" | "specialist" | "reviewer" | "operator";
type AgentType = "harness" | "high_code" | "managed" | "registered";
type RunStatus = "running" | "waiting_human" | "completed" | "canceled" | "failed";
type TaskStatus = "queued" | "running" | "completed" | "blocked" | "skipped";

interface Employee {
  id: string;
  org_id: string;
  name: string;
  agent_type?: AgentType;
  role: EmployeeRole;
  title: string;
  mission: string;
  skills: string[];
  mcp_servers: string[];
  memory_scope: "private" | "team" | "org";
  autonomy: "suggest" | "execute_with_approval" | "autonomous";
  status: "active" | "paused";
  avatar_color: string;
  created_at: string;
}

interface Squad {
  id: string;
  org_id: string;
  name: string;
  mission: string;
  orchestration: "sequential" | "parallel" | "router" | "debate";
  lead_id: string;
  member_ids: string[];
  app_ids: string[];
  human_gates: string[];
  sla_minutes: number;
  status: "active" | "paused";
  created_at: string;
}

interface RunTask {
  id: string;
  employee_id: string;
  employee_name: string;
  title: string;
  status: TaskStatus;
  output: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface Message {
  id: string;
  employee_id: string;
  employee_name: string;
  role: "lead" | "member" | "system" | "human";
  content: string;
  created_at: string;
}

interface Run {
  id: string;
  org_id: string;
  squad_id: string;
  squad_name: string;
  goal: string;
  app_id: string | null;
  status: RunStatus;
  tasks: RunTask[];
  messages: Message[];
  artifacts: Array<{ name: string; kind: string; content: string }>;
  approvals: Array<{ gate: string; requested_at: string; decided_at: string | null; decision: "approved" | "rejected" | null }>;
  usage: { tokens: number; cost_usd: number };
  created_at: string;
  completed_at: string | null;
}

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

function seedEmployee(partial: Omit<Employee, "id" | "org_id" | "created_at">): Employee {
  return { agent_type: "harness", ...partial, id: id("emp"), org_id: "system", created_at: "2026-11-08T00:00:00.000Z" };
}

const EMPLOYEES: Employee[] = [
  seedEmployee({ name: "林研", role: "lead", title: "研发交付负责人", mission: "拆解需求、编排小队、守住交付质量与节奏", skills: ["需求拆解", "技术方案", "code review", "发布决策"], mcp_servers: ["git", "issue-tracker", "ci"], memory_scope: "team", autonomy: "execute_with_approval", status: "active", avatar_color: "#2563eb" }),
  seedEmployee({ name: "周码", role: "specialist", title: "后端工程师", mission: "实现服务端接口、数据模型与集成", skills: ["TypeScript", "API 设计", "SQL", "测试"], mcp_servers: ["git", "database", "ci"], memory_scope: "team", autonomy: "execute_with_approval", status: "active", avatar_color: "#0891b2" }),
  seedEmployee({ name: "唐测", role: "reviewer", title: "质量工程师", mission: "制定测试策略、执行回归与安全门禁", skills: ["测试计划", "E2E", "安全审计", "缺陷定位"], mcp_servers: ["test-runner", "issue-tracker"], memory_scope: "team", autonomy: "execute_with_approval", status: "active", avatar_color: "#7c3aed" }),
  seedEmployee({ name: "苏客", role: "lead", title: "客户运营专家", mission: "分诊客户问题、组织专家答复、沉淀知识", skills: ["工单分诊", "知识库", "客户沟通", "升级判断"], mcp_servers: ["crm", "knowledge-base", "ticket"], memory_scope: "org", autonomy: "suggest", status: "active", avatar_color: "#059669" }),
  seedEmployee({ name: "陈数", role: "specialist", title: "数据分析师", mission: "取数、建模指标、输出可行动洞察", skills: ["SQL", "指标体系", "可视化", "归因"], mcp_servers: ["warehouse", "bi"], memory_scope: "org", autonomy: "suggest", status: "active", avatar_color: "#d97706" }),
  seedEmployee({ name: "钱账", role: "lead", title: "财务运营专家", mission: "核对账务、识别异常、执行合规审批", skills: ["对账", "发票", "预算", "合规"], mcp_servers: ["erp", "invoice", "bank"], memory_scope: "private", autonomy: "execute_with_approval", status: "active", avatar_color: "#dc2626" }),
  seedEmployee({ name: "何聘", role: "operator", title: "HR 伙伴", mission: "入职引导、政策答疑、面试安排", skills: ["入职", "政策", "面试安排"], mcp_servers: ["hr-system", "calendar"], memory_scope: "private", autonomy: "suggest", status: "active", avatar_color: "#db2777" }),
];

const SQUADS: Squad[] = [
  { id: "sq_sdlc_delivery", org_id: "system", name: "研发交付小队", mission: "把需求变成可上线、可验证、可回滚的软件交付", orchestration: "sequential", lead_id: EMPLOYEES[0].id, member_ids: [EMPLOYEES[1].id, EMPLOYEES[2].id], app_ids: [], human_gates: ["发布上线"], sla_minutes: 240, status: "active", created_at: "2026-11-08T00:00:00.000Z" },
  { id: "sq_customer_ops", org_id: "system", name: "客户运营小队", mission: "7x24 分诊客户问题，给出可执行答复并沉淀知识", orchestration: "router", lead_id: EMPLOYEES[3].id, member_ids: [EMPLOYEES[4].id], app_ids: [], human_gates: ["退款/补偿"], sla_minutes: 30, status: "active", created_at: "2026-11-08T00:00:00.000Z" },
  { id: "sq_finance_ops", org_id: "system", name: "财务运营小队", mission: "对账、异常识别与合规付款审批", orchestration: "sequential", lead_id: EMPLOYEES[5].id, member_ids: [EMPLOYEES[4].id], app_ids: [], human_gates: ["对外付款"], sla_minutes: 120, status: "active", created_at: "2026-11-08T00:00:00.000Z" },
];

const employees = new Map<string, Employee>();
const squads = new Map<string, Squad>();
const runs = new Map<string, Run>();
const runQueue: string[] = [];

interface AgentTemplate {
  id: string;
  org_id: string;
  name: string;
  description: string;
  category: string;
  config: Omit<Employee, "id" | "org_id" | "created_at">;
  created_at: string;
}
const templates = new Map<string, AgentTemplate>();

function seedTemplate(name: string, description: string, category: string, employee: Employee): void {
  const { id: _id, org_id: _org, created_at: _created, ...config } = employee;
  const template: AgentTemplate = { id: id("tpl"), org_id: "system", name, description, category, config, created_at: "2026-11-08T00:00:00.000Z" };
  templates.set(template.id, template);
}
seedTemplate("研发交付负责人", "拆解需求、编排小队、守住交付质量", "研发", EMPLOYEES[0]!);
seedTemplate("客户运营专家", "分诊客户问题、组织答复、沉淀知识", "客服", EMPLOYEES[3]!);
seedTemplate("财务运营专家", "对账、异常识别、合规付款审批", "财务", EMPLOYEES[5]!);

interface Guardrails {
  allowed_tools: string[];
  forbidden_actions: string[];
  max_autonomy: "suggest" | "execute_with_approval" | "autonomous";
  require_approval_for: string[];
}
interface EmployeeVersion {
  id: string;
  employee_id: string;
  version: string;
  snapshot: Employee;
  created_at: string;
}
interface Schedule {
  id: string;
  org_id: string;
  name: string;
  squad_id: string;
  goal: string;
  interval_minutes: number;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_run_id: string | null;
  created_at: string;
}
const employeeVersions = new Map<string, EmployeeVersion[]>();
const guardrailsByEmployee = new Map<string, Guardrails>();
const schedules = new Map<string, Schedule>();
const defaultGuardrails = (): Guardrails => ({ allowed_tools: [], forbidden_actions: [], max_autonomy: "execute_with_approval", require_approval_for: [] });
for (const employee of EMPLOYEES) employees.set(employee.id, employee);
for (const squad of SQUADS) squads.set(squad.id, squad);

interface Principal { orgId: string; userId: string; roles: string[] }
function principalOf(request: FastifyRequest): Principal {
  const header = (name: string) => (typeof request.headers[name] === "string" ? (request.headers[name] as string) : undefined);
  return { orgId: header("x-oc-org-id") ?? DEFAULT_ORG, userId: header("x-oc-user-id") ?? "system", roles: (header("x-oc-roles") ?? "owner").split(",") };
}
const visible = <T extends { org_id: string }>(items: T[], orgId: string) => items.filter((item) => item.org_id === "system" || item.org_id === orgId);
const employeeOf = (orgId: string, employeeId: string) => [...employees.values()].find((e) => e.id === employeeId && (e.org_id === "system" || e.org_id === orgId));

function squadView(squad: Squad): Record<string, unknown> {
  return {
    ...squad,
    lead: employeeOf(squad.org_id, squad.lead_id) ?? null,
    members: squad.member_ids.map((memberId) => employeeOf(squad.org_id, memberId)).filter(Boolean),
  };
}

function taskTitle(employee: Employee, goal: string): string {
  if (employee.role === "lead") return `拆解目标并分派：${goal.slice(0, 60)}`;
  if (employee.role === "reviewer") return `评审交付物并给出质量结论`;
  if (employee.role === "operator") return `执行流程性任务并回填结果`;
  return `完成专业任务并提交产物`;
}

function mockOutput(employee: Employee, goal: string): string {
  if (employee.role === "lead") return `已拆解目标「${goal}」为 ${employee.skills.length} 个工作项，指派给小队成员，并设定评审与人工审批节点。`;
  if (employee.role === "reviewer") return `已完成评审：覆盖 ${employee.skills.slice(0, 2).join("、")}；结论为通过，发现 0 个阻塞问题、2 个建议项。`;
  return `已完成 ${employee.title} 相关工作，产出结构化结果与后续建议（基于 ${employee.skills.slice(0, 2).join("、")}）。`;
}

function createRun(squad: Squad, goal: string, appId: string | null): Run {
  const members = [squad.lead_id, ...squad.member_ids]
    .map((memberId) => employeeOf(squad.org_id, memberId))
    .filter((employee): employee is Employee => Boolean(employee));
  const nowIso = now();
  const run: Run = {
    id: id("run"),
    org_id: squad.org_id,
    squad_id: squad.id,
    squad_name: squad.name,
    goal,
    app_id: appId,
    status: "running",
    tasks: members.map((employee) => ({
      id: id("task"),
      employee_id: employee.id,
      employee_name: employee.name,
      title: taskTitle(employee, goal),
      status: "queued",
      output: null,
      started_at: null,
      finished_at: null,
    })),
    messages: [
      { id: id("msg"), employee_id: squad.lead_id, employee_name: employeeOf(squad.org_id, squad.lead_id)?.name ?? "lead", role: "lead", content: `收到目标「${goal}」，开始编排小队。`, created_at: nowIso },
    ],
    artifacts: [],
    approvals: squad.human_gates.map((gate) => ({ gate, requested_at: nowIso, decided_at: null, decision: null })),
    usage: { tokens: 0, cost_usd: 0 },
    created_at: nowIso,
    completed_at: null,
  };
  // 立即执行 lead 的第一项任务，体现"已开始工作"。
  advanceRun(run);
  runs.set(run.id, run);
  return run;
}

function advanceRun(run: Run): Run {
  if (run.status !== "running") return run;
  const task = run.tasks.find((item) => item.status === "queued" || item.status === "running");
  if (!task) {
    const gate = run.approvals.find((item) => item.decision === null);
    if (gate) {
      run.status = "waiting_human";
      run.messages.push({ id: id("msg"), employee_id: "system", employee_name: "系统", role: "system", content: `等待人工审批：${gate.gate}`, created_at: now() });
      return run;
    }
    finishRun(run);
    return run;
  }
  const employee = employeeOf(run.org_id, task.employee_id);
  if (!employee) return run;
  task.status = "completed";
  task.started_at = task.started_at ?? now();
  task.finished_at = now();
  task.output = mockOutput(employee, run.goal);
  run.messages.push({ id: id("msg"), employee_id: employee.id, employee_name: employee.name, role: employee.role === "lead" ? "lead" : "member", content: task.output, created_at: now() });
  run.artifacts.push({ name: `${employee.title}-交付物.md`, kind: "markdown", content: task.output });
  run.usage.tokens += 420;
  run.usage.cost_usd = Number((run.usage.cost_usd + 0.012).toFixed(3));
  if (!run.tasks.some((item) => item.status === "queued" || item.status === "running")) {
    const gate = run.approvals.find((item) => item.decision === null);
    if (gate) {
      run.status = "waiting_human";
      run.messages.push({ id: id("msg"), employee_id: "system", employee_name: "系统", role: "system", content: `等待人工审批：${gate.gate}`, created_at: now() });
    } else {
      finishRun(run);
    }
  }
  return run;
}

function finishRun(run: Run): void {
  run.status = "completed";
  run.completed_at = now();
  run.messages.push({ id: id("msg"), employee_id: "system", employee_name: "系统", role: "system", content: "小队已完成目标，交付物已归档。", created_at: now() });
}

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : crypto.randomUUID());
  });
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { status?: number }).status ?? 500;
    request.log.error({ err: error }, "agent-workforce error");
    return reply.code(status).send({ error: { code: status === 404 ? "not_found" : "validation_failed", message: error.message, request_id: String(request.headers["x-request-id"] ?? "") } });
  });
  app.get("/healthz", async () => ({ status: "ok", service: "agent-workforce", version: VERSION, employees: employees.size, squads: squads.size, runs: runs.size }));
  app.get("/readyz", async () => ({ status: "ok" }));

  app.get("/api/v1/agent-employees", async (request) => ({ items: visible([...employees.values()], principalOf(request).orgId) }));
  app.get("/api/v1/agent-templates", async (request) => ({
    items: [...templates.values()].filter((template) => template.org_id === "system" || template.org_id === principalOf(request).orgId),
  }));
  app.get("/api/v1/agent-templates/:templateId", async (request) => {
    const { templateId } = request.params as { templateId: string };
    const template = templates.get(templateId);
    if (!template || (template.org_id !== "system" && template.org_id !== principalOf(request).orgId)) throw Object.assign(new Error("template not found"), { status: 404 });
    return template;
  });
  app.post("/api/v1/agent-templates", async (request, reply) => {
    const principal = principalOf(request);
    const body = z.object({ name: z.string().min(1).max(80), description: z.string().max(500).default(""), category: z.string().max(40).default("通用"), employee_id: z.string() }).parse(request.body ?? {});
    const employee = employeeOf(principal.orgId, body.employee_id);
    if (!employee) throw Object.assign(new Error("employee not found"), { status: 404 });
    const { id: _id, org_id: _org, created_at: _created, ...config } = employee;
    const template: AgentTemplate = { id: id("tpl"), org_id: principal.orgId, name: body.name, description: body.description, category: body.category, config, created_at: now() };
    templates.set(template.id, template);
    return reply.code(201).send(template);
  });
  app.post("/api/v1/agent-templates/:templateId/instantiate", async (request, reply) => {
    const principal = principalOf(request);
    const { templateId } = request.params as { templateId: string };
    const template = templates.get(templateId);
    if (!template || (template.org_id !== "system" && template.org_id !== principal.orgId)) throw Object.assign(new Error("template not found"), { status: 404 });
    const body = z.object({ name: z.string().min(1).max(80).optional() }).parse(request.body ?? {});
    const employee: Employee = { ...structuredClone(template.config), name: body.name ?? template.config.name, id: id("emp"), org_id: principal.orgId, created_at: now() };
    employees.set(employee.id, employee);
    return reply.code(201).send(employee);
  });
  app.post("/api/v1/agent-employees", async (request, reply) => {
    const principal = principalOf(request);
    const body = z.object({ name: z.string().min(1).max(80), agent_type: z.enum(["harness", "high_code", "managed", "registered"]).default("harness"), role: z.enum(["lead", "specialist", "reviewer", "operator"]), title: z.string().min(1), mission: z.string().min(1), skills: z.array(z.string()).default([]), mcp_servers: z.array(z.string()).default([]), memory_scope: z.enum(["private", "team", "org"]).default("team"), autonomy: z.enum(["suggest", "execute_with_approval", "autonomous"]).default("execute_with_approval"), avatar_color: z.string().default("#2563eb") }).parse(request.body ?? {});
    const employee: Employee = { ...body, id: id("emp"), org_id: principal.orgId, status: "active", created_at: now() };
    employees.set(employee.id, employee);
    return reply.code(201).send(employee);
  });
  app.get("/api/v1/agent-employees/:employeeId", async (request) => {
    const { employeeId } = request.params as { employeeId: string };
    const employee = employeeOf(principalOf(request).orgId, employeeId);
    if (!employee) throw Object.assign(new Error("employee not found"), { status: 404 });
    return employee;
  });
  app.patch("/api/v1/agent-employees/:employeeId", async (request) => {
    const { employeeId } = request.params as { employeeId: string };
    const employee = employeeOf(principalOf(request).orgId, employeeId);
    if (!employee) throw Object.assign(new Error("employee not found"), { status: 404 });
    Object.assign(employee, z.object({ name: z.string().optional(), title: z.string().optional(), mission: z.string().optional(), skills: z.array(z.string()).optional(), status: z.enum(["active", "paused"]).optional() }).parse(request.body ?? {}));
    return employee;
  });

  app.get("/api/v1/agent-squads", async (request) => ({ items: visible([...squads.values()], principalOf(request).orgId).map(squadView) }));
  app.post("/api/v1/agent-squads", async (request, reply) => {
    const principal = principalOf(request);
    const body = z.object({ name: z.string().min(1).max(80), mission: z.string().min(1), orchestration: z.enum(["sequential", "parallel", "router", "debate"]).default("sequential"), lead_id: z.string(), member_ids: z.array(z.string()).default([]), app_ids: z.array(z.string()).default([]), human_gates: z.array(z.string()).default([]), sla_minutes: z.number().int().min(1).max(1440).default(120) }).parse(request.body ?? {});
    if (!employeeOf(principal.orgId, body.lead_id)) throw Object.assign(new Error("lead not found"), { status: 400 });
    const squad: Squad = { ...body, id: id("sq"), org_id: principal.orgId, status: "active", created_at: now() };
    squads.set(squad.id, squad);
    return reply.code(201).send(squadView(squad));
  });
  app.get("/api/v1/agent-squads/:squadId", async (request) => {
    const { squadId } = request.params as { squadId: string };
    const squad = squads.get(squadId);
    if (!squad || (squad.org_id !== "system" && squad.org_id !== principalOf(request).orgId)) throw Object.assign(new Error("squad not found"), { status: 404 });
    return squadView(squad);
  });
  app.post("/api/v1/agent-squads/:squadId/runs", async (request, reply) => {
    const { squadId } = request.params as { squadId: string };
    const squad = squads.get(squadId);
    if (!squad || (squad.org_id !== "system" && squad.org_id !== principalOf(request).orgId)) throw Object.assign(new Error("squad not found"), { status: 404 });
    const body = z.object({ goal: z.string().min(3).max(2000), app_id: z.string().optional(), context: z.record(z.unknown()).optional(), inputs: z.record(z.unknown()).optional(), async: z.boolean().default(false) }).parse(request.body ?? {});
    const lead = employeeOf(squad.org_id, squad.lead_id);
    const policy = lead ? (guardrailsByEmployee.get(lead.id) ?? defaultGuardrails()) : defaultGuardrails();
    const blocked = policy.forbidden_actions.find((action) => action && body.goal.toLowerCase().includes(action.toLowerCase()));
    if (blocked) throw Object.assign(new Error(`guardrail blocked: ${blocked}`), { status: 400 });
    const run = createRun(squad, body.goal, body.app_id ?? null);
    run.org_id = principalOf(request).orgId;
    if (body.async) {
      runQueue.push(run.id);
      return reply.code(202).send({ ...run, queued: true, queue_position: runQueue.length });
    }
    return reply.code(201).send(run);
  });
  app.get("/api/v1/agent-runs", async (request) => ({ items: [...runs.values()].filter((run) => run.org_id === principalOf(request).orgId) }));
  app.post("/api/v1/agent-runs/:runId/enqueue", async (request) => {
    const { runId } = request.params as { runId: string };
    const run = runs.get(runId);
    if (!run || run.org_id !== principalOf(request).orgId) throw Object.assign(new Error("run not found"), { status: 404 });
    if (run.status !== "running") throw Object.assign(new Error("run is not queueable"), { status: 409 });
    if (!runQueue.includes(runId)) runQueue.push(runId);
    return { id: run.id, status: run.status, queued: true, queue_position: runQueue.indexOf(runId) + 1 };
  });
  app.get("/api/v1/agent-runs/:runId", async (request) => {
    const { runId } = request.params as { runId: string };
    const run = runs.get(runId);
    if (!run || run.org_id !== principalOf(request).orgId) throw Object.assign(new Error("run not found"), { status: 404 });
    return run;
  });
  app.post("/api/v1/agent-runs/:runId/advance", async (request) => {
    const { runId } = request.params as { runId: string };
    const run = runs.get(runId);
    if (!run || run.org_id !== principalOf(request).orgId) throw Object.assign(new Error("run not found"), { status: 404 });
    return advanceRun(run);
  });
  app.post("/api/v1/agent-runs/:runId/approve", async (request) => {
    const { runId } = request.params as { runId: string };
    const run = runs.get(runId);
    if (!run || run.org_id !== principalOf(request).orgId) throw Object.assign(new Error("run not found"), { status: 404 });
    const body = z.object({ gate: z.string().optional(), decision: z.enum(["approved", "rejected"]).default("approved") }).parse(request.body ?? {});
    const gate = run.approvals.find((item) => item.gate === (body.gate ?? run.approvals.find((a) => a.decision === null)?.gate));
    if (!gate) throw Object.assign(new Error("approval gate not found"), { status: 404 });
    gate.decision = body.decision;
    gate.decided_at = now();
    run.messages.push({ id: id("msg"), employee_id: "human", employee_name: "人工审批人", role: "human", content: `${body.decision === "approved" ? "通过" : "拒绝"}审批：${gate.gate}`, created_at: now() });
    if (body.decision === "rejected") {
      run.status = "failed";
      return run;
    }
    run.status = "running";
    return advanceRun(run);
  });
  app.post("/api/v1/agent-runs/:runId/cancel", async (request) => {
    const { runId } = request.params as { runId: string };
    const run = runs.get(runId);
    if (!run || run.org_id !== principalOf(request).orgId) throw Object.assign(new Error("run not found"), { status: 404 });
    if (run.status === "completed") throw Object.assign(new Error("run already completed"), { status: 409 });
    run.status = "canceled";
    return run;
  });
  app.post("/api/v1/agent-squads/:squadId/embed-sessions", async (request, reply) => {
    const { squadId } = request.params as { squadId: string };
    const squad = squads.get(squadId);
    if (!squad) throw Object.assign(new Error("squad not found"), { status: 404 });
    const body = z.object({ app_id: z.string().min(1), permissions: z.array(z.string()).default(["read"]) }).parse(request.body ?? {});
    return reply.code(201).send({ token: `aw_embed_${crypto.randomUUID().replace(/-/g, "")}`, squad_id: squad.id, squad_name: squad.name, app_id: body.app_id, permissions: body.permissions, expires_in: 3600, embed_url: `/embed/squads/${squad.id}` });
  });
  // ---------------- 治理：版本快照 / Guardrail / 排班
  const employeeOrThrow = (request: FastifyRequest, employeeId: string): Employee => {
    const employee = employeeOf(principalOf(request).orgId, employeeId);
    if (!employee) throw Object.assign(new Error("employee not found"), { status: 404 });
    return employee;
  };
  app.get("/api/v1/agent-employees/:employeeId/versions", async (request) => {
    const { employeeId } = request.params as { employeeId: string };
    employeeOrThrow(request, employeeId);
    return { items: employeeVersions.get(employeeId) ?? [] };
  });
  app.post("/api/v1/agent-employees/:employeeId/versions", async (request, reply) => {
    const { employeeId } = request.params as { employeeId: string };
    const employee = employeeOrThrow(request, employeeId);
    const versions = employeeVersions.get(employeeId) ?? [];
    const record: EmployeeVersion = { id: id("empver"), employee_id: employeeId, version: `1.0.${versions.length + 1}`, snapshot: structuredClone(employee), created_at: now() };
    employeeVersions.set(employeeId, [...versions, record]);
    return reply.code(201).send(record);
  });
  app.post("/api/v1/agent-employees/:employeeId/rollback", async (request) => {
    const { employeeId } = request.params as { employeeId: string };
    const employee = employeeOrThrow(request, employeeId);
    const body = z.object({ version_id: z.string() }).parse(request.body ?? {});
    const versions = employeeVersions.get(employeeId) ?? [];
    const target = versions.find((version) => version.id === body.version_id);
    if (!target) throw Object.assign(new Error("employee version not found"), { status: 404 });
    employeeVersions.set(employeeId, [...versions, { id: id("empver"), employee_id: employeeId, version: `1.0.${versions.length + 1}`, snapshot: structuredClone(employee), created_at: now() }]);
    Object.assign(employee, target.snapshot, { id: employee.id, org_id: employee.org_id, created_at: employee.created_at });
    return employee;
  });
  app.get("/api/v1/agent-employees/:employeeId/guardrails", async (request) => {
    const { employeeId } = request.params as { employeeId: string };
    employeeOrThrow(request, employeeId);
    return guardrailsByEmployee.get(employeeId) ?? defaultGuardrails();
  });
  app.put("/api/v1/agent-employees/:employeeId/guardrails", async (request) => {
    const { employeeId } = request.params as { employeeId: string };
    employeeOrThrow(request, employeeId);
    const body = z.object({
      allowed_tools: z.array(z.string()).default([]),
      forbidden_actions: z.array(z.string()).default([]),
      max_autonomy: z.enum(["suggest", "execute_with_approval", "autonomous"]).default("execute_with_approval"),
      require_approval_for: z.array(z.string()).default([]),
    }).parse(request.body ?? {});
    guardrailsByEmployee.set(employeeId, body);
    return body;
  });

  app.get("/api/v1/agent-schedules", async (request) => ({ items: [...schedules.values()].filter((schedule) => schedule.org_id === principalOf(request).orgId) }));
  app.post("/api/v1/agent-schedules", async (request, reply) => {
    const principal = principalOf(request);
    const body = z.object({
      name: z.string().min(1).max(120),
      squad_id: z.string(),
      goal: z.string().min(3).max(2000),
      interval_minutes: z.number().int().min(1).max(10080).default(60),
      enabled: z.boolean().default(true),
    }).parse(request.body ?? {});
    const squad = squads.get(body.squad_id);
    if (!squad || (squad.org_id !== "system" && squad.org_id !== principal.orgId)) throw Object.assign(new Error("squad not found"), { status: 404 });
    const schedule: Schedule = { id: id("sch"), org_id: principal.orgId, name: body.name, squad_id: body.squad_id, goal: body.goal, interval_minutes: body.interval_minutes, enabled: body.enabled, next_run_at: new Date(Date.now() + body.interval_minutes * 60_000).toISOString(), last_run_at: null, last_run_id: null, created_at: now() };
    schedules.set(schedule.id, schedule);
    return reply.code(201).send(schedule);
  });
  app.patch("/api/v1/agent-schedules/:scheduleId", async (request) => {
    const { scheduleId } = request.params as { scheduleId: string };
    const schedule = schedules.get(scheduleId);
    if (!schedule || schedule.org_id !== principalOf(request).orgId) throw Object.assign(new Error("schedule not found"), { status: 404 });
    Object.assign(schedule, z.object({ name: z.string().optional(), goal: z.string().optional(), interval_minutes: z.number().int().min(1).max(10080).optional(), enabled: z.boolean().optional() }).parse(request.body ?? {}));
    return schedule;
  });
  app.delete("/api/v1/agent-schedules/:scheduleId", async (request, reply) => {
    const { scheduleId } = request.params as { scheduleId: string };
    const schedule = schedules.get(scheduleId);
    if (!schedule || schedule.org_id !== principalOf(request).orgId) throw Object.assign(new Error("schedule not found"), { status: 404 });
    schedules.delete(scheduleId);
    return reply.code(204).send();
  });
  app.post("/api/v1/agent-schedules/:scheduleId/run", async (request, reply) => {
    const { scheduleId } = request.params as { scheduleId: string };
    const schedule = schedules.get(scheduleId);
    if (!schedule || schedule.org_id !== principalOf(request).orgId) throw Object.assign(new Error("schedule not found"), { status: 404 });
    const squad = squads.get(schedule.squad_id);
    if (!squad) throw Object.assign(new Error("squad not found"), { status: 404 });
    const run = createRun(squad, schedule.goal, null);
    run.org_id = schedule.org_id;
    schedule.last_run_at = now();
    schedule.last_run_id = run.id;
    schedule.next_run_at = new Date(Date.now() + schedule.interval_minutes * 60_000).toISOString();
    return reply.code(201).send({ schedule, run });
  });
  app.post("/internal/agent-schedules/tick", async () => {
    const due = [...schedules.values()].filter((schedule) => schedule.enabled && Date.parse(schedule.next_run_at) <= Date.now());
    const started: string[] = [];
    for (const schedule of due) {
      const squad = squads.get(schedule.squad_id);
      if (!squad) continue;
      const run = createRun(squad, schedule.goal, null);
      run.org_id = schedule.org_id;
      schedule.last_run_at = now();
      schedule.last_run_id = run.id;
      schedule.next_run_at = new Date(Date.now() + schedule.interval_minutes * 60_000).toISOString();
      started.push(run.id);
    }
    return { started, count: started.length };
  });
  return app;
}

const app = buildApp();
await app.listen({ host: HOST, port: PORT });
console.log(`[agent-workforce] listening on http://${HOST}:${PORT}`);

// 异步 Agent Run worker（MVP：内存队列；生产替换为 NATS/Temporal + Postgres）
const runWorker = setInterval(() => {
  const runId = runQueue.shift();
  if (!runId) return;
  const run = runs.get(runId);
  if (!run || run.status !== "running") return;
  advanceRun(run);
  if (run.status === "running" && run.tasks.some((task) => task.status === "queued" || task.status === "running")) {
    runQueue.push(run.id);
  }
}, 1000);
runWorker.unref?.();
