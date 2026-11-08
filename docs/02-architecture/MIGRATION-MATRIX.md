# P1-1 文件级迁移矩阵（AI Native 平面重构）

> 目的：在写任何大规模重构代码前，把现有文件映射到最终平面，明确 **保留 / 改造 / 迁移 / 新建 / 废弃**、依赖顺序与回滚点。
> 依据：[平面契约](PLANE-CONTRACT.md) · [ADR-018](adr/ADR-018-ai-native-planes.md) · [架构 V5](ARCH-V5.md) · [评审闭环](../04-reviews/AI-NATIVE-ARCH-REVIEW-RESOLUTION.md)
> 原则：**先契约、后适配、再迁移；旧路径兼容，禁止双写。**

## 1. 目标平面

| 代号 | 平面 | 目标服务/目录 |
| --- | --- | --- |
| AC | 执行平面 | `services/agentcore/`（新建） |
| HS | 工程平面 | `services/harness/`（新建协议/网关）+ `apps/desktop` + console harness |
| LF | 编排平面 | `services/orchestration/`（新建）+ `services/workflow-engine/`（保留为 SOP 引擎） |
| AL | 质量平面 | `services/agentloop/`（新建，聚合 eval/experiment/observability/audit） |
| CC | 应用平面 | `apps/console/app/command-center/` + `services/command-center/`（新建投影） |
| FOUND | 基础设施 | `apps/control-plane/`（BFF/身份/模型/MCP/Skill/凭证/配额）+ 现有 centers |

## 2. 迁移总表

### 2.1 执行平面 AgentCore（AC）

| 现有文件/目录 | 动作 | 目标 | 说明 |
| --- | --- | --- | --- |
| `services/agent-workforce/src/server.ts`（Session/Run/任务/执行部分） | 拆分/迁移 | `services/agentcore/` | 先抽 Runtime 接口，不搬业务编排 |
| `services/agent-workforce/src/executors.ts` | 保留/迁移 | `services/agentcore/executors.ts` | 执行器注册表属于 Runtime 适配 |
| `services/workspace-operator/` | 保留 | AC 的执行基础设施 | K8s Operator 不变，接口归属 AC |
| `services/local-gateway/` | 保留 | AC/HS 边缘 | 本地/云网关归属执行侧 |
| `apps/control-plane/src/provisioner/` | 迁移/适配 | AC Runtime adapter | 控制面不再直接管工作区生命周期 |
| `apps/control-plane/src/services/workspaces.ts` | 迁移 | AC Workspace service | 先保留兼容层，后切读 |
| `apps/control-plane/src/routes/workspaces.ts` | 保留门面/转调 | AC API | 过渡期 BFF 转发 |
| `apps/control-plane/src/routes/desktop.ts` | 部分迁移 | AC Session/模型代理 | 桌面配对/设备保留在控制面 |
| `packages/schema/workflow-v1` | 不变 | LF | 属于编排规范 |

**迁移顺序**：契约 → Runtime interface → Session/Run store → Workspace/Sandbox adapter → 控制面切读。
**回滚**：保留 `agent-workforce` 只读/旧 API；不删除旧表。

### 2.2 工程平面 OpenCode Harness（HS）

| 现有文件/目录 | 动作 | 目标 | 说明 |
| --- | --- | --- | --- |
| `apps/desktop/` | 保留/改造 | HS 端侧实现 | 统一 Session/Event/Permission 协议 |
| `apps/console/app/workspaces/` | 保留/改造 | HS 云端入口 | 工作区 UI 仍可用 |
| `apps/control-plane/src/routes/desktop.ts`（模型代理/配对） | 部分保留 | HS/控制面 | 配对/设备属于控制面；执行归 AC |
| `packages/`（opencode 配置生成） | 保留 | HS 配置 | `opencode-config.ts` 迁至 HS adapter |
| 新增 `services/harness/` | 新建 | HS 协议网关 | 统一 `/api/v1/harness/*` |
| 新增 `packages/harness-protocol/` | 新建 | HS 契约 | Session/Event/Tool/Permission/Snapshot |

