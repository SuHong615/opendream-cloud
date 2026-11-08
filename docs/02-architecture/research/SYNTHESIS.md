# AI Native 架构研究合并与审视（SYNTHESIS）

> 研究小组：architect（AgentCore/AgentLoop）、capability-centers（OpenCode/LoopForge）、pm-research（企业指挥中心）。
> 输入：
> - [AGENTCORE-AGENTLOOP.md](AGENTCORE-AGENTLOOP.md)
> - [OPENCODE-LOOPFORGE.md](OPENCODE-LOOPFORGE.md)
> - [ENTERPRISE-COMMAND.md](ENTERPRISE-COMMAND.md)
>
> 结论：**保留用户提出的组件，但放弃“五层线性堆叠”的表达**。最终采用 **4 个功能平面 + 1 个横切质量平面 + 基础设施**。

## 1. 研究结论摘要

### 1.1 AgentCore 不是一个“单层运行时”

AWS Bedrock AgentCore 公开为 13 个可独立服务：Harness、Runtime、Memory、Gateway、Identity、Code Interpreter、Browser、Observability、Evaluations、Optimization、Policy、Registry、Payments。Runtime 以“每 session 独立 microVM”为核心，Gateway/Identity/Policy 提供边界治理原语。

**判断**：AgentCore 是“**执行面 + 边界治理原语**”的产品化打包，横跨执行/控制/数据多个平面，不能简单当作五层中的一层。

### 1.2 阿里云 AgentLoop 是真实的质量治理平面

阿里云 AgentLoop（Agent Observation and Optimization）提供：
- 全栈可观测（trace/metrics/logs、拓扑、诊断）；
- 防篡改行为审计；
- Agent-as-a-Judge 评测；
- 在线实验（Playground，计划 GA）；
- 数据集/Trace2Dataset；
- Memory/资产/上下文优化。

它**不绑定运行时**，兼容 AgentRun/AgentTeams/ACS 与第三方框架。

**判断**：AgentLoop 是**跨运行时的质量/治理平面**，不是 Agent 的“感知-规划-行动”循环，也不是某一层的相邻层。

### 1.3 OpenCode Harness 是“一个协议、两种运行时”

OpenCode 提供 server/TUI/SDK/agents/permissions/MCP；其 workspace 是本地目录/worktree，不是云沙箱。LoopForge 把 Main Bot、Role、SOP、Docker sandbox、Git、审批、insights 放在一个自托管产品里，适合可信团队/单实例。

**判断**：
- **Harness 层**管“Agent 怎么跑”：会话、工具循环、权限、MCP、本地工作区；
- **编排层**管“团队怎么按 SOP 交付”：流程、角色、门禁、重试补偿、证据；
- OpenDream 应做“一个 Harness 协议、两种运行时”：端侧本地 server + 云侧托管 server/平台沙箱；
- LoopForge 需补 Temporal 式事件历史/信号/定时器/补偿，不能只做 DAG。

### 1.4 指挥中心是应用层“驾驶舱”，不是编排/运行时

Palantir（Ontology/数字孪生）、Microsoft（Agent 控制面）、ServiceNow（Control Tower）、UiPath（实时实例干预）、Celonis（DToO）、Agentforce（业务内嵌 Agent）各自覆盖 1–2 层。

**判断**：
- 没有一家把“Agent 军团 + 任务态势 + 运行级干预 + 复盘 + 组合 + 数字孪生”合成为军团指挥中心；
- 指挥中心应**只读态势 + 幂等控制命令**，不直接执行 Agent、不双写编排状态；
- 这是 OpenDream 的差异化应用层机会。

## 2. 对“五层线性架构”的审视

| 原假设 | 研究结论 | 修正 |
| --- | --- | --- |
| AgentCore 是运行时层 | AgentCore 同时包含 Runtime + Gateway/Identity/Policy/Memory/Observability/Evaluations | 定义为**执行平面 + 边界原语**，不强行归为一层 |
| AgentLoop 是相邻层 | 跨运行时质量平面 | 定义为**横切质量/治理平面** |
| OpenCode Harness 在 AgentLoop 之上 | Harness 是工程协议，与质量平面正交 | 定义为**工程平面**，通过 Trace 与 AgentLoop 交接 |
| LoopForge 只是流程编排 | 需持久化事件历史/信号/定时器/补偿 | 定义为**持久化编排平面**，构建在 AgentCore 上 |
| 指挥中心是应用层 | 正确，但需“数字孪生 + 指挥 + 干预” | 定义为**应用平面**，只读投影 + 控制命令 |

**结论**：组件名称保留，但架构表达改为**平面（plane）**，避免“谁在谁上面”的误导。

## 3. 最终架构：4 + 1 + 1

