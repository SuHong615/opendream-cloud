# OpenDream Cloud 产品设计（AI Native 基础设施）

> 4+1+1 平面：AgentCore / AgentLoop / OpenCode Harness / LoopForge / 数字军团指挥中心。
> 总纲：[AI Native OS](AI-NATIVE-OS.md)

## 1. 设计目标

1. 让不同角色找到自己的层与入口；
2. 运行时/质量/工程/编排/指挥边界清晰；
3. 一条主旅程：业务目标 → 编排 → 执行 → 质量 → 指挥 → 复盘；
4. 云边一致：OpenCode Harness；
5. 可治理：AgentLoop 门禁。

## 2. 信息架构

```text
企业门户
└─ 控制台
   ├─ 指挥中心（默认）
   │   ├─ 数字孪生战场
   │   ├─ 军团/战役
   │   ├─ 风险/审批
   │   └─ 复盘/组合
   ├─ 编排 LoopForge
   │   ├─ 流程/SOP
   │   ├─ 角色数字人
   │   ├─ 小队/军团
   │   └─ 需求
   ├─ 构建 OpenCode Harness
   │   ├─ 云端工作区
   │   ├─ 桌面端
   │   ├─ 应用/模板
   │   └─ 分享
   ├─ 质量 AgentLoop
   │   ├─ 可观测
   │   ├─ 评测
   │   ├─ 实验
   │   ├─ 安全/治理
   │   └─ 沙箱/回测
   ├─ 能力
   │   ├─ 模型
   │   ├─ MCP
   │   ├─ Skill
   │   └─ Prompt
   └─ 治理
       ├─ 审计
       ├─ 配额
       ├─ 凭证
       └─ 可观测
```

## 3. 各层页面

### 3.1 指挥中心（应用层）

- 数字孪生战场：业务/任务/军团/角色映射；
- 态势：战役、军团、资源、风险；
- 干预：暂停/退回/接管/重派；
- 复盘：周期/成功率/人工介入/成本/复用；
- 组合：多业务域。

### 3.2 LoopForge（编排层）

- 流程/SOP：模板、定义、画布、版本；
- 角色数字人：Role 契约 + Employee；
- 小队/军团：编制、绑定 SOP；
- 需求/战役/审批。

### 3.3 OpenCode Harness（工程层）

- 云端工作区 + 桌面端；
- opencode + MCP + 模型；
- 应用/模板/分享；
- 快速接入。

### 3.4 AgentLoop（质量层）

- Trace/日志/指标；
- 评测/实验；
- 治理与安全；
- 沙箱/回测；
- 发布门禁。

### 3.5 能力/治理

- 模型/MCP/Skill/Prompt；
- 审计/配额/凭证/观测。

## 4. 核心对象

```text
AgentCore: Session/Run/ToolCall/Workspace
AgentLoop: Trace/EvalRun/Experiment/Policy/Backtest
OpenCode: Workspace/App/Share
LoopForge: Process/Role/Employee/Squad/Legion/LegionRun/Requirement/Approval
Command Center: Mission/Front/Risk/Intervention/Review
```

## 5. 关键流程

```text
业务目标
 → LoopForge 识别流程/角色
 → 编成小队/军团
 → AgentCore 执行
 → AgentLoop 观测/评测/安全/回测
 → 指挥中心态势/干预
 → 复盘/沉淀
```

## 6. 交互模式

| 模式 | 场景 |
| --- | --- |
| 数字孪生大屏/态势 | 指挥中心 |
| 画布 | SOP/角色/军团编制 |
| 工作区 | OpenCode Harness |
| 时间线 | AgentCore Run/AgentLoop Trace |
| 右侧抽屉 | 创建/编辑/审批 |
| 表格 | 任务/资产/评测 |

## 7. 权限

- 指挥官：态势/干预/审批；
- 领域专家：流程/角色；
- Builder：应用/分享；
- 质量：评测/安全/回测；
- 管理员：能力/治理；
- 审计：只读/导出。

## 8. 路线

| 阶段 | 重点 |
| --- | --- |
| Alpha | LoopForge 原型 |
| Beta | AgentCore Runtime、AgentLoop 闭环、OpenCode Harness 云边、指挥中心原型 |
| GA | 真实执行/HA/行业包/生态 |

> 相关：[UX](UX-DESIGN.md) · [架构](../02-architecture/ARCH-V5.md)
