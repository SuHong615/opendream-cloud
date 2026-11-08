# G-V3 契约符合性核对（architect，gate 前最终 diff）

- 日期：2026-11-08
- 基线：`openapi 1.1.0`（`frozen@1.1.0`，144 paths / 197 ops / 129 schemas；快照 `openapi.v2.lock.json`）
- 实现提交：`15fcd35 feat(v3): MCP gateway P0/P1 (EdDSA/JWKS, orgSlug, JSON-RPC codes), app patch whitelist, E2E + CI gates`
- 方法：**静态路由抽取**（`tools/extract-routes.py`，扫 `apps/control-plane/src` + `services/*/src` 的 Fastify 注册；通配路由按 openapi 展开）→ `tools/check-routes-vs-openapi.py` 比对；P0/P1 用代码 `file:line` 抽检（非仅读测试）。
- 产物：`docs/02-architecture/G-V3-impl-routes.json`（179 条实现路由）。

---

## 1. 路由覆盖（按 gate 范围分域）

| 域 | openapi ops | 已实现 | 缺失 | 结论 |
| --- | --- | --- | --- | --- |
| **App 协同/权限（V3-COL 范围）** | 44（含 14 个 `x-mvp-alias`；8 个 `x-v3-target` 单列） | **44** | **0** | ✅ 覆盖完整（含平铺 13 ops + `collab-sessions` 标记目标） |
| **MCP 控制面管理（V3-A2 范围）** | 33（含 2 mvp-alias） | 25 | **8** | ⚠️ 8 个为**版本生命周期管理端点**，见下 KNOWN_GAPS |
| **MCP 数据面（不在 openapi）** | — | 5（`POST/GET /v1/{orgSlug}/{serverSlug}`、`/mcp`、`/sse`） | — | ✅ canonical + `/mcp` 别名 + SSE 均在 `routes.ts:54-58` |
| 数字人（M3 设计） | 9 | 0 | 9 | ⏳ 非 G-V3 范围（M3） |
| 工作流/人工任务（M3） | 15 | 0 | 15 | ⏳ 非 G-V3 范围（M3） |
| 其他 v2 backlog（orgs/quotas/exports/events/auth OIDC 等） | 56（全量缺口中余下） | — | — | ⏳ 已完成 G4 子集；其余 M2/M3 |

**8 个缺失的 MCP 管理端点（KNOWN_GAPS，非 G-V3 P0/P1）**：
`getMcpServerVersion`、`submitMcpServerVersionReview`、`reviewMcpServerVersion`、`publishMcpServerVersion`、`yankMcpServerVersion`、`listMcpServerChannels`、`setMcpServerChannel`、`listMcpServerTools`。
> 判定：属 **M2 版本生命周期管理**（openapi 已定契约、实现排期），**不影响 G-V3 的 MCP 数据面安全语义**；不得把其中任何一项标为 P0。建议 qa 在 gate 以 `KNOWN_GAPS(状态=missing, milestone=M2)` 记录，不阻塞 G-V3。

---

## 2. P0/P1 实现证据（代码抽检）

