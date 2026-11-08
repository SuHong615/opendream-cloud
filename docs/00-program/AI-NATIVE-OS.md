# OpenDream Cloud：AI Native 基础设施总纲（研究后最终版）

> 版本：v1.0（经 AI Native 研究小组独立调研与评审）
> 研究输入：[AgentCore/AgentLoop](research/AGENTCORE-AGENTLOOP.md) · [OpenCode/LoopForge](research/OPENCODE-LOOPFORGE.md) · [企业指挥中心](research/ENTERPRISE-COMMAND.md) · [合并审视](research/SYNTHESIS.md)
>
> **重要修正**：保留 AgentCore、AgentLoop、OpenCode Harness、LoopForge、军团指挥中心五个组件，但放弃“五层线性堆叠”。最终采用 **4 个功能平面 + 1 个横切质量平面 + 基础设施**。

## 1. 一句话定义

**OpenDream Cloud 是企业 AI Native 基础设施：**

> 以 **AgentCore** 提供 Agent 运行时与边界治理原语，以 **AgentLoop** 提供跨运行时的可观测/评测/实验/安全/回测质量平面，以 **OpenCode Harness** 提供云端与端侧统一的 Harness 工程协议，以 **LoopForge** 在 AgentCore 之上提供持久化流程编排与角色数字人，以 **数字军团指挥中心** 作为应用层数字孪生指挥作战中心，承载任何业务的 AI Native 应用。

## 2. 最终架构：4 + 1 + 1

```text
┌────────────────────────────────────────────────────────────────────┐
│ 应用平面：数字军团指挥中心                                         │
│ 态势 / 编制 / 资源 / 风险 / 审批 / 干预 / 复盘 / 组合              │
│ 只读投影 + 幂等控制命令；不持有编排状态                            │
├────────────────────────────────────────────────────────────────────┤
│ 编排平面：LoopForge                                                │
│ SOP / 角色数字人 / 小队/军团 / 人工门禁 / 重试补偿 / 事件历史      │
│ 构建在 AgentCore 之上                                              │
├────────────────────────────────────────────────────────────────────┤
│ 工程平面：OpenCode Harness                                         │
│ 一个 Harness 协议，两种运行时（云端 / 端侧）                       │
│ 会话 / 工具循环 / 权限 / MCP / 工作区；不定义业务流程              │
├────────────────────────────────────────────────────────────────────┤
│ 执行平面：AgentCore Runtime                                        │
│ Session / Run / Tool / Workspace / Sandbox / State / Memory        │
│ 边界 PEP（Gateway/Identity/Policy）；不做业务编排                  │
├────────────────────────────────────────────────────────────────────┤
│ 横切质量平面：AgentLoop                                            │
│ Trace / 审计 / 评测 / 数据集 / 实验 / 回放 / 回测 / 安全门禁       │
├────────────────────────────────────────────────────────────────────┤
│ 基础设施：模型 / MCP / Skill / Prompt / 身份 / 审计 / 配额 / 存储  │
└────────────────────────────────────────────────────────────────────┘
```

### 为什么不是线性五层

研究结论：

- **AgentCore 横跨执行/控制/数据**：AWS Bedrock AgentCore 公开包含 Runtime、Gateway、Identity、Memory、Observability、Evaluations、Policy 等 13 个可独立服务；把它当“单一层”会漏掉边界治理。
- **AgentLoop 是横切质量平面**：阿里云 AgentLoop（Agent Observation and Optimization）不绑定运行时，兼容 AgentRun/AgentTeams/ACS 与第三方框架，提供可观测/审计/评测/实验/数据集；它不是 Agent 的认知循环。
- **OpenCode Harness 是协议与工程入口**：OpenCode 的 workspace 是本地目录/worktree，不是云沙箱；云端沙箱必须由 AgentCore 提供。
- **LoopForge 是持久化编排**：LoopForge 的 SOP 只有 DAG + 人工门禁 + 失败回退；企业多域需要 Temporal 式事件历史/信号/定时器/补偿。
- **指挥中心是驾驶舱**：只读态势 + 幂等控制命令，不能双写编排状态。

## 3. 平面职责与边界

