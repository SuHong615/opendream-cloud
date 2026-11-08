# M2：AgentCore Runtime 垂直切片

> 状态：M2a 已实现（独立运行，未接管现有 UI/业务）。
> 契约：[PLANE-CONTRACT](../PLANE-CONTRACT.md) · 迁移：[MIGRATION-MATRIX](../MIGRATION-MATRIX.md)

## 1. 范围

M2 目标是先建立 **唯一的执行平面 API**，不搬迁现有业务：

- Session 创建/查询；
- Run 创建/查询/取消；
- 幂等键；
- 租户隔离；
- 标准 Error Body；
- 可插拔 `RuntimeProvider`（当前 Mock，后续 OpenCode/Sandbox）。

**不做**：
- 不接生产 UI；
- 不接管 `agent-workforce` 现有 Run；
- 不删除旧 API；
- 不做真实代码执行（M2b/M3）。

## 2. 服务

`services/agentcore`，端口 **4110**，SQLite 持久化（`/app/.data/agentcore.sqlite`）。

### API

```http
GET  /healthz
POST /api/v1/runtime/sessions
GET  /api/v1/runtime/sessions/{id}
POST /api/v1/runtime/sessions/{id}/runs
GET  /api/v1/runtime/runs/{id}
POST /api/v1/runtime/runs/{id}/cancel
```

Headers：
- `X-OC-Tenant`（控制面 BFF 转换自 `x-oc-org-id`）
- `Idempotency-Key`（写操作必须）
- `X-Request-Id`

> 当前 BFF 使用 `x-oc-org-id`/`x-oc-user-id` 内部头；对外仍由控制面鉴权。

### 状态

```text
session: created → active → closing → closed
run: queued → running → succeeded/failed/canceled
```

Mock Provider 生成 `plan/execute/verify` 三步与 usage，用于验证契约与 UI 后续接入，不代表真实执行。

## 3. 所有权

- Session/Run/Step/ToolCall：**AgentCore 唯一写**；
- LoopForge/Harness 只能读或调 API；
- 审批/策略不在此服务（审批归 LoopForge，PEP 后续在 AgentCore Gateway）。

代码层：
- `packages/contracts` 的 `assertOwner("session"/"run","agentcore")` 在路由中执行；
- `services/agentcore/test/agentcore.test.ts` 覆盖幂等/租户/终态。

## 4. 部署

`deploy/local/docker-compose.yml` 新增 `agentcore` 服务：

```yaml
ports: ["4110:4110"]
volumes: [agentcore-data:/app/.data]
```

控制面 BFF：`/api/v1/runtime/*` → `AGENTCORE_URL`（默认 `http://agentcore:4110`），透传幂等键。

## 5. 验收

| 检查 | 结果 |
| --- | --- |
| 服务测试 | 5/5 pass |
| 根测试 | 142 pass / 3 skip |
| BFF 链路 | session 201 → run 202（succeeded）→ get 200 |
| 持久化 | 重启后 Run 仍存在 |
| 租户隔离 | 跨租户 404 |
| 幂等 | 同 key 返回同一 Run |

## 6. 后续

1. **M2b 迁移工具已实现**：[Legacy Run 迁移](M2B-MIGRATION.md)（dry-run/apply/幂等/对账）；
2. 生产全量导入 + 对账 + 灰度读切换；
3. M3：OpenCode Harness 协议 + 真实沙箱 Provider；
4. 迁 UI：LoopForge 通过 AgentCore API 读取 Run，不再直连 workforce；
5. PG 主库替换 SQLite。