| 项 | 证据（file:line） |
| --- | --- |
| **P0-1 ticket = EdDSA/Ed25519 + JWKS** | `services/mcp-hub/src/tickets.ts:45,48-51,68-73,78-93,96-101`（`alg=EdDSA`、`kid`、`generateKeyPairSync("ed25519")`、`claims` 含 `scope_hash/jti`；`denylist` `:53`）；`routes.ts:184-186` 暴露 `/.well-known/mcp-jwks.json`、`/.well-known/workspace-jwks.json`；校验 `proxy.ts:37-42`（iss/aud/exp/scope_hash/jti-revoked）；**生产拒绝 HMAC** `proxy.ts:25`（`NODE_ENV=production` → 401） |
| **P0-2 orgSlug slug 语义** | `proxy.ts:147-158`：按 `server.slug` 解析、`orgSlug` 仅与 `server.org_slug` 比较、租户安全以 `binding.org_id`+`ticket.org` 为准；403 `tenant_mismatch`；不再与 org UUID 硬比较 |
| **P1 destructive fail-safe** | `proxy.ts:110-116`：`destructive` 为 true 时需 `server.destructive_allowed` 或显式 `allow && require_explicit_allow`；`core.ts:60-61` 默认 deny |
| **P1 tool-policy 生效** | `proxy.ts:110-116` + `routes.ts:146-156`（`normalizeTools` 生成 manifest）；`/internal/mcp/servers/:id/tool-policy`（`routes.ts:76`） |
| **P1 只读才重试** | `proxy.ts:364`（`read_only === true` 才重试） |
| **P1 tools/list 字段** | `proxy.ts:86-104`（`read_only/risk/annotations.input_schema_hash` 等映射） |
| **P1 JSON-RPC 数字码** | `proxy.ts:311(-32006) / 341(-32007) / 345(-32001) / 351(-32002) / 356(-32005) / 375(-32003|-32004)`；`-32008/-32009/-32010` 见 §3-F3 说明 |
| **P1 status 映射** | `McpServerStatus` 含 `review/deprecated/offline/blocked`（contract）；实现侧 `routes.ts:630-631` 有 `tenant_mismatch` 分支（其余状态见 store） |
| **task-33 协同 patch 白名单** | `services/app-center/src/routes.ts:1119-1136`：`path_not_allowed` 逐文件、`400 validation_failed` + `reason=collab_patch_denied` + `details.cause/files`；测试 `services/app-center/test/collab.test.ts:202,231`、`tests/app-collab/api.spec.ts:113-119`（与 ADR-V3-02/冻结口径一致） |
| **task-33 两处校验** | 提案创建 + 批准合并路径均调用同一校验（`routes.ts:1119` 附近函数被两处使用；测试覆盖 approve 失败用例） |

---

## 3. 差异与建议（无 P0 契约破坏）

| ID | 级别 | 问题 | 建议 |
| --- | --- | --- | --- |
| F1 | P2 | 数据面路由注册把 `/v1/:orgSlug/:serverSlug/mcp` 标为 canonical、无后缀标 alias（`routes.ts:54-58`）；冻结契约为**无 `/mcp` canonical、`/mcp` 等价别名** | **行为等价已满足**（两路径同栈），仅内部命名/注释不一致；建议改注释标签，不改行为。qa 断言按无后缀 canonical + 别名等价即可 |
| F2 | P2 | `-32000/-32008/-32009/-32010` 未作为 JSON-RPC body code 出现：认证/租户在 HTTP 层 401/403；`result_too_large`/`version_conflict` 在 HTTP 413/409 拦截 | ARH §23.2 需补说明：**传输层错误用 HTTP，JSON-RPC body code 仅覆盖会话内错误**；数据面不产生 -32010（管理 API 用 HTTP 409）。**不改实现、不改 openapi**；我已在 `ARCH-V3 §23.2` 加注 |
| F3 | P3 | 内部路由 `/internal/mcp/jti:revoke`（`routes.ts:77`）疑似 `:revoke` 拼写（应为 `/jti/revoke` 或 `/jti:revoke` 故意的） | 内部端点、无契约影响；建议改为 `/internal/mcp/jti/revoke` 并加注释 |
| F4 | — | 8 个 MCP 管理端点 + DH 9 + WF 15 未实现 | 列入 `KNOWN_GAPS`（milestone=M2/M3），**不阻塞 G-V3**；qa 按"P0 端点不得标 gap"核对（它们均非 G-V3 P0） |
| **F5** | **P1（窄）→ ✅ closed（2026-11-08）** | legacy 字符串工具 fail-safe 已修：`services/mcp-hub/src/routes.ts:162` 现为 `typeof item === "string" ? true : tool.destructive !== false`；测试 `services/mcp-hub/test/mcp-v3.test.ts:349-350` 断言 legacy 字符串工具 `destructive === true`；`bun test services/mcp-hub/test` → 22 pass / 0 fail | 已关闭，无需 gate 行动项 |

