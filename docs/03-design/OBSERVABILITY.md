# 可观测性：控制面指标

控制面已内置 Prometheus 指标端点，运行中的 `/metrics` 可直接被 Prometheus / Grafana Agent / ARMS 抓取。

## 端点

```
GET http://control-plane:4000/metrics
```

指标：

| 指标 | 类型 | 说明 |
| --- | --- | --- |
| `opendream_http_requests_total` | counter | 按 method/route/status 统计请求数 |
| `opendream_http_request_duration_seconds_sum` | counter | 请求耗时总和（配合 count 算平均） |
| `opendream_workspaces` | gauge | 按 state 的活跃工作区数 |
| `opendream_model_providers_enabled` | gauge | 启用的模型供应商数 |

## 保护

生产环境建议设置：

```bash
METRICS_TOKEN=<至少 8 位随机串>
```

设置后必须带 `Authorization: Bearer $METRICS_TOKEN`；本地 compose 默认不设置，便于调试。

## Kubernetes

`deploy/gateway/ops/20-servicemonitor.yaml` 已包含 `control-plane` 的 ServiceMonitor（namespace `opencode-control`，端口 `http`，路径 `/metrics`，15s 间隔）。

Grafana 建议面板：

- RPS / 5xx 比例（`rate(opendream_http_requests_total{status=~"5.."}[5m])`）
- P95 延迟（需扩展 histogram；当前 sum/count 可算均值）
- 工作区状态分布（`opendream_workspaces`）
- 模型供应商启用数

## 本地验证

```bash
curl -s http://localhost:4000/metrics | head
```
