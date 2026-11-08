# AI Native 平面契约 v1（P0）

> 状态：架构审查 P0 收敛文件。未经本契约允许，禁止跨平面写资源。
> 依据：[AI Native 总纲](../00-program/AI-NATIVE-OS.md) · [架构 V5](ARCH-V5.md) · [独立评审](../04-reviews/AI-NATIVE-ARCH-REVIEW.md)
> 术语 MUST/SHOULD/MAY 按 RFC 2119 理解。

## 1. 唯一所有权矩阵

| 资源 | 唯一 Owner（写） | 只读消费方 | 禁止 |
| --- | --- | --- | --- |
| Session / Run / Step / ToolCall | **AgentCore** | Harness、LoopForge、AgentLoop、Command | Harness/LoopForge 直接写运行状态 |
| Workspace / Sandbox / Snapshot | **AgentCore** | Harness、LoopForge、AgentLoop | Harness 直接创建云沙箱；LoopForge 直接操作工作区 |
| PolicyDecision / PEP | **AgentCore（边界 PEP）** | AgentLoop、审计、Command | 在 prompt/业务代码中做策略执行 |
| HarnessSession / PermissionDecision | **OpenCode Harness（协议层）** | AgentCore（本地会话）、审计 | Harness 写 LegionRun/SOP |
| SOP / SOPVersion / Role / Squad / Legion | **LoopForge** | Command、AgentLoop | Harness/AgentCore 写业务编排 |
| LegionRun / Gate / Approval | **LoopForge（唯一审批事实源）** | Command、AgentLoop、AgentCore | AgentLoop/Command 另建审批表 |
| Trace / EvalDataset / EvalRun / Experiment / Backtest / QualityGate | **AgentLoop** | LoopForge（门禁结果）、Command | LoopForge 自定义评测结果替代 AgentLoop |
| Mission / Front / Intervention / Review / TwinProjection | **Command Center** | 高管看板 | Command 直接写 Run/Approval |
| Model / MCP Registry / Skill / Prompt / Identity / Audit / Quota | **Capability/Governance** | 所有平面 | 各平面自建模型/MCP 注册表 |

**硬规则**：
1. 每个资源只有一个写入口；跨平面只读或发命令。
2. 工作区/沙箱/运行状态只能由 AgentCore 写。
3. 审批只能由 LoopForge Approval 写；AgentLoop 的 QualityGate 只写评测结论，不写审批决策。
4. 策略只能由 AgentCore PEP 执行；AgentLoop 只做策略定义/验证。
5. Command 只能向 LoopForge 发幂等命令，不直接改 Run 状态。

## 2. 平面调用关系（修正）

```text
Command Center
   │ 只读投影 / 幂等命令
   ▼
LoopForge ──只调用──▶ AgentCore Runtime
   │                    ▲
   │ 质量门禁请求        │ 执行/沙箱/工具
   ▼                    │
AgentLoop ──Trace───────┘
                        ▲
OpenCode Harness ───────┘
   （协议/客户端；云侧沙箱由 AgentCore 提供，不直接写）
```

- LoopForge **不直连 Harness**；Harness 作为 AgentCore 的 ExecutionProvider/协议实现。
- AgentLoop 不执行 Agent，只消费 Trace/输出质量结论。
- Command 不直接调用 Harness/AgentCore；只调 LoopForge 命令 API。

## 3. API 契约

### 3.1 通用规则

所有平面 API MUST：
- 使用 `Authorization: Bearer <session/service-token>`；
- 使用 `X-OC-Tenant: <org_id>`；
- 写操作必须带 `Idempotency-Key`；
- 返回 `X-Request-Id`；
- 错误体：`{ error: { code, message, request_id, details? } }`；
- 租户不匹配返回 `404`（不泄露存在性）；
- 分页 `cursor/limit`，列表带 `next_cursor`。

### 3.2 AgentCore Runtime

```http
POST /api/v1/runtime/sessions
  { workspace: {mode: "cloud"|"local", repo?, snapshot_id?}, agent: {role_ref?, model_ref?, executor?} }
  → 201 {session_id, state:"created", workspace_id, created_at}

POST /api/v1/runtime/sessions/{session_id}/runs
  Idempotency-Key required
  { input, tools?, policy_context? }
  → 202 {run_id, state:"queued"}

GET /api/v1/runtime/runs/{run_id}
  → {run_id, state, steps[], artifacts[], usage, policy_decisions[]}

POST /api/v1/runtime/runs/{run_id}/cancel
  Idempotency-Key required
  → 202 {state:"canceling"|"canceled"}
```

**状态机**：
```text
session: created → active → closing → closed
run: queued → running → waiting_tool → running → succeeded
                         → waiting_human? (不允许；人工门禁归 LoopForge)
                         → failed/canceled
```
**约束**：AgentCore MUST NOT 创建人工审批；Human Gate 由 LoopForge 创建。

### 3.3 OpenCode Harness

```http
POST /api/v1/harness/sessions
  {mode:"local"|"cloud", workspace_ref, permissions}
  → {harness_session_id, runtime_session_id?}

GET /api/v1/harness/sessions/{id}/events
  SSE: event envelope

POST /api/v1/harness/permissions/{decision_id}/decide
  Idempotency-Key required
  {decision:"allow_once"|"allow_always"|"deny"}
```

**约束**：Harness MUST NOT 创建云 Sandbox；cloud 模式请求 `runtime_session_id` 由 AgentCore 提供。Harness MUST NOT 写 Run/Approval。

### 3.4 LoopForge

```http
POST /api/v1/orchestration/sops
POST /api/v1/orchestration/sops/{id}/versions
POST /api/v1/orchestration/legions
POST /api/v1/orchestration/legion-runs
POST /api/v1/orchestration/gates/{approval_id}/decision
  Idempotency-Key required
  {decision:"approved"|"rejected"|"send_back", target_node?, reason?}
```

