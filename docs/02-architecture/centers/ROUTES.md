# G5 四中心路由清单（基于 FROZEN 契约）

- 契约状态：`openapi.yaml` **FROZEN**（`x-contract-status: frozen`，`x-frozen-at: 2026-11-04`，`x-frozen-scope: G5 四中心公开 API`）
- 规模：96 paths / 131 operations / 98 schemas；**四中心相关 75 operations**（本文件清单）
- 依据：`docs/02-architecture/openapi.yaml`；本文件只做**路由清单/命名映射**，不新增路径、不写实现代码
- 规则：实现以 `operationId` 为准；列表 `?cursor&limit` + `{items,next_cursor}`；错误两层 `code`+`reason`；门禁 `409 precondition_failed` + `reason=gate_blocked`
- `x-p2-deferred`（8 项，**G5 不实现、不得发明路径**）：`GET /apps/{appId}/certificates`、`GET /apps/{appId}/metrics`、`GET /apps/{appId}/permissions`、`GET /apps/by-slug/{slug}`、`POST /mcp-servers/{serverId}/versions`、`POST /skill-installations/{installationId}/rollback`、`POST /skills/{skillId}/block`、`GET /skills/{skillId}/reviews`

## 1. Skill 中心（19 ops）

| Method | Path | operationId | 备注 |
| --- | --- | --- | --- |
| GET | `/api/v1/skills` | `listSkills` | cursor/limit |
| POST | `/api/v1/skills` | `createSkill` | Idempotency-Key |
| GET | `/api/v1/skills/by-slug/{orgSlug}/{skillSlug}` | `resolveSkillBySlug` | 域名/直达 |
| GET | `/api/v1/skills/{skillId}` | `getSkill` | |
| PATCH | `/api/v1/skills/{skillId}` | `updateSkill` | |
| DELETE | `/api/v1/skills/{skillId}` | `deleteSkill` | 软删 |
| GET | `/api/v1/skills/{skillId}/versions` | `listSkillVersions` | |
| POST | `/api/v1/skills/{skillId}/versions` | `createSkillVersion` | multipart 上传 |
| GET | `/api/v1/skills/{skillId}/versions/{versionId}` | `getSkillVersion` | |
| POST | `/api/v1/skills/{skillId}/versions/{versionId}/publish` | `publishSkillVersion` | 门禁 409 |
| POST | `/api/v1/skills/{skillId}/versions/{versionId}/submit-review` | `submitSkillVersionReview` | 返回 `SkillVersionSummary` |
| POST | `/api/v1/skills/{skillId}/versions/{versionId}/review` | `reviewSkillVersion` | approve/reject |
| POST | `/api/v1/skills/{skillId}/versions/{versionId}/yank` | `yankSkillVersion` | |
| POST | `/api/v1/skills/{skillId}/versions/{versionId}/rollback` | `rollbackSkillVersion` | 按 versionId |
| GET | `/api/v1/skills/{skillId}/stats` | `getSkillStats` | `SkillStats` |
| POST | `/api/v1/skills/{skillId}/install` | `installSkill` | |
| GET | `/api/v1/skill-installations` | `listSkillInstallations` | |
| PATCH | `/api/v1/skill-installations/{installationId}` | `updateSkillInstallation` | enable/disable |
| DELETE | `/api/v1/skill-installations/{installationId}` | `uninstallSkill` | |

## 2. 评测中心（12 ops）

| Method | Path | operationId | 备注 |
| --- | --- | --- | --- |
| GET | `/api/v1/eval-datasets` | `listEvalDatasets` | |
| POST | `/api/v1/eval-datasets` | `createEvalDataset` | 数据集版本随 multipart 创建 |
| GET | `/api/v1/eval-datasets/{datasetId}` | `getEvalDataset` | |
| GET | `/api/v1/eval-datasets/{datasetId}/versions` | `listEvalDatasetVersions` | |
| GET | `/api/v1/eval-runs` | `listEvalRuns` | |
| POST | `/api/v1/eval-runs` | `createEvalRun` | 202 + runId |
| GET | `/api/v1/eval-runs/{runId}` | `getEvalRun` | 含 9 态 status |
| GET | `/api/v1/eval-runs/{runId}/results` | `listEvalResults` | `case_id` 为 string |
| POST | `/api/v1/eval-runs/{runId}/cancel` | `cancelEvalRun` | |
| GET | `/api/v1/eval-runs/{runId}/report` | `getEvalRunReport` | `?compare_to=`、`failed_top5`/`deltas` |
| GET | `/api/v1/eval-runs/{runId}/baselines` | `listEvalBaselines` | |
| POST | `/api/v1/eval-runs/{runId}/baselines` | `createEvalBaseline` | |

## 3. 应用中心（30 ops）