---

## 4. 结论

- **G-V3 范围内**（MCP 数据面安全语义 + MCP P0/P1 修复 + App 协同/白名单）：**无 P0 契约破坏、无 P1 阻塞项**；路由覆盖 App 44/44、MCP 管理 25/33（8 为 M2 known gaps）、数据面 canonical+alias+SSE 齐全。
- **契约未被修改**（1.1.0 frozen 保持）；F2 为文档口径澄清（ARCH §23.2 加注，不改 openapi）。
- **建议（2026-11-08 更新）**：F5 已 closed、V3-MCP-011 镜像重建后 3×8/8、capability R2 PASS → **gate 可判 PASS**（action 2/3 为 M2/M3 与 1.2 backlog 台账，非阻塞）。

---

## 5. 复现命令

```bash
python docs/02-architecture/tools/extract-routes.py --out docs/02-architecture/G-V3-impl-routes.json
python docs/02-architecture/tools/check-routes-vs-openapi.py \
  --routes docs/02-architecture/G-V3-impl-routes.json \
  --allow-extra '/internal/' --allow-extra '/v1/' --allow-extra '/healthz' --allow-extra '/openapi.json'
# 注：全量 required=189 含 M2/M3 未实现端点；gate 判定请按 §1 分域矩阵（V3 范围）。
```

---

## 6. capability 第二轮实现复核（R2，2026-11-08）

- 报告：`centers/MCP-IMPL-REVIEW-R2.md`；**结论 PASS**（第一轮 2 P0 + 8 P1 全关）。
- route diff（capability 口径）：openapi MCP ops 33 vs 实现 27；`not-in-openapi=1`（`POST /api/v1/mcp-bindings/{bindingId}/ticket`，EdDSA 签发）；`mismatch=0`；`x-mvp-alias=16/16`；`missing=8`（version 详情/review/publish/yank、channels GET/PUT、tools GET，MVP 用 server 级端点）。
  - 与我方静态抽取差异（25 vs 27）来自计数口径（capability 含 `/ticket` 与若干 server 级入口）；**缺失集合一致（8 个）**。
- 别名等价：`/tool-policy` ↔ `/tool-policies` 同 handler ✅；App 平铺 13（`x-mvp-alias`）↔ `collab-sessions`（`x-v3-target`）符合约定 ✅。
- **残余项裁决（architect）**：

| # | 项 | 裁决 |
| --- | --- | --- |
| ① | `kid` 双 key 轮换未实现（单 key，轮换旧票立即失效，窗口 ≤300s） | **P2 确认**：短票 300s 使影响有界；1.2 补双 key JWKS；轮换流程写入 runbook（避开高峰） |
| ② | `POST /mcp-bindings/{id}/ticket` 未入 1.1.0 | **非阻塞**：标为 **MVP extension**（1.2 决定公开 + `x-mvp-alias`，或迁 `/internal/`）；必须鉴权 + scope + 审计，并在 `CONTRACT-DIFF` 记录 |
| ③ | legacy 字符串工具 `destructive=false` | **P1（窄）→ ✅ closed**：backend 已修 `routes.ts:162`（字符串按 true）+ `mcp-v3.test.ts:349-350` 断言；22 pass/0 fail |
| ④ | `McpServerStatus` 的 `pending_review/disabled/blocked` 未实现 | P2（契约只加不改；实现按 `review` 产出即可，其余 1.2 映射） |
| ⑤ | `jti` denylist 单进程 | P2（**MVP 单副本约束**；生产前必须 Redis 化，写入 1.2 backlog） |
| ⑥ | policy 推送 fire-and-forget | P2（不影响正确性；1.2 改 outbox/确认机制，补审计） |

