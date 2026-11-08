# G4 平台核心 · 准出证据（G4-EVIDENCE）

- 状态：**模板（待 task-12/14 可运行版本后填入）**
- Owner：`qa-reviewer`（task-15 / G4）
- 判定依据：`docs/05-delivery/TEST-PLAN.md` §9.1 G4 准出 + §9.4 门禁判定规则
- 前置：G1/G2/G3 已签署；G2 硬门槛 9/9 closed；契约 `x-contract-status: frozen`
- 证据产物：`docs/05-delivery/evidence/g4/<YYYYMMDD>-<runid>/`

---

## 1. 启动条件（先跑 #1/#2/#4/#7；满足后才开跑，不满足记 blocked）

| # | 条件 | 验证方式 | 状态 |
| --- | --- | --- | --- |
| C1 | task-12 控制面可启动（`GET /healthz` 200） | `bun run dev` 后 `curl -i :4000/healthz` | 待 |
| C2 | dev-login 可用（`POST /api/v1/auth/dev-login` → HttpOnly `oc_sess`） | curl + cookie jar | 待 |
| C3 | 工作区 Mock Provisioner 可 ensure/ready（9 态） | `POST /workspaces/me/ensure` → 轮询 `state=ready` | 待 |
| C4 | task-14 控制台可构建（`bun run build`）+ `/login` 可调 dev-login | `next build` + Playwright 手测 | 待 |
| C5 | E2E 环境变量就绪（`E2E_BASE_URL`、`E2E_KUBECONFIG`（若 kind）、`E2E_READY=1`） | `tests/e2e` 运行前检查 | 待 |
| C6 | 契约基线可读（openapi frozen，96/131/98） | 解析 yaml + 记录 sha256 | 待 |

> 首批启用（backend 落盘即跑）：**#1 E2E-AUTH-01、#2 E2E-AUTH-03、#4 E2E-WS-03、#7 E2E-MODEL-01/02**。
> #3/#5/#6/#8/#9/#10 视 task-13（operator/kind）与 task-14 进度启用；#6（隔离）至少需 kind。

---

## 2. 执行命令与原始输出

| 步骤 | 命令 | 退出码 | 原始输出位置 |
| --- | --- | --- | --- |
| 单测/集成 | `bun test apps/control-plane` | 待 | `evidence/g4/<run>/unit.log` |
| E2E #1/#2/#4/#7 | `npx playwright test -c tests/e2e -g "AUTH-01|AUTH-03|WS-03|MODEL-01"` | 待 | `e2e-report/` |
| E2E 全量 | `npx playwright test -c tests/e2e` | 待 | `e2e-report/` |
| 契约测试 | `bun test tests/contract` | 待 | `contract.log` |
| Manifest 校验 | `node scripts/validate-manifests.mjs` | 待 | `manifests.log` |
| 覆盖率 | `bun test --coverage` | 待 | `coverage/` |

### 2.1 静态契约 diff（不需服务器，先行 2026-11-04）

- 方法：解析 `apps/control-plane/src/app.ts` 的 `REGISTERED_ROUTES`（33 条）vs 冻结 `openapi.yaml` paths（96 条），占位符 `:id`→`{id}` 归一化。
- 结果：**routes-not-in-openapi = 4**

| # | 路由 | 归档处置 |
| --- | --- | --- |
| 1 | `POST /api/v1/auth/dev-login` | dev-only：openapi 加 `dev` tag 或契约测试 allowlist（生产不得暴露） |
| 2 | `GET /api/v1/auth/csrf` | **契约缺口（P2）**：控制台需要，须补 openapi 或说明替代方案 |
| 3 | `GET /healthz` | 基础设施探针：allowlist，文档注明（不计契约破坏） |
| 4 | `GET /readyz` | 基础设施探针：allowlist（同 #3） |

- 结论：G4 契约破坏项 **1（csrf 缺失，P2）** + 3 项待归档；处置：dev-login/healthz/readyz 走 **allowlist**，`/auth/csrf` 记 **KNOWN_GAPS(P2)**（lead 已确认口径）。动态 diff 待真实 server 可运行后补跑。
- 环境备注：`:4000/:3000` 仍为 **placeholder 503**（`scripts/dev.ts`）；C1 已在**隔离实例**通过（见 §2.2）。

### 2.2 Live probe（隔离实例，只读+写隔离 DB；2026-11-04 11:35）

- 方式：`PORT=4101 DATABASE_PATH=.data/qa-probe-20261104.sqlite SEED_DEV=true bun src/server.ts`（**不碰 backend 的 live 库**）；产物 `evidence/g4/20261104-113500/{probe-4101,api-flow-4101,api-level-4101}.log`。
- 结果：

