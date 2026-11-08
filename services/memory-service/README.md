# memory-service（记忆 + 经验库，M5）

OpenDream Cloud **Memory / Experience** 服务：mem0 兼容 memory 存储 + 搜索、经验库（Experience）。
Bun + Fastify 5 + Zod，内存 store（演示级），端口 **4107**，仅集群内可达（control-plane 门面调用）。

- 契约裁决：`docs/02-architecture/G-V5-CONTRACT.md §2.2`（MVP extension，1.2 收编）
- 任务：shared task `task-47`

## 启动

```bash
cd services/memory-service
bun install          # 根 bun install 已覆盖 workspace 时可跳过
bun run dev          # http://127.0.0.1:4107
bun run test         # 14 cases（add/list/search/delete/租户隔离/鉴权/experience）
bun run typecheck    # tsc --noEmit
```

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `4107` | 监听地址/端口 |
| `NODE_ENV` | `development` | test 时自动关闭 Fastify 日志 |
| `MEMORY_API_KEY` | `dev-memory-api-key-0123456789` | 内部 Bearer Key；**所有**业务端点（含 experience）都校验；`/healthz`、`/readyz` 开放 |
| `DEFAULT_ORG_ID` / `DEFAULT_USER_ID` | 固定 UUID | 无 `x-oc-*` 头时的开发默认（生产由门面透传） |
| `SEARCH_DEFAULT_TOP_K` | `10` | 搜索默认 top_k |
| `SEARCH_DEFAULT_THRESHOLD` | `0.1` | 相似度阈值（mock 词法分数） |
| `LIST_DEFAULT_LIMIT` / `LIST_MAX_LIMIT` | `20` / `100` | 列表分页默认/上限 |

## API

> 鉴权：`Authorization: Bearer <MEMORY_API_KEY>`；租户：`x-oc-org-id` / `x-oc-user-id`（门面透传，缺失回退开发默认）。
> 错误统一两层：`{ "error": { "code", "message", "details"?, "request_id" } }`；M5 不新增 `reason`。

### Memory（mem0 兼容，内部数据面；不进 openapi）

| Method | Path | 说明 |
| --- | --- | --- |
| POST | `/v1/memories` | add：`{messages:[{role,content}], user_id?, agent_id?, metadata?}` → `{results:[{...memory, event:"ADD"}]}` |
| GET | `/v1/memories` | list：`?user_id&agent_id&limit` → `{results:[...], items:[...], count}` |
| POST | `/v1/memories/search` | 搜索：`{query, user_id?, agent_id?, top_k?, threshold?}` → `{results:[{...memory, score}], count}` |
| DELETE | `/v1/memories/{id}` | 删除 → `{message:"Memory deleted successfully", id}`；跨租户/不存在 404 |

memory 记录：`{id, memory, user_id, agent_id, metadata, created_at, updated_at}`（search 额外 `score`）。
mock 相似度 = 词法 token 重合（0.8）+ 子串命中（0.2），确定性、无 embedding 依赖。

### Experience（MVP extension，1.2 收编）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/v1/experiences` | list：`?limit` → `{items, count, next_cursor:null}` |
| POST | `/api/v1/experiences` | 创建：`{title, content, tags?, source?}` → 201 |
| GET | `/api/v1/experiences/search` | 搜索：`?q&limit` → `{items:[{...experience, score}], count}` |

experience 记录：`{id, title, content, tags[], source, created_by, created_at, updated_at}`。

### 健康

`GET /healthz` → `{status:"ok", service:"memory-service", version, uptime_ms, memories, experiences}`；`GET /readyz` → `{status:"ok"}`。

## 租户隔离

- 所有 memory/experience 记录带 `org_id`；list/search/delete 一律按 `x-oc-org-id` 过滤与鉴权。
- 跨租户删除 → 404 `not_found`（不泄露存在性）；search 结果不会跨 org。
- `user_id`/`agent_id` 为同级二级过滤（可选）。

## seed

首次启动在 `DEFAULT_ORG_ID` 演示租户下 seed：
- 3 条 memory（`mem_seed_001..003`：TypeScript/Bun 偏好、平台项目、文档约定）；
- 2 条 experience（`exp_seed_001/002`：模型中心接入 Provider、数字人 L1 联调）。

## 已知限制（演示级）

| # | 限制 | 计划 |
| --- | --- | --- |
| M1 | 内存 store：重启丢失、单实例、无持久化 | M5+ 落 PG + 向量库（pgvector） |
| M2 | mock 相似度（词法）非 embedding；无 rerank | M5+ 接 embedding 模型 + vector search |
| M3 | 无配额/容量限制、无审计落库 | 门面审计 + M6 配额 |
| M4 | API Key 为单静态 key（无轮换/多 key） | M6 KMS/多 key |
| M5 | experience 无更新/删除（当前只读 + 创建） | 按需求追加 |

## 测试

`bun run test` 14 cases：
- 鉴权（缺失/错误 401、healthz 开放）；seed；add/list；search（排序/阈值/top_k）；delete（幂等 404）；
- 租户隔离（list/search/delete 跨 org）；参数校验；experience seed/create/search/隔离/鉴权。
