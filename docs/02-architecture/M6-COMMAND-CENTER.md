# M6：数字军团指挥中心（应用平面）

> 状态：M6a 已实现（投影 API + 控制台页面）；M6b 已实现 cancel/send_back 干预派发，其余干预动作仍为 issued/待接 LoopForge。
> 契约：[PLANE-CONTRACT](../PLANE-CONTRACT.md)

## 1. 定位

应用平面 / 数字孪生驾驶舱：

- 消费事件投影，不直接执行 Agent；
- 只读态势 + 幂等指挥命令；
- 不双写 Run/Approval。

## 2. 服务

`services/command-center`（`:4113`）：

```http
POST /api/v1/command/events          # 事件投影（幂等）
GET  /api/v1/command/fronts          # 态势
POST /api/v1/command/interventions   # 干预命令（幂等）
GET  /api/v1/command/interventions
GET  /api/v1/command/reviews
```

事件来源：AgentCore/AgentLoop/LoopForge；当前接受事件上报，后续接 NATS 消费。

### 干预执行（M6b）

`POST /api/v1/command/interventions` 支持 `action=cancel|send_back`：Command Center 用租户/用户头调用 agent-workforce：

```text
cancel    → POST /api/v1/agent-runs/:runId/cancel
send_back → POST /api/v1/agent-runs/:runId/send-back  { reason }
```

并把结果写回干预记录：

| 结果 | 含义 |
| --- | --- |
| `dispatched` | 下游返回 2xx，Run 已取消 |
| `failed` | 下游 4xx/5xx 或网络错误，Run 未取消 |
| `issued` | 未配置 `AGENT_WORKFORCE_URL`，仅记录命令 |

`pause/resume/takeover/reassign` 目前仍是 `issued`，需要 LoopForge 命令 API（下一步）。

## 3. 控制台

新增 `/command-center`：

- 态势统计：事件/等待人工/失败/干预；
- 战场态势卡（优先读取 agent-workforce 的 LegionRun/Approval；不可用时回退事件投影）；
- 质量平面统计（Trace/Eval/Gate）；
- 最近干预命令；
- 只读投影提示。

截图：[command-center](../../05-delivery/evidence/brand/28-command-center.png)

## 4. 验收

| 检查 | 结果 |
| --- | --- |
| Command Center 测试 | 5/5 pass |
| BFF | event 201 → fronts 200 → intervention 202 |
| cancel 派发 | 202 `dispatched`，agent-workforce Run 变 `canceled` |
| send_back 派发 | 202 `dispatched`，reason 透传 |
| UI | `/command-center` 4 个统计卡、态势、质量统计 |
| 幂等/租户 | 通过 |

## 5. 后续

1. NATS 事件订阅，不靠手动上报；
2. 其余干预动作接入 LoopForge 命令 API（cancel 已执行）；
3. 复盘报告与成本归集；
4. 数字孪生可视化（军团/角色/任务图）。
