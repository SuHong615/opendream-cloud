# OpenDream V4：面向企业私有化的 Agent 平台架构

> 对标阿里云 **AgentCore** 的产品抽象（Workspace / Agent / Agent 模板 / Skill / MCP / 模型连接 / 凭证 / Team / 观测评估），
> 但**不做多租户 SaaS**：面向企业内部私有化部署，所有云服务依赖提供开源替代与可插拔适配层。
>
> 参考资料：[AgentCore 产品概述](https://www.alibabacloud.com/help/zh/agentcore/agentcore-product-overview)、[AgentCore 基本概念](https://www.alibabacloud.com/help/zh/agentcore/agentcore-basic-concepts)。
> 外部链接仅作产品研究引用，不代表本项目与阿里云存在隶属或背书关系。

## 1. 设计原则

1. **私有化优先**：不依赖阿里云账号、不依赖公网 SaaS；离线/内网可完整部署。
2. **控制面 / 数据面分离**：控制面无状态可水平扩展；执行面按负载独立扩缩容。
3. **抽象而不是绑定**：对象存储、事件总线、密钥、观测、模型网关、身份均通过端口接口 + 适配器接入；默认开源实现。
4. **异步优先**：长任务、Agent Run、工具调用、评测、导出走消息/任务队列；同步 API 只做受理与查询。
5. **可治理**：Workspace 边界、RBAC、凭证集中管理、工具级策略、审计、配额、评估。
6. **可降级**：外部组件不可用时，核心控制面仍可登录、查看与人工审批。

## 2. 目标架构

```
┌────────────────────────────────────────────────────────────────────┐
│ 体验层                                                              │
│ 企业门户 / 控制台 / OpenDream Code 桌面端 / IM 渠道（钉钉/飞书/企微） │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ OIDC / 设备 token / Webhook
┌──────────────────────────────▼─────────────────────────────────────┐
│ 控制面（无状态 ×3）                                                  │
│ Keycloak 身份 │ Workspace/Org │ Agent Registry │ Agent 模板          │
│ Model Center │ Skill Center │ MCP Registry │ Credential Vault        │
│ Team/Squad │ Policy/RBAC │ Quota │ Audit │ Evaluation Registry       │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ 事件 / 命令
┌──────────────────────────────▼─────────────────────────────────────┐
│ 编排与异步层                                                        │
│ Agent Runtime（Harness/High-code/Managed/Registered）               │
│ Team Orchestrator（sequential/parallel/router/debate）              │
│ Workflow Engine（DSL/Saga/Human Task） │ Scheduler                  │
│ Event Bus（NATS JetStream）│ Outbox │ DLQ │ Idempotency              │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────────┐
│ 执行与数据面                                                        │
│ 云端 Workspace（opencode）│ 桌面端本地引擎 │ Sandbox Runner          │
│ MCP Gateway（Higress/MCP Hub）│ Model Gateway（LiteLLM/vLLM）       │
│ PostgreSQL │ Redis │ MinIO/Ceph │ Qdrant/Milvus │ Vault             │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ OTel
┌──────────────────────────────▼─────────────────────────────────────┐
│ 可观测与运维                                                        │
│ OpenTelemetry Collector │ Prometheus │ Grafana │ Loki │ Tempo       │
│ 备份/恢复 │ 告警 │ 审计导出 │ 容量与成本                             │
└────────────────────────────────────────────────────────────────────┘
```

## 3. 与 AgentCore 的概念映射

| AgentCore | OpenDream 对应 | 状态 |
| --- | --- | --- |
| Workspace（隔离边界） | `org` + 项目/工作区；模型/MCP/Agent 按 org 隔离 | ✅ MVP |
| Agent（Harness / 高代码 / 纳管 / 注册） | 数字员工 `agent_type`：`harness/high_code/managed/registered` | ✅ 新增 |
| Agent 模板 | `agent-templates`（快照 + 实例化） | ✅ 新增 |
| Team | 专家小队 `squads`（lead/member/human gates） | ✅ |
| 模型连接 / 模型 | 模型中心 provider/model + opencode 配置下发 | ✅ |
| Skill（ZIP / Nacos / 预置） | Skill 中心（上传/版本/启用/调试） | ✅；Nacos 导入待接 |
| MCP（HTTP to MCP / 代理） | MCP Hub + 网关 + 工具级 PEP | ✅ |
| 凭证（AK/SK / 环境变量） | `/credentials` 集中加密存储、掩码返回 | ✅ 新增 |
| 观测 / 评估 | `/observability` + 评测中心 + Prometheus `/metrics` | ✅ MVP；OTel/Tempo 待接 |
| 账号集成（钉钉/飞书/企微） | Webhook / Bot 连接器 | ⏳ 规划 |

## 4. 云依赖 → 开源替代矩阵（私有化）

| 阿里云依赖 | 私有化开源实现 | 接入方式 |
| --- | --- | --- |
| ACK / ECI | Kubernetes + KEDA / Knative | Helm/Kustomize |
| RDS PostgreSQL | PostgreSQL HA（CloudNativePG / Patroni） | `DATABASE_URL` |
| Redis | Redis Sentinel / Cluster | `REDIS_URL` |
| OSS / NAS / CPFS | MinIO / Ceph RGW / CephFS | S3 兼容 API |
| SLS | Loki | OTel / Fluent Bit |
| ARMS / CMS | Prometheus + Grafana + Tempo | OTel Collector |
| KMS | Vault / OpenBao | SecretProviderClass / API |
| MSE Nacos | Nacos 集群 | Nacos SDK/CLI |
| EventBridge | NATS JetStream / Kafka | 事件端口适配器 |
| Function Compute | Knative / KEDA Job / K8s Job | 任务队列 worker |
| Model Studio / 百炼 | LiteLLM + vLLM / SGLang | OpenAI 兼容 |
| PrivateLink | K8s NetworkPolicy + Ingress/Service Mesh | 内网 DNS/TLS |
| IDaaS | Keycloak（OIDC/SAML/LDAP） | OIDC |
| ACR | Harbor | 镜像仓库 |
| 钉钉/飞书/企微 | 自建连接器 + Webhook | 出站/入站网关 |

**约束**：业务代码不得直接调用云厂商 SDK；所有外部依赖通过 `packages/shared` 的端口接口（ObjectStore/EventBus/SecretStore/ModelGateway/Identity）注入适配器。当前默认实现为本地 SQLite/本地文件/内存队列，生产切换 Postgres/MinIO/NATS/Vault。

## 5. 异步架构

### 5.1 事件与任务

- **Outbox**：控制面写业务表同事务写 `outbox_events`，由独立 publisher 投递 NATS/Kafka；避免双写不一致。
- **At-least-once + 幂等**：事件带 `event_id`、`idempotency_key`、`org_id`、`occurred_at`；消费者按 `event_id` 去重。
- **重试与 DLQ**：指数退避（1s/5s/30s/5m），超过 N 次进 DLQ，人工重放。
- **长任务**：Agent Run、评测、导出、快照、应用发布均由 worker 异步执行；API 返回 `202 + run_id`，前端轮询/订阅 SSE。
- **Saga**：跨服务动作（创建 workspace → 绑定 MCP → 发布应用）按补偿事务执行；失败触发补偿。
- **定时**：Schedule 服务基于 Postgres advisory lock/leader election，保证多副本只执行一次。

### 5.2 当前落地

- 已有：workflow-engine 人工任务/Saga、agent-schedules、workflow-runs、评测运行、导出任务接口。
- **已实现**：`outbox_events` 事务事件表、每 2s publisher、指数退避、`publishing` 崩溃恢复、`credential.*` / `desktop.device.paired` 事件；无 `NATS_URL` 时本地落库不投递。
- **已提供**：NATS JetStream compose profile、`/metrics` 的 `opendream_outbox_events` 指标。
- **已实现**：Redis 可选分布式锁（`REDIS_URL`），多副本 outbox publisher 只允许一个实例 drain；Redis 不可用时自动降级单实例。
- **已实现**：Outbox 管理 API + `/outbox` 页面（失败事件查询/重放）；NATS 生产集群配置见 `deploy/onprem/nats/`。
- **已实现**：Agent Run 异步接收（`POST /agent-squads/:id/runs` body `async:true`，202 + 内存 worker）；生产需替换为 NATS/Temporal + Postgres。
- **已提供**：K8s HA 清单、Prometheus/Loki/Tempo 配置、备份恢复演练脚本。
- 待接：NATS 生产集群联调、DLQ 消费端、Agent Run 持久化、Postgres 全量路由迁移。**当前长任务仍有内存执行路径，不能宣称完整异步 HA。**

## 6. 高可用架构

| 组件 | 最小 HA 拓扑 | 说明 |
| --- | --- | --- |
| 控制面 / 门户 | 3 副本 + HPA | 无状态；PDB minAvailable=2 |
| MCP Hub / Gateway | 3 副本 | 网关无状态；Hub 数据落 Postgres |
| Agent Runtime Worker | 3+ 副本 | 按队列长度 HPA；单任务幂等 |
| PostgreSQL | 1 primary + 2 sync standby | CloudNativePG/Patroni；自动 failover |
| Redis | 3 Sentinel 或 6 节点 Cluster | 会话/锁/缓存；非持久关键数据 |
| NATS JetStream | 3 节点 | 流复制；DLQ/重放 |
| MinIO | 4 节点纠删码 | 对象/快照/导出 |
| Keycloak | 2 副本 + 外部 Postgres | OIDC |
| Vault | 3 节点 Raft | 密钥/凭证 |
| 观测 | Prometheus 2 副本/Thanos；Loki/Tempo 分布式 | 保留 ≥30 天 |

**K8s 基线**：

- 所有 Deployment：`readinessProbe` / `livenessProbe` / `startupProbe`、`PodDisruptionBudget`、`topologySpreadConstraints`、`antiAffinity`；
- 资源 requests/limits、HPA（CPU + 自定义队列指标）、`terminationGracePeriodSeconds: 30`；
- 滚动更新 `maxUnavailable: 0`、`maxSurge: 1`；
- 入口：Ingress/Gateway API + TLS；内网 DNS；
- 数据：PVC Retain、定时备份（pgBackRest/MinIO replication）、每季度恢复演练；
- 目标：RPO ≤ 15min，RTO ≤ 1h（核心控制面）。

## 7. 安全与合规

- 身份：Keycloak OIDC（企业 AD/LDAP 联邦）；设备 token 独立；SSO 登出。
- 密钥：Vault/OpenBao；控制面只持短期 token；凭证加密（AES-256-GCM）本地兜底。
- 网络：默认 deny NetworkPolicy；模型/MCP/数据库仅内网；出站白名单。
- 供应链：Harbor 镜像签名/扫描；SBOM；依赖许可证门禁。
- 审计：登录、凭证、Agent 运行、MCP 工具调用、发布、导出全量审计；不可篡改存储。
- 数据：按 org/workspace 隔离；敏感字段脱敏；备份加密；数据保留策略。

## 8. 部署形态

| 形态 | 适用 | 组成 |
| --- | --- | --- |
| 单机 Docker Compose | POC / 小团队 | 现有 `deploy/local`，SQLite |
| 标准私有化 | 部门/企业 | K8s + Postgres + Redis + MinIO + Keycloak + NATS + 观测 |
| 高可用私有化 | 关键生产 | 上述 + 多副本/HA 中间件 + 备份/DR |
| 完全离线 | 强隔离内网 | Harbor + 离线镜像包 + 本地模型 vLLM + 无公网依赖 |

## 9. 实施路线

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0（本轮） | 架构文档、凭证中心、Agent 模板/类型、HA values | 功能可用 + 架构评审 |
| P1 | Postgres 适配（替换 SQLite）、Redis、MinIO、Keycloak | 双实例无状态、重启不丢数据；迁移方案见 [POSTGRES-MIGRATION.md](POSTGRES-MIGRATION.md) |
| P2 | NATS JetStream + Outbox + DLQ、Agent Run 异步化 | 压测/故障注入通过 |
| P3 | K8s HA 部署、Prometheus/Loki/Tempo、备份恢复 | RPO/RTO 演练 |

> 当前进度：`DatabasePort` 异步抽象 + SQLite/Postgres 双适配器测试已落地；outbox/NATS profile/DLQ 页面已落地；
> K8s HA 清单、Prometheus/Loki/Tempo 配置、备份恢复演练脚本已提供。全量路由切 Postgres 与 Agent Run 持久异步化仍未完成。
| P4 | 桌面端/云端统一策略、SCIM、IM 连接器 | 企业试点 |

## 10. 当前真实边界（不可宣称）

- 当前本地 compose 仍是 **SQLite + 内存 store**，不具备多副本一致性；
- Agent workforce/工作流/评测的部分状态在内存，重启丢失；
- 尚未接入 Postgres/NATS/Keycloak/Vault；
- 因此“高可用”目前是**架构设计与部署模板**，不是已验收的生产能力。

## 11. 验收清单（生产前）

- [ ] 所有服务无状态化，Postgres 持久化
- [ ] Outbox + NATS + DLQ 上线
- [ ] 3 副本 + PDB + HPA + 反亲和
- [ ] Keycloak OIDC + Vault
- [ ] Prometheus/Loki/Tempo + 告警
- [ ] 备份恢复演练（RPO/RTO）
- [ ] 压测：并发 Agent Run、SSE、MCP 工具调用
- [ ] 故障注入：Pod kill、DB failover、NATS 分区