| 检查 | 实测 | 判定 |
| --- | --- | --- |
| C1 `/healthz` `/readyz` | 200 `{status:ok,version:0.1.0-g4}` / 200 | ✅ |
| C2 dev-login | 200；`__Host-oc_session`（HttpOnly/Secure/Lax）+ `oc_csrf`；`/me` 200（org/role/permissions） | ✅ |
| C3 ensure | 202 → `state=ready`（mock 120ms）；`resources{4C8G}`、`storage{20Gi,retain:true}`、`stage`/`last_active_at` 字段存在 | ✅ |
| access-ticket | 200，`url=https://w-…/?__ticket=<JWT>`（与契约一致） | ✅（一次性需网关验证） |
| start（幂等） | 202 | ✅ |
| destroy | 202；`destroy_scheduled_at`=当前+5min（D17） | ✅ |
| destroy/cancel | 200，审计 `workspace.destroy.cancel` | ✅ |
| D19 跨租户 | 随机 workspace → 404 `not_found/workspace_not_found` + request_id | ✅ |
| 错误两层模型 | 401 `unauthorized/auth_session_expired`、404 `not_found`、400 `validation_failed`+details | ✅ |
| #2 API Key | 创建明文仅一次+warning；列表无明文；revoke 204；审计 `apikey.revoke` | ✅ |
| #7 模型目录 | `GET /models` 返回 registry（context_window/prices/capabilities） | ✅ |

- **新缺陷 BUG-CP-001（P3）**：dev-login 响应**重复 2 条相同 `Set-Cookie: __Host-oc_session`**（csrf 1 条）；浏览器按名去重通常无害，但影响测试断言/头部卫生。复现：`curl -D - -X POST /api/v1/auth/dev-login`。建议修 `lib/http.ts` 的 `appendCookie`（`reply.header` 数组语义）。
- **测试约束（非产品缺陷）**：`__Host-`+`Secure` Cookie 在 http/非 localhost 客户端（curl/PowerShell）不会自动回传 → **E2E 必须用 Playwright 浏览器 context（localhost）或手工 Cookie 头**（已写 `tests/e2e` 说明）。
- **待验证**：#4 WS-03（需 kind 真 Pod）、#1 浏览器 SSO（需 console+control-plane 同起）、策略下发 ≤30s（需 workspace-agent 推送）、ticket 一次性（需 gateway）。
- 附注：lead 所述 4001 `ensure 500` 在隔离实例**未复现**（202 正常），判断为修复前临时状态；以 clean DB 复跑为准。

### 2.3 Clean-DB 独立复跑（4001，2026-11-04 11:45）

- 命令：`bun scripts/smoke-api.ts http://127.0.0.1:4001`（backend 的 clean DB `.data/smoke.sqlite`）；输出 `evidence/g4/20261104-114500/smoke-api.log`。
- 结果：**17/17 PASS**：dev-login 200 → csrf_token → ensure 202 + workspace id → resources 4C8G → ready → PVC retain=true → access-ticket 200 + TTL 60s + `__ticket` → destroy 错误名 400 → destroy 202 + cooldown → cancel 200 + 恢复 ready → audit-logs 200（含 workspace/ensure/destroy 条目）。
- 单测：`cd apps/control-plane && bun test` → **43 pass / 0 fail / 115 expect / 7 files（3.70s）**，输出 `evidence/g4/20261104-114500/unit-test.log`。覆盖：auth/API Key/模型（MODEL-01…05）/工单（ticket 一次性/过期/aud 不匹配）/工作区 WS-01…WS-12（含 WS-11 `last_active_at`+`stage`=G2-WC-03、WS-12 409 `ws_quota_exceeded`=G2-WC-06）。
- 判定：**C1/C2/C3 + 工作区销毁闭环（API 级）PASS**；#2/#3/#7（API 级）PASS；#1 浏览器 SSO、#4 kind、#5 长连接、#8/#9/#10 待后续环境。

---

## 3. 核心 E2E 结果（10 条）

| # | 场景 | 结果 | 关键断言实测 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | E2E-AUTH-01 SSO/登出/续期 | 待 | 登录 p95≤3s；登出旧会话 401；强退全设备 ≤5s | trace |
| 2 | E2E-AUTH-03 API Key | 待 | 明文一次；HMAC；scope 403；吊销 ≤5s | DB 查询日志 |
| 3 | E2E-WS-01 主旅程 | 待 | 拉起→可交互 p95≤90s；退出无销毁；回归 hash 一致；销毁 5min 冷却 | 事件时间戳 + sha256 |
| 4 | E2E-WS-03 4C8G | 待 | requests=limits=4C8G；OOMKilled 可观测 | jsonpath + events |
| 5 | E2E-WS-09 域名/ticket/长连接 | 待 | ticket 一次性 302 去票；Basic 不可见；30min 连续性 | 响应头 + soak |
| 6 | E2E-ISO-01 + WS-10 隔离 | 待 | 跨租户 404/同租户 403；Pod 间不可达；PVC 不可挂载 | 矩阵报告 |
| 7 | E2E-MODEL-01/02 模型策略 | 待 | 生效 p95≤30s；未授权模型 403 | 时间戳 + 网关日志 |
| 8 | E2E-SKILL-01/02 | 待 | 评测门禁 409+gate_blocked；安装 ≤2min | opencode skill API |
| 9 | E2E-APP-01/04 | 待 | 1C2G；ACL ≤5s；未授权直链 403/404 | k8s + ACL 矩阵 |
| 10 | E2E-MCP-01/04 | 待 | 探活≤10s；绑定≤30s；审计 100% 脱敏 | Hub 审计 |

