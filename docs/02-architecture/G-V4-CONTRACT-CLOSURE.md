# G-V4 契约收口（P2 收口：路由归一化 / CONTRACT-DIFF / known-gaps）

- 日期：2026-11-08；Owner：architect（task-45）；评审：qa-reviewer（G-V4 gate / task-44）、lead
- 基线：`openapi.yaml 1.1.0`（`frozen@1.1.0`，144 paths / 197 ops / 129 schemas；`ErrorReason` 58）
- 实现：工作区（未 commit）——workflow-engine(:4105)、digital-human(:4106) 已落盘并运行；control-plane 门面已通；MCP 管理 8 端点已实现
- 结论：**A-V4-1/A-V4-2/A-V4-3 全部关闭；最终路由 diff `RESULT: PASS`（unexpected extras=0，missing 全为台账 open 项）**

---

## 1. A-V4-1 路由归一化（工具口径）

### 1.1 归一化规则（已写入 `tools/extract-routes.py` / `check-routes-vs-openapi.py`）

1. **公开契约路由** = control-plane 门面路由 + 服务内以 `/api/v1/` 开头的路由；
2. **服务内部路由**（无 `/api/v1` 前缀，如 workflow-engine 的 `/workflow-definitions`）**不计入公开契约 diff**——它们仅供集群内门面调用；门面负责加前缀；
3. **排除项（不计 unexpected）**：
   - `/internal/*`（内部 mTLS/内网，不注册公开 Ingress/SDK）；
   - 数据面 `/v1/{orgSlug}/{serverSlug}`（含 `/mcp`、`/sse`；由 `centers/MCP-GATEWAY.md §4/§6` 定义，不进 openapi）；
   - **MVP extensions**（`G-V4-mvp-extensions.json`：38 条 + 2 条 blocked，见 §3）；
   - 健康/JWKS/静态内容：`/healthz`、`/readyz`、`/openapi.json`、`/.well-known/*`、`/s/*`；
   - 门面 `BLOCKED_SEGMENTS`（`advance/internal/_debug/metrics/admin`，`apps/control-plane/src/routes/workflow-dh.ts:10`）——上游存在但公网不可达；
4. **模板字符串路由**（`${...}`）不纳入静态抽取（避免误报），由运行时路由测试覆盖。

### 1.2 最终路由 diff（`G-V4-impl-routes.json`，241 条实现路由）

```
openapi ops: 189 expected, 8 x-v3-target, 16 x-mvp-alias
implemented: 241
missing required: 26 (known-gaps: 26 / unexpected: 0)
extra routes: 70 (allowed-by-default: x-v3-target; mvp-extensions: 40)
unexpected extras: 0
RESULT: PASS
```

复现：
```bash
python docs/02-architecture/tools/extract-routes.py --out docs/02-architecture/G-V4-impl-routes.json
python docs/02-architecture/tools/check-routes-vs-openapi.py \
  --routes docs/02-architecture/G-V4-impl-routes.json \
  --known-gaps docs/02-architecture/G-V3-known-gaps.json \
  --mvp-extensions docs/02-architecture/G-V4-mvp-extensions.json \
  --allow-extra-prefix '/internal/' --allow-extra-prefix '/v1/' \
  --allow-extra '/healthz' --allow-extra '/readyz' --allow-extra '/openapi.json' \
  --allow-extra '/.well-known/' --allow-extra '/s/'
```

**服务健康实测**：`GET http://127.0.0.1:4105/healthz` → 200 `{"status":"ok","service":"workflow-engine","version":"0.1.0-m3","api_version":"workflow.opencode.cloud/v1"}`；`GET http://127.0.0.1:4106/healthz` → 200 `{"status":"ok","service":"digital-human","version":"0.1.0-m3",...}`。

---

## 2. A-V4-3 known-gaps 回填（56 → closed 30 / open 26）

台账：`G-V3-known-gaps.json`（含 `status`/`owner_task`/`closed_at`；工具 `tools/known-gaps-status.py`）。

| 状态 | 数量 | 说明 |
| --- | --- | --- |
| **closed** | **30** | M2 MCP 管理 7（version 详情、review/publish/yank、channels GET/PUT、tools GET）+ M3 DH 9 + M3 workflow 14（定义/版本/实例/取消/信号/事件/人工任务） |
| **open** | **26** | M2 1：version 级 `submit-review`（**server 级已实现** `POST /mcp-servers/{id}/submit-review`，MVP 可用）；M3 1：`PATCH /workflow-definitions/{id}`（更新定义）；M2-backlog 24（orgs/quotas/exports/OIDC/events/snapshots 等，未排期） |

> 关闭判据：实现落盘 + 路由 diff 命中 canonical + 服务可运行 + QA G-V4 功能/安全/UI 全绿（lead 已确认）。
> **P0/P1 端点仍不得进入台账**；open 项均为 M2/M2-backlog 范围，不阻塞 G-V4。

