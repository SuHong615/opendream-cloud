# G-V4 契约收口（workflow-engine / digital-human / MCP 管理）

- 日期：2026-11-08
- Owner：architect；评审：qa-reviewer（G-V4 gate / task-44）、platform-backend（门面 task-41）、capability-centers（workflow-engine task-37）、model-backend（digital-human task-39）、infra-devops（部署 task-43）
- 基线：`openapi.yaml 1.1.0`（`frozen@1.1.0`：144 paths / 197 ops / 129 schemas；`ErrorReason` 58）
- 关联：`ARCH-V3.md §20/§23/§25`、`G-V3-known-gaps.json`（台账）、`services/WORKFLOW.md v0.7`、`services/DIGITAL-HUMAN.md v0.7`、`adr/ADR-V3-03/04`
- 状态：**契约收口草案（实现中）** —— 门面已落地；workflow-engine / digital-human 代码尚未落盘（task-37/39 in progress）。**本文档先冻结"映射与验收口径"，实现落盘后按 §7 复核并把结果写入 gate 证据。**

---

## 1. 范围与原则

1. **契约唯一源** = `openapi.yaml 1.1.0`（不再改）。MVP 实现名与契约名不一致时：
   - 上游服务**必须同时实现 1.1.0 canonical 路径**（门面已能转发 canonical 前缀）；
   - MVP 专有路径标 **MVP extension（`x-mvp-alias`，1.2 收编）**，在 `CONTRACT-DIFF` 记录，不得反向要求改契约。
2. **门面边界**：公网/控制台只经 control-plane；workflow-engine / digital-human 仅集群内可达；上游不自建用户鉴权，以 `x-oc-*` 头为准。
3. **错误模型**：所有响应（含上游透传）必须为两层 `{error:{code,reason,message,details,request_id}}`；`code` 用 16 通用枚举、`reason` 用 1.1.0 的 `ErrorReason`（含 `dh_*`/`wf_*` 各 10）。新增 reason 走 **1.2 backlog**，不得私自在 1.1.0 未定义 reason 上做契约断言。
4. **幂等**：写操作接受 `Idempotency-Key`（门面透传）；`advance`/webhook 等非用户动作需幂等键/去重（`event_id`）。

---

## 2. 门面契约（control-plane，已实现）

证据：`apps/control-plane/src/routes/workflow-dh.ts`

| 前缀 | 上游 | 方法 | 行为 |
| --- | --- | --- | --- |
| `/api/v1/workflows`、`/workflow-runs`、`/workflow-templates`、`/human-tasks` | `WORKFLOW_URL`（默认 `http://workflow-engine:4105`） | GET/POST/PATCH/PUT/DELETE + `/*` | session 必填；写操作 CSRF；透传 `x-oc-org-id/user-id/roles` + `x-request-id`；审计 best-effort |
| `/api/v1/workflow-definitions`、`/workflow-instances`、`/workflow-versions`（**1.1 canonical**） | 同上 | 同上 | 同上（canonical 已接） |
| `/api/v1/dh` | `DIGITAL_HUMAN_URL`（默认 `http://digital-human:4106`） | 同上 | 同上 |
| `/api/v1/workflow-service/health`、`/api/v1/digital-human/health` | 探测 `/healthz` | GET | session 保护，聚合 `{service,status,upstream_status}` |

- 上游不可用 → **502 `upstream_error`**（`workflow-dh.ts:36`）；写操作**不自动重试**（避免重复副作用）。
- 审计失败不阻断业务（best-effort）——**G-V4 需确认审计覆盖率**（写操作应 100% 尝试落审计，失败进指标）。
- 已知小问题：GET 请求也发送 `content-type: application/json`（无害）；`advance` 经 `/api/v1/workflow-runs/*` 暴露为公开写 —— 见 §4-A3。

---

## 3. workflow-engine 映射（task-37 实现 → 1.1.0 canonical）

契约（1.1.0，9 paths / 15 ops）：
`/workflow-definitions`(GET/POST)、`/workflow-definitions/{id}`(GET/PATCH)、`/workflow-definitions/{id}/versions`(GET/POST)、`/workflow-versions/{id}`(GET)、`/workflow-instances`(GET/POST)、`/workflow-instances/{id}`(GET)、`/workflow-instances/{id}/cancel`(POST)、`/{id}/signal`(POST)、`/{id}/events`(GET)、`/human-tasks`(GET)、`/human-tasks/{id}/decision`(POST)。