| 平面 | 拥有 | 不拥有 | 关键接口 |
| --- | --- | --- | --- |
| **AgentCore** | Session/Run、工具/MCP 路由、Workspace/Sandbox、State/Memory、模型网关、边界 PEP、OTEL 发射 | 业务流程、评测标准、指挥 | `createSession/run/cancel`、`ToolCall`、`PolicyDecision` |
| **OpenCode Harness** | 会话、工具循环、权限、MCP 客户端、本地/云端 workspace、Session/Event 契约 | 跨会话 SOP、角色编制、审批台账 | `HarnessSession`、`Permission`、`WorkspaceSnapshot` |
| **LoopForge** | SOP、Role、Squad/Legion、需求/战役、人工门禁、重试补偿、事件历史/信号/定时器 | 运行时、沙箱、评测引擎 | `SOPVersion`、`LegionRun`、`Gate`、`Artifact` |
| **AgentLoop** | Trace/审计、EvalDataset/EvalRun、Experiment、Backtest/Replay、Policy 验证、发布门禁 | Agent 执行、沙箱生命周期、工具路由 | `Trace`、`EvalRun`、`Experiment`、`Backtest` |
| **指挥中心** | 数字孪生投影、态势、风险、干预命令、复盘、组合 | 执行 Agent、编排状态、评测 | `Mission`、`Front`、`Intervention` |
| **基础设施** | 模型/MCP/Skill/Prompt/身份/审计/配额/存储 | 业务逻辑 | 能力目录/策略/审计 |

### 关键约束

1. **执行权与指挥权分离**：指挥中心只能发命令，命令经 LoopForge/AgentCore 执行。
2. **质量平面横切**：AgentLoop 消费所有平面的 Trace，不复制运行时。
3. **Harness 协议化**：一个协议，两种运行时；云沙箱由 AgentCore 提供。
4. **编排持久化**：LoopForge 必须有事件历史/信号/定时器/补偿，不能只靠内存。
5. **PEP 外置**：MCP/工具策略在 AgentCore Gateway 边界执行，deny-by-default。
6. **唯一写入口**：每个资源只有一个平面可写；跨平面只读或发命令。
7. **唯一审批源**：LoopForge Approval 是唯一审批事实源；AgentLoop QualityGate 只出 verdict；Command 只发干预命令。
8. **LoopForge 只调 AgentCore**：Harness 作为 AgentCore 的 ExecutionProvider/协议实现，LoopForge 不直连 Harness。

### P0 契约与评审

- [平面契约 v1](../02-architecture/PLANE-CONTRACT.md)：唯一所有权矩阵、API schema、状态机、事件目录、幂等、RLS/PII。
- [ADR-018](../02-architecture/adr/ADR-018-ai-native-planes.md)：内部概念/外部适配/自建边界；禁止“复用外部产品”模糊表述。
- [独立评审](../04-reviews/AI-NATIVE-ARCH-REVIEW.md)（PASS-WITH-ACTIONS）与 [闭环记录](../04-reviews/AI-NATIVE-ARCH-REVIEW-RESOLUTION.md)。

> 市场空位（“没有一家合成数字军团指挥中心”）是**研究推断/待验证假设**，不是已验证事实；需客户访谈与竞品 PoC 才能用于定位承诺。

## 4. 组件定义

### 4.1 AgentCore（执行平面）

- Session/Run 生命周期；
- 工具/MCP 路由；
- 工作区/沙箱/执行器；
- 状态、事件、快照、Memory；
- 模型网关；
- Gateway/Identity/Policy 边界原语；
- 多租户/配额/限流；
- OTEL Trace 发射。

### 4.2 AgentLoop（质量/治理平面）

- 可观测：Trace/Metrics/Logs、Agent→Tool→Model 拓扑；
- 审计：防篡改证据链、越权/数据外泄检测；
- 评测：Agent-as-Judge、数据集、Trace2Dataset；
- 实验：A/B、灰度、版本对比；
- 回放/回测/仿真：确定性回放、数据集回测、LLM 仿真；
- 安全/治理：策略验证、PII、内容安全；
- 发布门禁：SOP/角色/工具版本必须通过评测。

### 4.3 OpenCode Harness（工程平面）

- 一个 Harness 协议，两种运行时：
  - 端侧：本地 opencode server + worktree + 本地权限；
  - 云侧：托管 server + AgentCore 沙箱 + MCP Gateway + Approval；
- 统一 Session/Event/Tool/Permission/WorkspaceSnapshot；
- 快速接入/构建/分享；
- 不定义业务流程。

### 4.4 LoopForge（编排平面）

- SOP/流程建模、版本、画布；
- 流程驱动角色识别与角色数字人；
- 小队/军团编制；
- 需求/战役/人工门禁；
- 持久化事件历史/信号/定时器/补偿；
- 调用 AgentCore 执行，调用 AgentLoop 质量门禁。

