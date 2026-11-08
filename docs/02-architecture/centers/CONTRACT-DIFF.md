# G5 提交用 · centers 契约对齐证据（CONTRACT-DIFF）

- 目的：G5 门禁时向 qa/architect 提供 centers 侧两处"自身对齐"的可复现证据（错误码两层、API 路径命名），并固定实现后 diff 的自检方法。
- 契约基线：`docs/02-architecture/openapi.yaml` **FROZEN**（`x-contract-status: frozen`，`x-frozen-at: 2026-11-04`，scope=G5 四中心公开 API）
- 路由基线：`docs/02-architecture/centers/ROUTES.md`（architect 独立验证通过，2026-11-04；75 ops）
- 本文件只含证据与命令，不含实现代码。

## 1. 证据一：错误码统一为两层（`code` + `reason`）

### 1.1 冻结契约口径
- `openapi.yaml:46` `x-contract-status: frozen`；`openapi.yaml:2657` "领域原因放第二层 `error.reason`（如 `ws_launch_timeout` / `gate_blocked`）"；`:2666` `precondition_failed`；`:2683` 映射 `GATE_BLOCKED`→`gate_blocked`；`:2700` `gate_blocked`。
- 发布门禁：`409` + `code=precondition_failed` + `reason=gate_blocked`（architect C 裁定，不使用 412）。

### 1.2 centers 现状（已对齐）
| 位置 | 证据 |
| --- | --- |
| `centers/README.md:38` | 两层错误包 `{error:{code,reason,message,details,request_id}}`，wire 全 lower_snake |
| `centers/README.md:39` | 门禁 `409 + precondition_failed + gate_blocked`；eval run 失败是 `200+status=failed` |
| `centers/README.md:63` | 状态码已裁定（不用 412） |
| `centers/CENTERS.md:38` | A2 裁决记录（architect C 定稿） |
| `centers/SKILL-CENTER.md:341/367/369` | publish 端点、错误示例、错误码规则均为两层 |
| `centers/EVAL-CENTER.md:396/431` | gate 回调/发布被拒均为 `409 precondition_failed + reason=gate_blocked` |

### 1.3 旧口径残留检查（应为 0）
```powershell
$docs = 'README.md','CENTERS.md','SKILL-CENTER.md','EVAL-CENTER.md','APP-CENTER.md','MCP-HUB.md','ROUTES.md' | ForEach-Object { "docs/02-architecture/centers/$_" }
# 应为 0：不得再把 gate_blocked 当 code 单独使用（未伴随 precondition_failed）
(Select-String -Path $docs -Pattern '"code"\s*:\s*"gate_blocked"|code=gate_blocked' | Measure-Object).Count   # 期望 0
```
> 说明：`gate_blocked` 作为 `reason`、业务结果描述、`x-p2` 说明出现是允许的；判定条件是"作为 `code` 或 `code=` 出现"。检查排除本证据文件自身（其中含旧→新对照文本）。

## 2. 证据二：API 路径命名 canonical（openapi 权威）

### 2.1 已修正的旧命名（centers 内不得再出现）
| 旧（错误） | 新（canonical） | 依据 |
| --- | --- | --- |
| `/api/v1/eval/specs`、`/eval/compare`、`/eval/gates/skill`、`/eval/webhooks/ci`、`/eval/runs/*` | `/internal/eval/specs`、`/internal/eval/compare`、`/internal/eval/gates/skill`、`/internal/eval/webhooks/ci`；公开为 `/eval-datasets`、`/eval-runs/{runId}/...` | openapi 冻结路径 |
| `/api/v1/mcp/servers`、`/mcp/bindings`、`/mcp/calls`、`/mcp/proxy/*`、`/mcp/oauth/callback` | `/api/v1/mcp-servers`、`/mcp-bindings`；内部 `/internal/mcp/calls`、`/internal/mcp/proxy/{bindingId}`；OAuth callback 公开 `GET /api/v1/mcp-oauth/callback` | openapi 冻结路径 |
| 裸 `{id}` / `{vid}` / `{bid}` / `{binding_id}` | `{skillId}/{appId}/{serverId}/{runId}/{datasetId}/{versionId}/{installationId}/{bindingId}/{buildId}/{domainId}` | architect 参数命名规则 |
| `/apps/{appId}/deploy` | `POST /apps/{appId}/deployments` | openapi `createAppDeployment` |
| `/apps/{appId}/access-tickets` | `/apps/{appId}/access-ticket` | openapi `createAppAccessTicket` |
| `oauth2-proxy` 在应用链路 | `auth-edge` + `access-ticket` + `app-gateway`（ADR-004） | architect G2 P1 |
| `runtimeClassName: gvisor` | `runtimeClassName: sandbox-runtime`（handler=gvisor/kata） | ADR-007 |