| task-37 MVP 路径 | 1.1.0 canonical | 处置 |
| --- | --- | --- |
| `GET/POST /api/v1/workflows` | `GET/POST /workflow-definitions` | 上游**两者都实现**；MVP 名 1.2 `x-mvp-alias` |
| `GET /api/v1/workflows/{id}` | `GET /workflow-definitions/{id}` | 同上 |
| `POST /api/v1/workflows/{id}/publish` | `POST /workflow-definitions/{id}/versions`（创建不可变版本 + 设为 latest） | **语义需明确**：publish = create version（版本不可变）；1.1.0 无独立 publish 端点，不允许新增 reason/路径；上游可额外提供 MVP publish 作为 alias |
| `GET /api/v1/workflow-templates` | 无（1.1.0 未定义） | **MVP extension**（只读模板目录）→ 1.2；MVP 可保留但标 `x-mvp-alias` |
| `POST /api/v1/workflows/{id}/runs` | `POST /workflow-instances` | 上游两者都实现；`definition_id`/`dsl_version_id`/`input`/`correlation` 字段按 1.1.0 `WorkflowStartRequest` |
| `GET /api/v1/workflow-runs/{id}` | `GET /workflow-instances/{id}` | 同上 |
| `POST /api/v1/workflow-runs/{id}/advance` | 无 | **不得作为公开契约端点**：建议上游改为 `/internal/workflow-runs/{id}/advance`（或 1.2 正式化）；门面需**停止公开透传 `advance`**（见 §4-A3） |
| `POST /api/v1/workflow-runs/{id}/cancel` | `POST /workflow-instances/{id}/cancel` | 对齐 |
| `GET /api/v1/human-tasks`、`POST /human-tasks/{id}/decision` | 完全一致 | ✅ |
| （缺）`/workflow-instances/{id}/signal`、`/{id}/events`、`/workflow-versions/{id}` | 1.1.0 canonical | 上游需补实现（G-V4 known-gaps 中 M3 项，完成即 closed） |

**响应/字段**：`WorkflowDefinition/Version/Instance/HumanTask` 必须按 1.1.0 schema（含 `org_id`、`status` 枚举、`dsl_hash`、`correlation`、`seq` 分页）；列表统一 `?cursor&limit` + `{items,next_cursor}`。

---

## 4. digital-human 映射（task-39 实现 → 1.1.0 canonical）

契约（1.1.0，6 paths / 9 ops）：
`/dh/sessions`(GET/POST)、`/dh/sessions/{id}`(GET/DELETE)、`/dh/sessions/{id}/input`(POST)、`/dh/embed-tokens`(POST)、`/dh/render-jobs`(GET/POST)、`/dh/render-jobs/{id}`(GET)。

| task-39 MVP 路径 | 1.1.0 canonical | 处置 |
| --- | --- | --- |
| `GET /api/v1/dh/avatars`、`GET /api/v1/dh/voices` | 无 | **MVP extension**（资产目录）→ 1.2；MVP 保留 + `CONTRACT-DIFF` 记录 |
| `POST /api/v1/dh/sessions`、`GET /:id` | ✅ 一致 | 字段按 `DhSession`（`mode`/`status`/`rtc{room,url,token,expires_at}`） |
| `POST /api/v1/dh/sessions/{id}/messages` | `POST /dh/sessions/{id}/input` | 上游**两者都实现**；MVP 名 1.2 alias；请求体 `{text}` 对齐 `sendDhTextInput` |
| `POST /api/v1/dh/sessions/{id}/end` | `DELETE /dh/sessions/{id}` | 上游两者都实现；MVP 名 1.2 alias |
| `GET /api/v1/dh/sessions/{id}/events`（SSE） | 无 | **MVP extension**：SSE 事件流（`state/message/ended` + `Last-Event-ID`）→ 1.2 正式化 |
| `POST /api/v1/dh/webhooks` | 无 | **MVP extension**；必须 HMAC 签名 + 注册校验（1.2 正式化） |
| （缺）`/dh/embed-tokens`、`/dh/render-jobs*` | 1.1.0 canonical | M3 known-gaps；完成即 closed |

