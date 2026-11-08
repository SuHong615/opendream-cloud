# ADR-016：MVP 控制面 API 用 Fastify（而非 NestJS）

- 状态：**Accepted**（Lead 裁决，用于 G4 MVP 启动）
- 日期：2026-11-04
- 决策者：lead / architect
- 关联：`ARCHITECTURE.md §0/§3/§4.1`、`services/BACKEND.md`、PLAN §6 技术栈

## 背景

PLAN §6 原定控制面 API 用 **NestJS（Fastify adapter）**。G4 启动前，Lead 裁决 MVP 直接用 **Fastify**，原因是：
- MVP 只有 15 张表、约 30 个公开端点，NestJS 的模块/DI/decorator 体系带来的结构收益小于其构建/启动/调试成本；
- 契约优先：需要从 `openapi.yaml` 直接生成请求校验与 SDK，Fastify 生态（`@fastify/swagger`、`@fastify/type-provider-typebox`/zod）更直接；
- 团队规模小、交付周期短：减少框架抽象层可显著降低"框架知识"成本；
- 后续若需要更大规模（G5+），Fastify 的插件体系仍可支撑，不必为了"看起来企业级"先背 NestJS。

## 决策

**控制面 API 使用 Fastify 5 + TypeScript + TypeBox（或 zod）做 schema-first 校验；不使用 NestJS。**

架构约束不变：

| 关注点 | MVP 实现 |
| --- | --- |
| 契约 | `openapi.yaml` 为唯一源；路由注册从契约生成/校验（`@fastify/swagger` 输出与契约 diff 为零） |
| 校验 | TypeBox schema（编译期类型 + 运行时校验）；拒绝未声明字段（防批量赋值） |
| 租户上下文 | `preHandler` 统一注入 `{user_id, org_id, role}`；repository 层强制 `org_id` 过滤（**MVP SQLite 无 RLS**，见下） |
| 错误 | 统一 `ErrorEnvelope`（`code`+`reason`）；`setErrorHandler` 集中映射，禁止泄漏堆栈 |
| 幂等 | `Idempotency-Key` 插件（Redis 24h；ticket 类端点明确排除——每次新 jti） |
| 可观测 | `@fastify/otel` + pino 结构化日志 + `X-Request-Id` |
| 安全 | `@fastify/helmet`、CORS 白名单、body limit、rate-limit、CSRF（Cookie 写操作） |

**MVP 数据层降级（与 backend 联合裁定）**：G4 MVP 用 **bun:sqlite + Drizzle**，repository 层强制租户过滤；**PG + RLS 作为 G5 生产门槛**。约束：
- MVP 仅用于内部验收/演示，**不承载外部租户生产数据**；
- 控制面**单副本**（SQLite 单写者，禁止 HPA>1）；
- 数据量上限（工作区 ≤200、用户 ≤2,000）并在超限前迁移；
- **G5 必须完成 PG 迁移 + RLS 全量测试**，否则 G6 不准出；
- 风险已在 `SECURITY.md` 登记为残余风险（MVP 例外，Lead 已接受）。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. NestJS（Fastify adapter）** | 模块/DI/decorator 学习与构建成本高；MVP 端点少，收益低；契约生成链路更绕；出错时栈更深。**若团队后续扩大到多团队并行，可重新评估**（Fastify 代码可平滑迁移到 NestJS 的 Fastify adapter，但非必须） |
| **B. Express** | 生态老、TS 类型与 schema 校验弱、性能与插件治理不如 Fastify |
| **C. Hono** | 轻量优秀，但 Node 生态中间件（OIDC、OpenTelemetry、Swagger）成熟度与团队熟悉度低于 Fastify |
| **D. tRPC** | 非 REST/OpenAPI 契约，违背"API 可生成 SDK"的 G2 要求 |
| **E. 直接用 Fastify 但不用 schema-first（手写校验）** | 会与 `openapi.yaml` 漂移；契约测试成本高 |

## 后果

**正面**
- 启动快、依赖少、调试直接；契约与实现同源（schema-first），G2 的"API 可生成 SDK"更易保证。
- 减少框架抽象，G4 MVP 能在 2 周内出可验收闭环。
- 与 workspace-gateway 技术栈一致（都是 Fastify/TypeScript），可共享插件与中间件。

**负面 / 代价**
- 缺少 NestJS 的约定式模块边界，需靠目录规范 + code review 维持（`modules/<domain>/{route,service,repo}`）。
- 团队若后续引入 NestJS 需要迁移（成本可控，非阻塞）。
- Fastify 插件版本兼容需锁版本；schema-first 的 TypeBox/zod 二选一需先定（建议 TypeBox，与 JSON Schema 同源）。

## 验证

- 契约一致性：CI 中 `openapi.yaml` 与运行时 Swagger 输出 diff = 0；SDK 生成成功（`openapi-generator` → TS client）。
- 路由覆盖：playwright/vitest 契约测试覆盖 30 个公开端点。
- 错误一致性：所有 4xx/5xx 均符合 `ErrorEnvelope`（含 `code`/`reason`/`request_id`）。
- 性能：读 p95 <300ms、写 p95 <800ms（MVP 数据量下）。
- 降级风险：G5 迁移检查表（SQLite→PG、RLS 全量、分区、多副本）为硬门槛。