**结论更新**：capability R2 PASS；**唯一新增 gate 条件 = §3-F5（legacy 字符串工具 fail-safe）**——backend 1 行修复或 lead 风险接受后即可放行；其余均 P2/1.2 backlog。


---

## 7. 残余实现缺陷跟踪（非契约，2026-11-08）

| ID | 级别 | 状态 | 证据/说明 |
| --- | --- | --- | --- |
| V3-MCP-011 DELETE binding 偶发 500 | P1（实现） | **源码已修，待镜像重建** | backend 已改（204 空体 + 审计 try-catch）；architect 源码级复跑 `bun test services/mcp-hub/test` → **22/22**，`mcp-v3.test.ts` **连续 6 次 0 fail**；QA 3 次复跑 7/8 仍失败 = **运行旧镜像（4000）**，需重建 control-plane/mcp-hub 镜像后 3×8/8 |
| F5 legacy 字符串 destructive | P1（窄） | ✅ closed | `routes.ts:162` fail-safe=true；`mcp-v3.test.ts:349-350` 断言；22/22 |
| helper 字符串→`{destructive:false}` 注释 | P3 | backlog | `services/mcp-hub/test/helpers.ts:31` 仅测试夹具，不影响生产语义 |

**gate 影响**：V3-MCP-011 是部署/镜像问题，非契约；重建后 qa 3×8/8 + 我在场复跑即可升级 PASS。


---

## 8. gate 时点复跑（architect 在场，2026-11-08）

命令与结果（完整日志：`docs/02-architecture/G-V3-gate-rerun.log`）：

```bash
# 1) 工作流 Schema（V3-WF-001）
$ bun run validate:workflow
PASS cs-ticket.json (warnings: 4 compensate 建议，非阻断)
RESULT: PASS (1 file(s))
$ bun test packages/schema/test/workflow-schema.test.mjs
7 pass / 0 fail / 13 expect() calls

# 2) 端口门禁
$ bun run check:ports
[check-ports] OK: 13 hit(s) all allowlisted（禁止性说明/测试判据/证据引用）
exit 0

# 3) 实现路由 vs 冻结 1.1.0（known-gaps 口径）
$ python docs/02-architecture/tools/extract-routes.py --out docs/02-architecture/G-V3-impl-routes.json
static routes: 171; wildcard-expanded: 8; total: 179
$ python docs/02-architecture/tools/check-routes-vs-openapi.py     --routes docs/02-architecture/G-V3-impl-routes.json     --known-gaps docs/02-architecture/G-V3-known-gaps.json     --allow-extra '/internal/' --allow-extra '/v1/' --allow-extra '/healthz'     --allow-extra '/readyz' --allow-extra '/openapi.json'     --allow-extra '/.well-known/' --allow-extra '/s/'
openapi ops: 189 expected, 8 x-v3-target, 16 x-mvp-alias
implemented: 179
missing required: 56 (known-gaps: 56 / unexpected: 0)
extra routes: 38 (allowed-by-default: x-v3-target)
unexpected extras: 0
RESULT: PASS
```

**known-gaps 台账**（`G-V3-known-gaps.json`，56 项，**均为非 V3 P0/P1**）：
| milestone | 数量 | 范围 |
| --- | --- | --- |
| M2（MCP 版本生命周期） | 8 | version 详情/submit-review/review/publish/yank、channels GET/PUT、tools GET |
| M2-backlog（v2 未实现项） | 24 | orgs/members、quotas/quota-requests、usage/audit exports、auth OIDC login/callback/refresh、events SSE、workspace snapshots/retry/restore、api-key rotate、model-policy delete |
| M3（数字人/工作流） | 24 | DH 9 + workflow/human-tasks 15 |

**F5 / V3-MCP-011 状态**：F5 closed（源码+测试）；V3-MCP-011 镜像重建后 lead 验证 `tests/mcp-gateway` **3×8/8**、control-plane 64/64、mcp-hub 22/22。