**错误 reason（必须用 1.1.0）**：`dh_session_active`(409)、`dh_concurrency_exceeded`(429)、`dh_gpu_budget_exceeded`(429)、`dh_avatar_unavailable`(409)、`dh_voice_unauthorized`(403)、`dh_rtc_unavailable`(503)、`dh_tts_unavailable`(503)、`dh_lipsync_failed`(502)、`dh_content_blocked`(403)、`dh_embed_token_invalid`(401)。**不得**新增如 `dh_avatar_not_found`（如需 → 1.2 backlog；MVP 用 `not_found` + `details`）。

---

## 5. MCP 管理 8 端点（openapi 1.1.0 已含；task-35 待实现）

| # | 端点 | operationId | 校验点 |
| --- | --- | --- | --- |
| 1 | `GET /mcp-servers/{id}/versions/{versionId}` | `getMcpServerVersion` | schema `McpServerVersion`（`version:int`+`tools[]`；`semver` 可选） |
| 2 | `POST /.../versions/{versionId}/review` | `reviewMcpServerVersion` | `{decision:approve|reject}`；409 `precondition_failed`+`reason=gate_blocked`（门禁） |
| 3 | `POST /.../versions/{versionId}/publish` | `publishMcpServerVersion` | 版本不可变；签名 + tool snapshot |
| 4 | `POST /.../versions/{versionId}/yank` | `yankMcpServerVersion` | 已绑定保留；新安装阻断 |
| 5 | `GET /mcp-servers/{id}/channels` | `listMcpServerChannels` | `McpChannel[]`（`effective_at`） |
| 6 | `PUT /mcp-servers/{id}/channels/{channel}` | `setMcpServerChannel` | `{version_id}`；**不触发热切换**（PEP 解析，见 ARCH §7.2） |
| 7 | `GET /mcp-servers/{id}/tools` | `listMcpServerTools` | published 全量目录（含 `destructive/read_only/risk`）；≠ 数据面可见集 |
| 8 | （缺）`version submit-review` 已在 G-V3 前 MCP 生命周期中提供 server 级便捷端点 | `submitMcpServerReview` | 委托当前 draft；version 级权威 |

**验收**：路径/方法/响应 schema 与 1.1.0 一致；错误两层；权限（org admin/owner）与审计；不新增未入契约路径（如需要 → 1.2）。

---

## 6. known-gaps 台账状态（`G-V3-known-gaps.json`，2026-11-08 更新）

- 总计 **56** 项：`status=in_progress` **32**（M2 8 + M3 24）、`status=open` **24**（M2-backlog）。
- 归属：M2 8 → **task-35**；M3 24 → DH 9 **task-39** / WF 15 **task-37**；M2-backlog 24 → 未排期（M2 后续）。
- **关闭规则**：实现落盘 + G-V4 测试通过 + 路由 diff 命中（canonical）后，把该 `operationId` 的 `status` 改为 `closed`（保留行，注明 `closed_at`/证据），**再从 gate 的 missing 集合移入 closed 列表**；P0/P1 端点不得出现在台账。
- 台账更新命令：`python docs/02-architecture/tools/known-gaps-status.py --close <operationId> ...`（见 §7；若脚本未落盘则手工改 JSON 并跑校验）。

---

## 7. G-V4 验收口径与命令

| # | 检查 | 命令/方式 | 通过标准 |
| --- | --- | --- | --- |
| 1 | 契约未变 | `git diff --stat docs/02-architecture/openapi.yaml` | 无改动（1.1.0 frozen） |
| 2 | canonical 路由覆盖 | `python tools/extract-routes.py --out G-V4-impl-routes.json` + `check-routes-vs-openapi.py --known-gaps G-V4-known-gaps.json` | 新增 M2/M3 端点命中；missing 仅剩已登记 open 项 |
| 3 | 别名等价 | 对 `/workflows`↔`/workflow-definitions`、`/workflow-runs`↔`/workflow-instances`、`/dh/sessions/{id}/messages`↔`/input`、`/end`↔DELETE 各跑同一请求 | 响应（除 path 回显）逐字段等价 |
| 4 | 门面 | 未登录 401、无 CSRF 写 403、跨租户 404、上游停 → 502 `upstream_error` | 全部符合 |
| 5 | 错误层 | 抽样 10 个错误响应 | `code`∈16、`reason`∈58、含 `request_id` |
| 6 | 审计 | 写操作后查 `audit_logs` | 100% 有记录（含 proxy action） |
| 7 | SSE | `/dh/sessions/{id}/events` 带 `Last-Event-ID` | 续传不丢/不重复 |
| 8 | 安全 | `/advance`/`/dh/webhooks` 不公网可用（或强鉴权+审计）；上游仅内网 | NetworkPolicy + 门面白名单 |

