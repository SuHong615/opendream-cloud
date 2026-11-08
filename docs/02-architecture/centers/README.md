# 能力中心子设计（P2-C）· 索引与公共约定

- 版本：v0.2（P2 架构包 + **v3 MCP 网关设计**）
- Owner：capability-centers
- 上游基线：opencode v2.2.5（commit `4f271bc`，只读）
- 关联：`docs/00-program/PLAN.md` E4–E7、`OPENCODE-BASELINE.md` §2.3–2.4、`REVIEW-GATES.md` G2/G5、**`docs/02-architecture/ARCH-V3.md` §3/§4**
- 依赖：architect 的 `docs/02-architecture/{ARCHITECTURE,DATA-MODEL,SECURITY,openapi.yaml}`；platform-backend 的 `services/BACKEND.md`；infra-devops 的 `deploy/DEPLOYMENT.md`

## 1. 文档清单

| 文件 | 中心 | 覆盖需求 | 实现目录（后续） |
| --- | --- | --- | --- |
| [SKILL-CENTER.md](SKILL-CENTER.md) | Skill 中心 | R4.1–R4.6 | `services/skill-center/` |
| [EVAL-CENTER.md](EVAL-CENTER.md) | 评测中心 | R5.1–R5.6 | `services/eval-center/` |
| [APP-CENTER.md](APP-CENTER.md) | 应用中心 | R6.1–R6.8 | `services/app-center/` |
| [MCP-HUB.md](MCP-HUB.md) | MCP 中心（v2 设计） | R7.1–R7.6 | `services/mcp-hub/` |
| **[MCP-GATEWAY.md](MCP-GATEWAY.md)** | **MCP 全生命周期 + 网关（v3）** | ARCH-V3 §3/§4（A2） | `services/mcp-hub/` + `apps/control-plane/` |
| [ROUTES.md](ROUTES.md) | G5 冻结契约路由清单 | — | 四中心 |
| [G5-SKELETON.md](G5-SKELETON.md) | G5 服务骨架清单 | — | 四中心 |
| [CONTRACT-DIFF.md](CONTRACT-DIFF.md) | G5 契约对齐证据 | — | 四中心 |

> **v3 冲突裁决**：MCP 生命周期/网关/opencode 集成以 [MCP-GATEWAY.md](MCP-GATEWAY.md) 为准；`MCP-HUB.md` 作为 v2 历史设计保留（注册/凭证/代理/绑定基线）。其余三中心仍以各自文件为准。

四中心统一形态：**控制面服务（NestJS）+ PostgreSQL（RLS）+ OSS 制品 + K8s 数据面**；不 fork opencode，只通过 `opencode.json` 配置、SDK/HTTP API、workspace-agent 集成。

## 2. 公共约定（四中心一致，architect 可在 openapi 中引用）

### 2.1 身份与租户上下文

| 项 | 约定 |
| --- | --- |
| 调用方 | ①控制台：OIDC 会话 Cookie；②程序：`Authorization: Bearer ock_...`（用户 API Key）；③内部服务：mTLS + `X-OC-Service` |
| 租户键 | 每请求由认证中间件解析出 `tenant = {org_id, user_id, roles[]}`，写入请求上下文；**禁止从 body/query 读取 org_id 作为授权依据** |
| 数据隔离 | 所有业务表带 `org_id NOT NULL`；Postgres RLS `org_id = current_setting('oc.org_id')::uuid`；服务用独立 DB 角色，仅 `app` 角色受 RLS 约束 |
| 权限点 | 资源级：`owner/admin/member/viewer` + 资源 ACL；统一 `Permission.evaluate(resource, action, ctx)`；越权一律 403，不暴露资源存在性（404 与 403 统一为 `NOT_FOUND` 策略按资源定） |
| 幂等 | 所有 POST 支持 `Idempotency-Key`（24h 去重，键含 `org_id + route + key`） |
| 审计 | 所有写操作同步落 `audit_logs`（`actor, org, action, resource_type, resource_id, before/after 摘要, ip, ua, request_id`），异步不可丢（outbox 模式） |

