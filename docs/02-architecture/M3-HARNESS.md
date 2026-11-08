# M3：OpenCode Harness 协议垂直切片

> 状态：M3a 已实现（独立服务，未接管现有工作区 UI）。
> 契约：[PLANE-CONTRACT](../PLANE-CONTRACT.md) · 迁移：[MIGRATION-MATRIX](../MIGRATION-MATRIX.md)

## 1. 范围

建立 **一个 Harness 协议**，支持云端/端侧两种运行时：

- HarnessSession 创建/查询；
- Permission 请求/决策；
- Session Events（JSON + SSE）；
- WorkspaceSnapshot；
- 云端模式通过 AgentCore 创建 Runtime Session；
- 端侧模式不创建云沙箱。

**不做**：
- 不接管现有 `apps/desktop`/`apps/console` 工作区；
- 不实现真实文件/终端执行（由后续 Harness 网关/沙箱承担）；
- 不在此服务内做编排/审批（LoopForge 唯一）。

## 2. 服务

`services/harness`，端口 **4111**，SQLite（`/app/.data/harness.sqlite`）。

```http
GET  /healthz
POST /api/v1/harness/sessions
GET  /api/v1/harness/sessions/{id}
POST /api/v1/harness/sessions/{id}/permissions
POST /api/v1/harness/permissions/{id}/decide
GET  /api/v1/harness/sessions/{id}/events      # JSON；Accept: text/event-stream 为 SSE
POST /api/v1/harness/workspaces/{id}/snapshot
```

Headers：`x-oc-org-id`、`x-oc-user-id`、`Idempotency-Key`、`X-Request-Id`。

## 3. 云端/端侧

| 模式 | 行为 |
| --- | --- |
| `local` | 仅建 HarnessSession；运行时由端侧 opencode 承担 |
| `cloud` | 调用 AgentCore `POST /api/v1/runtime/sessions`，返回 `runtime_session_id` |

**约束**：Harness 不创建云沙箱、不写 Run/Approval。云沙箱归 AgentCore。

## 4. 权限

- `POST /sessions/{id}/permissions` 生成 `pending`；
- `POST /permissions/{id}/decide` 决策 `allow_once/allow_always/deny`；
- 事件：`harness.permission.asked/decided`；
- 决策可审计；重复决策 409；幂等键防重复。

## 5. 验收

| 检查 | 结果 |
| --- | --- |
| Harness 服务测试 | 4/4 pass |
| BFF 链路 | cloud session 201（含 runtime_session_id）、permission pending、decide allowed、events 3 条 |
| 幂等 | 同 key 返回同一 session/permission |
| 租户隔离 | 跨租户 404 |
| 云端模式 | 调 AgentCore 成功 |

## 6. 后续

1. M3b：真实 Harness 网关（opencode SDK/文件/终端/MCP）；
2. 接管桌面端/云端工作区 UI；
3. 接入 AgentCore Sandbox Provider；
4. 与 LoopForge 的 SOP 节点对接（通过 AgentCore，不直连）。
