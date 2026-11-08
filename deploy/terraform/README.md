# Terraform · ACK 基线

> 状态：**静态交付（DEGRADED）**。本机无 `terraform` 二进制与云凭证，未执行 `plan/apply`。

## 用法

```bash
cd deploy/terraform
cp terraform.tfvars.example terraform.tfvars   # 按需创建，填入地域/规格/桶名
terraform init
terraform plan  -out plan.bin
terraform apply plan.bin
```

## 覆盖资源

- VPC / 3 交换机（多可用区）
- ACK 托管集群（ack.pro.small，K8s 1.30 可配）
- 节点池：`system`（8C32G×2）、`workspace`（32C128G，1–64 弹性）、`sandbox`（16C64G，0–8）
- ACR 企业版基础实例 + `opencode` 私有命名空间
- RDS PostgreSQL（4C8G 级 + 200GB ESSD）
- Redis（8GB 主从）
- OSS（制品/审计归档）

## 生产前必须核对

1. RDS/Redis 实际规格与容量模型（1000 工作区需压测复核）；
2. ACK 是否支持 `runsc`/Kata 的 RuntimeClass（`sandbox-runtime`），不支持则降级 Kata/runV；
3. ACR 企业版计费与镜像同步策略；
4. 安全组/白名单/公网暴露面；
5. `terraform plan` 与真实账号的配额（vCPU、EIP、PVC）。

## 已知偏差 / 待办

- 字段名以 aliyun provider 实际版本为准，`terraform validate` 需在具备 provider 的环境执行一次；
- 未包含 WAF、SLB 证书、Argo CD、Prometheus/Loki（由 Helm/ACK 组件或后续模块补）；
- 未包含 OSS 生命周期与跨区复制。
