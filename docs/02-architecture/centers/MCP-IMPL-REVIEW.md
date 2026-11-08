# MCP 实现复核清单（第二轮 · task-32 修复合规检查）

- 目的：对 platform-backend task-32 修复做**可复现的契约/安全复核**；第一轮结论见下（2026-11-08，PASS-WITH-ACTIONS）。
- 契约基线：`openapi.yaml` **1.1.0 frozen@1.1.0**（144 paths/197 ops/129 schemas）+ `centers/MCP-GATEWAY.md v0.5` + `ARCH-V3 §4.7/§23.2/§23.3` + `ADR-V3-01/05`。
- 复核对象：`services/mcp-hub/**`、`apps/control-plane/**`（只读复核；不改实现）。
- 判定：全部 P0 + P1 关闭 → **PASS**；任一 P0/P1 未关闭 → **PASS-WITH-ACTIONS / 不通过**。

## 1. 第一轮问题（修复验收项）

### P0
| ID | 验收标准 | 第一轮证据 | 复核方法 |
| --- | --- | --- | --- |
| MCP-IMPL-01 ticket = EdDSA/JWKS | 生产入口校验 Ed25519 JWT（JWKS/`kid`），claims 全量 `iss/aud=mcp:org:<orgSlug>/sub/org/ws/app/binding_id/server_id/server_version/scope[]/scope_hash/jti/iat/exp`；TTL 300s；非一次性；binding+jti denylist（本地≤30s/生产≤5s）；HMAC `mcp1.` 仅 dev 兼容 | `proxy.ts:19-36` 仅 HMAC；`routes.ts:84-86` opaque `mcpb_` | 代码 grep `ed25519|jwks|kid|denylist`；测试断言：合法 EdDSA 200、篡改 401、过期 401、跨租户 403、吊销后 401/404；**新增 ① 生产配置（`NODE_ENV=production`/dev-only 开关默认关）下 HMAC `mcp1.` 票据必须 401 且审计标注；② `kid` 轮换：新 JWKS 生效后新票可用、旧票 TTL 内仍可验（双 key 并行），过期/撤销后 401** |
| MCP-IMPL-02 orgSlug slug 语义 | URL `{orgSlug}` 不参与租户硬比较；租户以 binding+server.org_id 为准；真实 slug（如 `acme`）可用；跨租户 403/不可见 404 | `proxy.ts:253-255` 将 slug 与 org_id UUID 比较；测试用 `/v1/default` 绕过 | 用例 `POST /v1/acme/<slug>` 200；`/v1/other/<slug>` 403；不存在 server 404（不得再出现 `/v1/default` 作为唯一路径）；**新增：slug→org 解析缓存必须有失效机制（≤30s 或 pub/sub），组织改名/迁移后不长期 403；org admin 经 `{orgSlug}` 访问他 org server → 403 `tenant_mismatch`，未发布/不可见 server → 404 `server_not_found`（两者区分）** |