### 2.2 API 风格

- Base：`https://api.<domain>/api/v1`，OpenAPI 3.1，tag 名与本文一致：`skill`、`eval`、`app`、`mcp`。
- 分页：cursor（`cursor` + `limit` ≤100），响应 `{items, next_cursor}`；列表默认 `created_at desc`。
- 时间：RFC3339 UTC；**ID：UUID v7（路径参数、FK、响应主键统一）；人读唯一键用 `slug`**（`(org_id, slug)` 唯一；应用 slug 全局唯一，用于域名）。按 slug 解析：`GET /api/v1/skills/by-slug/{org_slug}/{skill_slug}`、`GET /api/v1/apps/by-slug/{slug}`。
- 错误包（**两层模型，对齐 architect openapi**）：`{"error":{"code","reason","message","details","request_id"}}`。`code` = 通用分类（`validation_failed`/`forbidden`/`not_found`/`conflict`/`precondition_failed`/`quota_exceeded`/`rate_limited`/`service_unavailable`…）；`reason` = 领域原因（`gate_blocked`、`skill_permission_denied`、`app_build_failed`、`mcp_health_down`、`mcp_auth_required`、`share_link_expired` 等），wire 值一律 `lower_snake`。
- **门禁 vs 业务态**：发布动作被门禁拒绝 → `409` + `code=precondition_failed` + `reason=gate_blocked`（`details.gate_kind ∈ eval|scan|permission`、`details.failed_cases_top5`）；**评测运行本身**失败是资源态 → `200` + `eval_runs.status=failed`，不返回错误。
- 状态机：非法迁移返回 `409 STATE_INVALID`（附 `current_state`），不做"尽力而为"隐式转换。
- 长任务：`202` + 轮询对应资源详情端点（如 `/eval-runs/{runId}`、`/apps/{appId}/builds/{buildId}`），或 SSE `/api/v1/events`；不另立通用 `/tasks` 端点。
- 版本化：URI 大版本；新增字段向后兼容；删除/改语义走 `/api/v2` 或新端点，禁止原地破坏。

#### 2.2.1 路由权威与对齐（`openapi.yaml` 已 **FROZEN**：2026-11-04；G5 路由清单见 [ROUTES.md](ROUTES.md)，对齐证据见 [CONTRACT-DIFF.md](CONTRACT-DIFF.md)）

**已对齐（openapi 已存在，参数名统一）**：`/skills`、`/skills/by-slug/{orgSlug}/{skillSlug}`、`/skills/{skillId}/versions/{versionId}(/publish)`、`/skill-installations`；`/eval-datasets`、`/eval-datasets/{datasetId}`、`/eval-runs`、`/eval-runs/{runId}(/results|cancel)`；`/apps`、`/apps/{appId}(/deployments|rollback|logs|shares|access-ticket|suspend)`、`/apps/public/{slug}`；`/mcp-servers`、`/mcp-servers/{serverId}/health`、`/mcp-servers/{serverId}/health-check`、`/mcp-bindings`、`/mcp-bindings/{bindingId}`。
**路径前缀规则**：评测用 `/eval-datasets`、`/eval-runs`；MCP 用 `/mcp-servers`、`/mcp-bindings`；**不在 openapi 的一律 `/internal/...`（不进 SDK/公网）或标 `P2`（G5 前不得实现）**。

**已排期公开（architect 裁定，G5 契约冻结前补入 openapi）**：

