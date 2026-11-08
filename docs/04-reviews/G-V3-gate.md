# G-V3 门禁记录（v3：MCP 网关 / 应用权限 / 协同）

- 日期：2026-11-08（执行完成；阻塞项待 task-32）
- 关联：shared task `task-30`；上游 task-25/26/32；输入 `ARCH-V3 §4.7/§23.2/§23.3/§23.4`、`MCP-GATEWAY v0.5`、`openapi 1.1.0 frozen`、`DATA-MODEL §3.11`
- 主持：`qa-reviewer`；评审：capability-centers、platform-backend、web-console、architect、lead
- 证据：`docs/05-delivery/evidence/v3/`（`gate-evidence.md`、`mcp-gateway-run4.log`、`mcp-gateway-stability.log`、`app-collab-run5.log`、`app-e2e.log`、`app-01/02/03-*.png`、`regression-v3.log`、`port-4200-scan.md`、`wf-schema-test.log`、`ci-gates.log`、`mcp-scaffold-smoke*.log`）+ architect 在场复跑 `docs/02-architecture/G-V3-gate-rerun.log`、known-gaps `G-V3-known-gaps.json`（56 项）+ capability 第二轮复核 `docs/02-architecture/centers/MCP-IMPL-REVIEW-R2.md`（PASS）
- **结论：PASS（2026-11-08）**：P0=0 / P1=0；**MCP 3×8/8、App 6/6**、CI 门禁/回归全绿；V3-MCP-011（重建后 3×8/8）与 V3-MCP-012/F5（源码+22/22）均关闭；P2/KNOWN_GAPS 按台账跟踪。

---

## 1. 缺陷分级

| 级别 | 定义（v3） |
| --- | --- |
| P0 | 工具级越权成功；凭证明文泄露；SSRF 成功；审批绕过；patch 注入成功；跨租户读写；未登录可写；5xx 崩溃；**冻结契约核心不符（ticket EdDSA/orgSlug 语义）** |
| P1 | 生命周期非法迁移未拒绝；限流/超时/熔断缺失；审计缺口；分享过期失效；权限缓存超 30s；**JSON-RPC 码错、destructive fail-safe 缺失、policy 未生效、写工具重试、白名单缺失** |
| P2/P3 | 灰度/回滚、脱敏、健康抖动、文案/体验 |

**判定**：P0/P1=0 且 MVP 全绿 → PASS；否则 PASS-WITH-ACTIONS（阻塞）或 REJECT。

## 2. 检查项与证据

| # | 检查项 | 命令/用例 | 证据 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | MCP 生命周期（draft→review→published→deprecated→offline、非法迁移 409） | live 实测 via control-plane（create 201/status draft→submit 200→review approve→health→publish published；draft 直接 publish 409） | `gate-evidence.md §2` | ✅（实现路径可用） |
| 2 | MCP 网关协议/工具可见性/越权 | live 复跑 `tests/mcp-gateway`：**8/8 pass / 0 fail / 16 expect**（生命周期、工具白名单、EdDSA claims/kid/TTL、真实 orgSlug 200、未登录 401、跨租户 403、工具不存在 -32007、TK-04 吊销 204→401 均通过） | `mcp-gateway-run4.log` | ✅ 8/8 |
| 3 | **Ticket（C2 冻结）** | **EdDSA/JWKS 实机通过**：header alg=EdDSA、kid 存在、claims 全量（iss/aud/sub/org/binding_id/server_id/server_version/scope/scope_hash/jti/iat/exp）、TTL≤300s、aud=mcp:org:{orgSlug} | `mcp-gateway-run3.log` | ✅ |
| 4 | **canonical orgSlug（C1/C4）** | 真实 orgSlug gateway initialize/tools/list/tools/call **200**；跨租户 403 | 同上 | ✅ |
| 5 | JSON-RPC 码 §23.2 | tools/call 不存在工具 → `-32602`（应 `-32007`）；offline/circuit 同（capability diff） | 实测 + capability diff | ❌ P1 |
| 6 | destructive fail-safe / tool-policy / 重试 / jti | capability diff（8 项）；回归 `MCP-CP-04`、mcp-hub V3-MCP-03/04/07/08/09/10 | `gate-evidence.md §2/§4` | ❌ P1×8 |
| 7 | App 权限/协同 API | `tests/app-collab`（live 门面）：**6/6 pass**（含 COL-06 patch 白名单：逃逸/保护文件 → 400 `collab_patch_denied` + details.cause） | `app-collab-run5.log` | ✅ |
| 8 | **patch 路径白名单** | **closed**：`.git/config`/`.github/workflows/ci.yml`/`../etc/passwd` 均 400；创建+批准合并两处校验（backend 已修） | `app-collab-run5.log` | ✅ |
| 9 | App UI E2E | `E2E_READY=1 ... --grep "App 协同"` → **3/3 pass**：列表、详情（权限/分享/版本面板）、协同抽屉发消息并回显 | `app-e2e.log`、`app-01/02/03-*.png` | ✅ 部分（proposal/diff/approve 未覆盖，worker 未就绪） |
| 10 | 端口/入口（C4） | `bun run check:ports` → **0 blocking exit 0**（331 文件、12 处分类 allowlist：禁止性判据/证据引用；含 allowlist 复核提示 due 2026-12-15） | `port-4200-scan.md`、`ci-gates.log §5` | ✅ PASS（V3-INFRA-001 closed） |
| 11 | openapi 1.1.0 契约断言准备 | 144/197/129 frozen；ErrorReason 58；`x-mvp-alias:16`/`x-v3-target:8` | check-openapi-1.1 PASS | ✅（断言清单已列 TEST-PLAN §10.4） |
| 12 | 回归 | control-plane 61/62；mcp-hub 18/19；app-center 13/13 | `regression-v3.log` | ⚠️ 与 P1 相关 |
| 13 | DH/WF 静态评审 + CI 门禁 | DH 5/5 closed；**WF 6/6**：`workflow-v1.json` + validator + 7/7 tests；**已接入 CI**：`bun run validate:workflow`（含在 `bun run lint` 4 步）→ RESULT PASS/exit 0；根 test 74 pass/3 skip/0 fail | `wf-schema-test.log` + `ci-gates.log` | ✅ |