| Method | Path | operationId | 备注 |
| --- | --- | --- | --- |
| GET | `/api/v1/apps` | `listApps` | |
| POST | `/api/v1/apps` | `createApp` | 从工作区创建 |
| GET | `/api/v1/apps/{appId}` | `getApp` | |
| PATCH | `/api/v1/apps/{appId}` | `updateApp` | |
| DELETE | `/api/v1/apps/{appId}` | `deleteApp` | 二次确认 |
| POST | `/api/v1/apps/{appId}/preflight` | `preflightApp` | `AppPreflight` |
| GET | `/api/v1/apps/{appId}/builds` | `listAppBuilds` | |
| POST | `/api/v1/apps/{appId}/builds` | `createAppBuild` | 202 |
| GET | `/api/v1/apps/{appId}/builds/{buildId}` | `getAppBuild` | |
| POST | `/api/v1/apps/{appId}/builds/{buildId}/retry` | `retryAppBuild` | |
| GET | `/api/v1/apps/{appId}/deployments` | `listAppDeployments` | |
| POST | `/api/v1/apps/{appId}/deployments` | `createAppDeployment` | 1C2G |
| GET | `/api/v1/apps/{appId}/deployments/{deploymentId}` | `getAppDeployment` | |
| POST | `/api/v1/apps/{appId}/rollback` | `rollbackApp` | |
| POST | `/api/v1/apps/{appId}/deployments/{deploymentId}/rollback` | `rollbackAppDeployment` | |
| GET | `/api/v1/apps/{appId}/logs` | `getAppLogs` | Loki 代理 |
| GET | `/api/v1/apps/{appId}/shares` | `listAppShares` | |
| POST | `/api/v1/apps/{appId}/shares` | `createAppShare` | |
| PATCH | `/api/v1/apps/{appId}/shares/{shareId}` | `updateAppShare` | |
| DELETE | `/api/v1/apps/{appId}/shares/{shareId}` | `deleteAppShare` | |
| POST | `/api/v1/apps/{appId}/shares/preview` | `previewAppShares` | 不落库/无 total |
| POST | `/api/v1/apps/{appId}/access-ticket` | `createAppAccessTicket` | EdDSA/60s/jti |
| POST | `/api/v1/apps/{appId}/access-requests` | `createAppAccessRequest` | |
| GET | `/api/v1/apps/public/{slug}` | `getPublicAppBySlug` | 需登录 + ACL |
| POST | `/api/v1/apps/{appId}/suspend` | `suspendApp` | ≡ sleep |
| POST | `/api/v1/apps/{appId}/sleep` | `sleepApp` | 别名 |
| POST | `/api/v1/apps/{appId}/wake` | `wakeApp` | 别名 start |
| GET | `/api/v1/apps/{appId}/domains` | `listAppDomains` | |
| POST | `/api/v1/apps/{appId}/domains` | `createAppDomain` | TXT/ICP/DNS |
| POST | `/api/v1/apps/{appId}/domains/{domainId}/verify` | `verifyAppDomain` | 状态机 |

## 4. MCP 中心（14 ops）

| Method | Path | operationId | 备注 |
| --- | --- | --- | --- |
| GET | `/api/v1/mcp-servers` | `listMcpServers` | |
| POST | `/api/v1/mcp-servers` | `createMcpServer` | |
| GET | `/api/v1/mcp-servers/{serverId}` | `getMcpServer` | |
| PATCH | `/api/v1/mcp-servers/{serverId}` | `updateMcpServer` | |
| DELETE | `/api/v1/mcp-servers/{serverId}` | `deleteMcpServer` | |
| GET | `/api/v1/mcp-servers/{serverId}/health` | `getMcpServerHealth` | 历史 |
| POST | `/api/v1/mcp-servers/{serverId}/health-check` | `checkMcpServerHealth` | 主动探活 |
| POST | `/api/v1/mcp-servers/{serverId}/review` | `reviewMcpServer` | 返回 `McpServer` |
| POST | `/api/v1/mcp-servers/{serverId}/publish` | `publishMcpServer` | 返回 `McpServer` |
| GET | `/api/v1/mcp-bindings` | `listMcpBindings` | |
| POST | `/api/v1/mcp-bindings` | `createMcpBinding` | 返回 token 一次 |
| DELETE | `/api/v1/mcp-bindings/{bindingId}` | `deleteMcpBinding` | |
| POST | `/api/v1/mcp-bindings/{bindingId}/rotate-token` | `rotateMcpBindingToken` | `{binding_id,token,expires_in}` |
| GET | `/api/v1/mcp-oauth/callback` | `mcpOauthCallback` | `security: []`，state 校验 |

## 5. 内部端点（不在公开 OpenAPI；`/internal/...`）

- Skill：`/internal/skills/{skillId}/source-token`、`/internal/skills/source-keys`
- Eval：`/internal/eval/specs`、`/internal/eval/compare`、`/internal/eval/gates/skill`、`/internal/eval/runs/{runId}/reproduce`、`/internal/eval/webhooks/ci`
- MCP：`/internal/mcp/servers/{serverId}/{test-connection|credentials|tools}`、`/internal/mcp/calls`、`/internal/mcp/proxy/{bindingId}`、`/internal/mcp/webhooks/health`
- App：`/internal/apps/{appId}/authz`、`/internal/app-runtime/llm/chat`

> 内部端点同样受契约约束（字段/错误码/鉴权），但**不生成 SDK、不对公网暴露**；实现时不得把它们混入公开路由表。

## 6. G5 契约复核口径（完成后交 qa + architect）

1. 代码路由集合（method+path）⊆ 本清单公开集合，且 operationId 与 openapi 完全一致；
2. `x-p2-deferred` 的 8 项**不存在**于代码路由表；
3. 所有列表端点使用 `?cursor&limit` + `{items,next_cursor}`；
4. 错误响应使用两层 `code`+`reason`；门禁 `409 precondition_failed` + `gate_blocked`；
5. 内部端点只出现在内部路由组（`/internal/*`），不注册到公开网关/SDK。