---

## 4. 覆盖率（对照 TEST-PLAN §9.2）

| 模块 | 目标 | 实测 | 结论 |
| --- | --- | --- | --- |
| control-plane auth/RBAC/API Key | ≥85% 行 / ≥80% 分支 | 待 | — |
| control-plane workspace 状态机 | ≥85% / ≥80% | 待 | — |
| control-plane model policy | ≥80% / ≥75% | 待 | — |
| shared 类型/错误码 | ≥80% | 待 | — |
| 整体核心模块 | ≥70% | 待 | — |

---

## 5. 安全与隔离（G4 子集）

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| SEC-AUTHZ-01 水平越权矩阵（MVP 资源：workspace/key/model-policy） | 待 | 矩阵报告 |
| SEC-BYPASS-01/02 直连绕过（kind 时） | 待 | 网络探测 |
| SEC-SECRET-01/02 日志/前端 bundle 无密钥 | 待 | 扫描输出 |
| D19 跨租户 404 / 同租户 403 | 待 | E2E #6 |

---

## 6. DEGRADED 项（必须逐条列，未列=隐瞒）

| 项 | 原因 | 补偿控制 | 批准人 |
| --- | --- | --- | --- |
| kind 单节点（若使用） | 无真实 ACK/云凭证 | 性能数字不作准出；隔离/状态机仍验证 | lead（PLAN A5 已批） |
| gVisor 真机未验证 | 本地内核不支持 runsc | 仅 G5/G7 前关闭；G4 不宣称沙箱 | lead |
| 无 Docker/无 K8s（如发生） | 环境限制 | 记 blocked + 由 lead 豁免；不得记 PASS | lead |
| 成本单价 | 假设值 | T7.1 价格 API 复核 | lead（已批 DEGRADED） |

---

## 7. KNOWN_GAPS（仅 `missing` / `blocked`；**P0 端点不得标 gap**）

| 端点/能力 | 状态 | 原因 | 计划 |
| --- | --- | --- | --- |
| `GET /api/v1/auth/csrf` | missing | 冻结契约未收录，但控制台需要 | 补 openapi（P2，architect+backend）或明确由会话 Cookie 替代；G4 前决断 |
| `POST /api/v1/auth/dev-login` | allowlist | dev-only，非生产契约 | openapi `dev` tag 或契约测试 allowlist（不阻塞） |
| `GET /healthz` / `GET /readyz` | allowlist | 基础设施探针 | 文档注明，不计契约破坏 |
| G5 四中心 75 ops / 8 个 `x-p2-deferred` | blocked | G5 实现期 | G5 按 `ROUTES.md` 复核；P2 8 项**不得实现**（无 ADR 升版即违规） |

> 规则（architect `G4-CONTRACT-REVIEW.md §2`）：`missing` = 契约有、MVP 不实现；`blocked` = 依赖外部条件。P0 端点缺一个即 G4 不通过。

---

## 8. 缺陷清单（P0–P3，open/closed）

> 规则：**P0/P1 必须 closed 才能 G4 PASS**；P2 需有 owner+排期；P3 进 backlog。
> 每个缺陷必须有 ID、证据（日志/截图/用例）、回归用例；无回归用例不得关闭（TEST-PLAN §3.8）。
> 缺陷编号：`BUG-<域>-<n>`（CP=control-plane、WS=工作区、CON=控制台、OPS=部署）。

| ID | 级别 | 模块 | 问题 | 状态 | 回归用例 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| BUG-CP-001 | P3 | control-plane | dev-login 响应重复 2 条相同 `Set-Cookie: __Host-oc_session`（csrf 1 条）；浏览器去重通常无害，但影响测试断言/头部卫生 | open | E2E-AUTH-01 增加头部断言（`set-cookie` 去重） | `evidence/g4/20261104-113500/api-flow-4101.log`；`curl -D -` |

**汇总**：P0 open=0 / P1 open=0 为 G4 准出条件之一。

---

## 9. G4 判定（qa 填写）

| 条件（TEST-PLAN §9.1） | 实测 | 通过 |
| --- | --- | --- |
| 核心 E2E（AUTH/WS/MODEL/ISO）全绿 | 待 | — |
| control-plane 核心模块覆盖 ≥70% | 待 | — |
| 0 open P0/P1 | 待 | — |
| 越权矩阵 0 成功 | 待 | — |
| 安全扫描无 Critical/High（MVP 子集） | 待 | — |
| **结论** | — | **待判定** |

---

## 10. 变更记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 建立模板：启动条件 C1–C6、命令、10 E2E、覆盖率、DEGRADED、KNOWN_GAPS、判定表 | qa-reviewer |
| v0.2 | 2026-11-04 | lead 同意补"缺陷清单（P0–P3 open/closed）"章节（新 §8，含 P0/P1 关闭门槛与回归用例规则）；判定表顺延为 §9 | qa-reviewer |