**约束**：Harness 不创建云沙箱；cloud 模式调用 AC Runtime。

### 2.3 编排平面 LoopForge（LF）

| 现有文件/目录 | 动作 | 目标 | 说明 |
| --- | --- | --- | --- |
| `services/agent-workforce/src/server.ts`（Role/Employee/Squad/Legion/Requirement/Run） | 拆分/迁移 | `services/orchestration/` | 角色/军团/需求/审批归 LF |
| `services/workflow-engine/` | 保留 | LF 的 SOP 引擎 | 补 durable execution |
| `services/workflow-engine/src/engine.ts` | 改造 | LF | 事件历史/信号/定时器/补偿 |
| `apps/console/app/orchestration/loopforge/` | 保留/改造 | LF 工作台 | 拆分工作台/SOP/角色/军团/审批 |
| `apps/console/app/legions|requirements|approvals` | 重定向 | LF | 旧深链保留 |
| `apps/console/app/workflows/[id]/designer/` | 迁移 | LF SOP 设计器 | 路径改为 `/orchestration/sop/[id]/designer` |
| `apps/control-plane/src/routes/workforce.ts` | 保留门面/转调 | LF API | 过渡期 BFF |
| `apps/control-plane/src/routes/workflow-dh.ts` | 拆分 | LF/AC | workflow 归 LF，DH 后续 |
| 新增 `services/orchestration/` | 新建 | LF | 只持有 SOP/Role/Legion/Approval |

### 2.4 质量平面 AgentLoop（AL）

| 现有文件/目录 | 动作 | 目标 | 说明 |
| --- | --- | --- | --- |
| `services/eval-center/` | 合并/保留 | AL | 评测/数据集/评估器 |
| `services/experiment-center/` | 合并/保留 | AL | A/B/实验 |
| `apps/control-plane/src/routes/audit.ts`、`usage.ts`、`mcp.ts`（审计部分） | 迁移/投影 | AL | 统一 Trace/审计/成本 |
| `apps/control-plane/src/services/audit.ts` | 保留写入/双读 | AL | 过渡期事件投影 |
| `services/memory-service/` | 保留/集成 | AL/AC | Memory 归 Runtime；经验库可归 AL |
| `services/mcp-hub` 的 policy/audit | 拆分 | AL + AC PEP | 策略定义归 AL，执行 PEP 归 AC |
| 新增 `services/agentloop/` | 新建 | AL | Trace/Eval/Dataset/Experiment/Backtest/Policy |
| 新增 `docs` 回测/评测规范 | 新建 | AL | Trace2Dataset/发布门禁 |

### 2.5 应用平面 Command Center（CC）

| 现有文件/目录 | 动作 | 目标 | 说明 |
| --- | --- | --- | --- |
| `apps/console/app/orchestration/loopforge`（概览/Insights） | 拆分 | CC + LF | 态势/干预归 CC；编排归 LF |
| `apps/console/app/legions/[id]`（战役详情） | 保留/改造 | LF + CC | 详情读 LF，态势读 CC |
| `apps/console/app/orchestration` | 改造 | CC 默认 | 新增 `/command-center` |
| 新增 `services/command-center/` | 新建 | CC | 只读投影 + 幂等命令 |
| 新增 `apps/console/app/command-center/` | 新建 | CC | 数字孪生态势/干预/复盘 |

### 2.6 基础设施（FOUND）

