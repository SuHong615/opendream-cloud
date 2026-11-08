# 私有化 / 高可用部署基线

本目录给出**企业内网私有化**的参考部署方式；不依赖阿里云 SaaS。完整架构见
[ARCH-V4-ONPREM.md](../../docs/02-architecture/ARCH-V4-ONPREM.md)。

## 组件

| 能力 | 开源实现 | 说明 |
| --- | --- | --- |
| Kubernetes | RKE2 / k3s / 标准 K8s | 内网集群 |
| 数据库 | PostgreSQL HA（CloudNativePG/Patroni） | 替换 SQLite |
| 缓存 | Redis Sentinel/Cluster | 会话、锁、队列辅助 |
| 事件总线 | NATS JetStream | Outbox/DLQ/重试 |
| 对象存储 | MinIO / Ceph RGW | 导出、快照、附件；**控制面已支持 S3 兼容导出** |
| 身份 | Keycloak | OIDC/SAML/LDAP；**realm 模板见 `deploy/onprem/keycloak/`** |
| 密钥 | Vault / OpenBao | 凭证与 Provider Key |
| 模型网关 | LiteLLM + vLLM/SGLang | OpenAI 兼容 |
| MCP 网关 | Higress + MCP Hub | 内网工具接入 |
| 观测 | Prometheus + Grafana + Loki + Tempo | OTel Collector |
| 镜像 | Harbor | 离线镜像/扫描/签名 |

## Helmfile 参考

```bash
# 需先准备 kubeconfig 与 StorageClass
helmfile -f deploy/onprem/helmfile.yaml sync
```

`helmfile.yaml` 中 chart 版本需按企业镜像仓库固定；离线环境先把 chart 与镜像同步到 Harbor。

## HA 基线

- 控制面/门户/MCP Gateway：≥3 副本，PDB minAvailable=2，反亲和 + topology spread；
- PostgreSQL：1 primary + 2 sync standby，自动 failover；
- Redis：3 Sentinel；
- NATS：3 节点 JetStream；
- MinIO：4 节点纠删码；
- 所有服务 readiness/liveness/startup probe，优雅停机 30s；
- 备份：pgBackRest + MinIO replication，季度恢复演练；
- 目标：RPO ≤ 15min，RTO ≤ 1h。

## 已提供的落地文件

- `k8s/control-plane-ha.yaml`：3 副本 / PDB / HPA / 反亲和
- `observability/prometheus.yml`、`loki-config.yaml`、`tempo.yaml`
- `observability/alerts.yml`：控制面宕机、5xx、Outbox failed、工作区 error 告警
- `observability/grafana-dashboard.json`：RPS/工作区/Outbox/模型供应商面板
- `nats/README.md`：3 节点 JetStream、Stream/Consumer、DLQ
- `keycloak/realm-opendream.json`：OIDC realm
- `scripts/onprem/backup-restore-drill.sh`：Postgres + MinIO 恢复演练
- 控制台 `/outbox`：Outbox 失败事件查询/重放

## 当前限制

本地 compose 仍使用 SQLite + 内存 store，**不是 HA**；Postgres/NATS/Vault/Keycloak 适配器尚未全部接入。
本目录是部署模板，接入顺序见 ARCH-V4 §9。
