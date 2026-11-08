# ADR-008：PostgreSQL 单库多租 + RLS（而非每租户独立库）

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / platform-backend
- 关联：`DATA-MODEL.md §1.2/§4`、`SECURITY.md §3.3`

## 背景

多租户数据隔离方案：单库 + 行级过滤、每租户独立库（database-per-tenant）、每租户独立 schema、或应用层纯过滤。规模：10,000 用户、1,000 工作区、年 ~7,300 万用量行。

## 决策

**单个 PostgreSQL 16 实例（RDS 主 + 只读），所有业务表带 `org_id`，启用 `ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`，每请求 `SET LOCAL app.org_id/app.user_id`；应用层同时显式带 `org_id` 条件（双保险）。**

分区大表（`audit_logs`、`usage_records`、`workspace_events`、`eval_results`）按月分区。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 每租户独立数据库** | ① 迁移/升级要遍历 10,000 个库，运维不可承受；② 连接池爆炸（每个库至少一个池）；③ 跨租户统计/账单需要 ETL；④ 新租户创建是重操作（建库 + 迁移）；⑤ RDS 实例数量成本高 |
| **B. 每租户独立 schema** | 类似 A 的迁移/连接问题；schema 数量上限与 catalog 膨胀；`search_path` 切换易错 |
| **C. 仅应用层过滤（无 RLS）** | 一个漏写 `WHERE org_id` 就是全量泄露；审计无法证明"不可能跨租户"；不满足 G2"隔离可证明" |
| **D. 原生 PG 分区 + 每租户分区** | 租户数动态增长，分区数爆炸 |
| **E. 独立 OLTP + OLAP 分离（用量走 ClickHouse）** | 规模未到（7300 万行/年 PG 完全可承受）；增加运维面；P2 再评估 |

## 后果

**正面**
- 迁移/备份/监控统一；新租户 O(1)（插入一行）。
- RLS 提供"最后防线"：即使应用层漏写条件，DB 仍拒绝跨租户行。
- 跨租户聚合（平台管理员/账单）在一个库里完成（受控视图 + 审计）。
- 成本最低。

**负面 / 代价**
- 需要严格纪律：每请求必须 `SET LOCAL`（连接池复用会残留上下文 → 必须事务级 `SET LOCAL` + 连接归还前 `RESET ALL`）。
- RLS 性能开销（每行策略判断）→ 用简单等值策略 + 索引；实测应 <5%。
- 热点租户可能影响他人 → 大租户可后续迁移到独立实例（预留 `orgs.data_region`/`shard` 字段）。
- `BYPASSRLS` 角色必须严格管控（仅 migration/admin 服务，独立凭证）。

## 实现要点

```sql
-- 连接池：每个事务开始时
BEGIN;
SET LOCAL app.org_id = $1;
SET LOCAL app.user_id = $2;
SET LOCAL app.is_platform_admin = $3;
-- ... 业务 SQL ...
COMMIT;
-- 归还连接前：DISCARD ALL（或 RESET ALL）
```

- `opencode_app` 非表 owner（`FORCE RLS` 让 owner 也受限）；`opencode_platform` 拥有 `BYPASSRLS`，仅迁移/运维使用，凭证单独托管。
- 所有外键复合 `(org_id, id)`，杜绝跨租户引用。
- 测试：随机采样连接执行 `SHOW app.org_id` 必须非空；跨租户查询必须 0 行。

## 验证

- RLS 矩阵测试（见 `DATA-MODEL.md §4.3`）。
- 性能：开启 RLS 前后 p95 差异 <10%。
- 泄漏测试：故意省略 `WHERE org_id` 的查询必须返回 0 行。
- 连接池污染测试：连续复用连接处理 2 个租户请求，第二个不得看到第一个的数据。