| 中心 | 端点（参数名与 openapi 一致） |
| --- | --- |
| Skill | `POST /skills/{skillId}/versions/{versionId}/submit-review`、`/review`（approve/reject）、`/yank`、`/rollback`；`GET /skills/{skillId}/stats` |
| Eval | `GET /eval-datasets/{datasetId}/versions`；`GET /eval-runs/{runId}/report`（`?compare_to=<runId>`）；`POST/GET /eval-runs/{runId}/baselines` |
| App | `POST /apps/{appId}/preflight`；`GET /apps/{appId}/builds`；`POST /apps/{appId}/builds/{buildId}/retry`；`GET/POST /apps/{appId}/domains`；`POST /apps/{appId}/domains/{domainId}/verify`；`POST /apps/{appId}/shares/preview`；`POST /apps/{appId}/sleep`、`/wake`（别名 `suspend`/`start`） |
| MCP | `POST /mcp-servers/{serverId}/review`、`/publish`；`POST /mcp-bindings/{bindingId}/rotate-token`；`GET /api/v1/mcp-oauth/callback` |

**P2（契约未定义，G5 前不实现）**：Skill `GET /skills/{skillId}/reviews`、`POST /skills/{skillId}/block`（admin）、`reports`（先复用 feedback）、`access-requests`；App `GET /apps/{appId}/certificates`（随 domains 返回 `cert_ref`）、`GET /apps/{appId}/metrics`（MVP 用监控外链 + `/logs`）、`/apps/by-slug/{slug}`（由 `/apps/public/{slug}` 覆盖）；MCP `/mcp-servers/{serverId}/versions`、`/deprecate`、`/block`（→ `/internal/mcp/*` 或 P2）。

**内部端点（`/internal/...`，不进 SDK/公网）**：
`/internal/skills/{skillId}/source-token`、`/internal/skills/source-keys`；`/internal/eval/specs`、`/internal/eval/compare`、`/internal/eval/gates/skill`、`/internal/eval/runs/{runId}/reproduce`、`/internal/eval/webhooks/ci`；`/internal/mcp/servers/{serverId}/{test-connection|credentials|tools}`、`/internal/mcp/calls`、`/internal/mcp/proxy/{bindingId}`、`/internal/mcp/webhooks/health`；`/internal/apps/{appId}/authz`、`/internal/app-runtime/llm/chat`。

> **错误码状态码（architect 裁定）**：发布门禁 → **`409` + `code=precondition_failed` + `reason=gate_blocked` + `details.gate_kind`**；不使用 412。
> 命名规则：集合用复数短横线（`mcp-servers`、`eval-runs`），子资源 `/{resourceId}/{子资源}`；所有 `{id}` 必须带资源名（`skillId`/`appId`/`serverId`/`runId`/`datasetId`/`specId`/`versionId`/`installationId`/`bindingId`/`buildId`/`domainId`）。

### 2.3 制品与密钥

| 制品 | 存储 | 完整性 | 访问 |
| --- | --- | --- | --- |
| Skill 包、评测数据集、应用源代码快照、构建产物 | OSS 私有 Bucket，按 `org/<org_id>/<type>/...` 前缀 | `sha256` 记录在 DB；关键制品加签 | 控制面签发 ≤15min 预签名 URL；日志/前端不出现长期凭证 |
| 镜像 | ACR（企业版），按环境分命名空间 | digest 固定 + Trivy + SBOM + cosign | 集群内 imagePullSecret；禁止 `:latest` |
| 凭证（MCP/应用环境变量/模型 BYOK） | KMS 信封加密，密文入库 | `key_version` 记录 | 仅注入时解密，内存生命周期最短；禁止回显接口 |
| 分发 Token（Skill 源、应用访问票据） | 派生 HMAC，不落明文 | `kid` + 版本 | 可吊销、可轮换；日志脱敏 |

### 2.4 四中心与 opencode 的唯一集成面

| 集成点 | 配置键（`packages/schema/src/config.ts`） | 生效方式 |
| --- | --- | --- |
| 技能 | `skills: string[]`（目录或 URL） | workspace-agent 写全局 `opencode.json` → 上游文件监听热加载 |
| MCP | `mcp.servers: Record<name, Local|Remote>`、`mcp.timeout` | 同上；也可用上游 `POST /api/mcp` 运行时增删 |
| 策略 | `policies: [{action, resource, effect}]`，动作含 `skill.use` / `mcp.use` / `tool.use` | 托管策略（managed policy）强制，优先级最高 |
| 模型 | `model` + `providers`（指向 LiteLLM） | 控制面下发，评测/应用复用同一网关 |

