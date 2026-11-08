# local-gateway `/mcp/*` 路由契约（纯反代）

> 代码位于 `services/local-gateway/src/server.ts`（owner：平台后端）；本文件只定义契约，供实现与 E2E 复用。
> 生产对应：Higress `/mcp/*` → MCP Gateway（工具级 PEP 在 MCP Gateway）；本地 `/mcp/*` → mcp-hub **纯反代，不做工具策略**。

## 需求

1. 路径：`/mcp/*` → `MCP_HUB_URL`（默认 `http://mcp-hub:4104`），前缀重写：`/mcp/v1/{orgSlug}/{serverSlug}` → `/v1/{orgSlug}/{serverSlug}`。
2. 方法/请求体/响应：完整透传（含 `POST` JSON-RPC、`GET` SSE）。
3. 关键头透传：`authorization`、`content-type`、`accept`、`mcp-session-id`、`mcp-protocol-version`、`last-event-id`。
4. SSE：**不缓冲**（`X-Accel-Buffering: no`），读超时 ≥300s；响应 `content-type: text/event-stream` 原样回传。
5. 错误：
   - 上游不可达 → `503 {"error":{"code":"service_unavailable","message":"mcp_hub_unreachable","request_id":"..."}}`；
   - 上游 4xx/5xx → 原样透传状态码与 body（不重写 JSON-RPC 错误）。
6. 安全：不注入工具策略、不改 JSON-RPC body；不记录 `authorization`；header 日志脱敏。
7. 配置：`MCP_HUB_URL`、`MCP_PATH_PREFIX`（默认 `/mcp`）；未配置时返回 404（默认拒绝，不回落工作区）。

## 验收用例（与 Higress 共用 `tests/contract/gateway-contract.test.ts`）

```bash
# 经事件：local-gateway
curl -s -X POST http://mcp.localhost:8080/mcp/v1/org-demo/crm \
  -H 'authorization: Bearer local-ticket' -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq -e '.result.tools | length > 0'

# 直连对照：mcp-hub（排除网关因素）
curl -s -X POST http://127.0.0.1:4104/v1/org-demo/crm -H 'authorization: Bearer local-ticket' ...

# SSE
curl -N http://mcp.localhost:8080/mcp/v1/org-demo/crm/sse -H 'authorization: Bearer local-ticket'
```

断言：两条路径返回等价 JSON-RPC 结果；SSE 首帧 ≤1s；上游断开返回 503 且错误 envelope 一致。
