# AI Native 架构评审闭环记录

> 对应评审：[AI-NATIVE-ARCH-REVIEW.md](AI-NATIVE-ARCH-REVIEW.md)（PASS-WITH-ACTIONS）
> 闭环日期：2026-11-18

## 1. 结论

评审方向通过；P0 四项已在架构契约中收敛，P1 五项部分收敛、其余进入实施排期。**不进入大规模目录重构，直到 P1-1 迁移计划完成。**

## 2. P0 收敛

| ID | 状态 | 证据 |
| --- | --- | --- |
| P0-1 所有权矩阵 + 平面契约 | ✅ Closed | [PLANE-CONTRACT.md](../02-architecture/PLANE-CONTRACT.md)：唯一 owner、API header/schema、状态机、事件、幂等、RLS/PII |
| P0-2 命名/复用/自建 ADR | ✅ Closed | [ADR-018](../02-architecture/adr/ADR-018-ai-native-planes.md)：内部概念 vs 外部适配；禁止“复用外部产品”模糊表述 |
| P0-3 PEP/审批唯一化 | ✅ Closed | 契约 §4：唯一 PEP=AgentCore Gateway；唯一审批=LoopForge Approval；AgentLoop 只出 QualityGate verdict；Command 只发干预命令 |
| P0-4 事件/数据契约 v1 | ✅ Closed | 契约 §5：统一事件信封/目录/owner/保留/PII；Run 唯一定义在 AgentCore |

## 3. P1 状态

| ID | 状态 | 说明/下一步 |
| --- | --- | --- |
| P1-1 文件级迁移计划 | ✅ Closed | [MIGRATION-MATRIX.md](../02-architecture/MIGRATION-MATRIX.md)：文件→平面、动作、依赖、回滚、里程碑；contracts 包已落地（`packages/contracts`） |
| P1-2 命令总线契约 | ✅ Closed | 契约 §3.6：幂等/鉴权/不可逆动作二次确认/审计 |
| P1-3 Durable execution 规格 | ◐ Partial | 契约 §6 状态机；Temporal 式事件历史/信号/定时器/补偿需单独规格 |
| P1-4 质量平面 SLO/保留/PII/成本 | ◐ Partial | 契约 §5 保留/PII；SLO/成本归集待补 |
| P1-5 市场空位验证 | ◐ Partial | 总纲已把“空位”标为研究推断/假设，需 3–5 客户访谈验证 |

## 4. 最终架构基线

```text
执行 AgentCore | 工程 OpenCode Harness | 编排 LoopForge | 应用 Command Center
横切 AgentLoop Quality
基础 Model/MCP/Skill/Prompt/Identity/Audit/Quota
```

- 线性五层：废弃；
- 平面模型：生效；
- 唯一写入口：生效；
- 唯一审批/PEP：生效；
- 事件目录 v1：生效。

## 5. 下一步（不阻塞架构定稿）

1. M1 契约代码化：`packages/contracts` 已完成；继续把契约接入服务。
2. M2 AgentCore Runtime：**M2a 已实现**（`services/agentcore`，Session/Run/幂等/租户/SQLite；未接管 UI）。
3. M2b：把 `agent-workforce` Run/Executor 适配到 AgentCore（灰度读切换）。
4. M3 Harness 协议：**M3a 已实现**（`services/harness` Session/Permission/Events/Snapshot；cloud 调 AgentCore）。
5. M4 LoopForge 角色/军团/审批迁移：**M4a 过渡命名空间已实现**；M4b ownership 迁移待做。
6. M5 AgentLoop 聚合：**M5a 已实现**（Trace/Eval/Backtest/Gate）。
7. M6 Command Center 投影/干预：**M6a 已实现**（投影 API + 页面）。
8. 全程保留旧 API 兼容与回滚点。
