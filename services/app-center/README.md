# App Center（G5 服务骨架）

基于 **FROZEN** `openapi.yaml` 与 `centers/ROUTES.md` 的应用中心骨架：30 公开 ops + 2 内部端点。

## 启动

```bash
cd services/app-center
bun run dev      # http://127.0.0.1:4103
bun run test
bun run typecheck
```

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `4103` | 监听 |
| `DEFAULT_ORG_ID` / `DEFAULT_USER_ID` | dev UUID | 租户模拟默认 |
| `DEFAULT_ORG_SLUG` | `acme` | 默认域名后缀用 |
| `APP_HOST_SUFFIX` | `apps.opencode.local` | 应用域名 |
| `TICKET_TTL_SECONDS` | `60` | access-ticket TTL（EdDSA/一次性 jti） |
| `MOCK_BUILD_MS` / `MOCK_DEPLOY_MS` | `0` | mock 构建/部署延迟 |

租户模拟头：`x-oc-org-id` / `x-oc-user-id` / `x-oc-org-slug` / `x-oc-roles`。

## 已实现（公开 30 ops）

- Apps：`listApps`、`createApp`、`getApp`、`updateApp`、`deleteApp`、`preflightApp`、`getPublicAppBySlug`
- Builds：`listAppBuilds`、`createAppBuild`、`getAppBuild`、`retryAppBuild`
- Deploy：`listAppDeployments`、`createAppDeployment`、`getAppDeployment`、`rollbackApp`、`rollbackAppDeployment`、`getAppLogs`
- Shares：`listAppShares`、`createAppShare`、`updateAppShare`、`deleteAppShare`、`previewAppShares`
- Access：`createAppAccessTicket`（EdDSA 60s + jti 一次性）、`createAppAccessRequest`
- Lifecycle：`suspendApp`、`sleepApp`、`wakeApp`（别名映射）
- Domains：`listAppDomains`、`createAppDomain`、`verifyAppDomain`

内部（不进公开网关/SDK）：`/internal/apps/{appId}/authz`、`/internal/app-runtime/llm/chat`。

## 契约要点

- 1C2G：`createAppDeployment` 固定 `requests=limits cpu=1/memory=2Gi`（`APP_SPEC`），骨架拒绝自定义资源。
- 分享：`scope ∈ public|org|users` × `role ∈ view|use|edit`；`public` 仍需登录（网关语义），`previewAppShares` 不落库、无 total。
- access-ticket：EdDSA(Ed25519) 签名、60s、`jti` 一次性（骨架内存去重）。
- 域名：`pending_verification → issuing → active`；verify 前不签发证书。
- 别名：`suspend ≡ sleep`（缩容 0），`wake ≡ start`。
- 分页：`?cursor&limit` + `{items,next_cursor}`。

## 未实现（G5 集成阶段）

| 项 | 说明 |
| --- | --- |
| 真实 BuildKit | `src/infra.ts` 的 `BuildKitClient` 接口 + mock；rootless Job/ACR push 待接 infra |
| 真实 K8s 部署 | `Deployer` 接口 + mock（记录 1C2G/副本）；Deployment/Service/Ingress 待接 operator |
| 域名/证书 | mock 状态机；cert-manager/ACME/TXT 验证待接 |
| 分享 ACL 持久化 | 内存；接 PG `app_shares` + Redis ≤5s 失效缓存 |
| 日志/指标 | `/logs` 返回 mock 行；接 Loki/Prometheus |
| 应用模型调用 | `/internal/app-runtime/llm/chat` 仅占位返回；接 LiteLLM 代理与按访问者归因 |
| 持久化/审计/观测 | PG+RLS、audit/outbox、OTel span=operationId 集成阶段补 |

## 契约自检

`bun run test` 的 `contract.test.ts`：公开 ROUTES ⊆ 冻结 openapi、opId 命中、P2 为 0、内部端点隔离、1C2G 强制、ticket 一次性、share preview 不落库。
