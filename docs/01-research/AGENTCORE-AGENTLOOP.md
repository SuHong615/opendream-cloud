# 阿里云 AgentCore / AgentLoop 分析（2026-11-07）

> 来源：阿里云官方文档（访问日期 2026-11-07）。本文区分【官方事实】与【推断】；推断仅用于架构理解，不作为采购依据。
> - AgentCore 产品概述：https://www.alibabacloud.com/help/zh/agentcore/agentcore-product-overview
> - AgentCore 基本概念：https://www.alibabacloud.com/help/zh/agentcore/agentcore-basic-concepts
> - AgentCore 管理 Workspace：https://www.alibabacloud.com/help/zh/agentcore/manage-workspace
> - AgentCore Team 任务：https://www.alibabacloud.com/help/zh/agentcore/using-team-tasks
> - AgentLoop 什么是 AgentLoop：https://www.alibabacloud.com/help/zh/agentloop/product-overview/what-is-agentloop
> - AgentLoop 核心概念：https://www.alibabacloud.com/help/zh/agentloop/product-overview/core-concept
> - AgentLoop 数据飞轮实践：https://www.alibabacloud.com/help/zh/agentloop/use-cases/i-overview-a-closed-loop-that-allows-agent-to-continuously-tune

---

## 1. 两个产品是什么关系

| 产品 | 一句话定位 | 解决的问题 |
| --- | --- | --- |
| **AgentCore** | 智能体**构建与治理**平台 | Agent 怎么建、怎么管、怎么组队、怎么接模型/工具/技能 |
| **AgentLoop** | Agent **观测与优化**平台 | Agent 上线后怎么看见、怎么评估、怎么实验、怎么持续变好 |

二者互补：AgentCore 负责"造与管"，AgentLoop 负责"看与优"。AgentCore 的 Workspace 创建时可选自动创建 AgentLoop 的云监控工作空间，说明两者在阿里云体系内是打通的。

【官方事实】AgentCore 以 Workspace 为资源边界；【官方事实】AgentLoop 以 AgentSpace 为资源边界。两者都是"多租户工作空间 + 资产 + 权限"的组织方式。

---

## 2. AgentCore 拆解

### 2.1 定位与核心能力

官方定义：AgentCore 是"智能体构建和治理平台"，以**构建与运行、协作与治理、观测与评估**三大能力覆盖 Agent 全生命周期；支持自研、开源 Harness、商业 SaaS Agent 多来源统一纳管。

核心功能（官方）：

| 能力 | 内容 |
| --- | --- |
| Agent 管理 | 创建/管理 Agent，多种运行模式 |
| Agent 模板 | 可复用配置模板，批量部署同类型 Agent |
| 模型连接 | 统一管理模型供应商/端点/协议/凭证 |
| Skill 管理 | 创建、发布、管理 Skill，支持从 Skill 广场导入 |
| 工具管理 | 基于 MCP 集成外部工具（HTTP TO MCP / 直接代理） |
| 凭证管理 | 集中管理 AK/SK 等敏感信息，Key-Value（Key 为环境变量名） |
| Team 协作 | 团队、成员、多角色权限 |
| 账号集成 | 钉钉/微信/飞书等 IM 渠道接入 |

### 2.2 概念模型

```
Workspace（资源隔离边界）
├── 模型连接（供应商/端点/协议/凭证）→ 模型（上下文/输出/能力）
├── 凭证（Key-Value，供模型连接与工具引用）
├── Agent（执行单元）
│   ├── Harness Agent（平台提供运行框架，控制台配置即跑）
│   ├── 高代码 Agent（自定义代码）
│   ├── 纳管 Agent（已部署在客户本地，纳管进平台）
│   └── 注册 Agent（待上线）
├── Agent 模板
├── 资产：Skill（SKILL.md / ZIP / Nacos / 模板）、MCP
└── Team（Leader + Worker + 任务/子任务/任务房间/评审人）
```

### 2.3 Agent 运行模式（关键差异点）

| 类型 | 运行位置 | 适合 |
| --- | --- | --- |
| Harness Agent | AgentCore 托管运行时，控制台配置（模型/提示词/SubAgent/资源规格/Skill/MCP） | 快速上线数字员工、客服 |
| 高代码 Agent | 客户代码 + 平台运行 | 复杂业务逻辑、精细控制 |
| 纳管 Agent | 客户本地已部署，平台统一管理/编排 | 存量大模型应用、既有 Agent |
| 注册 Agent（待上线） | 平台外部署，平台调度 | 混合部署 |