| 现有文件/目录 | 动作 | 目标 | 说明 |
| --- | --- | --- | --- |
| `apps/control-plane/src/routes/auth.ts`、`org`、`api-keys` | 保留 | FOUND | 身份/租户 |
| `apps/control-plane/src/routes/models.ts`、`services/model-*` | 保留 | FOUND | 模型目录 |
| `apps/control-plane/src/routes/mcp.ts`、`services/mcp-hub` | 保留/拆分 | FOUND + AC PEP | MCP registry 保留，PEP 归 AC |
| `apps/control-plane/src/routes/skills.ts`、`prompts.ts` | 保留 | FOUND | 能力目录 |
| `apps/control-plane/src/routes/credentials.ts` | 保留 | FOUND | 凭证 |
| `apps/control-plane/src/routes/outbox.ts`、`services/outbox` | 保留 | FOUND | 事件基础设施 |
| `apps/control-plane/src/routes/eval.ts`、`experiments.ts` | 迁移 | AL | 质量平面 |
| `apps/console/app/models|skills|prompts|mcp|org|credentials|devices` | 保留 | FOUND | 管理入口 |
| `packages/shared/` | 保留/扩展 | FOUND/契约 | 不放业务规则 |

## 3. 依赖顺序

```text
1. 契约（contracts/PLANE-CONTRACT/ADR-018）
2. AgentCore Runtime interface + Session/Run store
3. Harness 协议 + 端/云适配
4. LoopForge 从 agent-workforce 抽离（Role/Legion/Run/Approval）
5. AgentLoop 聚合 eval/experiment/observability/audit
6. Command Center 只读投影
7. 旧路由/旧服务下线
```

**禁止顺序**：先改 UI/先拆目录/先删旧实现。每一步必须保留旧 API 兼容。

## 4. 兼容与回滚

| 项 | 兼容策略 | 回滚 |
| --- | --- | --- |
| 旧 `/api/v1/legions|roles|requirements|approvals` | BFF 转发 6 个月 | 切回旧实现 |
| 旧 `/api/v1/workflows` | 保留；新增 `/orchestration/*` | 切回 workflow-engine |
| 旧 `/orchestration/loopforge` | 保留；新增 `/command-center` | 保留路由 |
| 旧 SQLite | 双写 PG；读切换灰度 | 停双写回 SQLite |
| 旧 `agent-workforce` | 保留为 adapter | 回滚到旧进程 |
| 旧 Console 页面 | 重定向/保留 | 恢复导航 |

## 5. 里程碑与验收

| 阶段 | 交付 | 验收 |
| --- | --- | --- |
| M1 契约 | contracts 包 + PLANE-CONTRACT + 事件 schema | 契约测试通过；唯一写入口 |
| M2a AgentCore | Session/Run API + adapter | **已实现**：`services/agentcore` Session/Run/取消/幂等/租户；未接管旧 UI |
| M2b Legacy 迁移 | Run 导入/对账/灰度读 | **迁移工具 + 旧写双写镜像 + AGENTCORE_LEGACY_READ 灰度读已实现** [M2B-MIGRATION](M2B-MIGRATION.md)；默认关闭 |
| M3 Harness | 协议端/云统一 | **M3a 已实现**：`services/harness` Session/Permission/Events/Snapshot；cloud 调 AgentCore |
| M4 LoopForge | 角色/军团/审批迁移 | **M4a 已实现** `/api/v1/orchestration/*` 过渡命名空间；M4b ownership 迁移待做 |
| M5 AgentLoop | Trace/Eval/Experiment/Backtest | **M5a 已实现** `services/agentloop` Trace/Eval/Backtest/Gate；真实 Judge/实验待做 |
| M6 Command Center | 投影/干预/复盘 | **M6a + cancel/send_back 派发已实现** 投影 API + `/command-center` 页面；cancel/send_back 调 agent-workforce；NATS/其余干预待做 |
| M7 下线 | 旧路由/旧表 | M7a 弃用/重定向完成；M7b 删除待 ownership 切换后 |

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| 双写不一致 | Outbox + 对账 + 回滚开关 |
| 审批双源 | 契约唯一 `approval_id`；迁移期只读旧 |
| 工作区/沙箱三归属 | AgentCore 唯一 owner；Harness 不写云沙箱 |
| 大爆炸 | 禁止；按 M1–M7 顺序 |
| 旧测试回归 | 每阶段跑全量 E2E |

## 7. 结论

先做 **M1 契约与 contracts 包**，再做 M2 AgentCore。当前 **不删除/不重命名** 现有目录；所有迁移通过 adapter/BFF 渐进完成。
