# AGENT-WORKFORCE（数字员工 / 专家小队）v0.1

> 本文的“数字人”指 **Agent 里的数字员工（Digital Employee）与专家小队（Expert Squad）**，
> 即融入企业应用的 AI 同事与多 Agent 协作团队，**不是**短视频虚拟人/虚拟形象/RTC 音视频。
> 原 `services/digital-human`（头像/音色/RTC）降级为 legacy 演示，不再作为平台核心模块。

## 1. 概念

| 概念 | 定义 | 与 Agent 的关系 |
| --- | --- | --- |
| 数字员工 Digital Employee | 有岗位、职责、技能、MCP 工具、记忆范围、自治级别与绩效的 AI 同事 | 一个可复用的 Agent 配置（persona + skills + tools + memory + policy） |
| 专家小队 Expert Squad | 由 lead + specialists + reviewer 组成、可编排/委派/评审/升级的 Agent 团队 | Agent 的编排单元：router / sequential / parallel / debate |
| 小队运行 Run | 一次业务目标（goal）触发的小队协作实例，含任务、消息、产物、人工审批、用量 | Agent 会话/任务树 |
| 企业应用嵌入 | 应用通过 app_id + embed token 调用小队，7x24 运行并写审计 | App Center 应用的一种能力 |

## 2. 数据模型（MVP 内存；生产 PostgreSQL）

- `agent_employees`：id、org_id、name、role(lead/specialist/reviewer/operator)、title、mission、skills[]、mcp_servers[]、memory_scope、autonomy、status。
- `agent_squads`：id、org_id、name、mission、orchestration、lead_id、member_ids[]、app_ids[]、human_gates[]、sla_minutes。
- `agent_runs`：id、org_id、squad_id、goal、app_id、status、tasks[]、messages[]、artifacts[]、approvals[]、usage。
- `agent_run_tasks`：employee_id、title、status、output、started_at、finished_at。
- 生产补充：`agent_employee_versions`、`agent_memories`（复用 memory-service）、`agent_schedules`、`agent_evaluations`、`agent_audit`。

## 3. API（MVP，控制面门面）

服务 `agent-workforce:4106`，对外只经 control-plane `/api/v1/agent-*`（session + CSRF + 审计 + 502）：

- `GET/POST /api/v1/agent-employees`、`GET/PATCH /:id`
- `GET/POST /api/v1/agent-squads`、`GET /:id`
- `POST /api/v1/agent-squads/:id/runs` `{goal, app_id?, context?}`
- `GET /api/v1/agent-runs`、`GET /:id`
- `POST /api/v1/agent-runs/:id/advance`（推进下一任务）
- `POST /api/v1/agent-runs/:id/approve` `{gate?, decision}`
- `POST /api/v1/agent-runs/:id/cancel`
- `POST /api/v1/agent-squads/:id/embed-sessions` `{app_id, permissions}` → embed token（企业应用内嵌）

## 4. 运行语义

1. 用户/应用给出 goal；
2. lead 拆解并生成任务树（每个 member 一个任务）；
3. 按 orchestration 顺序执行，任务产出写消息与 artifacts；
4. 到达 human gate（如发布/退款/付款）→ `waiting_human`，人工 approve/reject；
5. 全部完成 → `completed`；拒绝/取消 → `failed/canceled`；
6. 全程记录 token/cost 与审计，可 7x24 调度。

## 5. 与平台其他模块

- **App Center**：应用绑定 squad（app_ids / embed token），用户在业务系统内直接唤起专家小队；
- **MCP 中心**：员工的 `mcp_servers` 走 MCP 网关 + 工具白名单/PEP；
- **Memory**：员工/小队按 scope 读写 memory-service；
- **Workflow**：workflow 节点可调用 squad run，squad 也可触发 workflow；
- **Eval**：对员工/小队做任务成功率、人工接管率、SLA、成本评测；
- **Observability**：runs/tokens/cost/失败率进 overview；
- **权限**：员工/小队属于 org，可分享到 team/app；human gate 强制 RBAC。

## 6. 已知限制（MVP）

- 内存 store，重启丢失；生产 PostgreSQL + Temporal；
- LLM 为合成演示输出，未接真实模型网关；
- 未实现排班/触发器（cron/webhook/事件）与绩效面板；
- embed token 为 mock，生产需签名 + 短 TTL + origin 校验；
- 未接 ASR/TTS/RTC（那属于 legacy digital-human，不是本模块）。