---

## 3. A-V4-2 CONTRACT-DIFF：5 个 MVP extension 端点（+相关）

明细：`G-V4-mvp-extensions.json`（38 条 extensions + 2 条 blocked，含 owner/disposition/note）；本表为 lead 指定的 5 项：

| # | 端点 | 归属 | 处置（1.2） |
| --- | --- | --- | --- |
| E-06 | `POST /api/v1/mcp-versions/{versionId}/review` | platform-backend | **1.2 `x-mvp-alias`**；canonical 已实现 `/mcp-servers/{serverId}/versions/{versionId}/review` |
| E-07 | `POST /api/v1/mcp-versions/{versionId}/publish` | platform-backend | **1.2 `x-mvp-alias`**；canonical 已实现 |
| E-08 | `POST /api/v1/mcp-versions/{versionId}/yank` | platform-backend | **1.2 `x-mvp-alias`**；canonical 已实现 |
| E-09 | `POST /api/v1/mcp-bindings/{bindingId}/ticket` | platform-backend | **MVP extension**（CONTRACT-DIFF E-01）：1.2 公开 + `x-mvp-alias` 或迁 `/internal/`；必须鉴权+scope+审计 |
| E-10 | `GET/POST /api/v1/dh/webhooks`（+ `DELETE /{id}`） | model-backend | **MVP extension**：1.2 正式新增（HMAC 验签、注册校验） |

**相关扩展（同表登记，非阻塞）**：`GET /api/v1/mcp-versions/{versionId}`；`GET /api/v1/dh/avatars|voices`；`POST /dh/sessions/{id}/messages`、`/end`（canonical `/input`、DELETE 已实现）；`GET /dh/sessions/{id}/events`(SSE)；workflow `/api/v1/workflows*`、`/workflow-runs*`、`/workflow-templates*`、`/workflows/{id}/publish`（canonical `/workflow-definitions|instances` 已实现）。
**blocked**：`POST /api/v1/workflow-runs/{runId}/advance`、`/workflow-instances/{runId}/advance`（门面拦截，非公开）。

---

## 4. 残余风险与行动项

| ID | 项 | 级别 | Owner/计划 |
| --- | --- | --- | --- |
| V4-R1 | version 级 `submit-review` 未实现（server 级便捷端点可用） | P2 | platform-backend，M2 补 version 级（1.2 前） |
| V4-R2 | `PATCH /workflow-definitions/{id}` 未实现（MVP 用创建新版本替代） | P2 | capability-centers，M3 补 |
| V4-R3 | 24 项 M2-backlog（orgs/quotas/exports/OIDC/events/snapshots 等） | P2 | 未排期，保持 open |
| V4-R4 | MVP extensions 29 条需在 1.2 逐条收编（alias 或正式新增） | P2 | architect 在 1.2 契约窗口统一处理 |
| V4-R5 | 门面逐路径白名单（当前黑名单 segments） | P3 | platform-backend，建议 1.2 前改为白名单 |

---

## 5. Gate 引用建议（qa task-44）

1. 本文档 §1.2 输出作为 **G-V4 路由覆盖/归一化** 证据；`G-V4-impl-routes.json`、`G-V4-mvp-extensions.json`、`G-V3-known-gaps.json` 一并归档。
2. G-V4 gate 判定建议：**PASS-WITH-ACTIONS**（P0/P1=0；残余为 M2/M2-backlog P2 台账，不阻塞）；行动项 = §4 V4-R1…R5。
3. 证据路径：`docs/02-architecture/G-V4-CONTRACT-CLOSURE.md`、`G-V4-impl-routes.json`、`G-V4-mvp-extensions.json`、`G-V3-known-gaps.json`、`G-V4-gate-rerun.log`。

---

## 6. 复现命令汇总

```bash
# 1) 抽取 + 归一化 diff
python docs/02-architecture/tools/extract-routes.py --out docs/02-architecture/G-V4-impl-routes.json
python docs/02-architecture/tools/check-routes-vs-openapi.py --routes docs/02-architecture/G-V4-impl-routes.json \
  --known-gaps docs/02-architecture/G-V3-known-gaps.json \
  --mvp-extensions docs/02-architecture/G-V4-mvp-extensions.json \
  --allow-extra-prefix '/internal/' --allow-extra-prefix '/v1/' \
  --allow-extra '/healthz' --allow-extra '/readyz' --allow-extra '/openapi.json' \
  --allow-extra '/.well-known/' --allow-extra '/s/'
# 2) known-gaps 状态
python docs/02-architecture/tools/known-gaps-status.py --show
# 3) 服务健康
curl -s http://127.0.0.1:4105/healthz ; curl -s http://127.0.0.1:4106/healthz
```