### 2.2 残留检查（应全为 0）
```powershell
$docs = 'README.md','CENTERS.md','SKILL-CENTER.md','EVAL-CENTER.md','APP-CENTER.md','MCP-HUB.md','ROUTES.md' | ForEach-Object { "docs/02-architecture/centers/$_" }
# 1) 旧前缀残留
(Select-String -Path $docs -Pattern '/api/v1/(eval/|mcp/)' | Measure-Object).Count                 # 期望 0
# 2) 裸占位符残留
(Select-String -Path $docs -Pattern '/\{id\}|\{vid\}|\{bid\}|\{binding_id\}' | Measure-Object).Count  # 期望 0
# 3) 重复 auth 网关残留（仅允许 1 处“仅第三方 UI 可选”说明）
(Select-String -Path 'docs/02-architecture/centers/APP-CENTER.md' -Pattern 'oauth2-proxy' | Measure-Object).Count  # 期望 1
# 4) RuntimeClass 绑定单一实现
(Select-String -Path 'docs/02-architecture/centers/EVAL-CENTER.md' -Pattern 'runtimeClassName: gvisor|runtime_class: gvisor' | Measure-Object).Count  # 期望 0
```
> 排除 `CONTRACT-DIFF.md` 自身：本文件含旧→新对照文本与检查命令，不计入残留。

## 3. ROUTES 基线数值（architect 独立验证 + 我方自检）

```
ROUTES 路由行: 75          operationId 重复: 0
ROUTES opIds not-in-openapi: 0
method/path mismatch: 0
四中心相关 openapi ops: 75  未在 ROUTES: 0
x-p2-deferred 出现在路由表: 0
/internal/ 混入公开路由表: 0
```

8 个 `x-p2-deferred`（G5 不实现、不得发明路径）：`apps/{appId}/certificates`、`apps/{appId}/metrics`、`apps/{appId}/permissions`、`apps/by-slug/{slug}`、`mcp-servers/{serverId}/versions`、`skill-installations/{installationId}/rollback`、`skills/{skillId}/block`、`skills/{skillId}/reviews`。

## 4. G5 实现完成后的复核方法（与 task-16 同口径）

1. 从实现代码导出路由表（method + path + handler function name），与 `ROUTES.md`/`openapi.yaml` 比对：
   - `not-in-openapi = 0`；`method/path mismatch = 0`；`operationId` 与冻结契约一致（SDK 方法名 = operationId）。
2. `x-p2-deferred` 8 项：代码路由/网关注册/前端调用点均为 0。
3. 列表端点全部 `?cursor&limit`，响应 `{items,next_cursor}`；无 `total`（除显式 `include_total=true` 的管理页）。
4. 错误响应全部两层：`code`（通用）+ `reason`（领域）；门禁 `409 precondition_failed` + `gate_blocked` + `details.gate_kind`。
5. `/internal/*` 只注册内部路由组（mTLS/内网网关），不注册公开 Ingress/SDK；`mcp-oauth/callback` 例外为公开但 `security: []` + state 校验。
6. 契约偏差处理：先 ADR → openapi `1.1.0` → README §5.1 changelog → 通知 qa/platform-backend/capability-centers；不允许实现先行。

## 5. 复现命令（一次跑完）

```powershell
# A. openapi 冻结标记
Select-String -Path 'docs/02-architecture/openapi.yaml' -Pattern 'x-contract-status|x-frozen-at|x-frozen-scope' 
# B. centers 残留检查（4 条，期望见 §2.2）
Select-String -Path 'docs/02-architecture/centers/*.md' -Pattern '/api/v1/(eval/|mcp/)' | Measure-Object
Select-String -Path 'docs/02-architecture/centers/*.md' -Pattern '/\{id\}|\{vid\}|\{bid\}|\{binding_id\}' | Measure-Object
Select-String -Path 'docs/02-architecture/centers/EVAL-CENTER.md' -Pattern 'runtimeClassName: gvisor|runtime_class: gvisor' | Measure-Object
# C. ROUTES vs openapi 双向比对（脚本见 docs/02-architecture/centers/ROUTES.md §6 口径）
```

## 6. 1.1.0 MCP MVP extensions / 已知差异（task-25 复核，2026-11-08）

> 冻结期不改 openapi；以下为 architect 裁决的 MVP extension 与后续 1.2 处理项。