【推断】Harness Agent 的"资源配置"指运行实例的 CPU/内存规格；结合"沙箱运行时按需弹性伸缩"的描述，底层大概率是阿里云 AgentRun / ACS 一类托管运行时（AgentLoop 文档明确列出"阿里云运行时 AgentRun、AgentTeams、ACS"）。OpenDream Cloud 以 4C8G 工作区作为运行单元，是同一类"每用户/每 Agent 一个隔离运行时"的思路。

### 2.4 Team 协作模型

官方 Task 机制：

- **Team**：人 + Agent 的协作单位；
- **Leader**：拆解计划、分配工作、汇总结果；可自己完成或拆子任务；
- **Worker**：承担具体子任务；
- **任务房间/任务聊天**：执行过程记录、补充信息、结果卡片；
- **评审人**：验收结果、提修改意见；
- **多团队协作**：上级团队 Leader 协调下级团队，子任务有独立状态与依赖。

【借鉴价值】这是"多 Agent 协作 + 人类验收"的完整工程化模型，比单纯的多 Agent 对话更接近生产：
任务是有状态的实体（看板/房间/子任务/依赖/验收），而不是一次聊天。

### 2.5 部署与依赖（官方）

- 地域：杭州、上海、深圳、北京、新加坡；
- 依赖 CMS（云监控 2.0）写 Tracing；依赖 PrivateLink 提供私网访问；
- Workspace 可选绑定 VPC（至少 2 个交换机、跨 2 个可用区）；
- 存储：平台 OSS 或客户私有 OSS（由平台创建管理）；
- 权限：多成员、多角色、企业级安全合规。

---

## 3. AgentLoop 拆解

### 3.1 定位

官方定义：面向企业级智能体的**一站式自进化平台**，提供全栈观测与审计、评估与实验、资产管理与持续优化，构建"数据飞轮"。

核心命题（官方归纳的四大挑战）：
1. 质量退化难感知（多步推理故障定位 >2h）；
2. 成本暴涨难归因（Token 峰值可达 10 倍）；
3. 变更风险难拦截（Prompt/Skill/模型缺质量门禁）；
4. 行为审计无留痕（多步轨迹缺审计/回放）。

### 3.2 数据飞轮

```
接入（OTel/探针）→ 观测（Trace/Trajectory）→ 审计（证据链）
   → 数据集（Dataset）→ 评估（Agent-as-Judge）→ 实验（A/B、显著性）
   → 经验库（自动挖掘）→ 反哺 Agent（Skill 注入）→ 回到观测
```

关键数据单元：

| 概念 | 定义 |
| --- | --- |
| Trajectory | 一次 Agent 请求的完整执行轨迹：输入、模型推理、工具调用、RAG、记忆、决策分支、输出、耗时/Token |
| Dataset | 可查询/可评估/可实验的结构化数据资产，支持 Schema、版本、检索、SQL |
| Pipeline | 原始 Trace → 降维/特征/AI 加工 → Dataset 的自动加工引擎 |
| Evaluator | 评估器本身是 Agent（Agent-as-a-Judge），可调工具/多步推理 |
| Experiment | 多组变量（Agent/模型/Prompt/参数/工具）在数据集上的对比实验 + 统计显著性 |
| Playground | 交互式调试/对比环境 |
| Memory | 长期上下文（用户偏好/事实），mem0 兼容接口 |
| Experience | 从轨迹自动提取的"如何更好完成任务"的可复用经验，可组织级共享 |

### 3.3 接入与生态

- 零侵入：阿里云探针 / OpenTelemetry / ARMS / Python/Java SDK / MCP Server；
- 兼容：LangChain/LangGraph、AgentScope、Dify、OpenClaw、Hermes、LlamaIndex、Claude Agent SDK，以及 Qoder/Claude Code/Codex/Cursor 等 CLI；
- 运行时：AgentRun、AgentTeams、ACS、第三方运行时。

### 3.4 使用限制（官方）

- AgentSpace 默认 ≤50；
- Trace 默认保留 30 天；
- 评估并发默认 100。

---

## 4. 对比：AgentCore / AgentLoop / OpenDream Cloud

