// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { JsonObject, WorkflowDsl, WorkflowNode, WorkflowTemplate } from "./core";
import { WORKFLOW_API_VERSION } from "./core";

type NodeInput = JsonObject;

function agent(id: string, needs: string[], prompt: string, extra: NodeInput = {}): WorkflowNode {
  return {
    id,
    type: "agent",
    needs,
    ...extra,
    model_ref: "default-coding",
    input: { prompt },
  };
}

function mcpTool(id: string, needs: string[], server: string, tool: string, args: NodeInput = {}, extra: NodeInput = {}): WorkflowNode {
  return { id, type: "mcp_tool", needs, ...extra, input: { server, tool, args } };
}

function humanApproval(id: string, needs: string[], title: string, assignee: { type: string; value: string }, extra: NodeInput = {}): WorkflowNode {
  return {
    id,
    type: "human_approval",
    needs,
    ...extra,
    assignee,
    sla: { due: "24h" },
    input: { title, description: `请处理：${title}` },
  };
}

function condition(id: string, needs: string[], cases: Array<{ when: string; next: string }>, otherwise?: string): WorkflowNode {
  return { id, type: "condition", needs, cases, ...(otherwise ? { else: otherwise } : {}) };
}

function timer(id: string, needs: string[], duration: string): WorkflowNode {
  return { id, type: "timer", needs, duration };
}

function parallel(id: string, needs: string[], branches: string[], join: "all" | "any" = "all"): WorkflowNode {
  return { id, type: "parallel", needs, branches, join };
}

function webhook(name: string, secretRef: string): JsonObject {
  return { webhook: { path: `/hooks/${name}`, secret_ref: secretRef } };
}

function doc(
  name: string,
  displayName: string,
  description: string,
  nodes: WorkflowNode[],
  extra: { trigger?: JsonObject; inputs?: unknown; labels?: Record<string, string> } = {},
): WorkflowDsl {
  return {
    apiVersion: WORKFLOW_API_VERSION,
    kind: "Workflow",
    metadata: { name, version: "1.0.0", displayName, description, labels: extra.labels ?? {} },
    spec: {
      description,
      ...(extra.trigger ? { trigger: extra.trigger } : {}),
      ...(extra.inputs ? { inputs: extra.inputs } : {}),
      nodes,
    },
  };
}

function template(id: string, category: string, name: string, displayName: string, description: string, dsl: WorkflowDsl): WorkflowTemplate {
  return { id, category, name, display_name: displayName, description, dsl };
}

const inputsFeature = { type: "object", required: ["feature"], properties: { feature: { type: "string" } } };
const inputsTicket = {
  type: "object",
  required: ["ticket_id", "content"],
  properties: { ticket_id: { type: "string" }, content: { type: "string" } },
};
const inputsIncident = { type: "object", required: ["incident_id"], properties: { incident_id: { type: "string" } } };
const inputsRequest = { type: "object", required: ["request_id"], properties: { request_id: { type: "string" } } };
const inputsVisitor = { type: "object", required: ["visitor_name"], properties: { visitor_name: { type: "string" } } };
const inputsJob = { type: "object", required: ["job_id"], properties: { job_id: { type: "string" } } };

const SDLC = "sdlc";
const CUSTOMER = "customer-service";
const APPROVAL = "approval";
const DATA = "data";
const OPS = "operations";
const DIGITAL_HUMAN = "digital-human";