> 关键原则：**平台只增加"声明 + 分发 + 授权 + 审计"四层，执行仍由 opencode 原生能力完成**；四个中心都不修改上游代码。技能/MCP 的"强制力"必须来自 `policies` + K8s 沙箱/网络策略，而不是仅靠声明。

### 2.5 安全边界统一口径（四中心逐项落实）

| 威胁 | 统一对策 |
| --- | --- |
| 任意代码执行 | 评测：gVisor + 禁网 + 只读根 + 非 root + drop ALL caps；构建：rootless BuildKit 独立 Pod、无 docker.sock；stdio MCP：仅平台白名单镜像/沙箱内运行 |
| SSRF | 控制面出站统一走 egress-proxy + 域名白名单；禁私网/链路本地（`169.254.169.254`、`10/8`、`127/8`、`::1`、metadata）；DNS 解析后二次校验（防 rebinding） |
| 凭证外泄 | KMS 信封加密；不下发明文；日志/事件脱敏；工具参数与模型输入做密钥模式扫描 |
| 分享越权 | 网关 fail-closed 校验（无 ACL 即拒绝）；IDOR 自动化测试；分享 ID 128-bit 随机；短期票据绑 user+session+resource |
| 租户越权 | 请求级 tenant context + RLS + 每资源归属校验 + 跨租户 ID 访问审计告警 |
| 供应链 | 镜像/包签名 + 扫描 + SBOM + 固定 digest；Skill 发布强制过评测基线 |

## 3. MVP 与迭代总览（与 G5 对齐）

| 里程碑 | Skill | 评测 | 应用 | MCP |
| --- | --- | --- | --- | --- |
| M5.1 主流程 | 上传/发布/URL 分发/安装/回滚 | 规则评分器 + Job 跑批 + 报告 | 模板构建 + 1C2G 部署 + 基础分享 | 远程 HTTP 注册 + 代理 + 绑定注入 |
| M5.2 治理 | 扫描 + 评测准入 + 审核流 | gVisor + 禁网/白名单 + 可复现指纹 | SSO 网关 + ACL 细化 + 域名/证书 | 审批目录 + 凭证托管 + 审计/限流 |
| M5.3 运营 | 评分/统计/推荐 | A/B + LLM judge + CI 回写 | 回滚/日志/指标/休眠/自定义域名 | stdio 沙箱托管 + 健康巡检 + 失效降级 |

M5.1 是 G5 的最小可验收闭环；M5.2 的安全项（gVisor、SSO、凭证托管）**不得后置到 G6**，因为它们是 G2 安全清单的组成部分。

## 4. 与其它分册的对齐点（开放项，已发消息给 architect）

| # | 待对齐 | 影响 | 默认假设（未回复即按此执行） |
| --- | --- | --- | --- |
| A1 | openapi tag/路径命名 | SDK 生成 | tag `skill/eval/app/mcp`，路径见各文档 §API |
| A2 | 公共表（users/orgs/workspaces/audit_logs）由 architect 定义 | 外键与 RLS | 仅引用，不重复建表；本册 DDL 为"增量表" |
| A3 | Skill 分发是否走统一网关 | Token 校验位置 | 独立子域 `hub.<domain>`，控制面签发 token，网关只做 TLS/限流 |
| A4 | 评测 Job 的命名空间/节点池归属 | 资源隔离 | `eval-sandbox` 命名空间 + gVisor taint 节点池（infra 提供） |
| A5 | 应用默认域名与证书签发方式 | R6.6 | `*.apps.<domain>` 泛域名证书；自定义域名 cert-manager ACME |
| A6 | 审计日志表结构与保留期 | 合规 | 180 天在线 + OSS 归档；`mcp_call_logs` 90 天 |