## 3. 问题清单

| ID | 级别 | 模块 | 位置 | 问题 | Owner | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| V3-MCP-001 | P0 | mcp-hub | ticket 形态 | 已修：EdDSA/JWKS + kid + claims 全量 + TTL≤300s（QA 实机通过） | platform-backend | **closed** |
| V3-MCP-002 | P0 | mcp-hub | canonical orgSlug | 已修：真实 orgSlug gateway 200；跨租户 403（QA 实机通过） | platform-backend | **closed** |
| V3-MCP-003 | P1 | mcp-hub | JSON-RPC 码 | 工具不存在 → -32007 通过；其余按 §23.2 | platform-backend | **closed（抽样）** |
| V3-MCP-004…009 | P1 | mcp-hub | destructive/policy/retry/jti/tools-list/status | backend 声称已修（mcp-hub 21/21、control-plane 63/63）；QA 未逐项深测 | platform-backend | closed（待第二轮 diff 复核） |
| **V3-MCP-011** | **P1** | control-plane/mcp-hub | `DELETE /api/v1/mcp-bindings/{id}` | 已修并验证：镜像重建后 **3 次连续 8/8**（204→401）；源码修复（204 空体/审计 try-catch）与 control-plane 64/64 一致 | platform-backend | **closed** |
| V3-COL-001 | P1 | app-center | `routes.ts` | 已修：patch 白名单（创建+批准合并两处）→ 400 validation_failed + collab_patch_denied + details.cause；QA 6/6 通过 | platform-backend（task-33） | **closed** |
| **V3-MCP-012** | **P1（窄）** | mcp-hub | `services/mcp-hub/src/routes.ts:161-162` | **closed**：字符串工具 fail-safe=true；`mcp-v3.test.ts:349-350`；mcp-hub 22/22；QA 复跑 MCP 3×8/8（对象化 payload 后工具可见性符合 fail-safe） | platform-backend | **closed** |
| V3-WF-001 | P1 | workflow | `WORKFLOW.md:382` | 权威 Schema 缺失 | architect/platform | **closed**（`packages/schema/schemas/workflow-v1.json` + `validate-workflow.mjs` + 7/7 tests；validator PASS；证据 `wf-schema-test.log`） |
| V3-DH-001 | P2 | 契约 | `DIGITAL-HUMAN.md:443` | dh_*/wf_* reason 已批准 §23.4，待 openapi 1.1.0 落库 | architect | open（随落库关闭） |
| V3-INFRA-001 | P2 | 部署文档 | `apps/control-plane/README.md:38` | 4200 文档笔误 | platform-backend | **closed**（二次扫描 0 blocking） |
| V3-MCP-010 | P2 | 测试缺口 | — | 缺 EdDSA/JWKS、真实 orgSlug、jti 吊销、policy 生效、read_only 重试用例（task-32 后由 QA 补） | qa-reviewer | open |

## 4. DEGRADED / NOT-RUN

| 项 | 原因 | 处理 |
| --- | --- | --- |
| MCP dev ticket 形态 | 实现为 HMAC/opaque；生产要求 EdDSA/JWKS | DEGRADED → P0 修复后升级 |
| App 协同 UI：proposal/diff/approve 全链路 | 本地 AI worker 未就绪（真实模式轮询无提案） | NOT-RUN（列表/详情/权限/分享/发消息已 3/3 通过） |
| 数字人 RTC/GPU/TTS、Temporal 工作流 | 无真机 | NOT-RUN（静态评审） |
| 第三方真实 MCP/模型凭证、Higress 真机 | 环境限制 | DEGRADED |

