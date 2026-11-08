# M2b：Legacy Agent Run 迁移到 AgentCore

> 状态：迁移工具已实现并本地验证；**尚未切写/删旧**。
> 目标：把 `agent-workforce` 的历史 Run 一次性导入 AgentCore，作为 ownership 切换前的数据准备。

## 1. 原则

- 只做一次性迁移，**不做双写**；
- 每个 Legacy Run 使用稳定 `Idempotency-Key`，可重复执行；
- 迁移不改变旧服务；旧 Run 继续可读；
- 切写前必须完成对账与回滚演练。

## 2. 工具

`scripts/migrate/legacy-runs-to-agentcore.ts`

```bash
CONTROL_PLANE_URL=http://localhost:4000 \
MIGRATE_EMAIL=lilei@xingyun.example \
  bun scripts/migrate/legacy-runs-to-agentcore.ts            # dry-run

# 实际导入
... --apply
```

流程：

```text
dev-login → GET /api/v1/agent-runs
→ 对每个 run POST /api/v1/runtime/import/legacy-run
  Idempotency-Key: migrate-<legacy_run_id>
→ 输出 imported/failed
```

## 3. 映射

| Legacy | AgentCore |
| --- | --- |
| `run.id` | `legacy.id`（可追溯） |
| `run.goal` | `input` |
| `run.status` | `state` |
| `tasks[]` | `steps[]`（legacy_task） |
| `session` | 自动建立 `legacy_<run_id>` workspace session |

## 4. 对账

```text
旧 Run 数 = AgentCore legacy Run 数（按 legacy.id 去重）
脚本重复执行不新增 Run
失败数 = 0
```

本地验证：

```text
legacy runs: 1
imported=1 failed=0
re-run imported=1 failed=0（幂等）
```

## 5. 切写门禁

只有以下全部满足才可做 M2b 灰度读切换：

1. 生产/预发全量导入，failed=0；
2. 对账 0 差异；
3. 旧 Run 只读校验通过；
4. UI 读切换演练通过；
5. 回滚脚本可恢复旧读路径。

**当前状态**：迁移工具完成；已实现**受控灰度读**与**旧写双写镜像**，默认关闭，旧服务仍是权威。

## 6. 双写镜像（M2b.2）

`agent-workforce` 在每次 `saveRun` 后，若 `AGENTCORE_MIRROR_WRITES=true` 且配置 `AGENTCORE_URL`，异步把完整旧 Run 导入 AgentCore（250ms 合并、3s 超时、失败静默）。这样灰度读不仅能读到迁移快照，也能读到切换后新建/推进的 Run。

```text
AGENTCORE_URL=http://agentcore:4110
AGENTCORE_MIRROR_WRITES=true
```

- 导入使用 `legacy_data` 保留旧 Run 全量；同 `legacy_run_id` 重复导入会更新 `legacy.data`，并复用同一 Session。
- 双写是**临时迁移机制**，不是新架构；AgentCore 接管写后删除 `scheduleAgentcoreMirror`。
- 失败不影响旧链路，需用迁移脚本 + 对账兜底。
- 本地验证：新建 Run 后 AgentCore `/runtime/legacy-runs` 出现同一 `legacy_run_id`；`AGENTCORE_LEGACY_READ=true` 时 `/api/v1/agent-runs` 返回 `source=agentcore` 且包含新 Run，关闭后恢复 `source=legacy`。

## 7. 灰度读切换（已实现）

控制面提供 `AGENTCORE_LEGACY_READ` 开关：

```text
AGENTCORE_LEGACY_READ=false  # 默认：GET /api/v1/agent-runs 仍读旧 agent-workforce
AGENTCORE_LEGACY_READ=true   # 灰度：GET /api/v1/agent-runs[/:id] 读 AgentCore legacy 投影
```

实现位置：`apps/control-plane/src/routes/workforce.ts`。只覆盖 **Run 读**，写仍走旧服务并由 `AGENTCORE_MIRROR_WRITES` 镜像到 AgentCore；`agentcore` 不可用返回 502，不静默回退。回滚只需把开关改回 `false` 并重启控制面。

本地验证：

```text
list 200 count=1 source=agentcore
id=run_... squad=sq_sdlc_delivery goal=... tasks=3
detail 200 squad=sq_sdlc_delivery status=running
```

> 注意：迁移脚本使用 `legacy_data` 保存完整旧 Run；若灰度读已开启，脚本会自动解包 `{source,id,data}`，避免嵌套。

## 8. 回滚

- 停止 AgentCore 读切流；
- 恢复 `agent-workforce` 旧读；
- 保留 AgentCore 导入数据用于修复；
- 不做删除。

> 相关：[M2 AgentCore](M2-AGENTCORE.md) · [MIGRATION-MATRIX](MIGRATION-MATRIX.md)