**约束**：
- LoopForge MUST 通过 AgentCore API 执行；禁止直接调用 Harness/沙箱；
- Gate 审批唯一事实源为 `approval_id`；
- 审批决策产生 `approval.decided` 事件，Command/AgentLoop 只读。

### 3.5 AgentLoop

```http
POST /api/v1/quality/traces
POST /api/v1/quality/eval-runs
POST /api/v1/quality/experiments
POST /api/v1/quality/backtests
GET  /api/v1/quality/gates/{gate_id}
```

**约束**：
- AgentLoop MUST NOT 写 Run/Approval；
- QualityGate 返回 `{gate_id, version_ref, metrics, verdict}`；LoopForge 根据 verdict 决定发布/阻断；
- 评测数据集 MUST 租户隔离，PII 默认脱敏。

### 3.6 Command Center

```http
GET  /api/v1/command/fronts
POST /api/v1/command/interventions
  Idempotency-Key required
  {mission_id, target_run_id, action:"pause"|"resume"|"send_back"|"takeover"|"reassign", reason}
GET  /api/v1/command/reviews
```

**约束**：
- 干预只向 LoopForge 发命令；不可逆动作（takeover/terminate）MUST 二次确认 + 审计；
- Command MUST NOT 双写 Run/Approval。

## 4. 审批与策略唯一化

### 4.1 审批

- **唯一审批事实源**：LoopForge `Approval`（`approval_id`）。
- AgentLoop **QualityGate** 只给评测结论，不产生审批决策。
- Command **Intervention** 是操作命令，不是审批；若需审批，创建 LoopForge Approval。
- 所有审批必须记录：`approval_id/run_id/gate/actor/decision/reason/at/policy_decision_id`。

### 4.2 策略执行点（PEP）

- **唯一 PEP**：AgentCore Gateway（含 MCP Gateway）在工具调用边界执行。
- AgentLoop 只定义/验证策略，不执行策略；不得在 Prompt 中实现策略。
- `policy_decision_id` MUST 进入 ToolCall/Trace/Audit。
- 沙箱侧兜底（网络/文件权限）属于 AgentCore，不是第二策略源。

## 5. 事件契约 v1

### 5.1 信封

```json
{
  "specversion": "1.0",
  "id": "evt_...",
  "type": "loopforge.gate.waiting",
  "source": "loopforge",
  "subject": "legion_run/legr_...",
  "tenant_id": "org_...",
  "time": "2026-11-18T00:00:00Z",
  "sequence": 42,
  "trace_id": "...",
  "data": {}
}
```

### 5.2 事件目录（唯一）

| type | Owner | subject | data |
| --- | --- | --- | --- |
| `agent.run.started` | AgentCore | run/{id} | session/workspace/agent refs |
| `agent.step.completed` | AgentCore | run/{id} | step, status, usage |
| `agent.tool.called` | AgentCore | run/{id} | tool, policy_decision_id |
| `harness.permission.decided` | Harness | session/{id} | decision, tool |
| `loopforge.run.started` | LoopForge | legion_run/{id} | legion, sop_version |
| `loopforge.gate.waiting` | LoopForge | approval/{id} | gate, run, sla |
| `loopforge.approval.decided` | LoopForge | approval/{id} | decision, actor |
| `quality.eval.completed` | AgentLoop | eval/{id} | metrics, verdict |
| `quality.backtest.completed` | AgentLoop | backtest/{id} | dataset, metrics |
| `command.intervention.issued` | Command | intervention/{id} | action, target |
| `command.risk.raised` | Command | mission/{id} | risk, severity |

**规则**：
- 事件类型版本化（`v1`），不兼容变更升版；
- event_id 幂等；消费者 MUST 去重；
- Command TwinProjection 只消费事件，不反写；
- 保留期：Trace 30d（默认，可配）、审计 1y、TwinSnapshot 90d；
- PII 默认脱敏；跨租户事件不可见。

## 6. 状态机

```text
LegionRun: planned → running → waiting_human → running → completed
                ↓                     ↓
             failed               canceled

Approval: pending → approved | rejected | sent_back
          sent_back → pending (new request_id)

QualityGate: pending → passed | failed | blocked
```

- `waiting_human` 只由 LoopForge 产生；
- `Approval` 决策必须幂等；重复决策返回同一结果；
- `sent_back` 不销毁 Run，重置目标节点。

## 7. 数据与迁移

- 所有表含 `org_id`；RLS/行级过滤强制。
- `Run` 唯一定义在 AgentCore schema；LoopForge 只存 `run_id` 引用，不复制 Run 表。
- 迁移：SQLite→Postgres，双写期按平面灰度；保留回滚点。
- 审计写入独立表，不可篡改存储。

## 8. 契约测试（必须）

1. 同一资源仅一个写入口：跨平面写返回 403/404。
2. 重复 `Idempotency-Key` 返回同一结果。
3. 审批：三处（LoopForge/AgentLoop/Command）读取同一 `approval_id`；重复决策幂等。
4. PEP：绕过 Gateway 的工具调用失败；`policy_decision_id` 可追踪。
5. 事件：重复投递去重；跨租户事件不可见；回放确定性。
6. 状态机：非法迁移 409；Command 不能直接改 Run。
7. PII：Trace/Dataset 脱敏测试通过。

## 9. P0 关闭标准

- 本契约与总纲/ARCH-V5 0 处矛盾；
- 唯一所有权矩阵通过评审；
- 审批/PEP 唯一化；
- 事件目录 v1 + conformance 测试；
- ADR 记录“内部概念/适配器/自建”决策。

> 未通过上述标准，不得开始平面实现或目录重构。