---

## 8. 待办 / 行动项（G-V4 前）

| ID | 项 | Owner | 动作 |
| --- | --- | --- | --- |
| V4-A1 | workflow-engine 同时实现 1.1 canonical（definitions/versions/instances/signal/events） | capability-centers（task-37） | 按 §3 表；MVP 名保留为 alias |
| V4-A2 | `publish` 语义 = 创建不可变版本并置 latest；无独立契约端点 | capability-centers | 语义/测试对齐 |
| V4-A3 | **`/workflow-runs/{id}/advance` 不得公开** | platform-backend（task-41） + capability | 上游改 `/internal/...`；门面停止公开透传 advance（或强 admin 鉴权 + 审计） |
| V4-A4 | digital-human canonical `/input` + `DELETE /sessions/{id}` 同时实现；`messages`/`end` 为 alias | model-backend（task-39） | 按 §4 表 |
| V4-A5 | `avatars/voices/events/webhooks`、`workflow-templates`、`collab-sessions`、`/ticket` 等 MVP extensions 汇总到 `CONTRACT-DIFF`，1.2 收编 | capability + backend | 各自文档记录；本轮不改 openapi |
| V4-A6 | MCP 管理 8 端点实现与 schema 校验 | platform-backend（task-35） | 按 §5 |
| V4-A7 | 部署：compose 4105/4106、env `WORKFLOW_URL`/`DIGITAL_HUMAN_URL`、NetworkPolicy | infra-devops（task-43） | 按 ARCH §25.3 |
| V4-A8 | known-gaps 关闭回填 + G-V4 证据 | architect + qa（task-44） | 实现落盘后执行 §6/§7 |

**G-V4 gate 预判**：门面已实现；上游服务落盘并满足 §7 后，预计 **PASS-WITH-ACTIONS**（MVP extensions 与 known-gaps 台账为非阻塞项）。

---

## 9. 复现与证据

```bash
# 路由抽取 + 契约 diff（known-gaps 口径）
python docs/02-architecture/tools/extract-routes.py --out docs/02-architecture/G-V4-impl-routes.json
python docs/02-architecture/tools/check-routes-vs-openapi.py \
  --routes docs/02-architecture/G-V4-impl-routes.json \
  --known-gaps docs/02-architecture/G-V3-known-gaps.json \
  --allow-extra '/internal/' --allow-extra '/v1/' --allow-extra '/healthz' \
  --allow-extra '/readyz' --allow-extra '/openapi.json' \
  --allow-extra '/.well-known/' --allow-extra '/s/' \
  --allow-extra '/api/v1/workflows' --allow-extra '/api/v1/workflow-runs' \
  --allow-extra '/api/v1/workflow-templates' --allow-extra '/api/v1/dh/'
# 门面/服务测试
bun test apps/control-plane services/workflow-engine services/digital-human tests/workflow tests/digital-human
```

---

## 10. V4 交接清单（给 QA task-44，2026-11-08）

> 当前实现状态：**服务骨架已落盘（`services/workflow-engine`、`services/digital-human`、console 页面、tests 目录），但 `src/server.ts` 入口与路由尚未落盘**（package.json 的 `start` 指向 `src/server.ts`）。以下为契约约定的启动/路径/选择器；入口落盘后即可跑 §7。

### 10.1 服务目录 / 端口 / 启动命令

| 服务 | 目录 | 端口（env 默认） | 本地启动 | 健康检查 |
| --- | --- | --- | --- | --- |
| workflow-engine | `services/workflow-engine` | **4105**（`HOST=127.0.0.1`、`PORT=4105`） | `bun run --cwd services/workflow-engine start`（或 `dev`）；compose：`docker compose -f deploy/local/docker-compose.yml up -d workflow-engine` | `GET /healthz` |
| digital-human | `services/digital-human` | **4106**（`HOST=127.0.0.1`、`PORT=4106`） | `bun run --cwd services/digital-human start`；compose：`... up -d digital-human` | `GET /healthz` |

