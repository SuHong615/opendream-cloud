# LoopForge 洞察与 OpenDream「数字军团」整合设计

> 研究对象：[Tencent/LoopForge](https://github.com/Tencent/LoopForge)（MIT）。
> 目标：把 LoopForge 的「SOP + 角色 + 沙箱 + 人工门禁 + 运行证据」能力，融入 OpenDream 既有的
> 工作区 / 数字员工 / 专家小队 / 工作流 / 模型中心 / MCP / Skill / 评测 / 审计体系，
> 形成**以流程为编制的企业级数字军团**，并驱动业务飞轮。
> 本文仅为架构与产品研究，不复制 LoopForge 代码；其 MIT 许可与第三方声明仍归其权利人。

## 1. LoopForge 的关键设计

| 能力 | LoopForge 做法 | 价值 |
| --- | --- | --- |
| **SOP** | 可视化流程图，节点为 Agent / Script / Human gate / Sub-SOP / Preview | 把“偶然成功”变成可重复交付 |
| **Role** | 复用的 prompt + executor + model + rules + Skills + MCP + artifacts + gates | 职责分离，规划/实现/评审/测试各司其职 |
| **Chat + Main Bot** | 对话入口，按需创建 Docker conversation workspace、调用子 Agent | 探索与快速修改 |
| **Run / 审批** | 节点级状态、日志、artifact、人工门禁、send-back、retry、rerun | 可观测、可干预、可恢复 |
| **Requirement → Delivery** | 需求贯穿 SOP 与聊天两条路径，关联 PR/MR 与成本 | 全链路追溯 |
| **Executor 抽象** | CodeBuddy / Codex / Claude Code / OpenCode / Cursor CLI 等 | 不绑定单一编码 Agent |
| **Sandbox** | Docker 容器隔离，仓库检出；平台 worker / 本地执行机 | 真代码、真测试、真交付 |
| **Insights** | 工程指标、业务报告、token/成本核算 | 用数据驱动 SOP 演进 |
| **Local** | 在 Claude Code / Codex 等宿主内安装工作流 | 开发者本地体验 |

**LoopForge 的边界**：Go + MySQL、面向可信团队、默认 Docker socket、以软件开发交付为主。
OpenDream 不直接照搬，而是吸收其**过程编排与治理模型**，落在自身企业级私有化架构上。

## 2. 整合原则

1. **流程优先，而非 Agent 堆叠**：军团以 SOP/流程为编制，Agent 是可替换的执行角色。
2. **数字人 + 数字军团双层**：数字员工是“岗位”，小队是“班组”，军团是“按流程编成的作战单元”。
3. **人机同流程**：Agent、脚本、人工审批、子流程在同一条 Run 里，统一状态、证据与审计。
4. **执行器可插拔**：opencode、Codex、Claude Code、CodeBuddy、自研 Agent 均可作为节点执行器。
5. **私有化与异步优先**：Postgres 状态、NATS Outbox、worker 租约、幂等、DLQ；不依赖云 SaaS。
6. **度量闭环**：每个需求、战役、SOP、角色、执行器都有成本、时延、成功率、人工介入指标。

## 3. 目标领域模型

```
企业 Enterprise
 └─ 业务域 Domain（研发 / 客服 / 财务 / 数据 / HR）
     └─ 数字军团 Legion（流程编制 + KPI + 小队集合 + 治理策略）
         ├─ SOP / Process（版本化流程；节点：Agent / Script / HumanGate / SubSOP / Preview）
         ├─ 专家小队 Squad（lead + members + 编排方式 + 人工门禁）
         │   └─ 数字员工 Agent（岗位、技能、MCP、记忆、自治、执行器）
         └─ 战役 Campaign / LegionRun（一次需求或目标的全链路执行）
             ├─ SquadRun / AgentRun
             ├─ Requirement（需求编号、验收标准、关联交付）
             ├─ HumanTask（审批 / send-back / 补充上下文）
             └─ Artifacts / Delivery（PR、文档、报告、成本）
```

### 核心概念

| 概念 | 定义 | 现有对应 |
| --- | --- | --- |
| 数字员工 | 有岗位、技能、MCP、记忆、自治与权限的 AI 同事 | `agent-workforce` Employee |
| 专家小队 | lead + members，按 sequential/parallel/router/debate 编排 | Squad |
| **数字军团** | 按业务流程编成、可独立承接业务目标的小队集合与治理边界 | **新增 Legion** |
| SOP / 流程 | 可版本化的节点图，含 Agent/Script/人工/子流程 | Workflow DSL（扩展节点） |
| 战役 | 一次军团级需求执行，聚合多个 SquadRun | **新增 LegionRun** |
| 需求 | 业务提出的目标与验收标准 | 新增 Requirement（规划） |
| 执行器 | 实际运行 Agent 的引擎/CLI | 模型中心 + opencode/Codex/… |
| 运行证据 | 节点日志、产物、审批、成本 | Run artifacts + audit + usage |

## 4. LoopForge → OpenDream 映射

| LoopForge | OpenDream 落地 | 说明 |
| --- | --- | --- |
| Workspace（Docker） | 云端 Workspace / K8s sandbox / 桌面端 | 多租户隔离用 K8s + NetworkPolicy，不用宿主 Docker socket |
| Main Bot | 军团指挥官 / 数字员工 | 可对话、可创建战役、可接管 Run |
| Role | 数字员工（agent_type：harness/high_code/managed/registered） | 角色 prompt/模型/MCP/Skill 组合 |
| SOP 节点 | Workflow DSL 扩展：agent/script/human/sub_sop/preview | 复用 workflow-engine + packages/schema |
| Team | 专家小队 | 已有 |
| Requirement | Requirement Center | 新增，关联 LegionRun / Delivery |
| Run / Artifacts / Approvals | WorkflowRun / AgentRun / 审批中心 | 已有基础，补齐统一视图 |
| Scheduler | agent-schedules + workflow scheduler | 已有，补分布式租约 |
| Insights | 观测 + usage + eval | 扩展军团/流程维度 |
| Executor | opencode / Codex / Claude Code / CodeBuddy 适配器 | 统一 runtime 接口 |
| Local | OpenDream Code 桌面端 | 本地引擎 + 云端模型/MCP 同步 |
| MySQL + Go | PostgreSQL + 现有 Bun/TS 控制面 | 私有化 HA，避免双技术栈 |

## 5. 目标架构

### 5.1 模块边界

LoopForge 不是工作流中心的子页面，而是**编排中心下的独立编排模块**：

```
编排中心 /orchestration
  └─ LoopForge 交付工作台 /orchestration/loopforge
       ├─ 工作台：Main Bot 会话 / 战役上下文
       ├─ SOP：模板 / 定义 / 节点能力 / 节点预览 / 从模板创建 / **可视化画布设计器（拖拽/连线/节点属性/角色/模型/执行器/审批/脚本/版本对比/回滚）**
       ├─ 角色：可复用 Role 注册表（Prompt / 模型 / 执行器 / Skills / MCP / Rules / 交付物 / 人工门禁）
       ├─ 军团：组建 / 详情 / 下达战役
       ├─ 需求：登记 / 下达军团
       ├─ 战役与运行：LegionRun / SquadRun / 工作流运行
       ├─ 审批：通过 / 退回重做 / 驳回
       ├─ 能力：数字员工 / Agent 模板 / Skill / MCP / 模型 / 凭证 / **执行器注册表**
       ├─ 评测：评测运行 / 数据集
       └─ 治理：审计 / Outbox / 凭据 / 配额 / 观测
```

- **权威入口**：`/orchestration/loopforge`
- 旧入口 `/workflows/loopforge` 重定向到 `/orchestration/loopforge`；`/legions`、`/requirements`、`/approvals` 保留为深链兼容，不再占据主导航。
- 数据面复用 `agent-workforce`、`workflow-engine`、`eval-center`、`skill-center`、`mcp-hub`、`control-plane`，不新造一套运行时。
- 模块只负责**交付编排体验与领域聚合**，不复制各中心的数据与权限。

### 5.2 架构链路

```
SOP（workflow-engine） ─┬─ 评测（eval-center）
Role（agent-workforce） ├─ 能力（skill-center / mcp-hub / model center）
Requirement ────────────┼─ 审批（human gate）
Legion / Campaign ──────┼─ 治理（audit / credential / quota / outbox）
Delivery ───────────────┴─ 洞察（insights / usage）
```


### 数字军团运行链路

1. 业务提出需求（Requirement）。
2. 选择军团 / SOP，创建 **LegionRun（战役）**，返回 `202`。
3. Outbox 发布 `legion.run.requested`，NATS 投递给 worker。
4. Orchestrator 按 SOP 拓扑创建 SquadRun/节点任务。
5. Agent 节点调用执行器；Script 节点跑确定性脚本；HumanGate 创建人工任务。
6. 人工审批 / send-back / retry 以持久化任务驱动，不依赖内存。
7. 交付物写入 Artifact/Delivery；成功/失败/成本回写。
8. Insights 汇总：时延、一次通过率、人工介入率、成本、SOP 复用率。

## 6. 异步与高可用

- **状态**：LegionRun / NodeRun / HumanTask 全部 Postgres；禁止生产使用内存 Map。
- **事件**：业务事务写 Outbox；publisher 投递 NATS；消费者幂等。
- **调度**：worker 从队列拉取；Redis/数据库租约避免多副本重复执行；心跳续租。
- **失败**：节点级重试 + 指数退避 + DLQ；Saga 补偿；人工介入后可重放。
- **人工门禁**：持久化任务 + SLA 计时 + 升级通知；审批后继续同一 Run。
- **多副本**：无状态控制面/worker ≥3；Postgres HA；NATS 3；MinIO 4；Redis Sentinel。
- **可观测**：每次 Run 一个 trace；节点耗时、token、成本、执行器、错误码。

## 7. 业务飞轮

```
更多业务需求
   → 军团按 SOP 承接（更快、更稳）
   → 交付数据 + 人工反馈
   → Skill / Prompt / SOP 版本沉淀
   → 一次通过率↑、人工介入↓、交付周期↓
   → 可承接更多需求 / 更高价值场景
```

### 飞轮指标

| 指标 | 定义 | 目标 |
| --- | --- | --- |
| 需求吞吐 | 每周完成战役数 | 持续上升 |
| 交付周期 | Requirement → Delivery | 持续下降 |
| 一次通过率 | 无需 send-back 的 Run 比例 | 上升 |
| 人工介入率 | 有人工 gate/接管 Run 比例 | 降到合理水平 |
| 单交付成本 | token + 执行器 + 人工 | 下降 |
| SOP 复用率 | 使用既有 SOP 的战役比例 | 上升 |
| Skill/MCP 复用 | 被引用资产数 | 上升 |
| 军团利用率 | 活跃小队 / 总小队 | 提升 |

## 8. 实施路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P0 数字军团 MVP** | Legion/LegionRun 数据、dispatch、SquadRun 聚合、Insights、控制台 `/legions` | ✅ 本轮 |
| P1 | SOP 节点扩展（agent/script/human/sub_sop/preview）、SOP 设计器、版本化 | 规划 |
| P2 | Requirement Center + 审批中心 + 交付物/PR 关联 | 规划 |
| P3 | 执行器适配器（opencode/Codex/Claude Code/CodeBuddy）、K8s sandbox | 规划 |
| P4 | Postgres/NATS 持久化、HA、成本/军团经营看板 | 规划 |
| P5 | IM 入口、外部 Agent 纳管、生态 Skill/MCP 市场 | 规划 |

## 9. 本轮已实现（MVP）

- `agent-workforce` 新增：
  - `Legion`：军团（业务域、使命、SOP 引用、小队集合）
  - `LegionRun`：战役（目标、需求编号、SquadRun 聚合、状态）
  - `GET /api/v1/legions`
  - `POST /api/v1/legions`
  - `GET /api/v1/legions/{id}`
  - `POST /api/v1/legions/{id}/dispatch`
  - `GET /api/v1/legions/{id}/insights`
  - `GET /api/v1/legion-runs`
- 需求中心：
  - `GET/POST /api/v1/requirements`
  - `PATCH /api/v1/requirements/{id}`
  - `POST /api/v1/requirements/{id}/dispatch`（需求 → 军团战役）
- 角色注册表：
  - `GET/POST /api/v1/roles`
  - `GET/PATCH /api/v1/roles/{id}`
  - 角色包含 Prompt / 模型 / 执行器 / Skills / MCP / Rules / 交付物 / 人工门禁
- 工作台：
  - Main Bot 会话直接创建军团战役
  - 右侧显示当前战役、SquadRun、角色/SOP/待审批上下文
- 审批中心：
  - `GET /api/v1/approvals`（聚合所有等待人工 gate 的 Agent Run）
  - 审批/驳回复用 `/api/v1/agent-runs/{id}/approve`
  - **退回重做**：`POST /api/v1/agent-runs/{id}/send-back`（保留 Run，回退上游节点重做）
- 控制面代理 `/api/v1/legions`、`/api/v1/legion-runs`、`/api/v1/requirements`、`/api/v1/approvals`
- 控制台：
  - `/legions`：军团卡片、**组建军团**（选择 SOP + 专家小队）、下达战役右侧抽屉、战役列表
  - `/legions/{id}`：军团详情、SOP/小队/战役/成功率/成本指标、关联需求、战役时间线
  - `/requirements`：需求登记 + 下达军团
  - `/approvals`：统一审批收件箱（通过 / 退回重做 / 驳回）
- 种子军团：软件交付 / 客户运营 / 财务合规
- **持久化**：军团 / 需求 / 战役 / **SquadRun/AgentRun** 已写入 `agent-workforce` SQLite（compose volume），服务重启后保留；进行中的 Run 会重新入队。
- **Postgres 路径**：设置 `DATABASE_URL` 后，同一份状态双写 `workforce_state(kind,id,data jsonb)`，启动时用 Postgres overlay 覆盖 SQLite；本地 compose 已带 `postgres:16-alpine`（`:55432`）。
- **执行器注册表**：`opencode` / `codex` / `claude-code` / `codebuddy` / `sandbox` / `mock`，通过 `GET /api/v1/executors` 暴露，并支持 `POST /api/v1/executors/{id}/probe` 探测 CLI 是否安装；SOP Agent 节点可选择执行器，CLI 执行器只声明契约，实际进程由执行机/沙箱承担。

> NATS JetStream 异步 worker 与 K8s HA 演练仍是生产化剩余项；本地队列已具备持久化恢复能力。

## 10. 不做 / 风险

- 不直接 fork LoopForge Go 引擎，避免双栈维护；
- 不使用宿主 Docker socket 做多租户隔离；
- 不把“数字人”理解为短视频虚拟人；数字人是企业岗位型 Agent；
- 军团不是静态组织图，必须绑定流程、指标、审批与交付数据，否则会退化为 Agent 列表。

## 11. 验收清单

- [ ] 一个军团可绑定 ≥1 个 SOP 与 ≥1 个小队
- [ ] 一次战役生成多个 SquadRun 并聚合状态
- [ ] 人工 gate 可暂停/恢复/退回
- [ ] 需求、Run、Artifact、成本可追溯
- [ ] Insights 可视化飞轮指标
- [ ] Postgres 持久化 + NATS 异步 + HA
- [ ] 执行器可插拔 + Sandbox 隔离
