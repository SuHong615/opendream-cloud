# SQLite → PostgreSQL 迁移方案（P1）

> 当前状态：本地 compose 使用 **SQLite**（`bun:sqlite` + Drizzle），适合单机 POC。
> 目标：企业私有化 HA 使用 **PostgreSQL**（CloudNativePG/Patroni），支持多副本控制面。

## 1. 为什么不能直接换连接串

业务代码大量使用同步 SQLite API：

```ts
ctx.sqlite.query<T, [string]>("SELECT ...").get(id)
ctx.sqlite.query("INSERT ...").run(...)
```

PostgreSQL 客户端是异步 API。直接替换会导致所有路由/服务需要改为 `async`，并调整事务边界。

## 2. 迁移步骤

> 已落地：`apps/control-plane/src/db/port.ts`（`DatabasePort`、`SqlitePort`、`PostgresPort`），并已将**凭证中心、设备配对/列表/bootstrap/模型代理、API Key、Prompt 库、Outbox/DLQ、审计日志、用量查询、工作区生命周期（workspace service）、MCP 工具策略/调用日志**路由迁移到 `ctx.dbPort` 作为渐进式示例。
> **Postgres schema 已可迁移**：`bun run --cwd apps/control-plane db:migrate:postgres`（需 `DATABASE_URL=postgresql://...`），自动转换 `PRAGMA/ifnull/INTEGER/AUTOINCREMENT` 并记录 `schema_migrations`；双适配器测试与 schema 测试均已通过。
> 双适配器测试：`TEST_POSTGRES_URL=postgresql://... bun test test/db-port.test.ts`；未设置时只跑 SQLite，保证 CI 无外部依赖。

| 阶段 | 工作 | 验收 |
| --- | --- | --- |
| P1-1 | 抽象 `DatabasePort` 接口（query/execute/transaction），SQLite 适配器保持同步，Postgres 适配器返回 Promise | 现有单测全绿 |
| P1-2 | 路由/服务改为 await；事务内禁止跨服务调用 | 双适配器单测 |
| P1-3 | 编写 Postgres schema（表/索引/约束/枚举），迁移种子数据 | `psql` 初始化成功 |
| P1-4 | 双写/影子读（可选）；灰度切流 | 数据一致性校验 |
| P1-5 | 生产切换 Postgres，SQLite 保留只读回滚窗口 | 故障回滚演练 |

## 3. 类型映射

| SQLite | PostgreSQL |
| --- | --- |
| `TEXT` | `text` |
| `INTEGER` 时间戳 | `bigint`（毫秒）或 `timestamptz` |
| `INTEGER` 布尔 | `boolean` |
| `TEXT` JSON | `jsonb` |
| `TEXT PRIMARY KEY` | `text PRIMARY KEY` / `uuid` |
| `AUTOINCREMENT` | `bigserial` / identity |
| `INSERT OR IGNORE` | `INSERT ... ON CONFLICT DO NOTHING` |
| `datetime('now')` | `now()` |
| `PRAGMA` | 删除（连接池/隔离级别配置替代） |

## 4. 关键表

- `orgs` / `users` / `memberships` / `sessions`
- `workspaces` / `workspace_snapshots`
- `model_providers` / `models` / `model_policies`
- `mcp_servers` / `mcp_versions` / `mcp_bindings`
- `audit_logs` / `usage_records` / `api_keys`
- `credentials` / `desktop_devices` / `desktop_pairings`
- `prompts` / `skills` / `agent_*`（agent-workforce 目前内存，需一并落库）

## 5. 连接与 HA

```bash
DATABASE_URL=postgresql://opendream:***@postgresql-ha-pgpool.opendream-data.svc:5432/opendream
DATABASE_POOL_MAX=20
DATABASE_SSL=require
```

- 使用 PgBouncer（transaction 模式）或 CloudNativePG 内置 pooler；
- 迁移使用单实例 Job，`schema_migrations` 行级锁/ advisory lock；
- 备份：pgBackRest / CloudNativePG 定时备份 + WAL 归档；
- 恢复演练：季度，目标 RPO ≤ 15min、RTO ≤ 1h。

## 6. 当前不做

- 不在本轮直接把全部路由改成 async（风险高、缺测试）；
- 不承诺当前 compose 可多副本（SQLite 文件锁）。
