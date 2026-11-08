# HA 备份恢复与故障演练 Runbook

## 目标

- RPO ≤ 15min
- RTO ≤ 1h（核心控制面）
- 每季度至少一次恢复演练

## 演练 1：PostgreSQL 恢复

```bash
export PGHOST=postgresql-ha-pgpool.opendream-data.svc
export PGUSER=opendream
export PGPASSWORD=***
export PGDATABASE=opendream
bash scripts/onprem/backup-restore-drill.sh
```

验收：

- `pg_restore` 成功；
- `orgs/users/workspaces` 行数与原库一致；
- 控制面切换 `DATABASE_URL` 到恢复库后 `/readyz` 200。

## 演练 2：MinIO / 对象导出

- `mc mirror` 备份 `opendream` bucket；
- 验证审计/用量导出文件可下载、内容行数正确。

## 演练 3：Pod 故障

```bash
kubectl -n opendream-control delete pod -l app.kubernetes.io/name=control-plane
kubectl -n opendream-control rollout status deploy/control-plane
```

验收：PDB 保持 ≥2 可用；`/readyz` 无中断；outbox 不重复（Redis 锁 + 幂等）。

## 演练 4：NATS 单节点故障

- 停一个 NATS Pod；
- 确认 Stream 仍可写、consumer 自动重连；
- 检查 outbox pending 是否恢复投递。

## 演练 5：数据库 failover

- 主库故障，Patroni/CloudNativePG 自动提升；
- 验证连接池重连、只读窗口、告警。

## 记录

| 日期 | 演练 | 结果 | RTO | RPO | 问题 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-10 | 首次基线 | 待执行 | — | — | — |