- compose 已声明：`workflow-engine`（4105:4105，`WORKFLOW_URL`/`CONTROL_PLANE_URL`、healthcheck）、`digital-human`（4106:4106，同上）；control-plane env 默认 `WORKFLOW_URL=http://workflow-engine:4105`、`DIGITAL_HUMAN_URL=http://digital-human:4106`（本地直跑时可覆盖为 `http://127.0.0.1:4105/4106`）。
- 两服务均为 **L1 控制面旁路**：只监听内网/本机，公网只经 control-plane。

### 10.2 control-plane 代理路径（已实现，`workflow-dh.ts`）

| 前缀 | 上游 | 鉴权/行为 |
| --- | --- | --- |
| `/api/v1/workflows*`、`/workflow-runs*`、`/workflow-templates*`、`/human-tasks*` | workflow-engine | session 必填；写操作 CSRF；`x-oc-org-id/user-id/roles`+`x-request-id` 透传；审计 best-effort；上游停 **502 `upstream_error`** |
| `/api/v1/workflow-definitions*`、`/workflow-instances*`、`/workflow-versions*`（1.1 canonical） | 同上 | 同上 |
| `/api/v1/dh*` | digital-human | 同上 |
| `GET /api/v1/workflow-service/health`、`/api/v1/digital-human/health` | 探测 `/healthz` | session 必填，聚合 `{service,status,upstream_status}` |

> 测试注意：控制面写操作需 CSRF（与既有控制台一致）；未登录 401；跨租户 404；上游停 502 `upstream_error`。

### 10.3 控制台页面与 data-testid（已落盘）

| 页面 | 路由 | 关键 testid |
| --- | --- | --- |
| 工作流 | `/workflows` | `workflows-page`、`workflow-status`、`workflow-create`、`workflow-card`、`workflow-publish`、`workflow-start`、`workflow-run`、`workflow-run-detail`、`workflow-cancel`、`workflow-retry`、`workflow-node`、`human-task`、`human-approve`、`human-reject`、`workflow-create-dialog/submit`、`workflow-start-dialog/submit`、`human-decision-dialog/confirm`、`toast` |
| 数字人 | `/digital-human` | `dh-page`、`dh-status`、`dh-avatar`、`dh-voice`、`dh-create`、`dh-session`、`dh-end`、`dh-message`、`dh-input`、`dh-send`、`toast` |

### 10.4 测试目录（已存在，供 V4_RUN）

`tests/workflow/`、`tests/digital-human/`、`tests/mcp-admin/`、`tests/app-collab/`、`tests/e2e/`（含 `workflow.spec.ts`/`digital-human.spec.ts` 待确认）。

### 10.5 落盘后 architect 立即执行（并通知 QA）

1. `python tools/extract-routes.py --out G-V4-impl-routes.json`（扫新服务）；
2. `python tools/check-routes-vs-openapi.py --routes … --known-gaps G-V3-known-gaps.json --allow-extra …`（canonical 覆盖 + alias）；
3. 对 `G-V3-known-gaps.json` 中 M2 8 / M3 24 的**已实现项**执行 `python tools/known-gaps-status.py --close <operationId>`；
4. 输出路由 diff + known-gaps 关闭清单，发 qa 并入 `G-V4-gate` 证据。


---

## 11. 实现态复核（2026-11-08，task-45 收口）

- **服务已落盘并运行**：workflow-engine(:4105)/digital-human(:4106) `healthz` 200；control-plane 门面已通；MCP 管理 8 端点已实现（QA 6/6）。
- **canonical 覆盖**：workflow/DH canonical 路径已实现（workflow-engine `app.ts` 同时提供 `/api/v1/workflow-definitions|instances|versions` 与 MVP 名；digital-human 提供 `/input`、`DELETE /sessions/{id}` 及 MVP 名）。
- **门面安全**：`BLOCKED_SEGMENTS = advance/internal/_debug/metrics/admin`（`workflow-dh.ts:10`）；`advance` 不公开。
- **最终路由 diff**：241 implemented / 26 known-gaps missing / **0 unexpected extras** / **PASS**（详见 `G-V4-CONTRACT-CLOSURE.md §1.2`）。
- **known-gaps**：closed 30 / open 26（M2 1 + M3 1 + M2-backlog 24）。
- 残余行动项见 `G-V4-CONTRACT-CLOSURE.md §4`（V4-R1…R5）。
