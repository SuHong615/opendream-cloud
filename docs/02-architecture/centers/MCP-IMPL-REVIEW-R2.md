# MCP 实现复核 · 第二轮（task-32 修复后）

- 日期：2026-11-08
- 复核人：capability-centers（只读复核；不改实现）
- 契约基线：`openapi 1.1.0 frozen@1.1.0`（144 paths/197 ops/129 schemas）+ `centers/MCP-GATEWAY.md v0.5` + `ARCH-V3 §4.7/§23.2/§23.3` + `ADR-V3-01/05`
- 判定：第一轮 2 P0 + 8 P1 **全部关闭** → **PASS**；残余为 P2/建议项（不阻断 G-V3）

## 1. 测试与构建证据（raw）

```
cd services/mcp-hub       && bun test   ->  21 pass, 0 fail, 105 expect() calls, 222ms (3 files)
cd apps/control-plane     && bun test   ->  63 pass, 0 fail, 246 expect() calls, 3.71s (10 files)
cd services/app-center    && bun test   ->  14 pass, 0 fail, 122 expect() calls, 180ms (3 files)
```

关键新增用例（mcp-hub `test/mcp-v3.test.ts`）：
`V3-MCP-04` destructive 缺失=true fail-safe / policy deny；`V3-MCP-06` JSON-RPC -32007/-32006；`V3-MCP-07` EdDSA JWT + JWKS + 篡改/过期/跨租户；`V3-MCP-08` HMAC dev 同 claims；`V3-MCP-09` binding 吊销 / jti denylist；`V3-MCP-11` 只读重试、写不重试；`V3-MCP-12` 限流 429/-32002。
control-plane `test/mcp-control.test.ts`：`MCP-CP-04` tool-policy destructive 默认 deny；`MCP-CP-06` EdDSA ticket claims/TTL/scope_hash/JWKS。

## 2. 第一轮 P0/P1 关闭矩阵

| QA 编号 | 项 | 结论 | 证据（file:line） |
| --- | --- | --- | --- |
| V3-MCP-001 | EdDSA/JWKS ticket + claims + TTL + denylist | ✅ 关闭（kid 轮换见 P2-01） | `tickets.ts:45-126`（EdDSA sign/verify/JWKS/denylist/TTL≤305）；`proxy.ts:21-71`（生产拒 HMAC `proxy.ts:25`，HMAC dev 同 claims）；`routes.ts:184-186`（`/.well-known/mcp-jwks.json`）；`proxy.ts:42`（jti denylist）；`tickets.ts:40-43`（scope_hash） |
| V3-MCP-002 | 真实 orgSlug（非 UUID 硬比较） | ✅ 关闭 | `proxy.ts:140-160` 按 `server.org_slug` 路由 + `aud=mcp:org:<slug>`/org/server/binding 校验；control-plane 转发 `x-oc-org-slug`（`apps/control-plane/src/routes/mcp.ts:19-30`）；测试用 `acme`（`mcp-v3.test.ts:37,129,227`） |
| V3-MCP-003 | JSON-RPC 码 §23.2 | ✅ 关闭 | `proxy.ts:311`（-32006）、`:341`（-32007）、`:356`（-32005）、`:375`（-32003/-32004）、`:351`（-32002）、`:345`（-32001）；测试 `mcp-v3.test.ts:172-180` |
| V3-MCP-004 | destructive fail-safe + policy/审批/审计 | ✅ 关闭（legacy 见 P2-02） | `routes.ts:154-166` 对象缺省 destructive=true；`proxy.ts:109-129` policy 优先 + `require_explicit_allow`；`routes.ts:766-798` 内部 policy PUT + jti revoke；测试 `V3-MCP-04` |
| V3-MCP-005 | tool-policy 网关生效 | ✅ 关闭（推送可靠性见 P2-03） | `proxy.ts:109-129`（deny/allow/require_explicit_allow）；`routes.ts:766-798` 内部 PUT；control-plane `mcp.ts:240-290` 推送 |
| V3-MCP-006 | 仅 read_only 重试 | ✅ 关闭 | `proxy.ts:358-365`（`meta?.read_only === true`）；测试 `V3-MCP-11` |
| V3-MCP-007 | jti/binding 吊销 | ✅ 关闭（跨副本见 P2-04） | `tickets.ts:110,119-126`；`proxy.ts:42,64-65`；`routes.ts:791-798`；测试 `V3-MCP-09` |
| V3-MCP-008 | tools/list 字段 | ✅ 关闭 | `proxy.ts:80-107`（read_only/risk/title/input_schema_hash/annotations）；测试 `mcp-v3.test.ts:118-119` |
| V3-MCP-009 | status review 映射 | ✅ 关闭（枚举补齐见 P2-05） | `core.ts:27` 含 `review`；`routes.ts:195,366,376,385` |
| V3-MCP-010 | 测试覆盖 | ✅ 关闭 | 21/63 用例；EdDSA/真实 slug/jti/policy/retry 均有 |

## 3. 路由 diff（实现 vs 冻结 1.1.0）

脚本：解析 `openapi.yaml` MCP 路径/方法 vs `apps/control-plane/src/routes/mcp.ts` 注册路由（`:param`→`{param}`，排除 `/internal/*`）。

