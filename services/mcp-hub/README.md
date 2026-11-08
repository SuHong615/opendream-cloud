# MCP Hub（G5 服务骨架）

基于 **FROZEN** `openapi.yaml` 与 `centers/ROUTES.md` 的 MCP 中心骨架：14 公开 ops + 内部代理/探活/审计端点。

## 启动

```bash
cd services/mcp-hub
bun run dev      # http://127.0.0.1:4104
bun run test
bun run typecheck
```

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `4104` | 监听 |
| `DEFAULT_ORG_ID` / `DEFAULT_USER_ID` | dev UUID | 租户模拟默认 |
| `BINDING_TOKEN_TTL_SECONDS` | `86400` | binding token TTL（≤ 工作区生命周期） |
| `MOCK_PROBE_MS` | `0` | mock 探活延迟 |
| `PROXY_RATE_LIMIT_PER_MIN` | `600` | 代理限流（骨架计数） |

租户模拟头：`x-oc-org-id` / `x-oc-user-id` / `x-oc-roles`。

## 已实现（公开 14 ops）

- Servers：`listMcpServers`、`createMcpServer`、`getMcpServer`、`updateMcpServer`、`deleteMcpServer`
- Health：`getMcpServerHealth`（历史）、`checkMcpServerHealth`（主动探活）
- Lifecycle：`reviewMcpServer`、`publishMcpServer`
- Bindings：`listMcpBindings`、`createMcpBinding`、`deleteMcpBinding`、`rotateMcpBindingToken`（token 明文仅一次）
- OAuth：`mcpOauthCallback`（`security: []`，state 校验）

内部（不进公开网关/SDK）：`/internal/mcp/servers/{serverId}/{test-connection|credentials|tools}`、`/internal/mcp/calls`、`/internal/mcp/proxy/{bindingId}`、`/internal/mcp/webhooks/health`。

## 契约/安全要点

- **stdio 仅无凭证白名单**：`transport=stdio` 且 `auth_type≠none` → 400（凭证型 stdio 降 M5.2，需安全审批）。
- **远程凭证不出 Hub**：`mcp_credentials` 只存 KMS 引用；代理在 Hub 侧注入。
- **binding token**：明文仅 create/rotate 返回一次；库中只存 `sha256(token)`；代理校验 `Authorization: Bearer`，校验失败 401（`code=unauthorized, reason=mcp_auth_required`）。
- **工具级授权**：`allowed_tools` 在代理侧强制；越权返回 JSON-RPC error + 审计 `mcp.tool.denied`。
- **审计 100%**：每次代理调用写 `mcp_call_logs`（tool/status/latency/args_hash，无明文参数）。
- **健康状态**：`pending|healthy|degraded|down`；`GET .../health` 返回最近记录，`POST .../health-check` 主动探活并留痕。
- 门禁/状态冲突：`409` + `precondition_failed` + `reason=gate_blocked`（如未审核直接发布）。
- 分页：`?cursor&limit` + `{items,next_cursor}`。

## 未实现（G5 集成阶段）

| 项 | 说明 |
| --- | --- |
| 真实上游连接 | `src/proxy.ts` mock；接 MCP 官方 SDK（streamable HTTP/SSE）与超时/熔断 |
| KMS 凭证加密 | 骨架只存 `credential_ref`；接 KMS 信封加密与刷新 |
| OAuth | 骨架用内存 state；接真实 authorize/token/refresh 与 PKCE |
| 健康探针 | mock 同步；接 60s 探针、3 失败→down、2 成功→healthy |
| PG/审计落库 | 内存；接 `mcp_call_logs`/`mcp_health_checks`/`mcp_credentials` 分区表 |
| 限流/Redis | 进程内计数；多副本接 Redis 令牌桶 |
| 观测 | OTel span=operationId、代理指标接入平台 |

## 契约自检

`bun run test` 的 `contract.test.ts`：公开 ROUTES ⊆ 冻结 openapi、opId 命中、P2 为 0、内部端点隔离、stdio 凭证拒绝、token 一次性、代理审计与越权拒绝。
