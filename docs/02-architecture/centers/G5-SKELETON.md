# G5 四中心服务骨架清单（docs-only）

- 状态：**设计基线**（architect 提前审；契约 FROZEN，任何偏离先 ADR → openapi `1.1.0` → changelog → 三方通知）
- 依据：`openapi.yaml`（96 paths/131 ops/98 schemas，`x-contract-status: frozen`）、`centers/ROUTES.md`（四中心 75 ops）、`DATA-MODEL.md §3.10`
- 实现约束：TypeScript + Fastify 5；存储 MVP 内存/SQLite，接口留 PG 适配；每服务 `GET /healthz`；路由与 `operationId` 一一对应；不改 `apps/`、`deploy/`

## 1. 目录结构（每中心一致）

```
services/<center>/
├── package.json            # @opendream-cloud/<center>，scripts: dev/start/test/typecheck
├── tsconfig.json           # extends ../../tsconfig.base.json；rootDir ../..（复用 packages/shared）
├── README.md               # 启动/环境变量/未实现项/契约边界
├── src/
│   ├── server.ts           # 进程入口：loadEnv + buildApp + listen
│   ├── app.ts              # buildApp()：Fastify、错误处理器、request-id、注册路由
│   ├── env.ts              # PORT/HOST/STORE_PATH/NODE_ENV（zod 校验）
│   ├── context.ts          # AppContext：store + clock + id 生成器
│   ├── lib/                # page.ts（cursor）、crypto.ts（token/签名）、errors.ts（映射 shared ApiError）
│   ├── types.ts            # 本服务 DTO（与 openapi schema 对齐；生成前手写）
│   ├── repositories/       # store.ts（MVP 内存/SQLite）；pg/ 预留（接口同签名）
│   ├── services/           # 领域逻辑（无 Fastify 依赖，可单测）
│   └── routes/
│       ├── index.ts        # registerRoutes(app, ctx) + ROUTES 清单（method/path/operationId）
│       ├── health.ts       # /healthz、/readyz、GET /api/v1/health
│       └── <resource>.ts   # 每个资源一个文件（见 §2）
└── test/
    ├── contract.test.ts    # 路由 ⊆ ROUTES；operationId 命中冻结契约；P2 不存在；两层错误码
    ├── <resource>.test.ts  # 核心 happy path + 403/404/409
    └── helpers.ts          # buildTestApp()、seed fixtures
```

- 服务端口：skill `4101`、eval `4102`、app `4103`、mcp `4104`（dev 约定，环境变量可覆盖）；均提供 `/healthz`。
- 根 `scripts/dev.ts` 由 infra 维护；本清单不修改根脚本，服务可独立 `bun run dev`。

## 2. 路由 → handler → service/表 映射

> `handler` 指 `src/routes/<file>.ts` 内注册的函数；`service/表` 指领域服务与 `DATA-MODEL §3.10` 表。所有路径/operationId 来自 `centers/ROUTES.md`（冻结契约）。

### 2.1 Skill 中心（19 ops，`routes/*.ts`）

