# control-plane G4 KNOWN_GAPS / 契约例外

契约源：`docs/02-architecture/openapi.yaml`（冻结基线；2026-11-04 ADR-017 后 **1.1.0 / 97 paths**）。
本文件列出 G4 MVP 的 **允许例外** 与 **未实现项**；动态 diff 由 `test/contract.test.ts` + 本表共同维护。

## 1. 契约例外（allowlist，非缺陷）

| 路由 | 类型 | 说明 | 处理 |
| --- | --- | --- | --- |
| `POST /api/v1/auth/dev-login` | dev-only | 无 OIDC 的本机登录；`ALLOW_DEV_LOGIN=1` 且 `NODE_ENV!=production`；生产 403 | arch 可在 openapi 加 `dev`/`experimental` tag；**不得进 SDK 默认面** |
| `GET /healthz` | 运维 | liveness 探针（G4 计划 §5 明确） | 不计契约破坏；生产由 K8s probe 使用 |
| `GET /readyz` | 运维 | readiness（DB + migrations） | 同上 |
| `GET /model-provider-presets` | G4 model-center（P2） | 内置 11 个供应商预设 | 待 arch 补 openapi |
| `POST /model-providers/{id}/test` | P2 | 连通性测试（200 `{ok,...}`，失败不 5xx） | 待 arch 补 openapi |
| `POST /model-providers/{id}/sync` | P2 | 拉取模型列表 | 待 arch 补 openapi |
| `POST /model-providers/{id}/activate` | P2 | 设为组织默认 provider（唯一 active） | 待 arch 补 openapi |
| `GET /model-config/preview` | P2 | 生成 opencode 配置预览（apiKey 掩码） | 待 arch 补 openapi |
| `POST /mcp-servers/{id}/submit-review` | v3 MCP | 提交审批 | 待 ADR/openapi 1.1 |
| `POST /mcp-servers/{id}/deprecate` | v3 MCP | 弃用（禁新绑定） | 待 ADR/openapi 1.1 |
| `POST /mcp-servers/{id}/offline` | v3 MCP | 下线（吊销绑定/凭证） | 待 ADR/openapi 1.1 |
| `GET/POST /mcp-servers/{id}/versions` | v3 MCP | 不可变版本 | 待 ADR/openapi 1.1 |
| `POST /mcp-servers/{id}/rollback` | v3 MCP | 切 stable 版本 | 待 ADR/openapi 1.1 |
| `GET/PUT /mcp-servers/{id}/tool-policy` | v3 MCP | 工具级 allow/deny（destructive 默认 deny） | 待 ADR/openapi 1.1 |
| `GET /mcp-call-logs` | v3 MCP | MCP 调用审计查询 | 待 ADR/openapi 1.1 |

> `GET /api/v1/auth/csrf` 已由 **ADR-017** 纳入契约 1.1.0（`getCsrfToken`），不再 allowlist。
> `PATCH/DELETE /api/v1/model-providers/{providerId}` 已在 openapi 中，G4 已实现（不再列 G-10）。
> 契约测试 `CONTRACT-01` 对上表显式 allowlist；其余已实现公开路由必须 ⊆ openapi。

## 1.1 模型中心实现偏差（G4 model-center，已知）

| # | 偏差 | 原因/影响 | 后续 |
| --- | --- | --- | --- |
| M-01 | DB `kind` 对 deepseek/qwen/kimi/glm/ollama/vllm 归一化为 `custom`，原值存 `preset_id` | SQLite 无法在保留 FK 数据下修改 CHECK；API/配置用 `effectiveKind` 还原 | 迁 PG 时扩 CHECK（G5） |
| M-02 | 历史 `LiteLLM Gateway` provider 无 `api_key_cipher`，不写入 opencode 配置 | 保证不下发明文/空 Key；仅新 provider（含 seed 企业 Mock）参与 | G5 补凭证或下线 |
| M-03 | seed 默认企业 Mock provider 仅在"无任何加密凭证 provider"时创建（非严格"无 provider"） | 兼容已有 dev 库与旧 43 测试（保留 LiteLLM seed） | 生产 seed 改为环境显式配置 |
| M-04 | 供应商 `base_url` 未做 SSRF 私网阻断（仅 URL 校验） | owner/admin 可配置任意地址，`/test` 会发起 GET | G5 接 SECURITY §6.1 私网/元数据阻断 |
| M-05 | `OPENCODE_CONFIG_OUT` 在 Windows 默认 `.data/opencode.json`（Linux/容器默认 `/shared/opencode.json`） | 防止本机向盘根写 `/shared` | compose 已显式设 `/shared/opencode.json` |

## 2. 未实现（G5+，不阻塞 G4）

| # | 缺口 | 影响 | 计划 |
| --- | --- | --- | --- |
| G-01 | 真实 OIDC（code+PKCE、JWKS、登出、group→role） | 仅 dev-login | G5：控制面唯一 RP（ADR-004） |
| G-02 | 真实 LiteLLM `/key/*` + spend log | 虚拟 Key/用量为 mock（`litellm_keys` 落库、无对外调用） | G5：接 LiteLLM + 对账（ADR-013） |
| G-03 | K8s Provisioner 运行（`K8sProvisioner` 仅编译） | 工作区为 Mock 状态机 | G5/kind：接 Operator，`ws-<orgId>` |
| G-04 | PostgreSQL + RLS（当前 `bun:sqlite`，无 RLS/分区/多副本） | 租户隔离靠 repository `org_id` 过滤；单副本/≤200 工作区 | G5：PG 迁移 + RLS 全量越权测试（ADR-016 条件） |
| G-05 | Redis（会话/幂等/限流） | 会话 HMAC 无服务端吊销列表（logout 用内存 Set，多副本失效）；幂等仅表 | G5 |
| G-06 | ed25519 access-ticket | 当前 HMAC-HS256；claims 同构 | G5 换签名器 + JWKS（根路径） |
| G-07 | Redis/SSE 实时事件 | 当前仅 `GET /workspaces/{id}/events` 历史，无 SSE | G5 |
| G-08 | API Key 轮换（`POST /api-keys/{keyId}`） | 已实现创建/列表/吊销 | G5 |
| G-09 | 工作区 `retry`/`snapshots`/`restore`/destroy precheck | openapi 有、MVP 未实现 | G5（依赖 K8s/快照） |
| G-10 | `model-policies` DELETE（provider PATCH/DELETE 已实现） | openapi 有、MVP 未实现 | G5 |
| G-11 | 审计哈希链/OSS 锚定 | `audit_logs` append-only（应用层无 UPDATE/DELETE），无防篡改链 | G5（`audit_chain_heads`） |
| G-12 | 用量采集（LiteLLM 回调/拉取/对账） | `usage_records` 可写可查，无真实 ingest | G5 |
| G-13 | 多 org / teams / viewer 完整权限 | 单 personal org + owner；team 规则不匹配 | G5 |
| G-14 | CSRF 双提交完整浏览器流 | API 已强制 `X-CSRF-Token`；控制台需接 `/auth/csrf` | G4 联调（web-console） |

## 3. 环境降级

- 无 Docker / 无 K8s 集群：G4 以 Mock Provisioner + `tsc` 编译 K8s 实现作为证据；真实部署 G7。
- SQLite：`journal_mode=WAL`、`foreign_keys=ON`、`busy_timeout=5000`；**单副本**，禁止 HPA>1。
- 生产 secret：`SESSION_SECRET`/`APIKEY_PEPPER`/`TICKET_SECRET` 必须显式注入（`NODE_ENV=production` 时 dev-login 禁用）。
