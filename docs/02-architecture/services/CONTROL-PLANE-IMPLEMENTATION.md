# control-plane 实现骨架清单（G4 开工前准备）

- 版本：**v1.1（已实现，2026-11-04；G4 MVP）**
- Owner：`platform-backend`
- 依据：[BACKEND.md](BACKEND.md) v0.3、`docs/00-program/G4-IMPLEMENTATION-PLAN.md` v0.1、task-12、`../openapi.yaml`、`../DATA-MODEL.md`、`../adr/ADR-016-fastify-over-nestjs.md`
- 状态：**已实现并自测**：`bun test` 43 pass / 0 fail；`tsc --noEmit` 通过；`bun scripts/smoke-api.ts` 17/17；真实服务 `:4000`（PID 20608，DB `apps/control-plane/.data/control-plane.sqlite`）
- 技术基线（G4 MVP）：**Bun 1.4.x + Fastify 5 + Zod + Drizzle + bun:sqlite**（ADR-016 Accepted；生产 PG16 + RLS 为 G5 硬门槛）
- 写作用域约束：只写 `apps/control-plane/`（+ 经协调的 `packages/shared/` 类型增补）；**不写根 `package.json`**（infra 建）；依赖声明只在 `apps/control-plane/package.json`

> **冻结基线（architect 2026-11-04 确认）**
> - `openapi.yaml`：**74 paths / 106 ops / 89 schemas**，SHA256 `A0DE7C10B50E1F2D07A70FA438A88E295699ADB908C33CAED90CE0C8DDDFB128`
> - `DATA-MODEL.md`：**36 张表**（23+4+9），SHA256 `68842F4F6C8E12A205A15DD6202E8F85724BFA036D43D552C257BFF836C868CC`
> - `ADR-016`（Fastify over NestJS）：SHA256 `A3BCD73EBD752FA3404F0936AAEC66F099EEE70A9E600CF9A8D55A61E6394543`
> - 已修：`quota_limits`/`app_shares` 唯一索引（BK-04）、access-ticket 去幂等（BK-08）、404 覆盖（BK-08）、`ws_launch_timeout`/`snapshot` 错误口径（BK-02）、ADR-009 L1/L2 凭证边界（BK-05）、namespace `ws-<orgId>`（BK-03）、9 张中心表（G2-08）。
> - **变更控制**：上述文件任何变更需 qa 通知并更新本页哈希；实现期间不得按旧契约写代码。

> **重要降级声明（MVP）**：SQLite 无 RLS/分区/多实例并发，**不能**用于 1000 工作区生产。MVP 以"repository 层强制 `org_id` 谓词 + 单实例"保证租户隔离，并在 G4 证据中标注 `DEGRADED: multi-tenant RLS not exercised`；ADR-016 附加条件：单副本、工作区 ≤200/用户 ≤2,000、G5 必须完成 PG+RLS 全量迁移与越权测试，否则 G6 不准出。

---

## 0. 开工前置（硬门禁）

| # | 条件 | 状态 | 不满足的后果 |
| --- | --- | --- | --- |
| P1 | G2/G3 签署（已 PASS-WITH-ACTIONS）+ A-G2-1…8 关闭 | BK 已落盘，qa 复核中 | 接口/DDL 返工 |
| P2 | BK-01/02 冷却期 5–1440min、snapshot 错误口径 | ✅ 已修（DEPLOYMENT:23/650/699/793；ARCH:394） | — |
| P3 | BK-03 namespace 每 org `ws-<orgId>` | ✅ 已修（ARCH:290/340；DEPLOYMENT:202/209） | — |
| P4 | BK-04 `quota_limits`/`app_shares` 唯一索引 DDL | ✅ 已修（DATA-MODEL:426/525） | — |
| P5 | BK-05 ADR-009 L2 不写凭证 | ✅ 已修（ADR-009:18-19） | — |
| P6 | BK-06 MCP/Eval/Skill/App "公开 vs 内部"清单 | 进行中（capability 出清单，architect 补 openapi） | controller 数量/契约 |
| P7 | ADR-016（Fastify 而非 NestJS） | ✅ Accepted（architect 2026-11-04） | — |
| P8 | 真实 IdP/LiteLLM/K8s 不在 MVP | 明确 | dev-login/mock 即可 |
| P9 | 根 `package.json`/workspace 由 infra 先建 | 依赖 task-11 | 无法 `bun install` |

**MVP 明确不做**（G4-IMPLEMENTATION-PLAN §6）：真实 OIDC、真实 LiteLLM、真实 K8s 调度、Skill/评测/应用中心业务、Redis 强依赖（MVP 用内存/SQLite 适配）。

---

## 1. 技术选型与依赖版本（`apps/control-plane/package.json`）

> 版本策略：**主版本锁定 + lockfile 锁精确版**；下表为计划版本，安装时以 `bun add` 实际解析为准并回写本表。所有依赖需在 PR 说明用途（ROLES 质量红线）。