| operationId | handler | service / 表 |
| --- | --- | --- |
| `listSkills` | `skills.ts:listSkills` | `SkillService.list` / `skills` |
| `createSkill` | `skills.ts:createSkill` | `SkillService.create` / `skills` |
| `resolveSkillBySlug` | `skills.ts:resolveSkillBySlug` | `SkillService.bySlug` / `skills` |
| `getSkill` | `skills.ts:getSkill` | `SkillService.get` / `skills` |
| `updateSkill` | `skills.ts:updateSkill` | `SkillService.update` / `skills` |
| `deleteSkill` | `skills.ts:deleteSkill` | `SkillService.softDelete` / `skills` |
| `listSkillVersions` | `versions.ts:listSkillVersions` | `VersionService.list` / `skill_versions` |
| `createSkillVersion` | `versions.ts:createSkillVersion` | `VersionService.create`（校验/扫描接口 mock）/ `skill_versions` |
| `getSkillVersion` | `versions.ts:getSkillVersion` | `VersionService.get` / `skill_versions` |
| `publishSkillVersion` | `versions.ts:publishSkillVersion` | `VersionService.publish`（gate 接口）/ `skill_versions`、`eval_runs`(FK 只读) |
| `submitSkillVersionReview` | `reviews.ts:submitSkillVersionReview` | `ReviewService.submit` / `skill_versions` |
| `reviewSkillVersion` | `reviews.ts:reviewSkillVersion` | `ReviewService.decide` / `skill_versions` |
| `yankSkillVersion` | `reviews.ts:yankSkillVersion` | `ReviewService.yank` / `skill_versions` |
| `rollbackSkillVersion` | `reviews.ts:rollbackSkillVersion` | `ReviewService.rollback` / `skill_versions` |
| `getSkillStats` | `stats.ts:getSkillStats` | `StatsService.get` / `skill_installations`(聚合) |
| `installSkill` | `installations.ts:installSkill` | `InstallService.install` / `skill_installations`、`skill_source_tokens` |
| `listSkillInstallations` | `installations.ts:listSkillInstallations` | `InstallService.list` / `skill_installations` |
| `updateSkillInstallation` | `installations.ts:updateSkillInstallation` | `InstallService.update` / `skill_installations` |
| `uninstallSkill` | `installations.ts:uninstallSkill` | `InstallService.uninstall` / `skill_installations`、`skill_source_tokens`(revoke) |

**内部（不进公开路由表）**：`/internal/skills/{skillId}/source-token`（`dist/source.ts`，签发 15min token）、`/internal/skills/source-keys`（公钥）；分发 `GET /s/{org_slug}/{skill_slug}/{version}/{token}/index.json` 与 `.../{file}` 挂在**独立 listener/host**（skill-source），不注册到公开 API 网关。

### 2.2 评测中心（12 ops）

| operationId | handler | service / 表 |
| --- | --- | --- |
| `listEvalDatasets` / `createEvalDataset` / `getEvalDataset` | `datasets.ts` | `DatasetService` / `eval_datasets` |
| `listEvalDatasetVersions` | `datasets.ts:listVersions` | `DatasetService.versions` / `eval_dataset_versions` |
| `listEvalRuns` / `createEvalRun` / `getEvalRun` / `cancelEvalRun` | `runs.ts` | `RunService`（Job 调度接口 + mock）/ `eval_runs` |
| `listEvalResults` | `runs.ts:listResults` | `RunService.results` / `eval_case_results` |
| `getEvalRunReport` | `reports.ts:getReport` | `ReportService.get`（`EvalReport`）/ `eval_runs`、`eval_case_results` |
| `listEvalBaselines` / `createEvalBaseline` | `baselines.ts` | `BaselineService` / `eval_baselines` |

**内部**：`/internal/eval/specs`、`/internal/eval/compare`、`/internal/eval/gates/skill`、`/internal/eval/runs/{runId}/reproduce`、`/internal/eval/webhooks/ci`（`internal.ts`，不注册公开网关）。

### 2.3 应用中心（30 ops）

| operationId | handler | service / 表 |
| --- | --- | --- |
| `listApps` / `createApp` / `getApp` / `updateApp` / `deleteApp` | `apps.ts` | `AppService` / `apps` |
| `preflightApp` | `apps.ts:preflight` | `PreflightService` / 只读工作区快照（mock） |
| `listAppBuilds` / `createAppBuild` / `getAppBuild` / `retryAppBuild` | `builds.ts` | `BuildService`（BuildKit 接口 + mock）/ `app_builds` |
| `listAppDeployments` / `createAppDeployment` / `getAppDeployment` / `rollbackApp` / `rollbackAppDeployment` | `deployments.ts` | `DeployService`（K8s 接口 + mock）/ `app_deployments`、`app_revisions` |
| `getAppLogs` | `logs.ts` | `LogService`（Loki 接口 + mock）/ 无表 |
| `listAppShares` / `createAppShare` / `updateAppShare` / `deleteAppShare` / `previewAppShares` | `shares.ts` | `AclService` / `app_shares` |
| `createAppAccessTicket` | `tickets.ts` | `TicketService`（EdDSA/60s/jti）/ 无表（Redis 预留） |
| `createAppAccessRequest` | `access.ts` | `AccessRequestService` / `app_access_requests`（§3.9 表） |
| `getPublicAppBySlug` | `public.ts` | `PublicAppService`（登录 + ACL 预检）/ `apps`、`app_shares` |
| `suspendApp` / `sleepApp` / `wakeApp` | `lifecycle.ts` | `LifecycleService`（别名映射）/ `apps`、`app_deployments` |
| `listAppDomains` / `createAppDomain` / `verifyAppDomain` | `domains.ts` | `DomainService`（cert-manager 接口 + mock）/ `app_domains` |

