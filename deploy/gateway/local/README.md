# 本地网关（dev）说明

## 目标

本地**不引入完整 Higress**，用 `local-gateway:8080` 作为统一 ingress，验证与生产**契约等价子集**（见 `docs/02-architecture/deploy/AI-GATEWAY.md §8.3`）：

- Host/Path 路由、鉴权头透传（不伪造 tenant）、错误模型、MCP `/mcp/*` 纯反代、SSE 不缓冲。

## 启动

```bash
# 默认：复用 deploy/local 的 local-gateway（:8080）
docker compose -f deploy/local/docker-compose.yml \
  -f deploy/gateway/local/docker-compose.gateway.yml --profile local-gateway up -d

# 可选：Envoy profile（:8081，更接近生产 L7）
docker compose -f deploy/local/docker-compose.yml \
  -f deploy/gateway/local/docker-compose.gateway.yml --profile envoy up -d
```

## 路由（local-gateway）

| 入口 | 上游 | 说明 |
|---|---|---|
| `http://console.localhost:8080` | console:3000 | 控制台 |
| `http://api.localhost:8080` | control-plane:4000 | API |
| `http://mcp.localhost:8080/mcp/*` | **mcp-hub:4104**（前缀重写） | 纯反代，不做工具策略 |
| `http://127.0.0.1:4104/v1/{orgSlug}/{serverSlug}` | mcp-hub 直连 | 排除网关因素的 E2E |
| `http://llm.localhost:8080` | mock-model:9100 | OpenAI 兼容 mock |
| `http://w-<id>.ws.localhost:8080` | workspace:4096 | 工作区 |

> **端口（lead 裁决 2026-11-08）**：`mcp-hub` 固定 **4104**（不改现有 compose）。入口 `local-gateway:8080/mcp/v1/{orgSlug}/{serverSlug}` → 去掉 `/mcp` → `mcp-hub:4104/v1/{orgSlug}/{serverSlug}`；`MCP_HUB_URL` 可覆盖（默认 `http://mcp-hub:4104`）。

## local-gateway 需要新增的 `/mcp/*` 路由（契约）

代码位于 `services/local-gateway/src/server.ts`（owner：平台后端；本目录只给契约与测试）：

```ts
const MCP_HUB = process.env.MCP_HUB_URL ?? "http://mcp-hub:4104";
const PREFIX = process.env.MCP_PATH_PREFIX ?? "/mcp";

if (url.pathname.startsWith(PREFIX + "/")) {
  const targetPath = url.pathname.slice(PREFIX.length); // /mcp/v1/x -> /v1/x
  const target = new URL(targetPath + url.search, MCP_HUB);
  // 纯反代：保留 method/body/headers（authorization、content-type、accept、mcp-session-id）
  // 不缓冲 SSE；超时 ≥300s；不注入工具策略
}
```

## 契约测试（双数据面）

```bash
# 本地
PLANE=local BASE_URL=http://api.localhost:8080 MCP_BASE_URL=http://mcp.localhost:8080 \
  bun test tests/contract/gateway-contract.test.ts

# staging（Higress）
PLANE=higress BASE_URL=https://api.staging.example.com MCP_BASE_URL=https://mcp.staging.example.com \
  bun test tests/contract/gateway-contract.test.ts
```

断言最小集：401/403/404/429 语义、错误 envelope 字段（code/message/request_id）、MCP JSON-RPC 流程、SSE 首帧 ≤1s 且 30min 不断连、ticket 一次性。
