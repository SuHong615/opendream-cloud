# G4 契约偏差审查（Contract Deviation Review）

- Owner：architect（审查人） / platform-backend（实现方） / qa-reviewer（准出）
- 适用：G4 task-11…15（monorepo / 控制面 MVP / Operator+镜像 / 控制台 / E2E）
- 契约唯一源：`docs/02-architecture/openapi.yaml`（+ `DATA-MODEL.md`、`SECURITY.md`、`adr/`）
- 原则：**实现服从契约**；确有必要偏离时，先提 ADR，再改契约，最后改实现。禁止"先写代码后补文档"。

---

## 0. 自检先于评审（backend/infra/web 提交前必须跑）

| # | 检查 | 命令/方式 | 通过标准 |
| --- | --- | --- | --- |
| 1 | OpenAPI 可解析 | `python -c "import yaml;yaml.safe_load(open('docs/02-architecture/openapi.yaml',encoding='utf-8'))"` | 无异常；`openapi: 3.1.0` |
| 2 | 路由对齐 | 启动控制面 → `GET /docs/json`（或 Fastify `printRoutes`）导出路由清单，与 openapi `paths` 做集合 diff | 已实现路由 ⊆ openapi；未实现项写入 `KNOWN_GAPS`（qa task-15） |
| 3 | operationId 唯一 | `grep -c operationId` vs 去重 | 无重复 |
| 4 | 错误信封 | 任一 4xx/5xx 响应体 | `{"error":{code,reason?,message,request_id,details?}}`，`code` ∈ 16 枚举、`reason` ∈ 23 枚举 |
| 5 | 状态枚举 | 反序列化 `Workspace.state` / `EvalRun.status` / `AppDeployment.status` | 与 openapi 枚举**完全一致**（9 态 / 9 态 / 8 态） |
| 6 | 分页 | 列表端点 | `?cursor&limit`（limit 1–100，默认 20），响应 `{items,next_cursor}`；`total` 仅 `include_total=true` |
| 7 | 幂等 | 写端点 | `Idempotency-Key` 生效（重放 `Idempotency-Replayed: true`）；**两个 access-ticket 端点必须无幂等**（每次新 jti） |
| 8 | 租户隔离 | 跨用户/跨 org 请求 | 统一 **404**（不可见），同租户越权 **403**；repository 必须带 `org_id`（SQLite MVP 无 RLS，靠 repo 兜底） |
| 9 | 凭证 | 响应/日志/配置 | 无服务密码、无真实供应商 Key、无 MCP 上游凭证；L2 配置无 baseURL/apiKey |
| 10 | 审计 | 写操作后查 `audit_logs` | 100% 落审计（含 actor/ip/request_id/outcome），不可 UPDATE/DELETE |

---

## 1. 逐端点审查清单（MVP 子集）

> 每个端点：method/path 一致 → 请求 schema 一致 → 响应 schema 一致 → 错误响应覆盖 → 权限与租户语义一致 → 审计。

### 1.1 认证
| 契约 | 检查点 |
| --- | --- |
| `GET /api/v1/me` | 无会话 401；返回 `user/orgs/active_org/permissions`；不得回显任何密钥 |
| `POST /api/v1/auth/logout` | 204；Redis/会话删除；幂等 |
| `POST /api/v1/auth/dev-login`（**MVP 新增，须进 KNOWN_GAPS 并在 G5 前移除或加环境开关**） | 仅 `NODE_ENV!=production` 启用；写审计；返回 `__Host-oc_session`（dev 可用 `oc_sess`，但需 ADR） |

### 1.2 工作区
| 契约 | 检查点 |
| --- | --- |
| `POST /workspaces/me/ensure` | 幂等；不存在→创建（202），stopped→start（202），ready/idle→200 原态；**不得**因调用删除/重置数据 |
| `GET /workspaces`、`GET /workspaces/{id}` | ETag（GET 单资源可选）；跨用户 404；`state` 枚举精确 |
| `POST /workspaces/{id}/start|stop` | 非法迁移 409（如 deleted→start）；幂等语义 |
| `POST /workspaces/{id}/destroy` | **必须**校验 `confirm_name` 与 `display_name` 完全一致 + `acknowledge_data_loss=true`；202 + `destroy_scheduled_at`（默认 +5min，D17）；写审计 |
| `POST /workspaces/{id}/destroy/cancel` | 冷却期内成功；过期 409 `workspace_destroy_cooldown`（reason） |
| `POST /workspaces/{id}/access-ticket` | ticket 60s、一次性 jti、`aud=workspace:<id>`、绑定 sub；**无 Idempotency-Key**；未就绪 409 `workspace_not_ready`；跨用户 404 |
| `GET /workspaces/{id}/events`、`/events`(SSE) | `seq` 单调；SSE 只承诺可重连的可见连续性（5min 回放 + resync） |

