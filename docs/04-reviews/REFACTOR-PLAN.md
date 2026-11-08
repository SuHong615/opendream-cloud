# OpenDream Cloud 重构方案

> 结论：当前最大问题是 **五层边界没有落到产品结构**，不是缺页面。
> 目标：AgentCore / AgentLoop / OpenCode Harness / LoopForge / 数字军团指挥中心。

## 1. 当前诊断

| # | 问题 | 影响 |
| --- | --- | --- |
| 1 | AgentCore 未抽离 | 运行时/编排/业务混在一起 |
| 2 | AgentLoop 被误解为认知循环 | 评测/实验/安全/回测未形成闭环 |
| 3 | OpenCode Harness 云边未统一 | 构建/接入/分享体验割裂 |
| 4 | LoopForge 未真正构建在 AgentCore 上 | 流程编排依赖页面聚合 |
| 5 | 指挥中心只有概览 | 无数字孪生态势/干预 |
| 6 | 概念重叠 | 角色/员工/军团/小队/页签混乱 |
| 7 | 持久化/异步/HA 未生产化 | 不能承载企业负载 |
| 8 | 文档与实现漂移 | 认知不一致 |

## 2. 目标结构

```text
应用层：数字军团指挥中心
流程编排：LoopForge（构建在 AgentCore 上）
工程层：OpenCode Harness（云端+桌面）
质量层：AgentLoop（观测/评测/实验/治理/安全/沙箱/回测）
运行时：AgentCore（Session/Run/Tool/Workspace/Sandbox/State）
基础设施：模型/MCP/Skill/Prompt/身份/审计/配额
```

```text
services/
  agentcore/            运行时（新增）
  agentloop/            质量闭环（新增）
  loopforge/            流程编排（由页面聚合下沉）
  command-center/       指挥中心投影/干预（新增）
  opencode-harness/     云边 Harness 接口
  workflow-engine/      SOP 引擎
  agent-workforce/      角色/员工/小队/军团
  control-plane/        BFF/认证/租户
  eval/experiment/observability  → 归入 AgentLoop
```

## 3. 前端 IA

```text
指挥中心 /command-center
编排 LoopForge /orchestration
构建 OpenCode Harness /harness
质量 AgentLoop /agentloop
能力 /capabilities
治理 /governance
```

- 指挥中心为默认首页；
- LoopForge 不占一级；
- 旧路由重定向；
- 每个角色有默认工作台。

## 4. 分阶段

### Phase 0 收口（1 周）

- 冻结新增功能；
- 五层契约与 IA 定稿；
- 导航收敛；
- 旧路由重定向；
- 文档统一。

### Phase 1 五层骨架（3–4 周）

- 抽 AgentCore Runtime 接口；
- LoopForge 迁移到 AgentCore；
- OpenCode Harness 云边统一；
- 指挥中心原型；
- Postgres 主库。

### Phase 2 AgentLoop 闭环（4–6 周）

- 观测/评测/实验/安全/沙箱/回测；
- 发布门禁；
- 真实执行器；
- NATS。

### Phase 3 规模化（4–6 周）

- 行业包、伙伴、市场；
- K8s HA/SSO/安全。

## 5. 保留/合并

| 对象 | 决策 |
| --- | --- |
| workflow-engine | 保留为 SOP 引擎 |
| agent-workforce | 收窄角色/军团/运行 |
| eval/experiment/observability | 合并为 AgentLoop 能力 |
| LoopForge 页面 | 重构为编排 |
| 工作流/员工/小队一级导航 | 合并 |
| 旧路由 | 重定向 |
| SQLite | 替换 Postgres |
| mock | 开发保留，生产真实执行 |

## 6. 验收

- 五层各有清晰接口/页面；
- 一条真实闭环；
- 指挥中心可干预；
- 角色复用率 ≥ 40%；
- AgentLoop 门禁覆盖；
- 文档一致。

> 相关：[总纲](../00-program/AI-NATIVE-OS.md) · [架构 V5](../02-architecture/ARCH-V5.md) · [产品定义](../01-research/PRODUCT-DEFINITION.md)
