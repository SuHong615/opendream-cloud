# ADR-018：AI Native 平面模型、命名与“自建/适配”决策

- 状态：Accepted（架构评审 P0-2）
- 日期：2026-11-18
- Owner：architect + lead
- 关联：[AI Native 总纲](../../00-program/AI-NATIVE-OS.md) · [平面契约](../PLANE-CONTRACT.md) · [独立评审](../../04-reviews/AI-NATIVE-ARCH-REVIEW.md)

## 1. 背景

早期文档把 AgentCore、AgentLoop、OpenCode Harness、LoopForge、Command Center 写成线性五层，并使用“复用 AgentCore/LoopForge”等模糊表述。独立研究发现：

- AWS Bedrock AgentCore 是 13 个可独立服务的打包，横跨运行时/网关/身份/策略/可观测；
- 阿里云 AgentLoop 是跨运行时的质量治理平面；
- OpenCode 的 workspace 是本地目录/worktree，不是云沙箱；
- LoopForge 是可信团队单实例的 SOP 产品，其持久化语义不足以支撑企业多域；
- 企业指挥中心是应用层驾驶舱，不是运行时。

因此需要 ADR 明确：**哪些是 OpenDream 内部概念、哪些是外部产品适配器、哪些自建**，并禁止模糊“复用”。

## 2. 决策

### 2.1 命名与实现主体

| 名称 | 性质 | 实现主体 | 外部关系 |
| --- | --- | --- | --- |
| **AgentCore** | OpenDream 内部执行平面 | OpenDream 自建 Runtime（Session/Run/Tool/Workspace/Sandbox/State/PEP） | 参考 AWS AgentCore 公开能力，**不依赖 AWS 产品** |
| **AgentLoop** | OpenDream 内部横切质量平面 | OpenDream 自建/集成（Trace/Eval/Dataset/Experiment/Backtest/Policy） | 参考阿里云 AgentLoop、LangSmith/Langfuse，**不依赖其 SaaS** |
| **OpenCode Harness** | 工程协议 + 适配层 | OpenDream 实现 Harness 协议；上游 opencode 作为 MIT 组件适配 | 基于 opencode，**非官方产品** |
| **LoopForge** | OpenDream 内部编排平面 | OpenDream 自建（SOP/Role/Legion/Gate/Durable Execution） | 参考 Tencent LoopForge 设计，**不复制其代码/不强绑其运行时** |
| **数字军团指挥中心** | OpenDream 内部应用平面 | OpenDream 自建（TwinProjection/Intervention/Review） | 参考 Palantir/UiPath/ServiceNow 等，**不依赖** |

### 2.2 平面模型

采用 **4 个功能平面 + 1 个横切质量平面 + 基础设施**：

```text
执行 AgentCore | 工程 OpenCode Harness | 编排 LoopForge | 应用 Command Center
横切 AgentLoop Quality
基础 Model/MCP/Skill/Prompt/Identity/Audit/Quota
```

不是线性五层；AgentLoop 横切所有平面，AgentCore 同时包含运行时与边界 PEP。

### 2.3 自建 / 适配 / 集成

| 能力 | 决策 | 理由 |
| --- | --- | --- |
| Agent Runtime / Sandbox / PEP | **自建** | 多租户、私有化、安全边界不可外包 |
| 质量平面（Trace/Eval/Experiment/Backtest） | **自建 + 可选集成** | 核心数据资产与门禁；可接 Langfuse/LangSmith 兼容层 |
| Harness 协议 | **自建协议 + 适配 opencode** | 云边一致；opencode 为执行内核 |
| SOP/Role/Legion/Gate | **自建** | 企业多域、治理、持久化需求 |
| Command Center | **自建** | 差异化应用层；数字孪生/干预/复盘 |
| 模型/MCP/Skill 目录 | **自建目录 + 开放协议** | 可接第三方 |
| 外部 Agent 框架 | **适配** | 通过 Harness/Runtime 协议接入，不复制 |

### 2.4 禁止项

- 禁止把“复用 AWS AgentCore / 阿里云 AgentLoop / Tencent LoopForge”写成实现方案；只能写“参考能力/兼容协议/适配器”。
- 禁止 LoopForge 直接创建云沙箱或写 AgentCore Run。
- 禁止 AgentLoop 执行 Agent 或写审批决策。
- 禁止 Command Center 直接写 Run/Approval。
- 禁止在 prompt 中实现策略；PEP 唯一在 AgentCore 边界。

## 3. 备选方案与否决

| 方案 | 否决理由 |
| --- | --- |
| 直接采用 AWS AgentCore 托管 | 云绑定、私有化/数据主权不满足 |
| 直接 fork Tencent LoopForge | Go/MySQL 单实例、可信团队假设、多域治理不足 |
| 直接采用阿里云 AgentLoop SaaS | 数据出境/合规、无法私有化 |
| 五层线性堆叠 | 职责重叠、审批/策略/PEP 重复、接口不可验收 |
| 只做 Command Center 薄壳 | 无运行时/质量/编排护城河，易被替换 |

## 4. 后果

### 正面

- 所有权清晰，避免重复权威；
- 可私有化、可替换外部组件；
- 接口可按平面独立演进；
- 研究结论与实现边界一致。

### 负面/代价

- 自建 Runtime/质量/编排成本高；
- 需要严格契约测试与迁移计划；
- 早期不能靠“接一个外部产品”快速交付。

## 5. 验收

- [ ] 总纲/ARCH-V5/README 使用同一命名与平面模型；
- [ ] 无“复用外部产品”模糊表述；
- [ ] 平面契约唯一所有权矩阵通过评审；
- [ ] 代码/目录命名与 ADR 一致；
- [ ] 评审记录引用本 ADR。

> 本 ADR 关闭 P0-2；P0-1/3/4 见 [PLANE-CONTRACT](../PLANE-CONTRACT.md)。
