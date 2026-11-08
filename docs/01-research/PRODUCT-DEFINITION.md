# OpenDream Cloud 产品定义

## 1. 产品是什么

**企业 AI Native 基础设施**，采用 **4 个功能平面 + 1 个横切质量平面 + 基础设施**：

```text
执行平面      AgentCore（Runtime + 边界 PEP）
工程平面      OpenCode Harness（一个协议，两种运行时）
编排平面      LoopForge（构建在 AgentCore 之上）
应用平面      数字军团指挥中心（数字孪生驾驶舱）
横切质量平面  AgentLoop（观测/评测/实验/安全/回放/回测）
基础设施      模型/MCP/Skill/Prompt/身份/审计/配额/存储
```

> 这不是线性五层：AgentLoop 横切所有平面，AgentCore 同时包含运行时与边界治理原语。

## 2. 平面定义

### 2.1 AgentCore

Agent 运行时环境：
- Session/Run 生命周期；
- 工具/MCP 路由；
- 工作区/沙箱/执行器；
- 状态、事件、持久化；
- 模型网关；
- 多租户/配额/限流。

**不是**编排器、评测器或指挥中心。

### 2.2 AgentLoop

对标阿里云 AgentLoop 的质量与治理闭环：
- 可观测；
- 评测；
- 实验；
- 治理与安全；
- 沙箱；
- 回测。

**不是** Agent 的“感知-规划-行动”认知循环。

### 2.3 OpenCode Harness

基于 opencode 的 Harness 工程：
- 云端 Harness + 桌面 Harness；
- 模型/MCP 接入；
- 快速使用/接入/构建/分享；
- 工作区、应用、模板。

### 2.4 LoopForge

构建在 AgentCore 之上的流程编排层：
- SOP/流程；
- 流程驱动角色识别；
- 角色数字人；
- 小队/军团；
- 需求/战役/审批；
- 调用 AgentCore 执行，调用 AgentLoop 做质量门禁。

### 2.5 数字化军团指挥中心

应用层数字孪生指挥作战中心：
- 任务/军团/资源/风险态势；
- 指挥干预；
- 复盘与经营；
- 组合管理。

**不执行 Agent，不替代编排。**

## 3. 面向用户

| 用户 | 层 | 任务 |
| --- | --- | --- |
| AI Native Builder | OpenCode Harness | 快速构建/接入/分享应用 |
| 领域专家/角色设计师 | LoopForge | 流程识别角色、定义数字人、编成军团 |
| 开发者 | AgentCore/Harness | 扩展运行时、工具、MCP |
| 平台/质量工程师 | AgentLoop | 观测、评测、实验、安全、回测 |
| 作战指挥官/业务负责人 | 指挥中心 | 指挥、干预、复盘 |
| 平台/IT 管理员 | 基础设施 | 私有化、权限、成本、安全 |
| 高管 | 指挥中心 | 组合价值与转型 |

## 4. 面向任何业务

横向底座 + 行业包：
- 软件研发、客户运营、财务、供应链、HR/IT、销售、数据；
- 通过角色包 + SOP 包 + MCP 连接器 + 模板适配行业。

## 5. 核心对象

```text
AgentCore: Session / Run / ToolCall / Workspace / Sandbox
AgentLoop: Trace / EvalRun / Experiment / Policy / Backtest
OpenCode: Workspace / App / AppVersion / Share
LoopForge: Process / Role / Employee / Squad / Legion / LegionRun / Requirement / Approval
Command Center: Mission / Front / Risk / Intervention / Review
```

## 6. 状态机

- Role：draft → reviewing → active → deprecated
- SOP：draft → published → deprecated
- Legion：forming → ready → engaged → stand_down
- LegionRun：planned → running → waiting_human → completed/failed/canceled
- EvalRun：queued → running → passed/failed

## 7. MVP 与路线

| 阶段 | 范围 |
| --- | --- |
| Alpha | LoopForge 原型、角色/SOP/军团/审批、能力/治理、SQLite/PG overlay |
| Beta | AgentCore Runtime 抽象、AgentLoop 闭环、OpenCode Harness 云边接入、指挥中心原型 |
| GA | 真实执行、NATS、K8s HA、SSO/SCIM、行业包、生态 |

## 8. 非目标

- 不做通用模型训练；
- 不做纯低代码表单；
- 不做虚拟主播；
- 不追求全自动无人；
- 不以 Agent 数量为卖点；
- 不做封闭 SaaS。

## 9. 成功指标

- Builder 首个应用 < 30 min；
- 角色复用率 ≥ 40%；
- 军团任务完成率 ≥ 80%；
- 指挥干预 ≤ 3 次点击；
- AgentLoop 发布门禁覆盖 100%；
- 云边配置一致率 100%。

## 10. 命名

- **AgentCore**：Agent Runtime
- **AgentLoop**：质量与治理闭环
- **OpenCode Harness**：云端/桌面 Harness 工程
- **LoopForge**：流程编排层
- **数字军团指挥中心**：应用层
- **Role**：角色契约
- **Digital Employee**：数字员工
- **Squad/Legion/LegionRun**：小队/军团/战役

> 相关：[总纲](../00-program/AI-NATIVE-OS.md) · [架构](../02-architecture/ARCH-V5.md) · [产品设计](../03-design/PRODUCT-DESIGN.md)