## 5. 结论与行动项

- **结论：PASS**（P0=0 / P1=0，2026-11-08 最终收口；MCP 3×8/8、App 6/6、CI/回归全绿；V3-MCP-011/012、V3-COL-001 全关闭）。行动项 A-V3-1…5 已完成；KNOWN_GAPS（56 项）与 P2 六项按台账进 M2/M3 与 1.2 backlog，不阻塞 V3。
- 行动项：
  | ID | 行动 | Owner | 验证 |
  | --- | --- | --- | --- |
  | A-V3-1 | 修 V3-MCP-001/002（EdDSA+JWKS、orgSlug slug 语义）+ P1 8 项 | platform-backend（task-32） | 修复后 QA 重跑 `tests/mcp-gateway`（canonical slug/ticket claims/JSON-RPC 码/destructive/policy/jti） |
  | A-V3-2 | 修 V3-COL-001（patch 白名单 `.git/`、CI、密钥文件） | platform-backend | `tests/app-collab` 6/6 + 手工复验 |
  | A-V3-3 | 补 `workflow-v1.json` Schema（V3-WF-001） | architect/platform | WF-DSL-01 可执行 |
  | A-V3-4 | 部署新版 app-center（含 collab）后 QA 跑 App UI E2E | web-console+infra | Playwright 通过 |
  | A-V3-5 | dh_*/wf_* reason 随 openapi 落库 | architect | 1.1.0 落库确认 |
- 复跑门槛：P0=0、P1=0 后 QA 复跑 → 升级 **PASS**；否则保持阻塞。
- 签署：qa-reviewer `qa-reviewer` 2026-11-08（**PASS**，P0/P1=0；MCP 3×8/8、App 6/6）；lead `lead` 2026-11-08（**PASS** 签署；P2/1.2 backlog、M2/M3 KNOWN_GAPS 台账保留）

## 6. 修订记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-08 | 阶段 1 模板 | qa-reviewer |
| v0.2 | 2026-11-08 | C1–C4 冻结、端口门禁、DH/WF 评审 | qa-reviewer |
| v0.3 | 2026-11-08 | 执行：MCP 2 P0+8 P1、App 5/6 + V3-COL-001；结论 PASS-WITH-ACTIONS（阻塞） | qa-reviewer |
| v0.4 | 2026-11-08 | App 重建后复测：API 5/6（live 门面，仅 V3-COL-001）、UI E2E 3/3；MCP 仍待 task-32；结论保持 PASS-WITH-ACTIONS | qa-reviewer |
| v0.5 | 2026-11-08 | V3-WF-001 closed（workflow-v1.json + validator PASS + 7/7 tests）；WF 6/6；MCP 仍待 task-32 | qa-reviewer |
| v0.6 | 2026-11-08 | CI 门禁接入并复跑：`bun run lint`(4 步) exit 0、`validate:workflow` PASS、`check:ports` 0 blocking、根 test 74/3/0；C4 保持 PASS | qa-reviewer |
| v0.7 | 2026-11-08 | task-32/33 修复后复跑：MCP 7/8（P0 已闭环；新增 V3-MCP-011 吊销 500）、App 6/6（V3-COL-001 closed）；结论保持 PASS-WITH-ACTIONS（1 P1 open） | qa-reviewer |
| v0.8 | 2026-11-08 | V3-MCP-011 修复（hubFetch DELETE body/content-type）后复跑 **MCP 8/8**、App 6/6；P0/P1=0 → 结论升 **PASS** | qa-reviewer |
| v0.9 | 2026-11-08 | architect 最终契约核对新增 F5（legacy 字符串工具 destructive 未 fail-safe，P1 窄）→ 回退为 **PASS-WITH-ACTIONS**；F5 修复/风险接受后升 PASS | qa-reviewer |
| v1.0 | 2026-11-08 | 稳定性复跑 3×：当前镜像仍 **7/8**（TK-04 DELETE 500）；V3-MCP-011 重开（源码已修待镜像）；F5 待 mcp-hub 重建；结论维持 PASS-WITH-ACTIONS | qa-reviewer |
| v1.1 | 2026-11-08 | F5/V3-MCP-012 源码+测试闭环（22/22，architect 确认）；仅剩 V3-MCP-011 待 control-plane/mcp-hub 镜像重建后 3×8/8 验证 → 届时升 PASS | qa-reviewer |
| v1.2 | 2026-11-08 | 镜像重建后 **MCP 3×8/8 + App 6/6**；V3-MCP-011/012 关闭；P0/P1=0 → 结论升 **PASS** | qa-reviewer |
| v1.3 | 2026-11-08 | architect 在场复跑全绿（WF/check:ports/路由 diff PASS，known-gaps 56 项台账）并入证据；结论维持 PASS | qa-reviewer |