export const BUILTIN_TEMPLATES: WorkflowTemplate[] = [
  template(
    "sdlc-requirements",
    SDLC,
    "sdlc-requirements",
    "SDLC · 需求分析",
    "需求澄清、可行性分析与产品负责人确认。",
    doc(
      "sdlc-requirements",
      "SDLC · 需求分析",
      "需求分析阶段模板",
      [
        agent("analyze", [], "分析需求 ${inputs.feature}，输出验收标准与风险", { retry: { maxAttempts: 2 } }),
        humanApproval("approve", ["analyze"], "确认需求与验收标准", { type: "role", value: "product_owner" }),
      ],
      { inputs: inputsFeature, labels: { stage: "requirements" } },
    ),
  ),
  template(
    "sdlc-design",
    SDLC,
    "sdlc-design",
    "SDLC · 方案设计",
    "技术方案设计与架构评审。",
    doc(
      "sdlc-design",
      "SDLC · 方案设计",
      "方案设计阶段模板",
      [
        agent("design", [], "为 ${inputs.feature} 输出技术方案与接口设计"),
        humanApproval("review", ["design"], "架构/技术方案评审", { type: "role", value: "tech_lead" }),
      ],
      { inputs: inputsFeature, labels: { stage: "design" } },
    ),
  ),
  template(
    "sdlc-implementation",
    SDLC,
    "sdlc-implementation",
    "SDLC · 编码实现",
    "AI 编码、CI 校验与实现确认。",
    doc(
      "sdlc-implementation",
      "SDLC · 编码实现",
      "编码实现阶段模板",
      [
        agent("code", [], "为 ${inputs.feature} 生成实现并提交 PR"),
        mcpTool("ci", ["code"], "ci", "run_pipeline", { ref: "${steps.code.output.ref}" }),
      ],
      { inputs: inputsFeature, labels: { stage: "implementation" } },
    ),
  ),
  template(
    "sdlc-testing",
    SDLC,
    "sdlc-testing",
    "SDLC · 测试验证",
    "自动化测试、缺陷修复与测试签核。",
    doc(
      "sdlc-testing",
      "SDLC · 测试验证",
      "测试验证阶段模板",
      [
        agent("test", [], "执行 ${inputs.feature} 的测试计划并汇总结果"),
        condition("gate", ["test"], [{ when: '${steps.test.status} == "succeeded"', next: "signoff" }], "fix"),
        humanApproval("signoff", ["gate"], "确认测试通过", { type: "role", value: "qa_lead" }),
        agent("fix", ["gate"], "分析失败用例并给出修复建议"),
      ],
      { inputs: inputsFeature, labels: { stage: "testing" } },
    ),
  ),
  template(
    "sdlc-deployment",
    SDLC,
    "sdlc-deployment",
    "SDLC · 发布上线",
    "发布审批、灰度发布与回滚补偿。",
    doc(
      "sdlc-deployment",
      "SDLC · 发布上线",
      "发布上线阶段模板",
      [
        humanApproval("approve", [], "确认发布窗口与变更", { type: "role", value: "release_manager" }),
        mcpTool("release", ["approve"], "deploy", "rollout", { version: "${run.id}" }, { compensate: "rollback" }),
        mcpTool("rollback", [], "deploy", "rollback", { version: "${run.id}" }),
      ],
      { inputs: inputsFeature, labels: { stage: "deployment" } },
    ),
  ),
  template(
    "sdlc-operations",
    SDLC,
    "sdlc-operations",
    "SDLC · 运维巡检",
    "监控、等待观察窗口与巡检报告。",
    doc(
      "sdlc-operations",
      "SDLC · 运维巡检",
      "运维巡检阶段模板",
      [
        agent("monitor", [], "检查 ${inputs.feature} 的关键指标与告警"),
        timer("observe", ["monitor"], "5m"),
        agent("report", ["observe"], "生成巡检报告与后续行动项"),
      ],
      { inputs: inputsFeature, labels: { stage: "operations" } },
    ),
  ),
  template(
    "cs-ticket-triage",
    CUSTOMER,
    "cs-ticket-triage",
    "客服 · 工单分诊",
    "Webhook 接入工单，AI 分诊并按紧急度升级人工。",
    doc(
      "cs-ticket-triage",
      "客服 · 工单分诊",
      "客服工单分诊模板",
      [
        agent("triage", [], "阅读工单 ${inputs.ticket_id} 并判断紧急度"),
        condition("urgency", ["triage"], [{ when: 'contains(${steps.triage.output.text}, "urgent")', next: "escalate" }], "reply"),
        humanApproval("escalate", ["urgency"], "紧急工单人工升级", { type: "role", value: "support_lead" }),
        mcpTool("reply", ["urgency"], "helpdesk", "reply", { ticket_id: "${inputs.ticket_id}" }),
        agent("close", ["reply"], "总结工单并建议知识库更新"),
      ],
      { inputs: inputsTicket, trigger: webhook("cs-ticket", "cs_webhook_secret"), labels: { channel: "support" } },
    ),
  ),
  template(
    "cs-approval",
    APPROVAL,
    "cs-approval",
    "审批 · 通用审批",
    "经理审批 + 通知，支持驳回（触发 Saga 补偿）。",
    doc(
      "cs-approval",
      "审批 · 通用审批",
      "通用审批模板",
      [
        humanApproval("approve", [], "审批申请 ${inputs.request_id}", { type: "role", value: "manager" }),
        mcpTool("notify", ["approve"], "notify", "send", { request_id: "${inputs.request_id}" }, { compensate: "revoke_notify" }),
        mcpTool("revoke_notify", [], "notify", "revoke", { request_id: "${inputs.request_id}" }),
      ],
      { inputs: inputsRequest, labels: { category: "approval" } },
    ),
  ),
  template(
    "data-pipeline",
    DATA,
    "data-pipeline",
    "数据 · 管道任务",
    "抽取、转换、加载与质量校验。",
    doc(
      "data-pipeline",
      "数据 · 管道任务",
      "数据管道模板",
      [
        timer("schedule", [], "1m"),
        agent("extract", ["schedule"], "抽取任务 ${inputs.job_id} 的数据并校验 schema"),
        mcpTool("load", ["extract"], "warehouse", "load", { job_id: "${inputs.job_id}" }, { compensate: "cleanup" }),
        mcpTool("cleanup", [], "warehouse", "cleanup", { job_id: "${inputs.job_id}" }),
      ],
      { inputs: inputsJob, labels: { domain: "data" } },
    ),
  ),
  template(
    "ops-incident",
    OPS,
    "ops-incident",
    "运维 · 故障响应",
    "并行诊断/通知、复盘与人工确认。",
    doc(
      "ops-incident",
      "运维 · 故障响应",
      "故障响应模板",
      [
        parallel("triage", [], ["diagnose", "notify"], "all"),
        agent("diagnose", [], "诊断故障 ${inputs.incident_id} 并给出根因假设"),
        mcpTool("notify", [], "oncall", "page", { incident_id: "${inputs.incident_id}" }),
        agent("postmortem", ["triage"], "撰写 ${inputs.incident_id} 复盘初稿"),
        humanApproval("confirm", ["postmortem"], "确认复盘与行动项", { type: "role", value: "sre_lead" }),
      ],
      { inputs: inputsIncident, trigger: webhook("ops-incident", "ops_webhook_secret"), labels: { severity: "p1" } },
    ),
  ),
  template(
    "digital-human-reception",
    DIGITAL_HUMAN,
    "digital-human-reception",
    "数字人 · 前台接待",
    "数字人问候、访客登记与人工确认。",
    doc(
      "digital-human-reception",
      "数字人 · 前台接待",
      "数字人接待模板",
      [
        agent("greet", [], "以数字人形象问候访客 ${inputs.visitor_name} 并说明流程"),
        {
          id: "render",
          type: "render",
          needs: ["greet"],
          app_id: "00000000-0000-4000-8000-000000000010",
          script: "欢迎 ${inputs.visitor_name} 到访，请稍候。",
          avatar: "default-avatar",
          voice: "default-voice",
        },
        mcpTool("register", ["render"], "frontdesk", "register_visitor", { visitor_name: "${inputs.visitor_name}" }),
        humanApproval("confirm", ["register"], "确认访客接待结果", { type: "role", value: "receptionist" }),
      ],
      { inputs: inputsVisitor, labels: { channel: "lobby" } },
    ),
  ),
];
