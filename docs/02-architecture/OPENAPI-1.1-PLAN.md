# OpenAPI `1.1.0` 增量计划（v3 / MCP 为核心）

- 状态：**Draft Plan（待 lead 拍板窗口后执行）**
- 日期：2026-11-08
- Owner：architect；评审：qa-reviewer / platform-backend / capability-centers / infra-devops
- 依据：`adr/ADR-V3-05-mcp-lifecycle-contract.md`（契约升级 ADR）、`ARCH-V3.md §20/§23`、`centers/MCP-GATEWAY.md v0.4`、`adr/ADR-V3-02/03/04`
- 前置：v2 `openapi.yaml` **FROZEN（96 paths / 131 ops / 98 schemas）不得改动**；本计划只描述**新增**。

---

## 1. 原则（硬约束）

1. **只加不改**：1.1.0 中，v2 的每个 `path+method+operationId` 必须原样存在；不得删除/重命名/改语义。
2. **schema 只允许"新增可选字段"**：不得给 v2 schema 增加 `required` 字段（会破坏生成 SDK 的兼容性）；枚举只允许**追加**值。
3. **数据面不进资源 API**：MCP 数据面 `/v1/{orgSlug}/{serverSlug}`（+`/sse`）由 `MCP-GATEWAY.md` 定义，不出现在 openapi；`/internal/*` 不出现在 openapi。
4. **版本号**：`info.version: 1.1.0`；`/api/v1` 前缀不变；`x-contract-status` 由 `frozen` 变为 `frozen@1.1.0`，并保留 `x-p2-deferred`。
5. **一次性落库**：所有 v3 增量（MCP/协同/数字人/工作流 + reason）**同一次** 1.1.0 提交，避免零散改契约；后续再变更走 1.2.0。

---

## 2. 新增端点清单（按域）

> 全部沿用 v2 约定：`?cursor&limit` + `{items,next_cursor}`、两层错误（`code`+`reason`）、写操作 `Idempotency-Key`（ticket 类除外）、跨租户 404/同租户 403。

### 2.1 MCP 生命周期（约 10）

| Method | Path | operationId | 说明 |
| --- | --- | --- | --- |
| GET/POST | `/api/v1/mcp-servers/{serverId}/versions` | `listMcpServerVersions` / `createMcpServerVersion` | 版本列表/创建（draft，不可变） |
| POST | `/mcp-servers/{serverId}/versions/{versionId}/submit-review` | `submitMcpServerVersionReview` | draft→review |
| POST | `/mcp-servers/{serverId}/versions/{versionId}/review` | `reviewMcpServerVersion` | approve/reject（含 reason） |
| POST | `/mcp-servers/{serverId}/versions/{versionId}/publish` | `publishMcpServerVersion` | 发布（签名 + tool snapshot） |
| POST | `/mcp-servers/{serverId}/versions/{versionId}/yank` | `yankMcpServerVersion` | 下架（保留已绑定） |
| PUT | `/mcp-servers/{serverId}/channels/{channel}` | `setMcpServerChannel` | channel→version（canary/stable） |
| GET | `/mcp-servers/{serverId}/tools` | `listMcpServerTools` | 已发布版本工具清单（含 `destructive`/`risk`） |
| PUT | `/mcp-servers/{serverId}/tool-policies` | `setMcpToolPolicies` | 工具级 allow/deny/limits（批量） |
| GET | `/api/v1/mcp-call-logs` | `listMcpCallLogs` | 审计检索（from/to 必填、≤90 天） |
| POST | `/mcp-bindings/{bindingId}/rotate-token` | `rotateMcpBindingToken` | **v2 已有**（v2 冻结时已加），1.1.0 仅补 `server_version/scope` 字段说明（不改 schema 必填） |

### 2.2 App 协同（约 8）