### 1.3 模型
| 契约 | 检查点 |
| --- | --- |
| `GET/POST /model-providers`、`PATCH/DELETE /{id}` | 凭证只写不读（`has_credential` 代替明文）；删除被引用模型/供应商 409 |
| `GET /models`、`GET /{id}` | 已按策略过滤；`litellm_alias` 不可重命名 |
| `GET/POST /model-policies`、`GET/PUT/DELETE /{id}`、`POST /{id}/preview` | 规则解析顺序 deny 优先、subject 精确>role>org；preview 不落库 |

### 1.4 组织 / API Key
| 契约 | 检查点 |
| --- | --- |
| `GET /orgs`、`GET/PATCH /orgs/{id}` | 仅成员可见；patch 仅 admin+ |
| `GET/POST /orgs/{id}/members`、`PATCH/DELETE /{memberId}` | 不能自提权；owner 唯一性 |
| `GET/POST /api-keys`、`DELETE /{id}`、`POST /{id}`（rotate） | 明文仅创建/轮换响应一次；HMAC-SHA256(pepper) 存储；吊销 ≤5s |

### 1.5 用量 / 审计（MVP 读侧）
| 契约 | 检查点 |
| --- | --- |
| `GET /usage`、`GET /quotas` | `from/to` 必填、跨度 ≤90 天；`cost_usd` 为 decimal string、token 为整数 |
| `GET /audit-logs` | `from/to` 必填；admin+；不含正文/密钥 |

---

## 2. 实现偏差的处置规则

| 情形 | 处置 |
| --- | --- |
| 实现缺端点（MVP 范围外） | 写入 `docs/05-delivery/G4-EVIDENCE.md` 的 `KNOWN_GAPS`（qa 维护），**不得**在实现里发明新路径。**`KNOWN_GAPS` 只允许两种状态：`missing`（契约有、MVP 不实现）与 `blocked`（依赖外部条件）；P0 端点不得标 gap**（P0 缺一个即 G4 不通过，只能修） |
| 契约字段不够用 | 先提 **ADR-017+**（记录：为什么、影响哪些端点和客户端）→ 改 openapi → 实现 |
| 实现命名与契约不一致 | **改实现**（契约是 SDK 源，改名会破坏客户端） |
| 错误码不匹配 | 改实现：`code` 用 16 枚举、`reason` 用 23 枚举；新增 reason 必须先改 openapi |
| 性能/安全例外（如 dev-login） | 必须：环境开关 + 审计 + 写进 ADR + G5 前移除计划 |
| SQLite 特有行为 | 不得引入 SQLite-only 语义（如 `rowid`、`AUTOINCREMENT`）；`id` 由应用生成 uuid，保证 G5 迁 PG 无痛 |

---

## 3. 审查输出格式（我提交给 qa）

| ID | 位置（文件:行 / 端点） | 级别 | 问题 | 契约依据 | 建议 |
| --- | --- | --- | --- | --- | --- |
| G4-C-01 | `apps/control-plane/src/...:L12` | P0/P1/P2 | … | openapi `/workspaces/{id}` | … |

- **P0**：契约破坏（SDK 会挂/安全/隔离）→ 阻断准出；
- **P1**：契约不一致（命名/字段/错误码）→ 本轮修；
- **P2**：建议（注释/校验消息/可观测）→ 可排期。

---

## 4. 我（architect）在 G4 的动作

1. task-12 代码 PR：逐端点对照 §1 清单审查，输出 §3 表格给 qa + backend。
2. 契约测试结果（task-15）：核对 `KNOWN_GAPS` 是否合理（不得把 P0 端点标成 gap）。
3. 收集实现反馈 → 需要时新增 ADR（候选：dev-login 的隔离策略、Fastify 插件分层、SQLite→PG 迁移细则）。
4. 更新 openapi（仅当 ADR 批准偏离；每次变更记录 changelog）。
5. **不写 `apps/` 代码**（只读审查 + 契约/ADR 文档）。
