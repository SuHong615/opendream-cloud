# control-plane（G4 MVP）

OpenDream Cloud 控制面 MVP：Bun + Fastify 5 + Zod + Drizzle + `bun:sqlite`。
契约源：`docs/02-architecture/openapi.yaml`（v1.1.0，97 paths）；设计：`docs/02-architecture/services/BACKEND.md`。

## 启动

```bash
# 在仓库根
bun install

# 方式 A：直接启动（默认 :4000，DB 在 apps/control-plane/.data/control-plane.sqlite）
cd apps/control-plane
bun run start

# 方式 B：开发热重载
bun run dev

# 方式 C：根 dev（同时起 console，若 apps/console 存在）
bun run dev
```

环境变量（也可用根 `.env.example` 的别名）：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` / `CONTROL_PLANE_PORT` | `4000` | HTTP 端口 |
| `DATABASE_PATH` / `DATABASE_URL=file:...` | `.data/control-plane.sqlite` | SQLite 文件 |
| `SESSION_SECRET` / `SESSION_HMAC_SECRET`（G5 统一） | dev 值 | 会话 Cookie HMAC |
| `APIKEY_PEPPER` | dev 值 | `ock_` Key HMAC pepper |
| `TICKET_SECRET` | dev 值 | access-ticket HMAC（生产换 ed25519） |
| `ALLOW_DEV_LOGIN` | `1` | 生产必须 `0`（`NODE_ENV=production` 时强制校验） |
| `DESTROY_COOLDOWN_MIN` | `5` | 冷却期分钟（5–1440） |
| `MOCK_PROVISION_MS` | `120` | Mock Provisioner 状态推进步长 |
| `MODEL_SECRET_KEY` | 由 `SESSION_SECRET` 派生 | 供应商 API Key AES-256-GCM 加密密钥 |
| `MODEL_PROVIDER_TEST_TIMEOUT_MS` | `10000` | `/model-providers/:id/test` 拉取 `/models` 超时 |
| `OPENCODE_CONFIG_OUT` | Win `.data/opencode.json` / Linux `/shared/opencode.json` | 生成的 opencode 配置目标（compose 挂载到 workspace） |
| `MCP_HUB_URL` | `http://127.0.0.1:4104` | v3 MCP 数据面（registry/lifecycle 转发）；**4104 为唯一端口，历史端口值已作废，出现即测试失败** |
| `MCP_INTERNAL_TOKEN` | 无 | hub → control-plane `call-logs:batch` 共享 token |
| `SEED_DEV` | `1` | 幂等 seed 企业 Mock provider（`mock-model:9100`）+ 旧 LiteLLM + dev 策略 |

> ⚠️ 生产环境必须提供真实 secret；dev 默认值仅用于本机。

## 验证

```bash
bun test                 # 54 条（AUTH/KEY/MODEL/WS/TICKET/AUDIT/USAGE/CONTRACT/MODEL-CENTER）
bun run typecheck        # tsc --noEmit
curl -s localhost:4000/healthz
curl -s localhost:4000/readyz
```

## MVP 端点（与 openapi 对齐）

- 认证：`POST /api/v1/auth/dev-login`（dev-only）、`GET /api/v1/me`、`POST /api/v1/auth/logout`、`GET /api/v1/auth/csrf`（契约缺口，见 KNOWN_GAPS）
- API Key：`GET/POST /api/v1/api-keys`、`DELETE /api/v1/api-keys/{keyId}`
- 模型：`GET/POST /api/v1/model-providers`、`PATCH/DELETE /model-providers/{id}`、`GET /api/v1/models`、`GET /models/{modelId}`、`GET/POST /api/v1/model-policies`、`GET/PUT /model-policies/{policyId}`、`POST /model-policies/{policyId}/preview`
- **模型中心（企业/第三方）**：`GET /model-provider-presets`、`PATCH/DELETE /model-providers/{id}`、`POST /model-providers/{id}/test|sync|activate`、`GET /model-config/preview`；API Key AES-256-GCM 加密存储、仅回显 `api_key_masked`；配置原子写 `OPENCODE_CONFIG_OUT`（含 `disabled_providers:["opencode"]`）
- **MCP（v3）**：`GET/POST /mcp-servers`、`GET/PATCH/DELETE /mcp-servers/{id}`、`.../submit-review|review|publish|deprecate|offline|health-check|health|versions|rollback`、`GET/PUT .../tool-policy`、`/mcp-bindings*`、`GET /mcp-call-logs`；registry 转发 mcp-hub，tool policy/调用审计在控制面（`POST /internal/mcp/call-logs:batch`）
- 工作区：`POST /workspaces/me/ensure`、`GET /workspaces`、`GET /workspaces/{id}`、`PATCH`、`start|stop|destroy|destroy/cancel`、`access-ticket`、`events`
- 审计/用量/健康：`GET /audit-logs`、`GET /usage`、`GET /api/v1/health`、`/healthz`、`/readyz`

## 行为要点

- 会话 Cookie：`__Host-oc_session`（HMAC、HttpOnly/Secure/Lax）；CSRF：`oc_csrf` + `X-CSRF-Token`；API Key：`Authorization: Bearer ock_...`。
- 9 态工作区状态机；非法迁移 409；Mock 收敛 `provisioning→starting→ready`；**退出不销毁**。
- 显式销毁：`POST /destroy` 二次确认（`confirm_name` + `acknowledge_data_loss`）→ 5min 冷却可取消 → Mock 到 `deleted`。
- access-ticket：HMAC JWT 60s、`aud=workspace:<id>`、jti 一次性；测试可导入 `verifyAndConsumeWorkspaceTicket` 验证。
- 模型策略：deny 优先、subject 精确度（org<role<user）、`priority` 小者优先；member 列表过滤，admin 可管理。
- 审计：登录/Key/工作区/策略写审计；`detail` 不含明文 Key。
- 错误：统一 `{error:{code,reason?,message,request_id}}`；`code` 16 枚举、`reason` 23 枚举。

## 已知缺口

见 [KNOWN_GAPS.md](KNOWN_GAPS.md)。G4 不实现真实 OIDC/LiteLLM/K8s/Redis/RLS。
