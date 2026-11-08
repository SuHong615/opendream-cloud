# deploy/gateway · 统一 AI 网关制品（A4 / task-27）

本目录是 [docs/02-architecture/deploy/AI-GATEWAY.md](../../../docs/02-architecture/deploy/AI-GATEWAY.md) 的配套样例：

- **生产默认**：Higress on ACK（CNCF Sandbox），Gateway API 暴露；MCP 代理/REST-to-MCP、模型路由、语义缓存、Token 保护由 Higress 插件承担入口层；工具级授权/凭证在 MCP Gateway（PEP）。
- **可选**：agentgateway（`a2a.` 旁路，见 `gateway-api/20-httproutes.yaml` 注释）。
- **本地 dev**：`local/docker-compose.gateway.yml`（不引入完整 Higress）。

## 目录

| 路径 | 内容 | 生产是否 apply |
|---|---|---|
| `gateway-api/` | GatewayClass / Gateway / HTTPRoute（api、mcp、llm、console、ws、apps、dh、a2a；`/api/v1/workflows`、`/api/v1/dh`、`/api/v1/eval`、`/api/v1/memory` 经 control-plane 门面） | 是（需先装 Higress） |
| `higress/` | MCP Server 插件、AI Proxy、语义缓存、Token 限流、ext-auth | 是（或由控制面渲染） |
| `security/` | cert-manager Certificate、NetworkPolicy、ReferenceGrant | 是 |
| `ops/` | HPA/PDB、ServiceMonitor、Watchdog、备份、PrometheusRule | 是 |
| `values/` | Helm values（Higress on ACK） | helm install 用 |
| `local/` | 本地 compose + Envoy + mock MCP/DH | 否（仅本地） |

## 安装顺序

```bash
# 0) 前置：Gateway API CRD、cert-manager、Higress 命名空间、网关节点池
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml
helm repo add higress.io https://higress.io/helm-charts
helm upgrade --install higress higress.io/higress -n higress-system --create-namespace \
  -f deploy/gateway/values/higress-values.yaml

# 1) 入口与路由
kubectl apply -f deploy/gateway/gateway-api/
# 2) 插件（MCP/AI/ext-auth）
kubectl apply -f deploy/gateway/higress/
# 3) 证书与网络
kubectl apply -f deploy/gateway/security/
# 4) 运维对象
kubectl apply -f deploy/gateway/ops/
```

> **版本注意**：样例基于 Higress v2.2.x 文档口径；插件 CRD（`WasmPlugin`/`McpBridge`）字段以实际安装版本为准。所有 `image`/`digest`/域名均为占位，生产必须 pin digest 并替换域名。

## 验证（staging）

```bash
kubectl get gatewayclass,gateway -A
kubectl get httproute -A
kubectl -n higress-system get pods -l app.kubernetes.io/name=higress-gateway
curl -fsS https://api.example.com/healthz
curl -fsS https://mcp.example.com/healthz
curl -fsS https://llm.example.com/v1/models -H "authorization: Bearer $VIRTUAL_KEY"
curl -fsS -o /dev/null -w '%{http_code}\n' https://console.example.com/
```

## 本地

```bash
docker compose -f deploy/gateway/local/docker-compose.gateway.yml --profile local-gateway up -d
# 或更接近生产 L7：--profile envoy
```

详见 `local/README.md`。
