# G4 平台核心 评审记录

- 日期：2026-11-04
- 主持（Owner）：`platform-backend`
- 评审人：`architect`、`infra-devops`、`qa-reviewer`（汇总/判定）
- 被评交付物：`apps/control-plane/`（认证/模型中心/工作区编排/审计/用量）、`apps/console/`（登录/工作区/四中心占位）、`services/workspace-operator/`（Go）、`deploy/` 制品、`tests/`（单测 + API E2E + 越权矩阵）
- 证据：`docs/05-delivery/G4-EVIDENCE.md` + `docs/05-delivery/evidence/g4/20261104-114500/`（smoke-api/unit-test/coverage/authz-matrix）、控制台 `apps/console/scripts/evidence/*.png`
- 前置门禁：G1 = PASS-WITH-ACTIONS（签署）；G2 = PASS-WITH-ACTIONS（签署，硬门槛 9/9 closed，契约 FROZEN）；G3 = PASS-WITH-ACTIONS（签署）
- 结论：**PASS-WITH-ACTIONS**（P0/P1 open = 0；DEGRADED 与 G5/G7 台账项见 §3/§6）

---

## 1. 检查项结论（REVIEW-GATES §4 G4 六项）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | SSO 登录、会话、登出、越权测试通过 | ✅（API 级 + 真实浏览器） | dev-login 200/会话 Cookie/`/me` 200/未认证 401（`unit-test.log`、`smoke-api.log`）；越权矩阵 **9/9 PASS**（跨租户 404、B 列表/审计不泄露 A）；控制台真实浏览器 **13/13 PASS**（lead 执行：登录→列表→详情→ticket→销毁冷却→取消；截图 `apps/console/scripts/evidence/`）；qa 的 Playwright #1 复跑因 console dev 当前未监听待重启（行动项 A-G4-4，非缺陷） |
| 2 | API Key 生命周期与审计通过 | ✅ | 单测 + qa 实测：明文仅一次+warning、DB 仅 HMAC、scope、revoke 204、审计 `apikey.revoke`、吊销后 401（`api-level-4101.log`） |
| 3 | 模型策略下发 ≤30s、未授权模型不可调用 | ⚠️ 部分（转行动项） | 模型注册表/策略 CRUD/preview API 通过（`MODEL-01…05` 单测）；**策略→工作区 ≤30s 与未授权网关调用需 workspace-agent + LiteLLM 链路，G4 环境不具备**（无 kind/网关）→ A-G4-2 |
| 4 | 工作区创建/就绪/销毁 E2E 通过，隔离测试通过 | ✅（4C8G Pod 维度 DEGRADED） | `smoke-api` **17/17 PASS**（ensure 202→4C8G 字段→ready→PVC retain→ticket 60s→destroy 冷却→cancel→audit）；单测 WS-01…WS-12 **43/43**；越权矩阵 9/9；**#4 真实 Pod requests=limits/OOM 未验证（见 §3 DEGRADED）** |
| 5 | 用量采集准确率 ≥99%（抽样对账） | ⚠️ 部分（转行动项） | `/api/v1/usage` 200 + 单测；与 LiteLLM spend log 对账需网关与真实调用 → A-G4-3 |
| 6 | 控制台 MVP 主流程可用 | ✅ | `next build` 12 路由通过；真实浏览器 smoke **13/13**；登录后无 `demo-banner`（真实 API）；空态/错误态/加载态单测与实测 |

---

## 2. 关键证据（可复现）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| `cd apps/control-plane && bun test` | 43 pass / 0 fail / 115 expect / 7 files | `evidence/g4/20261104-114500/unit-test.log` |
| `bun test --coverage` | 函数 **86.99%** / 行 **88.82%**（All files） | `coverage.log` |
| `bun scripts/smoke-api.ts http://127.0.0.1:4001` | **17/17 PASS** | `smoke-api.log` |
| `bun tests/security/authz-matrix.ts` | **9/9 PASS**（401/404/列表/审计隔离） | `authz-matrix.log` |
| 控制台真实浏览器（Chrome CDP） | **13/13 PASS** | `apps/console/scripts/evidence/01..06-*.png` |
| operator | `go build ./...` + `go test ./...` 通过（GOROOT=`D:\Go`；controller 5 测试） | operator README/CI 记录 |
| deploy 制品 | kind manifests/Helm/Dockerfile + `scripts/validate-manifests.mjs` 静态校验（修中） | DEPLOYMENT §13；A-G4-5 |
| 契约 | `implemented-not-in-openapi = 0`（33 注册 = 29 ∈ openapi + 4 allowlist） | `apps/control-plane/KNOWN_GAPS.md` §1 |

---

## 3. DEGRADED 声明（lead 已豁免；不得冒充）