### 4.5 数字军团指挥中心（应用平面）

- 数字孪生战场：业务/任务/军团/角色映射；
- 任务/编制/资源/风险态势；
- 运行级干预：暂停/退回/接管/重派/升级；
- 复盘与经营：周期/成功率/人工介入/成功结果成本；
- 组合：多业务域/多军团；
- 只读投影 + 幂等控制命令。

## 5. 面向用户

| 用户 | 主平面 | 任务 |
| --- | --- | --- |
| AI Native Builder | OpenCode Harness | 构建/接入/分享应用 |
| 领域专家/角色设计师 | LoopForge | 流程识别角色、定义数字人、编成军团 |
| 开发者 | AgentCore/Harness | 扩展运行时、工具、MCP |
| 质量/平台工程师 | AgentLoop | 观测、评测、实验、安全、回测 |
| 作战指挥官/业务负责人 | 指挥中心 | 指挥、干预、复盘 |
| 平台/IT 管理员 | 基础设施 | 私有化、权限、成本、安全 |
| 高管 | 指挥中心 | 组合价值与转型 |

## 6. 面向任何业务

横向底座 + 行业包：
- 软件研发、客户运营、财务、供应链、HR/IT、销售、数据；
- 通过角色包 + SOP 包 + MCP 连接器 + 模板适配行业。

## 7. 关键机会

1. AI Native 基建层空缺。
2. AgentCore 运行时 + AgentLoop 质量平面组合稀缺。
3. OpenCode Harness 云边一致。
4. LoopForge 流程驱动角色数字人。
5. **数字军团指挥中心**：把“军团编制 + 态势 + 运行级干预 + 复盘 + 数字孪生”合成驾驶舱，市场空位。
6. 私有化/开源替代。
7. 行业包/生态。

## 8. 当前实现差距

| 平面 | 当前 | 差距 |
| --- | --- | --- |
| AgentCore | **M2a 已新增 `services/agentcore`**：Session/Run/取消/幂等/租户隔离/SQLite Provider 接口 | 尚未接管现有 UI；真实沙箱/Provider 在 M3 |
| AgentLoop | **M5a 已新增 `services/agentloop`**：Trace/Eval/Backtest/Gate；不做审批 | 真实 Judge/实验/安全/SLO |
| OpenCode Harness | **M3a 已新增 `services/harness`**：HarnessSession/Permission/Events/Snapshot；cloud 调 AgentCore；local 不建云沙箱 | 未接管现有工作区 UI；真实工具/终端在 M3b |
| LoopForge | **M4a 已落地 `/api/v1/orchestration/*` 过渡命名空间**（当前仍由 agent-workforce 持有数据） | M4b 独立 orchestration 服务/ownership 迁移 |
| 指挥中心 | **M6a 已新增 `services/command-center` + `/command-center` 页面**：态势/质量/干预投影 | 实时 NATS/干预执行/复盘全量 |
| 数据 | SQLite+PG overlay | PG 主库 + NATS |

## 9. 路线

| 阶段 | 目标 |
| --- | --- |
| P0 契约 | 固化平面接口/事件/所有权 |
| P1 执行+工程 | AgentCore Runtime、Harness 协议、云/端双运行时 |
| P2 编排+质量 | LoopForge 持久化、AgentLoop Trace/Eval/Experiment/Backtest |
| P3 指挥 | 数字孪生投影、干预、复盘、组合 |
| P4 生产 | PG/NATS/K8s HA/SSO/安全 |

## 10. 研究来源

- AWS Bedrock AgentCore 文档（Runtime/Gateway/Identity/Memory/Observability/Evaluations/Policy）
- 阿里云 AgentLoop（Agent Observation and Optimization）
- LangSmith / Langfuse（Trace→Dataset→Eval→Experiment）
- E2B / Firecracker（沙箱隔离）
- OpenCode 文档（server/agents/permissions/MCP/SDK）
- Tencent LoopForge（README/architecture/conversation-workspaces）
- Palantir / Microsoft / ServiceNow / UiPath / Celonis / Salesforce / Dify / Coze（企业应用层）

详见 [SYNTHESIS](research/SYNTHESIS.md) 与三份研究文档。

> 相关：[SP/BP](SP-BP.md) · [5 看 3 定/SWOT](../01-research/OPPORTUNITY-5-3-SWOT.md) · [产品定义](../01-research/PRODUCT-DEFINITION.md) · [架构 V5](../02-architecture/ARCH-V5.md)
