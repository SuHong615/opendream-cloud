# ADR-V3-04：工作流引擎 —— Temporal 生产 + 轻量状态机 MVP（同一 Runtime Port 与 DSL）

- 状态：**Accepted（建议；与 pm-research WORKFLOW.md 联合口径）**
- 日期：2026-11-08
- 决策者：architect（引擎与执行语义） / pm-research（DSL 规范）
- 关联：`ARCH-V3.md §9`、`services/WORKFLOW.md`、`ADR-V3-02`（协同审批）、`ADR-V3-03`（数字人）

## 背景

v3 业务层需要：SDLC 工作流（需求→设计→开发→测试→发布→运维）与通用工作流（客服、审批、数据分析、运维值班、数字人接待）。关键需求：

- 7×24、长流程（小时~天级）、人工审批节点、定时/事件触发；
- 持久化、重试、补偿、审计回放、版本化；
- 与 opencode 工作区（Agent 节点）、MCP Gateway（工具节点）、App Center（发布节点）协作；
- MVP 要快（本地可跑、无重运维），生产要稳。

候选：Temporal（自建/Cloud）、Cadence、Argo Workflows、Camunda/Zeebe、自研状态机。

## 决策

**双层落地，同一契约：**

| 阶段 | 实现 | 说明 |
| --- | --- | --- |
| **MVP（本地/首版）** | **轻量状态机 + PG 持久化 + Redis Streams 触发** | 单进程 worker + outbox；无 Temporal 运维成本；覆盖串行/条件/人工/定时/子流程 |
| **生产（7×24）** | **Temporal（自建于 ACK）** | 持久化 workflow history、重试/补偿、人工任务 Signal、定时器、版本化、可观测 |

**强制约束：两者共用同一 `WorkflowRuntime` Port 与同一 DSL/同一套持久化表**，保证 MVP → Temporal 是**替换适配器**而不是重写业务。

```ts
interface WorkflowRuntime {
  start(defVersionId: string, input: Json, opts: StartOpts): Promise<RunRef>
  signal(runId: string, name: string, payload: Json): Promise<void>
  cancel(runId: string, reason: string): Promise<void>
  query(runId: string): Promise<RunState>
  listHumanTasks(filter: HumanTaskFilter): Promise<Page<HumanTask>>
  completeHumanTask(taskId: string, decision: Decision): Promise<void>
  replay(runId: string, fromSeq?: number): Promise<WorkflowEvent[]>   // 基于事件表，不依赖引擎
}
```

### 1) 引擎与部署形态

- **自建 Temporal on ACK**（不用 Temporal Cloud）：数据驻留/合规可控，凭证与 workflow payload 不出 VPC。
- 持久化：**RDS PostgreSQL 16**（Temporal 官方支持）；MVP/中量足够；>5k workflow/s 或历史表膨胀再评估 Cassandra。
- Visibility：PG 标准可见性；**复杂检索走平台自己的 `workflow_instances` 表**（不引入 Elasticsearch）。
- 组件：frontend×3 / history×3 / matching×3 / worker 按能力分**6 队列**（`wf-agent`/`wf-tool`/`wf-human`/`wf-timer`/`wf-script`/`wf-render`）×N；平台任务在 `platform-system` namespace 用 `wf-platform`；PDB + 独立 DB schema + 每日备份；**mTLS + 仅集群内网**。
- 命名空间：**每环境一个租户 namespace**（`workflows`）+ **一个平台 namespace**（`platform-system`，放 Watchdog/计费/巡检），避免平台任务被租户限流/故障拖垮。

### 2) 租户隔离（与 pm 口径一致）