| 依赖 | 计划版本 | 用途 | 备注 |
| --- | --- | --- | --- |
| `fastify` | `^5.2` | HTTP 框架 | ADR-016 Accepted；替代 NestJS |
| `@fastify/cookie` | `^11` | `oc_sess`/`oc_csrf` | HttpOnly/SameSite |
| `@fastify/cors` | `^10` | console origin 白名单 | 生产收紧 |
| `@fastify/helmet` | `^13` | 安全头 | CSP 由 console 定 |
| `@fastify/rate-limit` | `^10` | 登录/Key 限流 | MVP 内存 store |
| `zod` | `^3.24` | 请求/响应/环境校验 | ADR-016 允许 TypeBox 或 zod；按 task-12/lead 选 zod（TypeBox 作 G5 备选） |
| `drizzle-orm` | `^0.44` | ORM（sqlite-core） | 生产切 pg-core；`id` 应用生成 uuid（不用 AUTOINCREMENT） |
| `drizzle-kit` | `^0.31` | 迁移生成（devDependency） | DDL 手写 SQL 更可控 |
| `bun:sqlite` | Bun 内置（1.4.x） | MVP 本地 DB | 无 npm 依赖 |
| `@kubernetes/client-node` | `^1.3` | K8s Provisioner | 只要求 `tsc` 通过；MVP 不连集群 |
| `jose` | `^6` | HMAC ticket（MVP）/ed25519（生产） | WebCrypto |
| `@fastify/jwt`（可选） | `^9` | 若用 JWT 简化 ticket | 也可手写 jose |
| `pino` | `^9` | 结构化日志（Fastify 内置） | 脱敏 redact |
| `prom-client`（可选） | `^15` | `/metrics` | G4 可先 `/healthz` |
| `typescript` | `^5.7` | 类型检查（dev） | Bun 运行 TS，`tsc --noEmit` 做 gate |
| `bun-types` | 与 Bun 1.4 匹配 | 类型 | devDependency |
| `@types/node` | `^22` | 类型 | devDependency |
| `vitest`（可选） | — | **不用**；统一 `bun:test` | task-12 要求 `bun test` |
| `ioredis`（G5） | `^5` | 会话/幂等/限流生产版 | MVP 不装，留适配接口 |

**MVP 明确不装**：NestJS、TypeORM、Prisma、Redis client、OpenTelemetry SDK（G5 再补）、Next.js（console 属 web-console）。

**`apps/control-plane/package.json` 草案（字段级，不含实现代码）**

```jsonc
{
  "name": "@opendream-cloud/control-plane",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/server.ts",
    "start": "bun src/server.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "db:migrate": "bun src/db/migrate.ts",
    "db:seed": "bun src/db/seed.ts"
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cookie": "^11.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/helmet": "^13.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "zod": "^3.24.0",
    "drizzle-orm": "^0.44.0",
    "@kubernetes/client-node": "^1.3.0",
    "jose": "^6.0.0",
    "pino": "^9.0.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "typescript": "^5.7.0",
    "bun-types": "latest",
    "@types/node": "^22.0.0"
  }
}
```

> 版本若与 infra 的 Bun/workspace 冲突，以根 lockfile 为准；**不修改根 `package.json`**，仅在本包声明。

---

## 2. 目录骨架（Fastify 版；文件只列名，不含代码）

```
apps/control-plane/
├── package.json
├── tsconfig.json                 # extends 根 tsconfig.base.json（infra 提供）
├── src/
│   ├── server.ts                 # Fastify 装配：插件顺序、错误处理、listen :4000
│   ├── env.ts                    # zod 校验环境变量（fail-closed）
│   ├── app.ts                    # buildApp()（测试可注入）
│   ├── plugins/
│   │   ├── request-context.ts    # AsyncLocalStorage<Principal> + request-id
│   │   ├── errors.ts             # ErrorEnvelope（code+reason）映射
│   │   ├── auth.ts               # session cookie / api-key / dev-login guard
│   │   ├── tenant.ts             # principal → org 校验；repository 必须带 orgId
│   │   ├── rbac.ts               # can(principal, permission, resource)
│   │   ├── idempotency.ts        # MVP: SQLite 表；G5: Redis
│   │   ├── audit.ts              # 写操作审计钩子
│   │   ├── rate-limit.ts
│   │   └── security.ts           # helmet/cors/bodyLimit
│   ├── db/
│   │   ├── client.ts             # bun:sqlite + PRAGMA（WAL/FK/busy_timeout）
│   │   ├── schema.ts             # drizzle sqlite-core 表定义（MVP 15 张）
│   │   ├── migrate.ts            # 执行 db/migrations/*.sql（schema_migrations 记录）
│   │   └── seed.ts               # dev 数据：org/user/admin/model/policy
│   ├── modules/
│   │   ├── auth/                 # dev-login, session, me, logout
│   │   ├── api-keys/             # ock_ 创建/列表/吊销 + HMAC 校验
│   │   ├── models/               # providers/models/policies + resolver + mock LiteLLM
│   │   ├── workspaces/           # 状态机 + service + routes + events
│   │   ├── audit/                # audit writer/query
│   │   ├── usage/                # usage_records 写入/查询（MVP 估算）
│   │   └── health/               # /healthz /readyz
│   ├── provisioner/
│   │   ├── types.ts              # Provisioner 接口（ensure/start/stop/destroy/status）
│   │   ├── mock.ts               # 内存/文件实现（状态推进 + 定时器）
│   │   └── k8s.ts                # @kubernetes/client-node 实现（编译通过即可，MVP 不启用）
│   └── lib/
│       ├── ids.ts                # uuid/ulid
│       ├── crypto.ts             # HMAC/HKDF/constant-time/pepper
│       ├── ticket.ts             # HMAC JWT（MVP）→ ed25519（生产）
│       └── redact.ts             # 日志脱敏
├── db/
│   └── migrations/
│       ├── 0001_init.sql
│       ├── 0002_indexes.sql
│       └── 0003_seed_meta.sql
└── test/
    ├── helpers/app.ts            # buildApp + 临时 DB
    ├── auth.test.ts
    ├── api-keys.test.ts
    ├── models.test.ts
    ├── workspaces.test.ts
    ├── ticket.test.ts
    ├── audit-usage.test.ts
    └── contract.test.ts          # 路由 vs openapi MVP 子集
```

