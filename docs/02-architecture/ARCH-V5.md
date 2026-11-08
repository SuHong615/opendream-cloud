# OpenDream Cloud 架构设计 V5（研究后最终版）

> 架构模型：**4 个功能平面 + 1 个横切质量平面 + 基础设施**。
> 不是线性五层。
> 研究依据：[SYNTHESIS](research/SYNTHESIS.md) · 总纲：[AI Native OS](../00-program/AI-NATIVE-OS.md)
> 实现约束：[平面契约 v1](PLANE-CONTRACT.md) · [ADR-018](adr/ADR-018-ai-native-planes.md)

## 1. 平面架构

```text
┌──────────────────────────────────────────────────────────────────┐
│ 应用平面：数字军团指挥中心                                       │
│ 数字孪生态势 / 编制 / 资源 / 风险 / 干预 / 复盘 / 组合           │
│ 只读投影 + 幂等控制命令                                          │
├──────────────────────────────────────────────────────────────────┤
│ 编排平面：LoopForge                                              │
│ SOP / Role / Squad / Legion / LegionRun / Gate / Event History   │
├──────────────────────────────────────────────────────────────────┤
│ 工程平面：OpenCode Harness                                       │
│ 一个 Harness 协议，两种运行时（云端/端侧）                       │
├──────────────────────────────────────────────────────────────────┤
│ 执行平面：AgentCore Runtime                                      │
│ Session/Run/Tool/Workspace/Sandbox/State/Memory + 边界 PEP       │
├──────────────────────────────────────────────────────────────────┤
│ 横切：AgentLoop 质量/治理平面                                    │
│ Trace/审计/Eval/Dataset/Experiment/Replay/Backtest/Policy        │
├──────────────────────────────────────────────────────────────────┤
│ 基础设施：模型/MCP/Skill/Prompt/Identity/Audit/Quota/Storage     │
└──────────────────────────────────────────────────────────────────┘
```

## 2. 平面所有权

| 平面 | 拥有 | 不拥有 |
| --- | --- | --- |
| AgentCore | Session/Run、工具/MCP 路由、Workspace/Sandbox、State/Memory、模型网关、Gateway/Identity/Policy PEP、OTEL | 业务流程、评测、指挥 |
| OpenCode Harness | 会话、工具循环、权限、MCP 客户端、云/端 workspace、Session/Event 契约 | 跨会话 SOP、角色编制、审批台账 |
| LoopForge | SOP、Role、Squad/Legion、Requirement/LegionRun、Gate、重试补偿、事件历史 | 运行时、沙箱、评测 |
| AgentLoop | Trace、审计、Eval、Dataset、Experiment、Replay/Backtest、Policy 验证、门禁 | Agent 执行、沙箱生命周期、工具路由 |
| 指挥中心 | 数字孪生投影、态势、风险、干预命令、复盘、组合 | 执行 Agent、编排状态、评测 |
| 基础设施 | 模型/MCP/Skill/Prompt/身份/审计/配额/存储 | 业务逻辑 |

**硬约束**：
- 指挥中心只发命令，经 LoopForge/AgentCore 执行；
- AgentLoop 跨平面消费 Trace，不复制运行时；
- Harness 协议化，云沙箱由 AgentCore 提供；
- MCP 策略在网关/沙箱 PEP 执行（deny-by-default）。

### 2.1 唯一调用关系

```text
Command ──幂等命令──▶ LoopForge ──Run API──▶ AgentCore
                         │                    ▲
                         │ QualityGate 请求    │ ExecutionProvider
                         ▼                    │
                      AgentLoop          OpenCode Harness
```

- LoopForge **不直连 Harness**；Harness 作为 AgentCore 的 ExecutionProvider/协议实现。
- 审批唯一事实源：LoopForge Approval；AgentLoop 只出 QualityGate verdict；Command 只发干预命令。
- 策略唯一执行点：AgentCore Gateway（含 MCP Gateway）；AgentLoop 只定义/验证策略。
- 详细契约：[PLANE-CONTRACT](PLANE-CONTRACT.md) · [ADR-018](adr/ADR-018-ai-native-planes.md)。