- openapi MCP ops = **33**（25 paths）；control-plane MCP routes = **27**。
- **not-in-openapi（1）**：`POST /api/v1/mcp-bindings/{bindingId}/ticket`（control-plane `mcp.ts:156`，EdDSA 签发端点；契约未声明 → 见 P2-06）。
- **method/path mismatch = 0**；**x-mvp-alias 命中 = 16/16**（与契约一致；含 `/tool-policy` GET/PUT alias）。
- **missing（8，MVP 未实现，P2）**：`getMcpServerVersion`、version `submit-review/review/publish/yank`、`listMcpServerChannels`、`setMcpServerChannel`、`listMcpServerTools`。均属 version 级/channel/目录的 1.1 目标；MVP 用 server 级端点（v0.4 §6.0），不阻断 G-V3，但需在 1.2/后续补齐或声明 DEGRADED。
- **别名等价**：`GET/PUT /tool-policy` 与 `/tool-policies` 注册同一 handler（`mcp.ts:315-318`）✅；App 平铺 13 ops 为 `x-mvp-alias`，`collab-sessions` 为 `x-v3-target`（MVP 不实现）✅。
- 数据面（不在资源 API）：`/v1/{orgSlug}/{serverSlug}`、`/sse` 与 `/mcp` alias 均实现（`routes.ts:54-58`，label 反向见 P2-07）。

## 4. 残余 P1（窄）/ P2 / 建议

> architect §6 裁决（2026-11-08）：P2-01 kid 双 key **确认 P2**；P2-02 legacy 字符串 **升级 P1（窄）**；P2-06 `/ticket` 判 **MVP extension（非阻塞）**；P2-03/04/05 确认 P2。另 QA 新增 **V3-MCP-011**（DELETE binding 500 偶发，P1）见 §4.1。

### 4.1 本轮新增 P1（窄，待 backend 修）

| ID | 项 | 证据 | 修复/验收 |
| --- | --- | --- | --- |
| P1-01（原 P2-02） | legacy 字符串工具 `destructive=false` | `services/mcp-hub/src/routes.ts:161-162`：字符串已改 **destructive=true**（fail-safe）；测试 `mcp-v3.test.ts:349-350` | **✅ closed（2026-11-08）**：`bun test services/mcp-hub` 22/22；qa 记 V3-MCP-012 closed |
| P1-02（QA V3-MCP-011） | `DELETE /api/v1/mcp-bindings/{id}` 偶发 500 `internal_error` | 源码修：`mcp.ts:41`（204 不解析 JSON）、`:64-75`（审计 try/catch+重试）、`:80`（204 空体）；`MCP-CP-07` 回归；`bun test apps/control-plane` 64/64 | **✅ closed（2026-11-08，运行时验证通过）**：lead 用最新源码重建 control-plane/mcp-hub，QA 复跑 `tests/mcp-gateway` **3×8/8/0 fail**；`G-V3-gate.md` 升 **PASS v1.2**（qa+lead 签署） |

### 4.2 P2 / 建议（不阻断 G-V3）

| ID | 项 | 证据 | 建议 |
| --- | --- | --- | --- |
| P2-01 | **kid 双 key 轮换未实现**（architect 确认 P2，非 P1） | `tickets.ts:47-48,56-73,96-113`；`mcp-ticket.ts:32-45,61-85` 单 key | 轮换 runbook（避开高峰，窗口 ≤300s）+ JWKS 预留 `keys[]`；1.2 补双 key 并行 |
| P2-03 | tool-policy 推送 fire-and-forget（`void fetch`）无重试/ack；hub 内存 store 重启丢策略 | `apps/control-plane/src/routes/mcp.ts:284` | 1.2 加 outbox/重放 + 快照持久化；MVP 单实例可接受 |
| P2-04 | jti denylist 仅进程内；无 Redis/跨副本 ≤5s 传播 | `tickets.ts:53,119-126` | 生产多副本前补 Redis pub/sub（ARCH §23.3 目标） |
| P2-05 | `McpServerStatus` 未实现 `pending_review/disabled/blocked` | `core.ts:27` | 1.2 补映射与 block 流程或声明 DEGRADED |
| P2-06 | `/mcp-bindings/{id}/ticket` 未入 1.1（**architect 判 MVP extension，非阻塞**）；需鉴权/scope/审计 + CONTRACT-DIFF 记录；`rotate-token` 仍发 opaque `mcpb_` | `apps/control-plane/src/routes/mcp.ts:156`；`hub routes.ts:584-589` | 已记 `CONTRACT-DIFF §6`：MVP extension（1.2 `x-mvp-alias` 或迁 `/internal/`）；本轮不改 openapi |
| P2-07 | 数据面 route label 反向：`/mcp` 标 canonical、base 标 alias（行为等价） | `hub routes.ts:54-58` | 1.2 命名对齐 MCP-GATEWAY §4.1 |
| P2-08 | registry/审计为 hub 内存权威（重启丢）、local-gateway 仅反代不验 ticket | 既有结论 | MVP 标 DEGRADED |

## 5. 结论

**PASS（2026-11-08 收口）**：P1-01/P1-02 均 closed；第一轮 2 P0 + 8 P1 全部关闭。lead 用最新源码重建 control-plane/mcp-hub 后，QA 复跑 `tests/mcp-gateway` **3×8/8/0 fail**，`G-V3-gate.md` 升 **PASS v1.2**（qa+lead 签署）；task-25/task-26 已 complete。

- 测试：mcp-hub **22/22**、control-plane **64/64**、app-center 14/14；QA 套件 3×8/8。
- 其余 P2 按 architect §6 裁决归类（kid P2、`/ticket` MVP extension、status/jti/policy P2），进 1.2 backlog，不阻断 G-V3。
- 路由 diff：not-in-openapi=1（`/ticket`，MVP extension，已记 CONTRACT-DIFF §6）、mismatch=0、x-mvp-alias=16/16；missing=8（MVP 未实现的 1.1 目标端点，P2）。
- 复核未改动实现代码、未 commit。