**插件装配顺序（固定，`server.ts`）**：
`requestContext → errors → security(helmet/cors/bodyLimit) → rateLimit → cookie → auth(session|apiKey|dev) → tenant → rbac → idempotency → routes → audit(钩子) → notFound`。
任何顺序调整需在 PR 说明；`audit` 必须以 `onResponse` 钩子捕获结果，写操作在 handler 内落审计（失败回滚）。

---

## 3. 最终路由清单（MVP 子集；与 `openapi.yaml` 同名同参）

> 状态列：`MVP`=G4 必做；`G5`=占位/后续。鉴权：`P`=公开（仅 dev-login/health）、`S`=会话、`K`=API Key、`I`=内部。
> 所有 `S`/`K` 路由：401 未认证、403 同租户越权、404 跨租户/不存在；写操作 100% 审计。

### 3.1 认证（MVP）

| 方法 | 路径 | 鉴权 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/dev-login` | P | MVP | body `{email}`；仅 `NODE_ENV!=production` 或 `ALLOW_DEV_LOGIN=1`；建 `oc_sess`（HMAC，8h）+ `oc_csrf`；JIT 建 user/personal org/admin 角色 |
| GET | `/api/v1/me` | S | MVP | user/orgs/active_org/role/permissions |
| POST | `/api/v1/auth/logout` | S | MVP | 清 cookie + 吊销 ticket jti（MVP 内存/SQLite） |
| GET | `/api/v1/auth/login` | P | G5 | 真实 OIDC（302 IdP + PKCE） |
| GET | `/api/v1/auth/callback` | P | G5 | OIDC 回调 |
| GET | `/.well-known/workspace-jwks.json` | P | G5 | ed25519 公钥（MVP 可返回 HMAC 说明/空 keys） |

### 3.2 API Key（MVP）

| 方法 | 路径 | 鉴权 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/api-keys` | S | MVP | 仅元数据（prefix/last_used/expires） |
| POST | `/api/v1/api-keys` | S | MVP | 明文仅一次；HMAC-SHA256+pepper；scope ⊆ 角色 |
| DELETE | `/api/v1/api-keys/{keyId}` | S | MVP | 吊销（MVP 即时生效；生产 ≤5s 缓存） |
| POST | `/api/v1/api-keys/{keyId}` | S | G5 | 轮换（新旧重叠 24h） |
| POST | `/internal/authz/introspect` | I | G5 | 网关内部；MVP 不需要 |

### 3.3 模型中心（MVP）