### P1
| ID | 验收标准 | 复核方法 |
| --- | --- | --- |
| P1-1 JSON-RPC 码 | 按 `ARCH §23.2`：offline→-32006、tool_not_found→-32007、circuit→-32005、upstream_timeout→-32003、upstream_error→-32004、rate_limited→-32002、tool_not_allowed→-32001、result_too_large→-32008、tenant_mismatch→-32009、version_conflict→-32010 | 逐错误注入断言 `error.code` 数字 + `data.reason` |
| P1-2 destructive fail-safe | `destructive` 缺失/未标注=按 true；默认 deny；org admin 显式 allow（tool-policy `require_explicit_allow`）+ 审批 + 审计；不能仅靠 `server.destructive_allowed` | 未标注工具不可见/不可调；显式 allow 后可见可调；审计含 `mcp.tool.policy.high_risk_allowed` |
| P1-3 tool-policy 网关生效 | Gateway 消费 tool-policy（allow/deny/constraints），`tools/list` 过滤与 `tools/call` 二次校验均考虑；策略变更 ≤30s 生效 | deny 工具不可见、调用 -32001；limits（rpm/timeout/cache）生效 |
| P1-4 重试安全 | 仅 `read_only=true` 可重试 1 次；写工具不重试 | 注入上游超时：只读重试 1 次；写工具只 1 次调用 |
| P1-5 jti denylist | `jti` 吊销表；吊销后 ≤30s（本地）/≤5s（生产）失效；跨租户三态 | 吊销 jti 后立即/窗口内 401；其他 jti 不受影响 |
| P1-6 tools/list 字段 | 返回 `McpTool`：`name/description/title?/input_schema?/input_schema_hash/read_only/destructive?/risk/annotations?` | 字段断言 + `read_only` 驱动重试/缓存 |
| P1-7 status 映射 | `McpServerStatus` 响应值符合 1.1（含 `review`/pending_review 映射），无非法枚举 | 各状态读取/迁移用例 |
| P1-8 测试覆盖 | 新增 EdDSA/真实 slug/denylist/tool-policy/重试/tools-list 字段测试；全绿 | `bun test`（mcp-hub、control-plane）；测试列表核对 |

## 2. 第二轮复核流程

1. **路由 diff**：实现公开路由 vs `openapi 1.1.0`（mcp-lifecycle + v2）；输出 `not-in-openapi` / `method-path-mismatch` / `P2-deferred`，要求 0/0/0（数据面 `/v1/*` 不在资源 API，单独按 MCP-GATEWAY §6.3 核对）。**逐项对 operationId/method/path（排除 `x-v3-target`）**；报告 **`x-mvp-alias` 命中数**（当前契约 16）。
2. **别名等价性**：`GET/PUT /tool-policy` ↔ `/tool-policies`、App 平铺 13 ops（`x-mvp-alias`）↔ `collab-sessions`（`x-v3-target`，MVP 不实现）——断言**别名存在且行为等价（同中间件栈）**；`x-v3-target` 缺失不算失败，但不得以未声明别名实现。
3. **契约断言**：沿用 qa `tests/mcp-gateway` + 本清单用例；错误码/枚举/字段按 1.1.0 frozen。
3. **安全复核**：ticket 形态/claims/JWKS/denylist、三态、SSRF、凭证不外泄、destructive 策略与审计。
4. **一致性**：本地 `local-gateway:8080/mcp/v1/{orgSlug}/{serverSlug}` → 剥 `/mcp` → `mcp-hub:4104/v1/...` 与直连等价。
5. **输出**：`实现路由 vs 冻结 1.1.0` diff（P0/P1/P2 表 + `file:line` + 测试命令 + raw 输出 + grep 证据）+ 结论；**P2 单列"不判失败"**；发 qa/architect/lead；通过后由 lead reassign task-25 收口。

## 3. 复核命令（示例）

> **QA gate 编号映射（G-V3，2026-11-08）**：`V3-MCP-001`=P0-01 ticket、`V3-MCP-002`=P0-02 orgSlug、`V3-MCP-003`=P1-1 JSON-RPC 码、`V3-MCP-004`=P1-2 destructive fail-safe、`V3-MCP-005`=P1-3 tool-policy 生效、`V3-MCP-006`=P1-4 read_only 重试、`V3-MCP-007`=P1-5 jti denylist、`V3-MCP-008`=P1-6 tools/list 字段、`V3-MCP-009`=P1-7 status 映射、`V3-MCP-010`=P1-8 测试覆盖。第二轮报告按此编号回填结论。

```bash
cd services/mcp-hub && bun test
cd apps/control-plane && bun test
# 路由与契约 diff（示例：从实现导出 route 表后与 openapi 1.1.0 比对）
node tools/check-openapi-1.1.py   # architect 提供
```

> 约束：冻结期只按当前 schema/枚举断言；1.2 backlog（McpCallLog 归属/状态、ETag/If-Match、McpChannel.weight 等）不作为本轮失败项。