| Method | Path | operationId |
| --- | --- | --- |
| POST/GET | `/api/v1/apps/{appId}/collab-sessions` | `createAppCollabSession` / `listAppCollabSessions` |
| GET/DELETE | `/apps/{appId}/collab-sessions/{sessionId}` | `getAppCollabSession` / `closeAppCollabSession` |
| POST/GET | `/apps/{appId}/collab-sessions/{sessionId}/messages` | `postCollabMessage` / `listCollabMessages`（GET 支持 SSE `?stream=true`） |
| POST/GET | `/apps/{appId}/collab-sessions/{sessionId}/proposals` | `createCollabProposal` / `listCollabProposals` |
| POST | `/apps/{appId}/collab-sessions/{sessionId}/proposals/{proposalId}/decision` | `decideCollabProposal`（approve/request_changes/reject） |
| POST | `/apps/{appId}/collab-sessions/{sessionId}/proposals/{proposalId}/preview` | `buildCollabPreview` |

### 2.3 数字人（约 8）

| Method | Path | operationId |
| --- | --- | --- |
| POST/GET | `/api/v1/dh/sessions` | `createDhSession` / `listDhSessions` |
| GET/DELETE | `/dh/sessions/{sessionId}` | `getDhSession` / `endDhSession` |
| POST | `/dh/sessions/{sessionId}/input` | `sendDhTextInput`（文本/事件） |
| GET | `/dh/sessions/{sessionId}/events` | `streamDhEvents`（SSE） |
| POST | `/dh/embed-tokens` | `createDhEmbedToken` |
| POST/GET | `/dh/render-jobs` | `createDhRenderJob` / `listDhRenderJobs` |
| GET | `/dh/render-jobs/{jobId}` | `getDhRenderJob` |
| GET | `/dh/assets`（P2，先只读） | `listDhAssets` |

### 2.4 工作流 / 人工任务（约 11）

| Method | Path | operationId |
| --- | --- | --- |
| POST/GET | `/api/v1/workflow-definitions` | `createWorkflowDefinition` / `listWorkflowDefinitions` |
| GET/PATCH | `/workflow-definitions/{definitionId}` | `getWorkflowDefinition` / `updateWorkflowDefinition`（仅元数据） |
| POST/GET | `/workflow-definitions/{definitionId}/versions` | `createWorkflowVersion` / `listWorkflowVersions` |
| GET | `/workflow-versions/{versionId}` | `getWorkflowVersion`（不可变 DSL） |
| POST/GET | `/workflow-instances` | `startWorkflowInstance` / `listWorkflowInstances` |
| GET | `/workflow-instances/{instanceId}` | `getWorkflowInstance` |
| POST | `/workflow-instances/{instanceId}/cancel` | `cancelWorkflowInstance` |
| POST | `/workflow-instances/{instanceId}/signal` | `signalWorkflowInstance` |
| GET | `/workflow-instances/{instanceId}/events` | `listWorkflowEvents`（回放用，分页/seq） |
| GET | `/api/v1/human-tasks` | `listHumanTasks` |
| POST | `/human-tasks/{taskId}/decision` | `decideHumanTask`（approve/reject/request_changes） |

### 2.5 capability 预审定稿的额外端点（MCP-1.1-01…04，P1，必须入 1.1.0）

