# OpenDream Cloud · 运维手册（Runbook）

> 适用：ACK 生产/预发。所有命令示例以 `cn-hangzhou`、命名空间 `platform-system` / `ws-<orgId>` 为准。
> 本机无 kubectl/helm/terraform，下列命令需在具备工具与集群凭证的环境执行。

## 1. 部署顺序

```bash
# 1) 基础设施
cd deploy/terraform && terraform apply plan.bin

# 2) 配置 kubeconfig
aliyun cs GET /k8s/<cluster-id>/kubeconfig > ~/.kube/config

# 3) 镜像
docker build -f deploy/docker/workspace/Dockerfile -t <acr>/opencode/workspace-runtime:2.2.5 .
docker push <acr>/opencode/workspace-runtime:2.2.5

# 4) 平台组件
helm upgrade --install opendream-cloud deploy/helm/opendream-cloud \
  -n platform-system --create-namespace \
  -f deploy/helm/opendream-cloud/values.yaml \
  --set image.controlPlane=<acr>/opencode/control-plane:<tag> \
  --set image.workspace=<acr>/opencode/workspace-runtime:2.2.5

# 5) 数据库迁移 + 首个管理员
kubectl -n platform-system exec deploy/control-plane -- bun run db:migrate
kubectl -n platform-system exec deploy/control-plane -- bun run db:seed

# 6) 冒烟
kubectl -n platform-system port-forward svc/control-plane 4000:4000 &
bun scripts/smoke-api.ts http://127.0.0.1:4000
```

## 2. 健康检查与 SLO

| 检查 | 命令/端点 | 期望 |
| --- | --- | --- |
| 控制面 | `GET /healthz`、`/readyz` | 200；DB/migrations ok |
| 工作区 | `GET /api/v1/workspaces/{id}` | `state=ready`；P95 拉起 ≤90s（预热）/180s（冷启） |
| 网关 | `GET https://w-<id>.ws.<domain>/` | 未登录 302 → SSO；登录后 200 |
| LiteLLM | `GET /health` | 200；预算/限流指标正常 |
| 节点 | `kubectl top nodes` | CPU <70%，无 MemoryPressure |

## 3. 常见故障处置

### 3.1 工作区一直 provisioning（>180s）
1. `kubectl -n ws-<orgId> get ow <id> -o yaml` 看 `status.conditions`；
2. `kubectl -n ws-<orgId> describe deploy ws-<id>` 查镜像拉取/调度；
3. 常见原因：镜像仓库凭证、节点资源不足、PVC 绑定失败、配额超限；
4. 修复后 `kubectl annotate ow <id> opencode.cloud/retry-at="$(date -Iseconds)"` 触发 reconcile。

### 3.2 工作区 502/504
1. 查 Pod：`kubectl -n ws-<orgId> get pods -l workspace=<id>`；
2. 查 agent 健康：`kubectl exec ... -- curl -s localhost:8081/healthz`；
3. 查 opencode：`kubectl logs <pod> -c opencode --tail=200`；
4. 网关上游 Basic 注入失败 → 检查 Secret 与 gateway 配置；
5. 仍不可用：`POST /api/v1/workspaces/{id}/start` 重建。

### 3.3 模型调用 429/403
- 429：LiteLLM 预算/限流；查用户虚拟 Key 用量与组织配额；
- 403 `model_not_authorized`：策略未授权；在控制台模型策略中调整，≤30s 生效；
- 5xx：LiteLLM 上游故障；检查 fallback 与供应商状态。

### 3.4 MCP 调用失败
- Hub 健康：`GET /api/v1/mcp-servers/{id}/health`；
- 绑定 token 过期 → 轮换；凭证不落工作区；
- 连续失败触发降级：检查审计 `mcp_call_logs`。

### 3.5 数据库故障
- 控制面只读/不可用：工作区仍可通过 ticket 访问（ticket 本地验签，不查 DB）；
- RDS 主备切换：检查连接串/Secret；`/readyz` 恢复后流量回归；
- 禁止在故障期间执行 schema 变更。

## 4. 备份与恢复

| 对象 | 方式 | RPO | RTO |
| --- | --- | --- | --- |
| PostgreSQL | RDS 自动备份 + WAL 连续归档（PITR） | **≤15min**（PITR） | ≤2h |
| 工作区 PVC | 快照（销毁前自动） + 定时快照（每 6h） | **≤6h** | ≤1h |
| 对象存储 | OSS 版本控制 + 跨区复制 | 分钟级 | 分钟级 |
| 配置/密钥 | K8s Secret + KMS + GitOps 仓库 | 变更即备份 | ≤30min |

**RPO 口径（G7-03）**：生产以 RDS PITR 为准（目标 ≤15min），PVC 定时快照补充（目标 ≤6h）；本机 sqlite 实测仅证明"备份/恢复流程与数据一致性"，不代表生产 RPO。上线后第 1 周用真实备份时间戳核对一次并回填本表。

恢复演练（每季度）：
1. 从 RDS 备份恢复到新实例并切换连接串；
2. 从 PVC 快照恢复工作区并校验文件 hash；
3. 记录实际 RPO/RTO，更新本手册。

## 5. 回滚

```bash
# 应用回滚（Argo CD）
argocd app rollback opendream-cloud <history-id>

# Helm 回滚
helm rollback opendream-cloud <revision> -n platform-system

# 迁移回滚：仅允许向前修复（forward-only），禁止 down migration
```

工作区镜像回滚：把 `image.workspace` 固定回上一个 digest，金丝雀 5% 工作区验证后全量。

## 6. 扩缩容与成本

- 工作区节点池：`kubectl scale` 不直接操作；改 Terraform `workspace_node.max` 或 ACK 节点池弹性；
- 单工作区 4C8G 常驻成本 ≈¥651/月（边际），1,000 常驻 ≈¥72 万/月（infra 估算，含平台固定成本）；
- 成本优化：可选休眠档（保留 PVC，默认关闭）、按时段扩缩、配额与预算告警；
- 每月核对 LiteLLM 账单 vs 平台用量（差异 >2% 告警）。

## 7. 安全与合规

- 工作区服务密码 = 根凭证：仅 K8s Secret 与网关内存，禁止写入用户环境/日志；
- 密钥轮换：控制面会话密钥、API Key pepper、ticket 密钥按 90 天轮换；轮换即吊销旧会话；
- 审计：登录/Key/工作区/发布/分享/MCP 调用 100% 落库，热存 180 天 + 归档 3 年；
- 数据删除：用户内容 30 天内删除；审计日志脱敏后保留。

## 8. 值班交接

- 告警渠道：PagerDuty/钉钉机器人（按环境配置）；
- 升级路径：值班 → 平台负责人 → 架构师；
- 事故记录模板：`docs/05-delivery/incidents/YYYY-MM-DD-<slug>.md`（时间线/影响/根因/行动项）。