```text
┌──────────────────────────────────────────────────────────────────┐
│ 应用平面：数字军团指挥中心                                       │
│ Digital Twin Command Center：态势/编制/资源/风险/干预/复盘/组合  │
│ 只读投影 + 幂等控制命令；不持有编排状态                          │
├──────────────────────────────────────────────────────────────────┤
│ 编排平面：LoopForge                                              │
│ SOP/角色/门禁/重试补偿/事件历史/定时器/信号；构建在 AgentCore    │
├──────────────────────────────────────────────────────────────────┤
│ 工程平面：OpenCode Harness                                       │
│ 一个 Harness 协议，两种运行时（云端/端侧）；不定义业务流程       │
├──────────────────────────────────────────────────────────────────┤
│ 执行平面：AgentCore Runtime                                      │
│ Session/Run/Tool/Workspace/Sandbox/State/Memory；边界 PEP        │
├──────────────────────────────────────────────────────────────────┤
│ 横切：AgentLoop 质量/治理平面                                    │
│ Trace/审计/评测/数据集/实验/回放/回测/安全；发布门禁              │
├──────────────────────────────────────────────────────────────────┤
│ 基础：模型/MCP/Skill/Prompt/身份/审计/配额/存储                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 关键接口

| 边界 | 输入 | 输出 | 约束 |
| --- | --- | --- | --- |
| Harness ↔ AgentCore | Session/Run 请求、工具/工作区规格 | 事件流、结果、快照 | Harness 不直接管理云沙箱；通过 Runtime API |
| LoopForge ↔ AgentCore | SOP 步骤、角色、输入 | Run/Step 事件、Artifact | 编排不实现运行时 |
| LoopForge ↔ Harness | 角色/工具/工作区需求 | 执行入口/会话 | 编排不解析 token/工具协议 |
| AgentCore/Harness ↔ AgentLoop | OTEL Trace、版本、策略决策 | 评分、门禁、实验结论 | 质量平面不执行 Agent |
| 指挥中心 ↔ 各平面 | 事件投影 | 态势/干预命令 | 只读投影 + 幂等命令 |
| MCP Gateway ↔ AgentCore | MCP 工具调用 | 工具结果/策略决策 | PEP 外置，deny-by-default |

### 3.2 数据/事件模型

```text
AgentCore: Session, Run, Step, ToolCall, Workspace, Snapshot
Harness:   HarnessSession, PermissionDecision, WorkspaceSnapshot
LoopForge: SOP, SOPVersion, Role, Squad, Legion, LegionRun, Gate, Artifact
AgentLoop: Trace, Span, EvalDataset, EvalRun, Experiment, Backtest, PolicyDecision
Command:   Mission, Front, Formation, Risk, Intervention, Review
```

关键事件：
- `agent.session.started`、`agent.step.completed`、`agent.tool.called`
- `harness.permission.asked/decided`
- `loopforge.run.started/step.waiting_human/run.completed`
- `agentloop.eval.completed/backtest.completed/policy.denied`
- `command.risk.raised/intervention.issued`

## 4. 与当前实现的差距

| 平面 | 当前 | 差距 |
| --- | --- | --- |
| AgentCore | agent-workforce/workflow/workspace 混合 | 抽 Session/Run/Tool/Sandbox/State |
| AgentLoop | eval/experiment/observability 分散 | 统一 Trace/Eval/Dataset/Experiment/Policy/Backtest |
| OpenCode Harness | 控制台工作区 + 桌面端 | 统一 Harness 协议/云端沙箱/权限 |
| LoopForge | 页面 + 内存/部分 DB | 持久化事件历史/信号/定时器/补偿 |
| 指挥中心 | 概览/Insights | 数字孪生投影 + 干预命令 |
| 数据 | SQLite + PG overlay | PG 主库 + Outbox/NATS |

## 5. 设计决策（建议 ADR）

1. **ADR-01 平面模型**：采用 4+1+1 平面，不采用线性五层。
2. **ADR-02 AgentCore 边界**：Runtime + 边界 PEP；不内置业务编排。
3. **ADR-03 AgentLoop 横切**：Trace/Eval/Experiment/Backtest 统一，跨运行时。
4. **ADR-04 Harness 协议**：一个协议，两种运行时；云沙箱由 AgentCore 提供。
5. **ADR-05 LoopForge 持久化**：引入事件历史/信号/定时器/补偿（Temporal 式）。
6. **ADR-06 指挥中心只读投影**：命令幂等，禁止双写编排状态。
7. **ADR-07 MCP PEP 外置**：网关/沙箱边界执行策略，deny-by-default。
8. **ADR-08 回放/回测/仿真分家**：确定性回放、数据集回测、LLM 仿真。

## 6. 路线

| 阶段 | 目标 |
| --- | --- |
| P0 契约 | 固化平面接口/事件/所有权；停止跨平面写入 |
| P1 AgentCore + Harness | Runtime 抽象、Harness 协议、云/端双运行时 |
| P2 LoopForge + AgentLoop | 持久化编排、Trace/Eval/Experiment/Backtest 门禁 |
| P3 指挥中心 | 数字孪生投影、干预、复盘、组合 |
| P4 生产化 | PG/NATS/K8s HA/SSO/安全 |

## 7. 研究局限

- AWS/阿里云部分页面需登录/付费，事实以公开文档为准；
- LoopForge 快速演进，引用 README/architecture 当日版本；
- 企业指挥中心多为营销页，功能矩阵中 `◐` 为推断；
- 未做真实产品试用/压测，后续需 PoC 验证。

> 最终总纲更新：[AI-NATIVE-OS](../../00-program/AI-NATIVE-OS.md)

## 8. 独立评审与收敛

独立评审：[AI-NATIVE-ARCH-REVIEW](../../04-reviews/AI-NATIVE-ARCH-REVIEW.md)（PASS-WITH-ACTIONS）。

评审指出的 P0：
1. 唯一所有权矩阵 + 平面契约；
2. 命名/复用/自建 ADR；
3. PEP 与审批唯一化；
4. 事件/数据契约 v1。

已收敛：
- [PLANE-CONTRACT](../../02-architecture/PLANE-CONTRACT.md)：唯一 owner、API 规则、状态机、事件目录、审批/PEP 唯一化、RLS/PII、契约测试；
- [ADR-018](../../02-architecture/adr/ADR-018-ai-native-planes.md)：内部概念 vs 外部适配 vs 自建；
- [闭环记录](../../04-reviews/AI-NATIVE-ARCH-REVIEW-RESOLUTION.md)：P0 关闭、P1 状态。

P1 未闭合：文件级迁移计划、durable execution 详规、质量 SLO/成本、市场空位客户验证。**进入代码重构前必须先完成 P1-1 迁移矩阵。**
