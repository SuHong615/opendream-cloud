# ADR-V3-05：MCP 生命周期与契约升级（v2 FROZEN 不动，v3 走 openapi 1.1.0）

- 状态：**Accepted（建议；architect 主笔，capability-centers 提供设计输入）**
- 日期：2026-11-08
- 决策者：architect
- 关联：`ARCH-V3.md §3/§4`、`centers/MCP-GATEWAY.md`（v0.2）、`adr/ADR-V3-01-mcp-gateway.md`、`openapi.yaml`（v2 FROZEN）

## 背景

v3 把 MCP 作为能力总线，需要"服务注册 → 审核 → 发布版本 → 可见性/渠道 → 绑定 → 调用 → 弃用/下线"的全生命周期，并配套：
- 版本对象（不可变、工具清单快照、签名）；
- 渠道（canary/stable）；
- 审批记录；
- 工具级策略（allow/deny/限额/参数 schema）；
- 数据面 endpoint `/v1/{orgSlug}/{serverSlug}`；
- 绑定与令牌（binding token、轮换）；
- 审计/计量。

但 v2 的 `openapi.yaml` 已 **FROZEN**（96 paths / 131 ops），v2 里只有 `mcp_servers`/`mcp_bindings` 的简单 CRUD 与健康检查。直接改 v2 会破坏已冻结契约与 SDK。

## 决策

**v3 的 MCP 能力作为 `openapi.yaml` 的 `1.1.0` 增量发布；v2 FROZEN 契约不改、不删、不重命名。**

### 1) 数据模型增量（DATA-MODEL 增补，均为 `org_id` + RLS）

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `mcp_server_versions` | `server_id, semver, transport, endpoint/command, tool_manifest_hash, tool_count, signature, signing_key_id, status(draft/published/yanked), published_at` | **不可变**；工具清单快照（hash 签名） |
| `mcp_channels` | `server_id, channel(canary/stable), version_id, weight` | 渠道→版本指针；灰度切流 |
| `mcp_approvals` | `server_id, version_id, reviewer_id, decision(approve/reject), risk_score, comment` | 审核留痕（与 `human_tasks` 可关联） |
| `mcp_tool_policies` | `server_id, tool_name, effect(allow/deny), subject_type/subject_id, limits(rpm/tpm/max_bytes), schema_hash, priority` | 工具级 PEP 规则（编译后下发网关） |
| `mcp_bindings`（扩展） | `binding_token_hash, token_version, allowed_tools(version snapshot), expires_at, last_rotated_at` | 绑定令牌（**不存明文**） |
| `mcp_call_logs`（v2 已有） | `binding_id, server_version_id, tool, status, latency_ms, request_hash, response_bytes, error` | 审计/计量 |

### 2) API 增量（`1.1.0`，控制面）

```
POST   /api/v1/mcp-servers/{serverId}/versions           # 创建版本（draft）
POST   /api/v1/mcp-servers/{serverId}/versions/{versionId}/submit-review
POST   /api/v1/mcp-servers/{serverId}/versions/{versionId}/review   # approve/reject
POST   /api/v1/mcp-servers/{serverId}/versions/{versionId}/publish
POST   /api/v1/mcp-servers/{serverId}/versions/{versionId}/yank
PUT    /api/v1/mcp-servers/{serverId}/channels/{channel}  # 渠道→版本
GET    /api/v1/mcp-servers/{serverId}/versions
GET    /api/v1/mcp-servers/{serverId}/tools               # 已发布版本工具清单（含风险标注）
GET    /api/v1/mcp-servers/{serverId}/health              # 历史 + 当前
PUT    /api/v1/mcp-servers/{serverId}/tool-policies       # 工具级策略（批量）
POST   /api/v1/mcp-bindings/{bindingId}/rotate-token
GET    /api/v1/mcp-call-logs                              # 审计检索（from/to 必填，≤90 天）
```

- 数据面 **不属于**资源 API：`POST /v1/{orgSlug}/{serverSlug}`（streamable HTTP）、`GET /v1/{orgSlug}/{serverSlug}/sse`；契约由 `centers/MCP-GATEWAY.md` 定义 + 网关 OpenAPI 片段。
- `reason` 扩展（`1.1.0`）：`tenant_mismatch`、`tool_not_allowed`、`version_conflict`、`result_too_large`、`upstream_timeout`、`upstream_error`、`circuit_open`、`server_not_found`、`tool_not_found`；HTTP↔JSON-RPC 映射见 `ARCH-V3.md §23.2`。

### 3) 票据（MCP ticket）

**Binding ticket = EdDSA/Ed25519 JWT + JWKS（lead 2026-11-08 最终裁决；HMAC 仅本地 dev 兼容同一 claims）**