**内部**：`/internal/apps/{appId}/authz`、`/internal/app-runtime/llm/chat`。

### 2.4 MCP 中心（14 ops）

| operationId | handler | service / 表 |
| --- | --- | --- |
| `listMcpServers` / `createMcpServer` / `getMcpServer` / `updateMcpServer` / `deleteMcpServer` | `servers.ts` | `McpServerService` / `mcp_servers`、`mcp_server_versions` |
| `getMcpServerHealth` / `checkMcpServerHealth` | `health.ts` | `HealthService`（探针接口 + mock）/ `mcp_health_checks` |
| `reviewMcpServer` / `publishMcpServer` | `lifecycle.ts` | `McpLifecycleService` / `mcp_servers` |
| `listMcpBindings` / `createMcpBinding` / `deleteMcpBinding` / `rotateMcpBindingToken` | `bindings.ts` | `BindingService`（token 仅一次）/ `mcp_bindings` |
| `mcpOauthCallback` | `oauth.ts` | `OAuthService`（state 校验）/ `mcp_credentials` |

**内部**：`/internal/mcp/servers/{serverId}/{test-connection|credentials|tools}`、`/internal/mcp/calls`、`/internal/mcp/proxy/{bindingId}`、`/internal/mcp/webhooks/health`；代理/审计单独 listener（`mcp-proxy`），不注册公开 API 网关。

## 3. 共享类型来源（防漂移）

| 层 | 方案 |
| --- | --- |
| 契约源 | `docs/02-architecture/openapi.yaml`（FROZEN） |
| 类型生成 | **`bunx openapi-typescript docs/02-architecture/openapi.yaml -o packages/shared/src/generated/openapi.d.ts`**（G5 先手写 DTO，生成器接入后替换；生成物入仓） |
| 手写 DTO | 各服务 `src/types.ts`：仅本服务响应/请求子集，命名与 schema 一致（`Skill`、`SkillVersionSummary`…） |
| CI 校验 | ①`bun run generate:openapi` 后 `git diff --exit-code`（无脏 diff）；②各服务 `contract.test.ts` 比对 `ROUTES` opIds ⊆ 冻结契约；③路由方法/路径占位符归一化后 mismatch=0 |
| 共享错误 | `packages/shared/src/errors.ts`（`ApiError`、16 `code`/23 `reason`）；服务只做 `reason → 状态码` 覆写（门禁 409） |

## 4. 测试布局

| 类型 | 位置 | 覆盖 |
| --- | --- | --- |
| 契约测试 | `services/<center>/test/contract.test.ts` | 路由 ⊆ ROUTES；opIds 全部命中冻结契约；8 个 P2 不出现；错误两层；列表 cursor 结构；`/internal/*` 不进公开 `ROUTES` |
| 单测（领域） | `services/<center>/test/<resource>.test.ts` | 状态机/权限/幂等/分页/错误分支（Skill 审核发布、Eval 9 态、App ACL、MCP token 一次性） |
| 集成/E2E | `tests/e2e/`（qa 维护） | dev-login 后调用四中心；G4 就绪后补真实 K8s/BuildKit/LiteLLM |
| 运行 | `bun test <files>`（根 `bun run test` 自动发现 `services/**/*.test.ts`） | 各服务独立可跑 |