## 3. 接口契约

```text
AgentCore:
  POST /runtime/sessions
  POST /runtime/sessions/{id}/runs
  POST /runtime/runs/{id}/cancel
  GET  /runtime/runs/{id}
  POST /runtime/tools/register

Harness:
  POST /harness/sessions
  GET  /harness/sessions/{id}/events
  POST /harness/permissions/{id}/decision
  POST /harness/workspaces/{id}/snapshot

LoopForge:
  POST /orchestration/sops
  POST /orchestration/sops/{id}/versions
  POST /orchestration/legions
  POST /orchestration/legion-runs
  POST /orchestration/gates/{id}/decision

AgentLoop:
  POST /quality/traces
  POST /quality/eval-runs
  POST /quality/experiments
  POST /quality/backtests
  POST /quality/policies/evaluate

Command:
  GET  /command/fronts
  POST /command/interventions
  GET  /command/reviews
```

## 4. 事件模型

```text
agent.session.started
agent.step.completed
agent.tool.called
harness.permission.asked/decided
loopforge.run.started
loopforge.gate.waiting_human
loopforge.run.completed
agentloop.eval.completed
agentloop.backtest.completed
agentloop.policy.denied
command.risk.raised
command.intervention.issued
```

事件用于：
- AgentLoop 质量分析；
- 指挥中心数字孪生投影；
- 审计与成本；
- 复盘。

## 5. 数据模型

```text
AgentCore: Session, Run, Step, ToolCall, Workspace, Snapshot, Memory
Harness: HarnessSession, PermissionDecision, WorkspaceSnapshot
LoopForge: SOP, SOPVersion, Role, Squad, Legion, LegionRun, Gate, Artifact
AgentLoop: Trace, Span, EvalDataset, EvalRun, Experiment, Backtest, PolicyDecision
Command: Mission, Front, Formation, Risk, Intervention, Review
```

所有表带 `org_id`；事件带 `tenant_id/run_id/trace_id`。

## 6. 部署

### 6.1 本地/试点

Docker Compose：console/control-plane/agent-workforce/workflow/mcp/skill/eval/experiment/app/memory/gateway/postgres。

### 6.2 生产 K8s

```text
Ingress → Console / Control Plane
        → AgentCore Runtime (≥3)
        → OpenCode Harness (cloud/edge gateway)
        → LoopForge (orchestration workers)
        → AgentLoop (trace/eval/experiment)
        → Command Center (read model/query)
        → NATS / Redis / Postgres HA / MinIO
        → Sandbox namespace per tenant
        → Prometheus/Grafana/Loki/Tempo
        → Vault/Keycloak
```

## 7. 安全

- OIDC/Keycloak、RBAC、租户隔离；
- Vault/KMS 凭证；
- 沙箱 microVM/gVisor、无宿主 socket、NetworkPolicy；
- AgentLoop 策略/审计/PII；
- MCP PEP deny-by-default；
- 供应链/许可证。

## 8. 当前实现差距

| 目标 | 当前 | 差距 |
| --- | --- | --- |
| AgentCore Runtime | agent-workforce/workflow/workspace 混合 | 抽 Session/Run/Tool/Sandbox |
| AgentLoop | eval/experiment/observability 分散 | 统一 Trace/Eval/Dataset/Experiment/Backtest |
| Harness | 控制台+桌面 | 协议/云沙箱/权限 |
| LoopForge | 页面 + 内存/部分 DB | 事件历史/信号/定时器/补偿 |
| 指挥中心 | 概览/Insights | 投影/干预/复盘 |
| 数据 | SQLite+PG overlay | PG 主库/NATS |

## 9. 迁移

1. 固化平面契约/事件/所有权；
2. 抽 AgentCore Runtime；
3. 统一 AgentLoop；
4. Harness 协议 + 云/端；
5. LoopForge 持久化；
6. 指挥中心投影；
7. PG/NATS/HA。

> 重构：[REFACTOR-PLAN](../04-reviews/REFACTOR-PLAN.md)