| 维度 | AgentCore | AgentLoop | OpenDream Cloud（本项目） |
| --- | --- | --- | --- |
| 核心对象 | Agent / Team / Workspace | Agent 应用 / Trajectory / Dataset | 云工作区（opencode）+ 四中心 |
| 构建方式 | Harness 配置 / 高代码 / 纳管 | 不构建 Agent，只接入 | opencode 原生 Agent + Skill/MCP |
| 运行隔离 | 托管运行时（推断 AgentRun/ACS）+ 资源规格 | 不负责运行 | 每用户 4C8G Pod / 本地容器 |
| 技能 | Skill 管理（SKILL.md/ZIP/Nacos） | Agent 资产（Prompt/Skill 版本） | Skill 中心（原生 `skills[]` URL 源） |
| 工具 | MCP（HTTP TO MCP / 代理） | MCP Server 接入 | MCP 中心（目录/代理/审计） |
| 协作 | Team Leader/Worker/任务房间/评审 | 不作为重点 | 当前无 Team（规划中） |
| 观测 | 观测与评估（概览级） | 全栈 Trace/审计/拓扑 | 规划中（OTel + 事件流） |
| 评估 | 有（与 AgentLoop 打通） | Agent-as-Judge + 数据集 + 实验 | 评测中心（沙箱 Job + 评分器） |
| 优化闭环 | 资产版本 + 评测 | 数据飞轮（最强） | 规划中（Dataset/实验/经验） |
| 部署 | 阿里云托管 | 阿里云托管 | 本地 Docker / ACK，可离线 |
| 开源可控 | 否 | 否 | 是（opencode MIT + 自研外围） |

**结论**：AgentCore 强在"多来源 Agent 的统一构建/治理/组队"，AgentLoop 强在"上线后的数据飞轮"；两者都**不提供**"每用户可持久化、可交互的编码工作区"。OpenDream Cloud 的差异化应继续押在：
1. **工作区即 Agent**：opencode 工作区是具备文件/终端/Git/PTY 的真实工程环境；
2. **本地 + 云双模**：可离线 Docker，可 ACK；
3. **能力市场闭环**：Skill/MCP/应用可直接在工作区消费；
4. **开源可控**：模型、数据、部署均可私有化。

---

## 5. 可借鉴 / 不照搬

### 借鉴（建议纳入路线图）

1. **Workspace/AgentSpace 资源边界**：我们已有 org + workspace，可补"AgentSpace"作为团队级边界（模型/技能/MCP/评测/记忆的归属）。
2. **Agent 模板**：把"工作区模板 + Agent 配置"做成可复用模板（镜像/工具链/技能/MCP/模型策略）。
3. **纳管模式**：允许企业把已有 Agent（Claude Code/Codex/自研）注册进来统一治理，而不是只能新建。
4. **Team 任务模型**：Leader/Worker/子任务/任务房间/评审人——用于"多工作区协作完成一个研发任务"。
5. **Trajectory 作为一等数据**：opencode 的 session/message/tool/usage 事件需要标准化为 Trajectory，供观测/评估/经验复用。
6. **Agent-as-Judge**：评测器本身用 Agent（可调用工具/多步验证），而不是纯 prompt 打分。
7. **Dataset/Pipeline/Experiment**：把评测从"跑一次"升级为"数据集 + 回归 + A/B + 显著性"。
8. **Memory/Experience**：长期记忆与经验库，作为 Skill 的补充（经验可注入为 Skill/上下文）。
9. **凭证中心**：统一 AK/SK（我们已有 Secret/KMS 设计，可产品化）。
10. **IM 渠道**：钉钉/飞书/企微接入，作为 Agent 的对话入口（国内企业刚需）。

### 不照搬

1. **不自研 Harness 运行时**：我们以 opencode 为引擎，避免重复造 Agent 框架；
2. **不绑定阿里云托管**：保持本地/ACK/私有化三形态；
3. **不做通用多 Agent 编排优先**：先把"单工作区 + 能力中心"做深，再扩 Team；
4. **不照搬 AgentSpace 50 个上限/30 天 Trace**：按企业规模可配置。

---

## 6. 对我们的直接启示（产品决策）

| 决策 | 建议 |
| --- | --- |
| 是否增加 Agent 构建器 | **是，但轻量**：Agent 模板 = 工作区模板 + opencode agent 配置 + 技能/MCP 绑定 |
| 是否做 Team | **P1**：先做"任务 + Leader/Worker + 评审"，复用工作区作为 Worker 运行单元 |
| 是否做观测 | **P1**：OTel + Trajectory 标准化，先接 opencode 事件流，不自研探针 |
| 是否做评测 | **已有**：评测中心升级为 Dataset/Evaluator/Experiment 三层 |
| 是否做记忆/经验 | **P2**：Memory API（mem0 兼容）+ Experience 检索注入 Skill |
| 是否做纳管 | **P1**：注册外部 Agent（CLI/SaaS）到平台，统一模型/审计/配额 |

> 下一步产品模块规划见 [PRODUCT-MODULE-PLAN.md](../00-program/PRODUCT-MODULE-PLAN.md)。