| Method | Path | operationId | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/mcp-servers/{serverId}/versions/{versionId}` | `getMcpServerVersion` | 单版本详情（signature/tool_schema_hash/scan_report/approval） |
| POST | `/mcp-servers/{serverId}/rollback` | `rollbackMcpServer` | body `{version_id, channel?}`；切换指针 + 审计 + 通知（独立动作语义） |
| POST | `/mcp-servers/{serverId}/deprecate` | `deprecateMcpServer` | 标记弃用（禁止新绑定，通知使用方） |
| POST | `/mcp-servers/{serverId}/offline` | `offlineMcpServer` | 下线（拒绝新调用/终止流式会话/吊销票据） |
| GET | `/mcp-servers/{serverId}/channels` | `listMcpServerChannels` | 读当前 channel→version 指针（控制台/审计） |
| GET | `/mcp-servers/{serverId}/tool-policies` | `getMcpToolPolicies` | 读当前策略（含 `revision`/ETag） |

> MCP 生命周期端点合计：**10 + 6 = 16**。

---

## 3. Schema 增量（约 25）

- MCP：`McpServerVersion`、`McpChannel`、`McpApproval`、`McpToolPolicy`、`McpCallLog`；**`McpTool` 追加可选 `destructive`**（不改必填）；`McpServer` 追加可选 `stable_version_id`。
- 协同：`CollabSession`、`CollabMessage`、`CollabProposal`、`CollabDecision`。
- 数字人：`DhSession`、`DhEmbedToken`、`DhRenderJob`、`DhEvent`。
- 工作流：`WorkflowDefinition`、`WorkflowVersion`、`WorkflowInstance`、`WorkflowStep`、`WorkflowEvent`、`WorkflowTrigger`、`HumanTask`、`HumanTaskDecision`。
- 通用：`ExportJob` 复用；`Page<T>` 不引入泛型（沿用各 list 的 inline schema 惯例）。

**枚举追加**：
- `EvalRunStatus`/`AppState` 等 **不变**；
- `HumanTask.status`（pending/claimed/completed/expired/canceled）、`HumanTask.scope`（app/collab/publish/workflow/dh）；
- `ErrorReason`：**v2 23 → 1.1.0 58（+35）**：MCP 11（含 `tenant_mismatch`…`tool_not_found` + `ticket_invalid`）、协同 3、分享 2、数字人 10、工作流 10（`auth_session_expired` v2 已存在，不重复）。详见 `ARCH-V3 §23.4`。`ErrorCode` **保持 16 个不变**。

---

## 4. 兼容性验证（CI 硬门禁）

```bash
# 1) v2 基线保留（对冻结快照做逐项断言）
python docs/02-architecture/tools/check-openapi-1.1.py   # 读 openapi.v2.lock.json，断言只加不改
# 断言：base 的 path+method+operationId 100% 存在；schema required 未新增；enum 仅追加

# 2) 可生成 SDK（契约门槛）
# SDK 生成在有网/CI 环境执行（本机离线跳过，见交付说明）
npx @openapitools/openapi-generator-cli generate -i docs/02-architecture/openapi.yaml -g typescript-fetch -o /tmp/sdk-ts
npx @openapitools/openapi-generator-cli generate -i docs/02-architecture/openapi.yaml -g python -o /tmp/sdk-py

