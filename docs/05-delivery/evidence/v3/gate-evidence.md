# G-V3 执行证据汇总（task-30，2026-11-08）

## 1. 契约/文档（architect/capability）
- `openapi 1.1.0` **frozen@1.1.0**：144 paths / 197 ops / 129 schemas；新增 65、删除 0；`python docs/02-architecture/tools/check-openapi-1.1.py` → **PASS**；`x-mvp-alias:16`、`x-v3-target:8`；`ErrorReason=58`。
- `MCP-GATEWAY v0.5` 已按 1.1.0 回改；`WORKFLOW v0.5`/`DIGITAL-HUMAN v0.6` 与 `ARCH §23.4`、`DATA-MODEL §3.11` 一致。
- C1–C4 收敛（ticket=EdDSA/JWKS+claims 全量、canonical=slug、JSON-RPC §23.2、端口 4104）。
- 端口门禁：`bun run check:ports` → **0 blocking（exit 0）**；C4 由 PASS-WITH-ACTIONS 升 **PASS**，V3-INFRA-001 closed。

## 2. MCP 实现复核（capability-centers diff + QA 实测）
`tests/mcp-gateway` 原以 mock 上游/进程内假设编写；与 live 栈（control-plane:4000 → mcp-hub; local-gateway:8080/mcp）对齐后实测：

```
# QA 实测（live）
orgSlug=u-f1ee796a；canonical /v1/u-f1ee796a/{slug} initialize
{"status":403,"body":{"error":{"code":"tenant_mismatch","message":"tenant_mismatch"}}}   ← P0：orgSlug 当 org_id 比较
binding token = mcpb_...（opaque），非 EdDSA/JWKS                                  ← P0：ticket 形态不符 C2
tools/call "nope" → 200 error.code=-32602（data.code=tool_not_found）              ← P1：应为 -32007（§23.2）
```

capability 复核（task-25 diff，已确认）：
- **P0：MCP-IMPL-01** ticket 非 EdDSA/JWKS、claims 缺 `iss/sub/server_id/server_version/scope[]/scope_hash`、无 `kid`/jti denylist（`proxy.ts:19-36`、`:7-17`、`routes.ts:84-86`）。
- **P0：MCP-IMPL-02** canonical `{orgSlug}` 被当 org_id 比较（`proxy.ts:253-255`）；真实 slug 403（QA 已复现）。
- P1×8：JSON-RPC 码（offline -32000 应 -32006、tool -32602 应 -32007、circuit -32004 应 -32005）；destructive fail-safe 缺失；tool-policy 未在网关生效；写工具重试不幂等；jti denylist 缺失；tools/list 字段不全；McpServerStatus 值漂移；关键契约测试缺口。
- 处理：task-32 交 platform-backend；修复后重跑 `tests/mcp-gateway` 再复核。

## 3. App 权限 + 协同 API（`tests/app-collab`，本地 app-center:4213 源构建）
- **5 pass / 1 fail**（`app-collab-run2.log`）：
  - ✅ 创建/读取；collab 会话（base_version=1）；消息；提案；approve→v2；并发过期 base_version→409；跨租户 404；分享 users scope 创建 201。
  - ❌ **V3-COL-001（P1）**：`patch 路径白名单` 未完整实现——`../etc/passwd` 被拒（400），但 **`.git/config`、`.github/workflows/ci.yml` 被接受（201）**（QA 实测），违反 ARCH §5.3「禁止 `.git/`、CI 配置、密钥文件」。owner platform-backend。
- 说明：live app-center:4103 为旧构建（无 collab 路由，404）；本地源构建 4213 用于验证，故记录 **DEGRADED**（部署版本待更新）。
- App UI E2E：**NOT-RUN**（live app-center 无 collab；console 走示例降级；web-console 自测 13/13 为开发方证据，非 QA 独立复现）。

## 4. 回归
| 套件 | 结果 | 备注 |
| --- | --- | --- |
| control-plane | **61/62** | fail：`MCP-CP-04 工具策略 destructive 默认 deny 口径`（与 P1 一致） |
| mcp-hub | **18/19**（另有不稳定项） | V3-MCP-03/04/07/08/09/10、MCP-03 与 P1 相关；与 destructive/alias/限流相关 |
| app-center | **13/13** | ✅ |
| console build | 未重跑（上轮通过；UI E2E NOT-RUN） | 待 web-console 部署后补 |

## 5. 结论
- **G-V3 = PASS-WITH-ACTIONS（阻塞）**：P0×2（MCP-IMPL-01/02）+ P1×9（MCP 8 + V3-COL-001）未清零；**不得发布/上线**，task-32 修复后由 QA 复跑并升级 PASS。
- C4 端口门禁 PASS；openapi/文档侧无未决项。