- 单 namespace + `tenant_id` 自定义 search attribute + `workflow_id` 前缀 `wf:{tenant}:{id}`。
- **search attribute 不是安全边界**：Visibility 查询只允许控制面 API 代理；前端不可直连 Temporal；workflow payload 禁放密钥（只放 `credential_ref`）。
- `WorkflowIdReusePolicy` 明确（默认 `AllowDuplicateFailedOnly`）；`WorkflowExecutionTimeout` 显式（SDLC ≤30d，通用 ≤7d）；`WorkflowRunTimeout` 按节点类型。
- task queue 按能力分（避免长任务阻塞短任务）；Worker 水平扩缩（KEDA 按队列积压）。**队列名冻结为 6 个**（与 `WORKFLOW.md:171` 一致）：`wf-agent`/`wf-tool`/`wf-human`/`wf-timer`/`wf-script`/`wf-render` + 平台 `wf-platform`。

### 3) 触发与事件总线

- **MVP：Redis Streams**（消费组 + `MAXLEN≈1e6` + 积压告警）；**生产：NATS JetStream**（比 Kafka 轻，ACK 易运维）；超 5k events/s 或多地域再评估 Kafka。
- 事件信封（版本化）：`event_id, type, version, tenant_id, thread_id, occurred_at, payload, idempotency_key`。
- **at-least-once + 消费端按 `event_id` 幂等**；分区键 = `thread_id`（保序，对应 Super-agent "Thread 订阅直通"）。
- 关键 Trigger 走 **outbox 表 + 投递确认**，禁止"发后不管"。

### 4) 执行语义（architect 定义）

- 节点类型（DSL 由 pm 定义，语义固定 10 类）：`agent / mcp_tool / human_approval / condition / parallel / subworkflow / timer / webhook / script / render(digital_human)`。
- 实例状态：`pending → running → waiting_human | waiting_timer → succeeded | failed | canceled | compensating`。
- **幂等**：Activity 必须声明 `idempotent`；`idempotency_key={workflow_id}/{run_id}/{activity_id}/{attempt}`；非幂等节点默认**不重试**。
- **重试**：指数退避 + 最大次数（默认 3 次，可配）；可重试错误白名单（网络/429/5xx），业务错误不重试。
- **补偿**：有副作用的节点必须配补偿（Saga）；失败按**逆序**补偿；补偿失败进死信 + 人工任务。
- **取消**：级联到 opencode session（`POST /session/{id}/interrupt`）、MCP 调用、应用部署；取消后补偿未完成前不得标 `canceled`（标 `compensating`）。
- **人工任务**：`human_tasks` 表（assignee user/role/team、`sla_due_at`、escalation policy、decision/comment/attachments）；Temporal 用 Signal 唤醒；超时=SLA 升级（timer→child workflow）。
- **版本绑定**：实例绑定不可变 `dsl_version_id`；运行中实例不随 DSL 升级；新实例用新版本；Worker 用 Temporal Worker Versioning（或 DSL 版本门控）避免非确定性。`WORKFLOW.md` 的 WF-ADR-xx 编号统一改称“设计决策 D-WF-xx”，唯一 ADR 权威为本文件。
- **确定性约束**：workflow 代码内禁止网络/LLM/时间/随机；所有副作用走 Activity；这样 Temporal 重放才成立。
- **审计与回放**：`workflow_events`（append-only）+ Temporal history 双写；回放基于事件流（不依赖引擎），保证迁移后仍可回放。

### 5) 持久化表（与 DATA-MODEL 增补共享）

`workflow_definitions`、`workflow_versions`（不可变 DSL）、`workflow_instances`、`workflow_steps`、`human_tasks`、`workflow_artifacts`、`workflow_events`。全部带 `org_id`；`workflow_events` 按月分区（保留 180 天热 + 归档 1 年）。

### 6) 与现有系统集成