# 3) 结构检查
python - <<'PY'
import yaml; d=yaml.safe_load(open('docs/02-architecture/openapi.yaml',encoding='utf-8'))
ops=[(m,p) for p,i in d['paths'].items() for m in i if m in ('get','post','put','patch','delete')]
ids=[i[m]['operationId'] for p,i in d['paths'].items() for m in i if m in ('get','post','put','patch','delete')]
assert len(ids)==len(set(ids)), 'duplicate operationId'
print('paths',len(d['paths']),'ops',len(ops),'schemas',len(d['components']['schemas']))
PY
```

**基线快照**：执行 1.1.0 前，先把当前 FROZEN 文件复制为 `openapi.v2.lock.json`（只读锁文件），CI 用它对 1.1.0 做"只加不改"断言。

---

## 5. 流程与时间

| 步 | 动作 | Owner | 出口 |
| --- | --- | --- | --- |
| 1 | 本计划评审（qa/capability/backend） | architect | 无异议 |
| 2 | lead 批准 1.1.0 窗口 | lead | 批准 |
| 3 | 生成 `openapi.v2.lock.json`（冻结快照） | architect | 锁文件 |
| 4 | 写 1.1.0（一次提交，只加） | architect | 草案 |
| 5 | 兼容性脚本 + SDK 生成 | architect + qa | 全绿 |
| 6 | qa/capability/backend 逐条核对 | 三方 | 回执 |
| 7 | 冻结 1.1.0 + changelog（README §5.1）+ 通知 | architect | `x-contract-status: frozen@1.1.0` |

**风险与缓解**
- **required 字段误加** → CI 断言 + code review（P0）；
- **枚举 rename 而非 append** → 兼容脚本检查枚举子集；
- **数据面混入资源 API** → 路径白名单（禁止 `/v1/{orgSlug}` 出现在 openapi）；
- **SDK 生成失败（3.1 特性）** → 沿用 v2 的 3.1 子集约束（不用 `type` 数组以外的 2020-12 高级特性；已为 v2 验证可行）；
- **一次提交过大** → 按域拆 PR 但同一版本号，合并前统一跑兼容脚本。

---

## 6. 不纳入 1.1.0（明确 P2/内部）

- `/internal/*`（MCP proxy/calls/webhooks、eval specs/gates、app runtime LLM、skill source-token 等）：永不出现在 openapi；
- 灰度/canary 的流量 API（P2，P2 见 `x-p2-deferred`）；
- 数字人资产上传/训练 API（P2）；
- 团队任务/Team、Memory/Experience、实验中心（产品 P2，另行 ADR）。


---

## 7. capability 预审裁决（MCP-1.1-01…10，2026-11-08）

| # | 裁决 | 落地 |
| --- | --- | --- |
| 01 单版本详情 | **采纳（P1）** | §2.5 `getMcpServerVersion` |
| 02 server 级 rollback | **采纳（P1）**；`PUT /channels` 仍保留为"指针设置"，rollback 是"动作+审计+通知" | §2.5 `rollbackMcpServer` |
| 03 deprecate/offline | **采纳（P1）**；server 级语义（version 级只有 `yank`） | §2.5 |
| 04 GET channels / tool-policies | **采纳（P1）**；tool-policies 返回 `revision` + `ETag` | §2.5 |
| 05 version 状态枚举 | **权威：`McpServerVersionStatus = [draft, in_review, approved, published, yanked]`**（`approved`=审核通过待发布）；`scan_status`/`scan_report` 为独立字段；**不单设 validate 端点**，校验并入 `submit-review`；`deprecated/offline` 是 **server 级**状态 | §3 枚举 |
| 06 server 级 vs version 级 review/publish | **version 级为权威**；v2 的 `/review`、`/publish` 保留为"对当前 stable 版本的便捷操作（内部委托 version 级、同一审计）"，description 必须写明 | §2.1 + v2 端点 description 补注（1.1.0 允许改 description） |
| 07 高风险 fail-safe | **`McpTool.destructive` 缺失/未标注 = 按 `true` 处理（fail-safe）**；`McpToolPolicy.require_explicit_allow` 默认 `true` | §3 schema description |
| 08 `McpServer.status` 枚举 | **只加不改**：保留 v2 值 `[draft, pending_review, published, disabled]`，**追加** `deprecated, offline, blocked`，给出映射说明（online↔published、已弃用↔deprecated、下线↔offline） | §3 枚举 |
| 09 call-logs 保留期 | **在线查询窗口 ≤90 天 + 冷存保留 180 天**（满足 R7.5 审计 ≥180 天合规口径）；查询参数 `from/to` 超 90 天提示走导出 | §2.1 + §3 |
| 10 401 reason | `code=unauthorized` + `reason ∈ {auth_session_expired, ticket_invalid}`；**新增 `ticket_invalid` 与 `auth_session_expired` 到 ErrorReason**（1.1.0 增量 +2，reason 总数 23→**59**） | §3 reason |

### 7.1 `McpTool` / `McpToolPolicy` 补全（采纳 capability 建议）

- `McpTool`：`name, description, title?, input_schema?, input_schema_hash, read_only(bool), destructive(bool, 默认视为 true), risk(low/medium/high), annotations?`；
  - `read_only=true` 才允许**自动重试/缓存**（与 ADR-V3-01「工具默认不重试」一致）；
  - `input_schema_hash` 用于 `scope_hash` 与"工具清单漂移检测"（发布的 tool snapshot 与运行时一致）。
- `McpToolPolicy`（PUT body 为**批量替换**）：`effect(allow|deny)`、`tools[]`、`subjects{type:org|team|user|workspace|app, id?}`、`constraints{rpm,tpm,concurrency,timeout_ms,cache_ttl_sec,max_response_bytes}`、`priority`、`require_explicit_allow(默认 true)`；响应含 `revision`，PUT 支持 `If-Match`（并发覆盖返回 409 `conflict` + `reason=version_conflict`）。
- **`tools/list` 两种语义（必须写进 description）**：控制面 `listMcpServerTools` = **published 版本全量目录**（含 destructive/risk/read_only）；数据面 `/v1/{orgSlug}/{serverSlug}` 的 `tools/list` = **按 binding 过滤后的可见子集**（不在资源 API，由 `MCP-GATEWAY` 契约定义）。
- P2（不入 1.1.0）：`GET .../versions/{versionId}/approvals`（approvals 内嵌在版本详情中）。


---

## 8. 执行记录（2026-11-08，lead 批准后）

| 步 | 状态 | 产物/命令 |
| --- | --- | --- |
| 1 计划评审 | ✅ | capability 预审 MCP-1.1-01…10 已裁决（§7） |
| 2 lead 批准窗口 | ✅ | 2026-11-08 "出 draft" |
| 3 冻结快照 | ✅ | `openapi.v2.lock.json`（97 paths / 132 ops / 98 schemas） |
| 4 写 1.1.0 | ✅ | `openapi.yaml`：**144 paths / 197 ops / 129 schemas**；`info.version=1.1.0`、`x-contract-status=frozen@1.1.0`；新增 **65 ops**、0 删除（含 lead 裁决的 MVP 别名/目标别名） |
| 5 兼容性检查 | ✅（结构/增量） | `python docs/02-architecture/tools/check-openapi-1.1.py` → **PASS**（v2 ops 保留、无新增 required、枚举仅追加、refs 全解、无 `/internal/` 或数据面路径混入） |
| 5b SDK 生成 | ⏳ 待有网/CI | 本机离线（mermaid CDN/npx 均不可达），在 CI 或联网环境执行 §4 两条 `openapi-generator` 命令 |
| 6 三方预核 | ⏳ 已发 capability/qa/backend | 预核重点见消息与 §7 |
| 7 冻结 1.1.0 | ✅ **已冻结 `frozen@1.1.0`** | README §5.1 changelog 已记；SDK 生成待 CI/联网 |

**生成与校验命令（可复现）**
```bash
python docs/02-architecture/tools/build-openapi-1.1.py   # 从 lock 重建 1.1.0（幂等）
python docs/02-architecture/tools/check-openapi-1.1.py   # 只加不改断言，exit 0
```


### 7.3 backend 预核裁决（2026-11-08，冻结前）

| 争议 | 裁决 | 落地 |
| --- | --- | --- |
| MCP **server 级** `submit-review`（实现已用） | **采纳**：新增 `POST /mcp-servers/{serverId}/submit-review`，语义=委托当前 draft 版本（version 级为权威、同一审计） | 已加入 draft |
| `/tool-policy` 单数 vs `/tool-policies` 复数 | **契约唯一复数 `/tool-policies`**；单数仅为后端内部 alias，**不进契约**（后端改路由，保留 alias 兼容） | draft 复数 |
| App 协同：平铺路径（已上线 UI）vs `collab-sessions` 层级 | **平铺为 1.1 canonical**（13 ops：permissions/members/collab/messages/proposals/approve/reject/versions/rollback）；**`collab-sessions` 层级移除，留 1.2**（避免双 canonical） | draft 已替换 |
| 缺 schema | **补**：`AppMember`、`AppPermission`、`AppVersion`、`CollabBootstrap` | draft |
| `ShareScope` 缺 `team` | **追加 `team`**（只加不改） | draft |
| `McpServerStatus` 缺 `review` | **追加 `review`**（实现已返回） | draft |
| `McpServer.visibility` 缺 `team` | **追加 `team`** | draft |
| MCP 版本用 `semver` vs `version:int` | **`semver` 为 canonical**；`version:int` 允许作为**额外字段**（不在 required，legacy） | draft（schema semver required） |
| `McpRollbackRequest` | `version_id`(uuid) canonical；**新增可选 `version`(int) 兼容双写** | draft |
| `McpToolPolicy` 返回 shape | **必须严格按契约**（`revision` + `rules[{effect,tools[],subjects,constraints,priority,require_explicit_allow}]`）；后端内部行需映射（按 effect 分组） | 契约不变 |
| `McpTool.destructive` 缺省 | **缺省=true（fail-safe）**；legacy "string 工具数组" 按 false 处理并在文档标注 | 已写 description |
| `McpServer.upstream_url` vs `endpoint` | **`upstream_url` canonical**；`endpoint` 为内部/legacy alias | 契约不变 |
| `McpCallLog` 字段名 | 契约名 canonical（`tool/request_hash/server_version_id`）；后端响应加别名；`from/to` 必填 | 契约不变 |
| `CollabSession` 字段 | **`base_version:int` canonical** + 可选 `content_hash`；`CollabProposal.status` 追加 `open`（≡pending，MVP 兼容） | draft |

**裁决后规模**：**139 paths / 187 ops / 128 schemas**；新增 **55 ops**、删除 **0**；`check-openapi-1.1.py` → **PASS**。


---

## 9. 1.1.0 冻结后 backlog（→ `1.2.0`，只加不改）

> 来源：capability-centers 对 1.1.0 的 P2 预核建议（2026-11-08）。冻结后不即时改契约；1.2.0 走"ADR → 只加"流程。

| # | 项 | 类型 | 处置 |
| --- | --- | --- | --- |
| BL-01 | `McpCallLog` 追加归属/链路字段：`org_id?/workspace_id?/app_id?/user_id?/channel?/cache_hit?/trace_id?` | schema 可选字段 | 1.2.0 |
| BL-02 | `McpCallLog.status` 追加 `rate_limited/timeout/upstream_unavailable`（网关实际会写） | 枚举追加 | 1.2.0 |
| BL-03 | `tool-policies` 的 ETag/`If-Match`：补响应头 + 请求头，或把 summary 改为"revision in body" | 契约文本/header | 1.2.0（**MVP 断言按 body `revision`**，不要断言 ETag） |
| BL-04 | `McpChannel.weight`（canary 灰度权重） | schema 可选字段 | 1.2.0（canary 本身 P2） |
| BL-05 | `McpServerStatus` description 补 `review≡pending_review(读别名)` 映射说明 | description | 1.2.0（实现已按 `review` 返回） |
| BL-06 | `error.data` 结构 | 不入开放契约 | 保持：数据面由 `MCP-GATEWAY §6.4` 定义 |

**冻结期规则**：1.1.0 断言只按当前 schema/枚举；BL-01…05 在 1.2.0 一次性落地，实现可提前写但不得依赖。

---

## 10. 实现符合性（G-V3 相关，非契约变更）

> capability-centers 实现复核（2026-11-08）报告 2 个 P0 + 8 个 P1（file:line 已发 qa）。**架构侧确认：这些是实现不符合契约，不是契约需要修改**。

| 级别 | 项 | 契约依据 |
| --- | --- | --- |
| P0 | ticket 仅 HMAC/opaque，无 EdDSA+JWKS/claims/denylist | `ARCH-V3 §4.7`（**EdDSA/Ed25519 JWT + JWKS**，claims/TTL 300s/三态/吊销）；`ADR-V3-05 §3` |
| P0 | canonical `{orgSlug}` 被当 `org_id` 比较 → 真实 slug 403 | `ARCH-V3 §23.3 C1`（`{orgSlug}` 语义）+ 1.1.0 `McpServer.slug`；跨租户应 403 `tenant_mismatch`、不可见 404 |
| P1 | JSON-RPC 数字码、`destructive` fail-safe、tool-policy 生效、非只读重试、jti 吊销、`tools/list` 字段、status 映射、测试缺口 | `ARCH-V3 §23.2/§23.4` + 1.1.0 `McpTool/McpToolPolicy/McpServerStatus` |

**处置**：作者修复后重跑 G-V3；架构侧**不因实现偏离改契约**（lead 已定"MVP 已实现 + v3 目标别名"仅指路径/字段 shape 兼容，不含安全语义降级）。


---

## 11. 1.1.0 对齐状态（2026-11-08 冻结后）

| 对象 | 状态 | 验证 |
| --- | --- | --- |
| `openapi 1.1.0` | ✅ `frozen@1.1.0`（144 paths / 197 ops / 129 schemas） | `tools/check-openapi-1.1.py` PASS |
| `centers/MCP-GATEWAY.md v0.5` | ✅ 已按 1.1.0 回改（只加不改）；1.2 迁移计划见其 §11 | architect 抽检：`version:int`(:137/500/814/816)、扁平行 `tool_name/revision/destructive_default`(:340)、单数 `/tool-policy` + `x-mvp-alias`(:515/804/814)、`review≡pending_review`(:87/805)、`McpCallLog` 别名(:242/378/386/390)、`collab-sessions` 仅 1.2 节(:816)、规模 144/197/129(:4) |
| `WORKFLOW v0.7` / `DIGITAL-HUMAN v0.7` | ✅ 契约权威改引 `openapi 1.1.0 ErrorReason`（映射值不变）；与 `ADR-V3-04`/`DATA-MODEL §3.11` 一致 | pm 回执 v0.7 + 我抽检（`ErrorReason` 含 10 `dh_*` + 10 `wf_*`，1.1.0 frozen） |
| 实现（backend） | ⛔ **2 P0 + 8 P1 待修**（见 §10） | capability 复核 + file:line 已交 qa |
| G-V3 | ⏳ 等 backend 修复 + qa TEST-PLAN 刷新 | — |


---

## 12. 实现路由 vs 冻结契约（最终 diff 工具）

- 工具：`docs/02-architecture/tools/check-routes-vs-openapi.py`
- 输入：实现导出的路由 JSON（`[{"method":"GET","path":"/api/v1/..."}]`；Fastify `:id` 与 openapi `{id}` 自动归一）。
- 断言：
  - **required** = openapi 全部 ops（**排除 `x-v3-target`**）；缺失即 FAIL；
  - **`x-v3-target`**（8）默认视为允许额外（v3 目标，MVP 不要求实现）；
  - **extra** 路由仅允许 `--allow-extra` 子串（如 `/internal/`、数据面 `/v1/`），否则 FAIL；
  - 报告 `x-mvp-alias` 命中数（当前 16）用于别名等价性核对。
- 命令：
  ```bash
  python docs/02-architecture/tools/check-routes-vs-openapi.py --routes /tmp/routes.json     --allow-extra '/internal/' --allow-extra '/v1/'
  ```
- 与 capability 的 `MCP-IMPL-REVIEW.md` 第二轮 diff **互补**：capability 做 MCP 深度语义复核，本脚本做全量路由覆盖与别名计数，两者结果合并进 G-V3 证据。


---

## 13. CI 门禁接入（T7，2026-11-08 完成）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| openapi 只加不改 | `python docs/02-architecture/tools/check-openapi-1.1.py` | PASS |
| 工作流 Schema | `bun run validate:workflow`（= `bun run --cwd packages/schema validate`） | PASS exit 0（4 条 compensate 建议 WARN，非阻断） |
| 端口一致性 | `bun run check:ports` | PASS（0 blocking） |
| 汇总 | `bun run lint`（tsc + manifests + check:ports + validate:workflow） | exit 0 |

- **G-V3 #13 证据**：`bun run validate:workflow` 输出 + `docs/05-delivery/evidence/v3/wf-schema-test.log`（qa）。
- 根 `scripts/test.ts` 测试发现已扩为 `*.test.(ts|tsx|mjs)`，`packages/schema/test/workflow-schema.test.mjs` 进根 `bun run test`。
- 实现路由最终 diff：`tools/check-routes-vs-openapi.py`（required=189，排除 8 `x-v3-target`，`x-mvp-alias`=16）。

**allowlist 政策（infra 已实现，architect 复核）**：`check-port-4200.mjs` 头部四段政策（仅允许"禁止性/判据/证据引用"三类上下文；真实配置/代码/命令/路由出现 4200 必 BLOCK；新增 allowlist 词需 architect+qa 复核并在注释写明理由；`ALLOWLIST_REVIEW_MILESTONES=[G5,G6]`、`ALLOWLIST_REVIEW_DUE=2026-12-15`，到期打印 OVERDUE，`--strict-allowlist` 到期后 exit 2）。**当前不启用 strict**（未到期）；G5 门禁前做一次复核（重扫 + 残留判定 + 必要时收窄），真实残留=0 且词已最小化后再开 strict（先观察一个迭代）。当前 `check:ports`：12 hits 全 ALLOW / exit 0，可作 G-V3 端口门禁证据。