| 方法 | 路径 | 鉴权 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/model-providers` | S | MVP | 不返回凭证 |
| POST | `/api/v1/model-providers` | S(admin) | MVP | `name/kind/base_url/models[]`；mock LiteLLM 只落库 |
| PATCH/DELETE | `/api/v1/model-providers/{providerId}` | S(admin) | G5 | 更新/删除（MVP 可先不实现） |
| GET | `/api/v1/models` | S/K | MVP | 按策略过滤（未授权不可见）；解析器内部调用 |
| GET | `/api/v1/models/{modelId}` | S/K | MVP | 详情（未授权 404/403 按 openapi） |
| GET/POST | `/api/v1/model-policies` | S | MVP | 列表；创建（admin） |
| GET/PUT/DELETE | `/api/v1/model-policies/{policyId}` | S | MVP（DELETE G5） | 详情/全量替换（乐观锁）/删除 |
| POST | `/api/v1/model-policies/{policyId}/preview` | S(admin) | MVP | 影响预览（替代早期 `/resolved`；**openapi 无 `/model-policies/resolved`，禁止实现**） |

### 3.4 工作区（MVP）

| 方法 | 路径 | 鉴权 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/workspaces/me/ensure` | S | MVP | 幂等：无则建/stopped 则 start/ready 直接返回；`Idempotency-Key` 可选 |
| GET | `/api/v1/workspaces` | S | MVP | 仅自己 |
| GET | `/api/v1/workspaces/{workspaceId}` | S | MVP | 含 state/url/error |
| POST | `/api/v1/workspaces/{workspaceId}/start` | S | MVP | stopped→starting；非法 409 |
| POST | `/api/v1/workspaces/{workspaceId}/stop` | S | MVP | ready/idle→stopping；PVC 保留 |
| POST | `/api/v1/workspaces/{workspaceId}/destroy` | S | MVP | body `confirm_name/acknowledge_data_loss/keep_snapshot`；202 + 5min 冷却 |
| POST | `/api/v1/workspaces/{workspaceId}/destroy/cancel` | S | MVP | 冷却期内取消 |
| POST | `/api/v1/workspaces/{workspaceId}/access-ticket` | S | MVP | HMAC JWT 60s、jti 一次性；返回 `url/ticket/expires_in` |
| GET | `/api/v1/workspaces/{workspaceId}/events` | S | G5 | SSE（MVP 可选：轮询详情） |
| GET | `/api/v1/workspaces/{workspaceId}/snapshots` | S | G5 | 快照列表 |

> MVP 状态机：`provisioning → starting → ready → idle ⇄ ready → stopping → stopped → deleting → deleted` + `error`；Mock Provisioner 用定时器推进 `provisioning→starting→ready`（1–3s）；**退出不销毁**（无任何空闲销毁定时器）；`destroy` 只置 `destroy_scheduled_at`，冷却后 `deleting→deleted`（MVP 冷却可通过 env 缩短测试）。

### 3.5 审计/用量/健康（MVP）