| # | 实现 | 契约差异 | 裁决/处理 |
| --- | --- | --- | --- |
| E-01 | `POST /api/v1/mcp-bindings/{bindingId}/ticket`（control-plane EdDSA 签发） | 不在 openapi 1.1.0 | **MVP extension（非阻塞）**：必须鉴权 + scope + 审计；1.2 以 `x-mvp-alias` 补入或迁 `/internal/`；本轮不改 openapi |
| E-02 | `rotate-token` 仍发 opaque `mcpb_`；C2 期望续签走 rotate-token | 语义偏差 | 1.2 让 `rotate-token` 发 EdDSA，或把 `/ticket` 声明为续签 canonical；本轮记录 |
| E-03 | 1.1 目标端点未实现：`getMcpServerVersion`、version `submit-review/review/publish/yank`、`listMcpServerChannels`、`setMcpServerChannel`、`listMcpServerTools`（8 项） | 实现缺失 | MVP 用 server 级端点（MCP-GATEWAY v0.5 §6.0）；1.2/后续补齐，不发明路径 |
| E-04 | 数据面 `/v1/{orgSlug}/{serverSlug}`（+`/sse`、`/mcp` alias、`/.well-known/mcp-jwks.json`） | 不在资源 API（按约定） | 由 `centers/MCP-GATEWAY.md §4/§6.3` 定义；不进 openapi |
| E-05 | `/internal/mcp/*`（batch、tool-policy、jti:revoke 等） | 不进公开契约 | 仅内网/mTLS；不注册公开路由 |

**计数口径**：openapi MCP ops=33（25 paths）；实现 control-plane MCP routes=27；not-in-openapi=1（E-01，另 `/internal` 不计）；mismatch=0；`x-mvp-alias`=16/16；missing=8（E-03）。与 architect 报告 27 vs 25 的差异为 E-01 + server 级入口，缺失集合一致。


## 7. G-V4 MVP extensions（task-45 收口，2026-11-08）

> 明细：`docs/02-architecture/G-V4-mvp-extensions.json`（38 条 extensions + 2 条 blocked，含 owner/disposition）；本轮不签 openapi，1.2 统一收编。

| # | 端点 | 归属 | 处置（1.2） |
| --- | --- | --- | --- |
| E-06 | `POST /api/v1/mcp-versions/{versionId}/review` | platform-backend | 1.2 `x-mvp-alias`（canonical 已实现） |
| E-07 | `POST /api/v1/mcp-versions/{versionId}/publish` | platform-backend | 1.2 `x-mvp-alias` |
| E-08 | `POST /api/v1/mcp-versions/{versionId}/yank` | platform-backend | 1.2 `x-mvp-alias` |
| E-09 | `POST /api/v1/mcp-bindings/{bindingId}/ticket` | platform-backend | MVP extension（E-01）：1.2 公开+alias 或迁 `/internal/`；必须鉴权+scope+审计 |
| E-10 | `GET/POST /api/v1/dh/webhooks`（+DELETE） | model-backend | MVP extension：1.2 正式新增（HMAC 验签） |

- 相关：`GET /mcp-versions/{id}`、`dh/avatars|voices`、`dh/sessions/{id}/messages|end`、`dh/sessions/{id}/events`、workflow `/workflows*`/`workflow-runs*`/`workflow-templates*`/`publish`。
- blocked：`/workflow-runs/{id}/advance`、`/workflow-instances/{id}/advance`（门面 `BLOCKED_SEGMENTS` 拦截）。
- known-gaps 回填：closed 30 / open 26（详见 `G-V4-CONTRACT-CLOSURE.md §2`）。


## 8. M5 MVP extensions（task-51 收口，2026-11-08）

> 明细：`docs/02-architecture/G-V5-mvp-extensions.json`（已合并 G-V4 清单：**70 extensions + 2 blocked**；M5 新增 32 条）。1.2 统一收编，本版不改 openapi。

| 域 | 端点（公开） | 归属 | 处置（1.2） |
| --- | --- | --- | --- |
| eval | `GET/POST /api/v1/eval-evaluators`、`GET/PATCH/DELETE /{id}` | capability-centers | 1.2 新增 evaluator 资源（1.1.0 仅有 eval-datasets/runs） |
| memory | `GET/POST /api/v1/memories`、`DELETE /{id}`、`POST /search` | model-backend | 1.2 新增；内部 mem0 `/v1/memories*` 不进公开契约 |
| experience | `GET/POST /api/v1/experiences`、`GET /search` | model-backend | 1.2 新增 |
| observability | `GET /api/v1/observability/overview`、`/timeseries` | platform-backend | 1.2 新增平台可观测 API |
| org | `GET/PATCH /organizations/current`、`/members*`、`GET/PUT /quotas` | platform-backend | 1.2 `x-mvp-alias`（canonical `/orgs/{orgId}`）；quotas 为 1.2 新资源 |
| workflow | `POST/GET /api/v1/workflows/{id}/runs` | capability-centers | 1.2 alias（canonical `/workflow-instances`） |

- 错误口径：不新增 `reason`（用 `precondition_failed` + `details.quota` 等）；跨租户 404、越权 403、memory key 无效 401。
- 基线 strict diff：237 implemented / 25 known-gaps / 0 unexpected / PASS（落盘后复跑，见 `G-V5-CONTRACT.md §5/§7`）。