| 项 | 状态 | 声明/约束 |
| --- | --- | --- |
| **#4 4C8G Pod（requests=limits / OOMKilled）** | **DEGRADED** | 环境无 Docker/kind，**mock provisioner 只返回资源字段，不能证明真实 Pod 的 requests=limits=4C8G、OOMKilled 可观测**。**不得以 mock 结果冒充 Pod 级验证**；该项必须由 G6/G7 在真实 K8s（kind 或 ACK）补验 |
| **#5 长连接（SSE/WS 30min 可见连续性）** | 未执行 | 待 workspace-gateway 与工作区实例；G6 前补 |
| **#6 隔离** | 部分替代 | kind 不可用 → 以 **API 级越权矩阵（9/9）+ 真实登录态（无 DEMO banner）** 替代；Pod 间网络/PVC 挂载越权待真实 K8s |
| **#7 策略下发 / 未授权网关调用** | 未执行 | 依赖 workspace-agent + LiteLLM；G5 前补 |

> lead 豁免记录：2026-11-04 明确批准 #4 DEGRADED（无 Docker/kind），要求报告写明"mock 不能证明 4C8G Pod"——本文照此执行。

---

## 4. KNOWN_GAPS（仅 `missing` / `blocked`；P0 端点不得 gap）

| 项 | 状态 | 原因/计划 |
| --- | --- | --- |
| `GET /api/v1/auth/csrf` | missing（P2） | 控制台需要；建议 architect 补 openapi（返回 `{csrf_token}`），G4 不阻塞 |
| `POST /api/v1/auth/dev-login` | allowlist | dev-only（`ALLOW_DEV_LOGIN=1 && NODE_ENV!=production`；生产 403），不进 SDK |
| `GET /healthz` / `GET /readyz` | allowlist | 运维探针，不计契约破坏 |
| G5 四中心 75 ops / 8 个 `x-p2-deferred` | blocked | G5 实现期按冻结契约；P2 8 项不得实现（无 ADR 升版即违规） |

---

## 5. 缺陷

| ID | 级别 | 问题 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| BUG-CP-001 | P3 | dev-login 重复 2 条 `Set-Cookie: __Host-oc_session` | **closed**（backend 修：response-local cookie jar + `onSend` 一次性 flush；实测 2 条不重复） | `api-flow-4101.log`（修复前复现）；backend 证据（修后 getSetCookie=2） |

**汇总：P0 open = 0 / P1 open = 0 / P2 open = 1（csrf 契约缺口，不阻塞 G4）/ P3 open = 0。**

---

## 6. 行动项（PASS-WITH-ACTIONS）

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-G4-1 | 真实 K8s 验证 4C8G Pod（requests=limits、OOMKilled）+ Pod 间/PVC 越权 | infra-devops | G6 前（kind 可用即做） | `kubectl jsonpath` + 网络/PVC 越权用例；G4-EVIDENCE 更新 DEGRADED→PASS |
| A-G4-2 | 策略下发 ≤30s + 未授权模型网关 403（workspace-agent+LiteLLM） | platform-backend + infra | G5 前 | 时间戳差 ≤30s；网关 403 `model_not_authorized` |
| A-G4-3 | 用量对账（LiteLLM spend log vs usage_records，≥99%） | platform-backend | G5/G6 前 | 对账脚本输出 |
| A-G4-4 | Playwright 浏览器 #1/#3 复跑（系统 Chrome `channel:"chrome"`；console 重启后） | qa-reviewer | console 可用后 24h | `playwright-report` + trace；结论并入 G4-EVIDENCE |
| A-G4-5 | deploy 制品静态校验收尾（kind manifests/Helm/Dockerfile + validate-manifests） | infra-devops | G7 前 | `node scripts/validate-manifests.mjs` 通过 |
| A-G4-6 | `GET /auth/csrf` 契约决策（补 openapi 或明确替代） | architect + backend | G5 契约冻结后首轮 | openapi diff + KNOWN_GAPS 清零 |
| A-G4-7 | #5 长连接（SSE/WS 30min） | qa + infra | G6 前 | soak 日志（重连≤2s，SSE 断开不计失败） |

---

## 7. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：G4 六项中 4 项通过、2 项部分（A-G4-2/A-G4-3 属 G5 链路，非 G4 代码缺陷）；P0/P1 open=0；43/43 单测、覆盖率 86.99%/88.82%、smoke-api 17/17、越权矩阵 9/9、控制台真实浏览器 13/13、operator build/test 通过；#4 4C8G Pod 按 lead 豁免记 **DEGRADED（mock 不冒充 Pod）**；BUG-CP-001 已 closed。
- lead（放行）：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。确认：① #4 4C8G Pod 记 **DEGRADED**（无 Docker/kind；**mock 结果不得冒充 Pod 级验证**），A-G4-1 由 G6/G7 补验；② A-G4-1…7 全部接受并按台账跟踪；③ BUG-CP-001（P3）已 closed，复跑 `smoke-api` 17/17 覆盖该路径；④ KNOWN_GAPS 合理（csrf P2、dev-login/healthz/readyz allowlist、G5 blocked），P0 端点无 gap；⑤ 允许进入 G5 能力中心门禁。

---

## 8. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：六项检查、证据表、DEGRADED 声明、KNOWN_GAPS、缺陷 closed、A-G4-1…7、qa 判定 PASS-WITH-ACTIONS | qa-reviewer |