| 方法 | 路径 | 鉴权 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/audit-logs` | S | MVP | 本 org；cursor 分页；写操作必须已落审计 |
| GET | `/api/v1/usage` | S/K | MVP | 本 org/自己；MVP 按 `usage_records` 估算（no LiteLLM） |
| GET | `/api/v1/health` | P | MVP | **契约健康端点**（openapi `getHealth`；200/503） |
| GET | `/healthz` | P | MVP | 运维 liveness（**非 openapi 公开契约**，仅本机/G4 验收用） |
| GET | `/readyz` | P | MVP | DB 可用 + migrations 已执行（运维） |
| GET | `/metrics` | I | G5 | Prometheus |

**路由验收**：`test/contract.test.ts` 读取 openapi 的 74 paths，断言 **MVP 路由集合 ⊆ openapi**（method+path 一致），且不存在"实现存在但 openapi 没有"的公开路由；未实现路由列入 `KNOWN_GAPS`。`/healthz`/`/readyz` 为明确列出的运维例外（不进 SDK）。

---

## 4. 表清单（总 36；MVP 只建 15 + 2 可延后）

> 权威：`DATA-MODEL.md` §3（36 张，SHA256 见页首）。**MVP 只建控制面闭环所需 15 张**（下表），`mcp_call_logs`/`skill_source_tokens` 按 architect 指示可延后到 M5（MVP 不接 MCP/Skill 时无需建）；其余 8 张中心表由各中心自建，控制面只做 FK 引用/只读。
> SQLite 约定：`id TEXT PRIMARY KEY`（uuid，应用生成）、时间 `INTEGER`（epoch ms）、JSON `TEXT`、布尔 `INTEGER`；`PRAGMA foreign_keys=ON; journal_mode=WAL; busy_timeout=5000;`。**所有业务表含 `org_id`**（users 例外，通过 memberships）；repository 必须强制 `WHERE org_id = ?`，测试用"删除 org_id 条件即失败"的负向用例保护。

| # | 表 | 关键列（MVP） | 租户键 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | `users` | id, email UNIQUE, display_name, status, created_at | 全局 | dev-login JIT |
| 2 | `orgs` | id, slug UNIQUE, name, kind, status | 自身 | personal org 自动建 |
| 3 | `memberships` | id, org_id, user_id, role, status, UNIQUE(org_id,user_id) | org_id | RBAC 真相 |
| 4 | `api_keys` | id, org_id, user_id, name, prefix UNIQUE, key_hash, key_version, scopes(JSON), expires_at, revoked_at, last_used_at | org_id | HMAC |
| 5 | `workspaces` | id, org_id, owner_user_id, display_name, state, state_reason, host UNIQUE, image, image_digest, config_revision, model_default, last_activity_at, destroy_requested_at, destroy_scheduled_at, deleted_at, version | org_id | 唯一 `(org_id,owner_user_id) WHERE deleted_at IS NULL` |
| 6 | `workspace_events` | id, org_id, workspace_id, seq INTEGER, type, from_state, to_state, reason, message, metadata(JSON), created_at | org_id | SSE 回放 |
| 7 | `model_providers` | id, org_id(NULL=平台), name, kind, base_url, enabled, health, settings(JSON) | org_id/NULL | 不存明文凭证 |
| 8 | `models` | id, org_id(NULL), provider_id, provider_model_id, display_name, context_window, max_output, capabilities(JSON), input_price, output_price, enabled, litellm_alias UNIQUE | org_id/NULL | 策略/展示 |
| 9 | `model_policies` | id, org_id, name, default_model_id, is_default, enforcement, version | org_id | 唯一默认 |
| 10 | `model_policy_rules` | id, org_id, policy_id, effect, subject_type, subject_id, model_id, provider_id, priority | org_id | deny 优先 |
| 11 | `litellm_keys` | id, org_id, workspace_id, key_fingerprint UNIQUE, key_alias, budget_usd, rpm_limit, models(JSON), status, created_at | org_id | MVP mock Key 也落库 |
| 12 | `audit_logs` | id, org_id, actor_type, actor_id, action, resource_type, resource_id, outcome, detail(JSON), request_id, created_at | org_id | append-only（应用层禁 UPDATE/DELETE） |
| 13 | `usage_records` | id, org_id, user_id, workspace_id, model_id, request_id UNIQUE, tokens_*, cost_usd, status, occurred_at | org_id | MVP 由 mock 生成 |
| 14 | `idempotency_keys` | key PK, org_id, user_id, request_hash, status_code, response(JSON), expires_at | org_id | MVP SQLite 版（生产 Redis） |
| 15 | `schema_migrations` | version PK, applied_at | — | 迁移记录 |

**MVP 可延后/不建（architect 2026-11-04 确认）**：
- 控制面归属但 MVP 不接中心时可延后到 M5：`mcp_call_logs`（按月分区，180d）、`skill_source_tokens`（中心写、控制面只读校验）。
- 中心自建、控制面只 FK/只读：`eval_dataset_versions`、`eval_specs`、`eval_baselines`、`eval_ci_links`、`app_builds`、`app_domains`、`app_secrets`。
- 其余 G5+：`sessions`（Redis）、`workspace_snapshots`、`workspace_config_revisions`、`audit_chain_heads`、`outbox`、`quota_limits`、`teams/team_members`、`skill*/eval*/app*/mcp*` 业务表。
- **PG DDL 特殊约束（冻结）**：`quota_limits`/`app_shares` 的表达式唯一索引用 `CREATE UNIQUE INDEX`（哨兵 uuid `00000000-0000-0000-0000-000000000000`），见 DATA-MODEL:426/525；SQLite MVP 不建这两表。

**迁移顺序**：`0001_init.sql`（表 1–5 + 10）→ `0002_indexes.sql`（唯一索引/查询索引，含 `(org_id, ...)` 前缀）→ `0003_seed_meta.sql`（schema_migrations 之外无 seed；seed 由 `db/seed.ts` 幂等写 dev 数据）。

---

## 5. 测试用例清单（`bun test`，目标 ≥30 条）

| ID | 文件 | 场景 | 断言 |
| --- | --- | --- | --- |
| AUTH-01 | auth.test.ts | 未登录访问 `/api/v1/me` | 401 `unauthorized` |
| AUTH-02 | auth.test.ts | dev-login 新邮箱 | 200 + Set-Cookie `oc_sess`（HttpOnly/SameSite=Lax）+ `oc_csrf`；user/org/membership 创建 |
| AUTH-03 | auth.test.ts | dev-login 已有邮箱 | 复用 user，不重复建 org |
| AUTH-04 | auth.test.ts | 生产环境禁用 dev-login | 403/404（由 `ALLOW_DEV_LOGIN` 控制） |
| AUTH-05 | auth.test.ts | 登出后再访问 | 401；cookie 清除 |
| AUTH-06 | auth.test.ts | CSRF：写操作缺 `X-CSRF-Token` | 403 `forbidden` |
| KEY-01 | api-keys.test.ts | 创建 Key | 返回 `ock_...` 明文一次；DB `key_hash` ≠ 明文；`prefix` 唯一 |
| KEY-02 | api-keys.test.ts | 用 Key 访问 `/api/v1/workspaces` | 200；`org_id` 来自 Key 行 |
| KEY-03 | api-keys.test.ts | 吊销后使用 | 401（MVP 即时；生产 ≤5s） |
| KEY-04 | api-keys.test.ts | 伪造/篡改 Key | 401，不区分不存在/错误 |
| KEY-05 | api-keys.test.ts | scope 不足 | 403 `forbidden` |
| KEY-06 | api-keys.test.ts | 过期 Key | 401 |
| MODEL-01 | models.test.ts | GET `/models`（admin 全量） | 返回 enabled 模型 |
| MODEL-02 | models.test.ts | member 未授权模型 | 列表不含；直接调用/查询 403 `model_not_authorized` |
| MODEL-03 | models.test.ts | 策略 deny 优先 | deny 规则覆盖 role allow |
| MODEL-04 | models.test.ts | 策略乐观锁 | 旧 version PUT → 412 `precondition_failed` |
| MODEL-05 | models.test.ts | `POST /model-policies/{policyId}/preview` | 影响预览与解析器一致；**不实现 `/model-policies/resolved`（不在 openapi）** |
| WS-01 | workspaces.test.ts | ensure 无工作区 | 202 `provisioning`；Mock 1–3s 到 `ready` |
| WS-02 | workspaces.test.ts | ensure 重复调用 | 返回同一 workspaceId，不重复建 |
| WS-03 | workspaces.test.ts | 并发 ensure | 唯一约束/锁生效，只 1 行 |
| WS-04 | workspaces.test.ts | 跨用户访问 | 404（不是 403） |
| WS-05 | workspaces.test.ts | start/stop 合法迁移 | 202 并最终状态正确 |
| WS-06 | workspaces.test.ts | 非法迁移（ready→ready start 等） | 409 `conflict` |
| WS-07 | workspaces.test.ts | destroy 二次确认名称不匹配 | 400 `validation_failed` |
| WS-08 | workspaces.test.ts | destroy 成功 | 202 + `destroy_scheduled_at`；冷却期取消 → `destroy/cancel` 200 |
| WS-09 | workspaces.test.ts | 冷却到期 | `deleting→deleted`（缩短冷却 env） |
| WS-10 | workspaces.test.ts | 退出/断连不销毁 | 等待/无请求后状态仍 `ready/idle`，无 `stopping/deleting` |
| TICKET-01 | ticket.test.ts | 签发 → 验签 | HMAC 校验通过；`aud=workspace:<id>`、`sub`、`exp≤60s` |
| TICKET-02 | ticket.test.ts | 重放同一 ticket | 第二次 401/403 `ticket_reused` |
| TICKET-03 | ticket.test.ts | 过期 ticket | 401 |
| TICKET-04 | ticket.test.ts | 跨用户 ticket | 拒绝（aud/owner 校验） |
| AUDIT-01 | audit-usage.test.ts | 创建/吊销/工作区写操作 | 每写操作 1 条 audit；detail 无明文 Key |
| AUDIT-02 | audit-usage.test.ts | 越权/跨租户 | audit `outcome=denied` |
| AUDIT-03 | audit-usage.test.ts | 审计查询分页 | cursor 生效；不返回其他 org |
| USAGE-01 | audit-usage.test.ts | usage 写入/读取 | 按 org/user 过滤；`request_id` 幂等 |
| CONTRACT-01 | contract.test.ts | 路由集合 vs openapi（74 paths） | MVP 路由 ∈ openapi（method+path 精确）；无"实现存在但契约没有"；`/healthz`/`/readyz` 为运维例外白名单 |
| CONTRACT-02 | contract.test.ts | 错误响应形状 | 全部 `{error:{code,reason?,message,request_id}}`；code ∈ 16 枚举、reason ∈ 23 枚举 |
| CONTRACT-03 | contract.test.ts | 分页参数 | `cursor/limit` 生效，默认 20/max 100 |
| CONTRACT-04 | contract.test.ts | 契约基线防漂移 | 读取 openapi 的 74 paths/106 ops；若 openapi 变更而实现未跟进 → 失败并提示更新本文件哈希 |
| CONTRACT-05 | contract.test.ts | 跨租户语义 | 资源型路由跨 org 一律 404（不 403），同租户越权 403 |

**测试环境**：`test/helpers/app.ts` 每个测试用临时目录 SQLite（`file:test-<uuid>?mode=memory&cache=shared` 或 tmp 文件）+ `buildApp({db})`；不依赖网络/真实 K8s。`bun test --coverage` 目标：modules ≥70%，state machine/ticket/API Key 100% 分支。

---

## 6. Mock/真实适配层

| 适配器 | MVP 实现 | G5 替换 | 契约 |
| --- | --- | --- | --- |
| `Provisioner` | `mock.ts`：内存 Map + `setTimeout` 推进状态；`ensure/start/stop/destroy/status` | `k8s.ts`（CRD client + informer） | `types.ts` 接口冻结；Mock 与 K8s 同套断言 |
| `LiteLLM` | `mock`：生成假 `sk-` Key + 内存预算；不做真实调用 | 真实 `/key/*` + spend log | 只经 `LiteLLMClient` 接口 |
| `OIDC` | `dev-login`（email） | 控制面 OIDC（openid-client） | 会话/Principal 结构不变 |
| `KMS` | dev pepper 从 env/文件 | 阿里云 KMS | `CryptoProvider` 接口 |
| `Ticket` | HMAC-SHA256 JWT（测试可验签） | ed25519 + JWKS | `TicketSigner` 接口，claims 同 |

**Mock 不能"假过"**：Provisioner 的状态推进必须走真实状态机迁移表（非法迁移同样 409）；LiteLLM mock 必须返回结构化 Key（含 fingerprint/预算），让 `litellm_keys` 表真实落库。

---

## 7. 一次性提交计划（lead 已放行 2026-11-04；等待 task-11 根 workspace 后执行）

| 步骤 | 产出 | 验证 |
| --- | --- | --- |
| S1 | `apps/control-plane/{package.json,tsconfig.json,Dockerfile}` + `src/server.ts|app.ts|env.ts` | `bun run --cwd apps/control-plane start` 起 :4000 |
| S2 | `src/db/{client,schema,migrate,seed}.ts` + `db/migrations/*.sql` | `bun run db:migrate`；`bun run db:seed` 幂等 |
| S3 | 插件（request-context/errors/security/auth/tenant/rbac/idempotency/audit/rate-limit） | 401/403/404 契约测试 |
| S4 | 模块 auth/api-keys/models/workspaces/audit/usage/health | 路由 contract + 业务测试 |
| S5 | `provisioner/{types,mock,k8s}.ts` | Mock 生命周期测试；`tsc --noEmit`（k8s 实现编译） |
| S6 | `test/*.test.ts`（§5 全量） | `bun test` 全绿；覆盖率报告 |
| S7 | `README.md`（启动/环境变量/seed 账号/KNOWN_GAPS） | lead 按 §8 命令复跑 |
| S8 | 提交（不写根 package.json；不写 console/operator） | `git diff --stat` 仅 `apps/control-plane/`（+ 协调后的 shared 类型） |

**交付命令（与 G4 计划 §5 对齐）**

```bash
bun install
bun run --cwd apps/control-plane test
bun run --cwd apps/control-plane typecheck
bun run --cwd apps/control-plane start &   # :4000
curl -s localhost:4000/healthz
```

**G4 退出标准（本切片）**：dev-login 可用；API Key 生命周期；模型策略过滤；工作区 ensure→ready→destroy（冷却/取消）；ticket 60s 一次性（可验签）；审计/用量写入；`bun test` 全绿；路由与 openapi MVP 子集一致；证据文档列 `KNOWN_GAPS`（真实 OIDC/LiteLLM/K8s/RLS）。

---

## 8. 风险与已知降级

| # | 风险/降级 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | **SQLite 无 RLS/分区/多实例** | 生产多租户隔离未验证 | repository 强制 org_id + 负向测试；G4 证据标 DEGRADED；G5 迁 PG+RLS（DDL 已设计） |
| R2 | SQLite/PG 类型与 DDL 差异 | 迁移返工 | MVP 用 sqlite-core；PG DDL 独立维护（DATA-MODEL），不承诺同构自动迁移；G5 用 drizzle pg-core 重写 schema |
| R3 | ~~Fastify vs NestJS~~ | — | **已关闭**：ADR-016 Accepted（Fastify 5 + zod），ARCH 已同步 |
| R4 | HMAC ticket 非生产 | 安全性不足 | 仅 dev；claims/接口与 ed25519 一致，G5 换签名器不动业务 |
| R5 | Mock Provisioner 与真实 Operator 行为差 | 状态机边界漏测 | Mock 实现同一迁移表；与 infra 的 operator 单测共享用例（G4 后） |
| R6 | 无 Redis | 幂等/限流生产语义缺失 | MVP SQLite/内存；接口抽象 `IdempotencyStore/RateLimiter`，G5 换 Redis |
| R7 | 无真实 LiteLLM/用量 | 计费链路未验证 | mock Key + `usage_records` 结构；G5 接 LiteLLM spend log 对账 |
| R8 | `@kubernetes/client-node` 仅编译 | K8s Provisioner 未运行 | `tsc --noEmit` + 接口测试；G5/kind 验证 |

---

## 9. 与 G2/A-G2 的映射（开工前关闭）

| 项 | Owner | 状态 / 对 MVP 的影响 |
| --- | --- | --- |
| A-G2-1（G2-01/02）冷却期/reason 清理 | infra+architect | ✅ 已修（5–1440min、`ws_launch_timeout`、snapshot→internal_error+details.phase）；MVP 按此实现 |
| A-G2-2（G2-03）namespace | architect+infra | ✅ 已修（ARCH:290/340 + DEPLOYMENT:202/209）；K8s Provisioner 用 `ws-<orgId>`，Mock 不依赖 |
| A-G2-3（G2-04）quota DDL | architect | ✅ 已修（DATA-MODEL:426/525 唯一索引）；MVP 不建该表 |
| A-G2-4（G2-05）L2 凭证 | architect | ✅ 已修（ADR-009:18-19）；MVP 不生成配置 |
| A-G2-5（G2-06/07/08/09）契约/补表 | architect+capability+backend | ✅ 已闭环（74 paths/36 表/capability 清单：公开 26、proposed 25、内部 26）；MVP 只做子集 |
| A-G2-6…8 | capability+architect+infra | ✅ 已关闭（architect 2026-11-04 确认）；不影响 MVP 控制面骨架 |

---

## 10. 首批任务拆分（放行后 1 次性提交，按依赖排序）

1. **T-A 骨架**：`package.json/tsconfig/env/server/app/health` + 插件空实现 + 错误模型 → `GET /healthz` 200。
2. **T-B DB**：client/schema/migrate/seed + 15 表 + 索引 → `readyz` 检查迁移版本。
3. **T-C Auth**：dev-login/session/CSRF/me/logout + RBAC 基础 → AUTH-01..06。
4. **T-D API Key**：创建/列表/吊销/guard → KEY-01..06。
5. **T-E Models**：providers/models/policies/resolver → MODEL-01..05。
6. **T-F Workspaces**：状态机 + service/routes + Mock Provisioner + destroy/冷却 + ticket → WS-01..10、TICKET-01..04。
7. **T-G Audit/Usage**：审计写入/查询、usage 写入/查询 → AUDIT/USAGE。
8. **T-H 契约/测试**：contract.test + 覆盖率 + README/KNOWN_GAPS → `bun test` 全绿。

> 合并策略：一个 PR 一次提交（S1–S8），不拆多个半成品；`apps/control-plane/` 之外不改（除经协调的 `packages/shared` 类型）。**已执行完毕（2026-11-04）：lead 已放行、task-11 已 ready，实现与测试见 §12。**

---

## 12. 实现结果（G4，2026-11-04）

| 项 | 结果 |
| --- | --- |
| 代码 | `apps/control-plane/`（Fastify 5 + Zod + Drizzle + bun:sqlite；`src/{app,server,env,context,db,routes,services,provisioner,lib}`） |
| 单测 | `bun test`：**43 pass / 0 fail**（AUTH 6 / KEY 6 / MODEL 5 / WS 12 / TICKET 5 / AUDIT+USAGE 4 / CONTRACT 5） |
| 类型 | `bun x tsc --noEmit -p tsconfig.json` 通过 |
| Smoke | `bun scripts/smoke-api.ts http://127.0.0.1:4000` → **17/17 PASS**（dev-login/ensure/ready/ticket/destroy/cancel/audit） |
| 真实服务 | `:4000`，PID 20608；DB `apps/control-plane/.data/control-plane.sqlite`；`/healthz`、`/readyz` 200 |
| 路由 | 33 条 = 29 条 ∈ openapi（96 paths）+ 4 条 allowlist（dev-login/csrf/healthz/readyz）；implemented-not-in-openapi = **0** |
| 契约缺口 | 72 条 openapi 未实现（OIDC/orgs/skills/eval/apps/mcp/quota/export/snapshot/retry 等，G5+）；见 `apps/control-plane/KNOWN_GAPS.md` |
| G2-WC-03 | `GET /workspaces` summary 含 `last_active_at` + `stage`（WS-11） |
| G2-WC-06 | 配额超限 409 `ws_quota_exceeded`（WS-12；openapi `/workspaces` POST 已含 409） |
| BUG-CP-001 | dev-login Set-Cookie 去重：现为 2 条（`__Host-oc_session` + `oc_csrf`），由 `lib/http.ts` jar + `onSend` 一次 flush |

**启动（给 QA/console）**

```bash
cd D:\opencode
PORT=4000 DATABASE_PATH=apps/control-plane/.data/control-plane.sqlite bun apps/control-plane/src/server.ts
# 或 bun run dev（根，同时起 console）；DB/seed 默认开启
```

**结论**：G4 控制面 MVP 完成；G5 按 §11 迁 PG+RLS、Redis、LiteLLM、Operator、ed25519。

---

## 11. G5 迁移硬门槛（写入里程碑）

MVP 的 SQLite 降级**不延续到生产**。G5 必须完成以下项，否则 G6 不准出（ADR-016 条件 ④）：

| # | 迁移项 | 验收 |
| --- | --- | --- |
| G5-M1 | Drizzle schema 从 sqlite-core 切换 pg-core；`id` 保持应用生成 uuid（无 AUTOINCREMENT） | 同一套 repository 测试在 PG16 通过 |
| G5-M2 | 执行 DATA-MODEL 全量 DDL（36 表 + 分区 + 唯一索引 + 触发器） | 迁移可回滚；`pg_dump` schema diff = 0 |
| G5-M3 | `ENABLE/FORCE RLS` + 每请求 `SET LOCAL app.org_id/app.user_id` | 越权套件 100% 拒绝；跨租户 404 |
| G5-M4 | 连接池/PgBouncer、多副本、HPA 参数 | 2 副本压测；SQLite 单副本限制解除 |
| G5-M5 | Redis 会话/幂等/限流替换 SQLite/内存适配 | 5s 吊销、幂等重放、限流 429 用例 |
| G5-M6 | LiteLLM 真实虚拟 Key + spend log 对账替换 mock | 抽样计量偏差 ≤1%；对账 ≤2% 告警 |