## 5. 错误映射表（reason → HTTP → 文案 key）

| reason | HTTP | code | 文案 key（前端） |
| --- | --- | --- | --- |
| `gate_blocked` | **409** | `precondition_failed` | `skill.publish.gate_blocked` |
| `skill_permission_denied` | 403 | `forbidden` | `skill.install.permission_denied` |
| `share_link_expired` | 410 | `not_found` | `app.share.expired` |
| `mcp_health_down` | 503 | `service_unavailable` | `mcp.health.down` |
| `mcp_auth_required` | 401 | `unauthorized` | `mcp.auth.required` |
| `app_build_failed` | 422 | `precondition_failed` | `app.build.failed` |
| `authz_forbidden` | 403 | `forbidden` | `common.forbidden` |
| `tenant_context_missing` | 401 | `unauthorized` | `common.session.expired` |
| `ticket_reused` | 401 | `unauthorized` | `app.ticket.reused` |
| 其余领域 reason | 400/404/409/422/429/503 按语义 | 对应 `code` | `common.<reason>` |

> 所有错误响应必须含 `request_id`；`details` 不放密钥/正文。

## 6. 边界（表归属与内部路由）

**本中心自建表（`DATA-MODEL §3.10`，写权限归各中心）**：
- Skill：`skills`、`skill_versions`、`skill_installations`、`skill_source_tokens`、`skill_reviews`(P2)
- Eval：`eval_datasets`、`eval_dataset_versions`、`eval_specs`、`eval_runs`、`eval_case_results`、`eval_baselines`、`eval_ci_links`
- App：`apps`、`app_revisions`、`app_builds`、`app_deployments`、`app_domains`、`app_shares`、`app_secrets`、`app_access_requests`
- MCP：`mcp_servers`、`mcp_server_versions`、`mcp_credentials`、`mcp_bindings`、`mcp_health_checks`、`mcp_call_logs`

**只读 FK（不建表、不写）**：`orgs`、`users`、`memberships`、`workspaces`、`audit_logs`、`usage_records`、`model_*`、`quotas`；`eval_runs` 对 Skill 是只读 FK（`skill_versions.eval_run_id`）。

**内部路由注册点**：每服务 `src/routes/internal.ts` 仅在 `INTERNAL_LISTEN_HOST`/内部 listener 注册；公开 `ROUTES` 不含 `/internal/*`；网关/Ingress 只暴露公开 listener；`mcp-oauth/callback` 是唯一公开但 `security: []` 的端点。

## 7. 可观测

| 项 | 约定 |
| --- | --- |
| Span 名 | `operationId`（如 `publishSkillVersion`），属性：`org_id`、`resource_id`、`http.status_code`、`error.reason` |
| 指标 | `center_requests_total{operationId,status}`、`center_request_duration_ms{operationId}`、`center_errors_total{code,reason}` |
| 业务指标 | Skill：发布 gate 失败率/安装生效时延；Eval：run 成功率/队列长度；App：构建成功率/回滚耗时；MCP：代理成功率/熔断次数 |
| 日志 | 结构化 JSON；禁止记录 token/凭证/正文；`request_id` 贯穿 |
| 健康 | `GET /healthz`（进程存活）、`GET /readyz`（store/依赖） |

---

## 附：G5 任务映射（便于 review）

| 任务 | 服务 | 交付 |
| --- | --- | --- |
| G5-Skill | `services/skill-center/` | 19 公开 ops + 内部源/分发；审核/发布 gate mock；单测+契约测试 |
| G5-Eval | `services/eval-center/` | 12 公开 ops + 5 内部；Job 接口 + mock；9 态；报告/baseline |
| G5-App | `services/app-center/` | 30 公开 ops + 2 内部；BuildKit/K8s/Loki 接口 + mock；ACL/域名/ticket |
| G5-MCP | `services/mcp-hub/` | 14 公开 ops + 7 内部；代理/审计 mock；token 一次性/健康 |