- claims：`iss=control-plane`、`aud=mcp:org:<orgSlug>`、`sub`、`org`、`ws`、`app`、`binding_id`、`server_id`、`server_version`、`scope[]`、`scope_hash`（=sha256(canonical(scope+server_version))）、`jti`、`iat`、`exp`；
- **TTL 300s**、**非一次性**（同一 binding 可复用至过期，agent 提前刷新）；
- 吊销：binding 状态 + `jti` denylist；生产 ≤5s、本地 ≤30s 生效；
- 网关校验：JWKS 验签、`iss/aud`、`org/ws` 匹配、binding 状态、`server_version`=当前 stable、工具 ∈ `scope` ∧ 发布清单；
- 三态：未认证 401 `unauthenticated`、越权/跨租户 403 `tenant_mismatch|tool_not_allowed`、不存在 404 `server_not_found|tool_not_found`；
- **B 端嵌入（数字人/应用）用 app/ws 各自 ticket，不共用**；续签接口 `POST /api/v1/mcp-bindings/{bindingId}/rotate-token`。

### 4) 契约升级路径（必须按序）

1. 本 ADR 签署 → 2. `openapi.yaml` 升 `1.1.0`（只加不改）→ 3. `README §5.1` changelog → 4. 通知 qa/platform-backend/capability-centers → 5. 契约测试：v2 端点回归 + v3 新增端点校验 → 6. SDK 重新生成。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. 直接改 v2 FROZEN openapi** | 省事；但破坏已生成 SDK/客户端，违背冻结承诺，且 v2 已进入 G4 实现 | 否决 |
| **B. v3 全部新开 `openapi-v3.yaml`** | 完全隔离；但两套契约长期漂移、SDK 双份、网关难以统一治理 | 否决（除非 v3 完全重写，当前是增量） |
| **C. `1.1.0` 增量（采纳）** | 只加不改；v2 客户端不受影响；v3 能力集中同一契约；可回滚 | **采纳** |
| **D. 用 GraphQL/内部 RPC 替代 REST** | 与现有 SDK/网关体系不符 | 否决 |

## 后果

**正面**
- v2 冻结承诺不破；v3 增量可独立评审/回滚。
- 版本对象/渠道/审批/工具策略/审计形成完整生命周期，支撑企业治理与灰度。
- 数据面 endpoint 与 HTTP/JSON-RPC 错误映射明确，QA 可冻结测试断言。

**负面 / 代价**
- 契约 1.1.0 需要一次集中评审（qa/backend/capability）与 SDK 重生成。
- 版本对象增加存储与管理复杂度（channel/version 指针一致性需事务/校准任务）。
- `mcp_tool_policies` 编译到网关的发布链路需要"双缓冲热切换"（见 ADR-V3-01），否则策略变更抖动。
- v2 的 `mcp_servers` 表与 v3 版本表并存，迁移期需回填（默认 v2 server → 一个 `stable` 版本）。

## 实现要点

- 版本不可变：`mcp_server_versions` 只 INSERT；`tool_manifest_hash` 由规范化工具清单（排序 + JSON canonical）计算；签名用 registry 的 ed25519 私钥（KMS）。
- 渠道切换：`mcp_channels` 指针更新在一个事务内完成 + 发 `mcp.channel.changed` 事件；网关订阅后热切换，旧快照保留 60s。
- 绑定令牌：随机 256-bit，DB 存 `sha256(token)`；轮换双活 24h；调用时校验 `binding_id + token_hash + version` 一致。
- 下线：先 `deprecated`（禁止新绑定，通知使用方），再 `offline`（拒绝新调用、终止流式会话）；进行中调用优雅结束（≤30s）。
- 计量：`mcp_call_logs` 按月分区；`request_hash` 不含敏感参数原文；`response_bytes` 用于成本与 413 判定。
- 兼容：v2 `mcp_servers` 的 `transport/auth_type/health` 字段保留（v3 从 stable 版本派生展示）。

## 验证

- 契约：`1.1.0` 只加不改（diff 检查：v2 端点签名不变）；v2 SDK 回归通过。
- 生命周期：draft→review→published→deprecated→offline 全链路 + 回滚（channel 指针）≤1min。
- 灰度：canary 10% → 观察 → stable；异常自动回切（错误率 >5% 持续 5min）。
- 票据：401/403/404 三态、过期/跨租户/吊销 ≤5s；`scope_hash` 变更后旧 ticket 失效。
- 审计：每次 tools/call 有 `mcp_call_logs` + Trace + 计量；抽样对账。
- 停旧：v2 端点与 v3 版本共存期行为一致（同一 server 的 stable 版本）。