- Agent 节点：调 workspace API/SDK 执行（一次性任务或复用已有 session），产物引用 Git/PR；平台**不复制**工作区状态。
- 工具节点：走 MCP Gateway（审计/策略统一）。
- 发布节点：调 App Center（构建/部署/回滚），审批复用 `human_tasks`。
- 数字人节点：`render` 类，调数字人 Runtime（离线/近实时）。
- Watchdog：平台 namespace 内定时 workflow，只读诊断 + 告警；自动修复限"重启/重连"白名单动作。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. Temporal（采纳为生产）** | 持久化/重试/补偿/人工/定时/版本/可观测成熟；history 天然审计回放；Go/TS SDK 成熟 | **采纳** |
| **B. 纯自研状态机（长期）** | MVP 简单；但事件溯源/补偿/定时器/长流程恢复要自己补，长期成本高 | 仅 MVP |
| **C. Cadence** | 与 Temporal 同源但社区/生态弱于 Temporal | 否决 |
| **D. Temporal Cloud** | 省运维；数据驻留/合规与内网要求冲突，成本高 | P2 评估，不作默认 |
| **E. Camunda/Zeebe** | BPMN 强，适合业务审批；但 Agent/代码节点与容器任务集成不如 Temporal 自然；JVM 栈与团队不符 | 否决（可用作纯业务审批的备选） |
| **F. Argo Workflows** | 适合容器批处理 DAG；人工任务/长事务/信号语义弱 | 否决（可用于 CI/构建类子流程） |
| **G. 仅事件驱动 + 自研编排（无工作流引擎）** | 灵活；但长流程状态/补偿/审计不可控 | 否决 |
| **H. 双实现（MVP 状态机 + 生产 Temporal，同一 Port）** | 兼顾速度与长期；需要严格契约纪律 | **采纳**（即本决策） |

## 后果

**正面**
- MVP 无 Temporal 运维负担；生产获得工业级持久化与可观测。
- 同一 DSL/表/Port：迁移只换适配器，不重写业务流程。
- 审计回放独立于引擎（事件表），迁移/升级不丢证据。
- 与 MCP/Agent/App/数字人节点统一在一种编排模型内。

**负面 / 代价**
- 两套实现必须保持语义一致 → 需要**契约测试**（同一 DSL 在两种 runtime 上跑同一套用例，结果一致）。
- Temporal 自建运维成本（PG 历史表增长快，需归档/清理策略；frontend/history/matching 三组件要懂）。
- Worker 版本升级需遵守确定性约束（改 workflow 代码要小心）；需要版本化纪律。
- 长流程（30 天）占用 history 存储，需 retention 配置与归档。

## 实现要点

```yaml
# workflow instance（平台侧元数据，非 Temporal 内部）
instance:
  id: wfi_...
  tenant_id: acme
  definition_id: wfd_...
  dsl_version_id: wfv_...        # 不可变
  runtime: state_machine | temporal
  status: running
  input_ref: oss://wf/inputs/...
  correlation: { thread_id: ..., trigger_event_id: ... }
  limits: { execution_timeout_s: 2592000 }
```

- 迁移路径：MVP 用 `runtime=state_machine`；生产切换 `runtime=temporal`，**同一实例表**记录 `temporal_run_id`；存量长流程可"跑到结束"再迁移（或双跑校验）。
- 事件表：`workflow_events(instance_id, seq, type, node_id, payload_hash, created_at)`，回放工具只读该表。
- 死信：`workflow_dead_letters`（失败节点 + 输入 + 错误 + 可重试标记），人工处理后可重放。

## 验证

- 契约一致：同一 DSL（含条件/并行/人工/定时/补偿）在 MVP runtime 与 Temporal runtime 上结果一致（diff = 0）。
- 可靠性：kill worker → 实例恢复且不重复执行（幂等验证）；Temporal history 回放一致。
- 人工任务：超时升级触发；Signal 幂等；审批后继续。
- 审计：任意实例全链路事件可回放（消息/工具/审批/产物）。
- 性能：Trigger → 首节点启动 ≤2s P95；1000 并发实例（混合）无积压告警。
- 故障：Temporal 暂不可用时，Trigger 事件在 Stream/outbox 中积压不丢，恢复后继续。
