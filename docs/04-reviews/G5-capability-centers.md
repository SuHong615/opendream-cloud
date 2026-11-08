# G5 能力中心 评审记录

- 日期：2026-11-04
- 主持（Owner）：`capability-centers`
- 评审人：`architect`、`platform-backend`、`qa-reviewer`（汇总/判定）
- 被评交付物：
  - 设计：`docs/02-architecture/centers/{SKILL-CENTER,EVAL-CENTER,APP-CENTER,MCP-HUB,CENTERS,ROUTES,CONTRACT-DIFF}.md`
  - 实现：`services/skill-center/`、`services/eval-center/`、`services/app-center/`、`services/mcp-hub/`（含各自 `contract.test.ts`）
- 证据：`docs/05-delivery/evidence/g5/{skill-center,eval-center,app-center,mcp-hub}-tests.log`
- 前置门禁：G2 = PASS-WITH-ACTIONS（契约 FROZEN：96 paths/131 ops/98 schemas）；G4 = PASS-WITH-ACTIONS（签署）
- 结论：**PASS-WITH-ACTIONS**
  - 四中心 **40/40 测试通过**（skill 13 / eval 8 / app 10 / mcp 9，qa 独立复跑）；
  - 契约 diff 由各服务 `contract.test.ts` 覆盖，且 `implemented-not-in-openapi = 0`（allowlist 除外）；
  - **真实 K8s 强隔离（gVisor/Kata）、LiteLLM、Builder/ACR 部署为 DEGRADED**（环境不具备，lead 已授权转 G6/G7 补验）；**不得以 mock 结果冒充真机**。

---

## 1. 检查项结论（REVIEW-GATES §4 G5 五项）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | Skill 发布→审核→安装→opencode 可用闭环 | ✅（逻辑/契约级） | `skill-center` **13/13 pass**（SKILL-01…05：状态机/审核/publish/install/分发 token→index.json→文件；`SKILL-05` 验证不泄露公开路由）；契约 `contract.test.ts` 覆盖冻结路径；真实 opencode 安装待 G6（需工作区） |
| 2 | 评测沙箱逃逸测试全部拦截；结果可复现 | ⚠️ **DEGRADED** | `eval-center` **8/8 pass**（EVAL 生命周期、gate、跨租户 404、cancel 409、9 态）；**无 K8s/gVisor → 真实逃逸用例未执行**（mock 不冒充），必须 G6 真机补；可复现口径（N=3/一致率/极差）已在逻辑层实现 |
| 3 | 应用创建→构建→1C2G 部署→分享→SSO 闭环 | ✅（逻辑/契约级）+ **DEGRADED（构建/部署真机）** | `app-center` **10/10 pass**（APP-CONTRACT-04 healthz/未知路由、builds/deployments/domains/shares/SSO 契约、1C2G 字段校验）；BuildKit/ACR/真实 Ingress 未执行 → G6/G7 补 |
| 4 | MCP 注册→绑定→调用→审计闭环；失效降级 | ✅（逻辑/契约级） | `mcp-hub` **9/9 pass**（MCP-05 凭证端点不回显密文 + OAuth state 校验；health/down 降级、绑定/调用/审计、stdio 白名单）；真实远程 MCP 待 G6 |
| 5 | 四中心权限模型与租户隔离测试通过 | ✅ | 各中心测试含跨租户 404/同租户 403；qa 独立复跑 40/40；`ROUTES.md` 75 ops 与冻结契约双向 0 差异（architect 独立验证） |

---

## 2. 关键证据

| 项 | 结果 | 证据 |
| --- | --- | --- |
| `cd services/skill-center && bun test` | **13 pass / 0 fail / 53 expect / 2 files** | `evidence/g5/skill-center-tests.log` |
| `cd services/eval-center && bun test` | **8 pass / 0 fail / 36 expect** | `evidence/g5/eval-center-tests.log` |
| `cd services/app-center && bun test` | **10 pass / 0 fail / 49 expect** | `evidence/g5/app-center-tests.log` |
| `cd services/mcp-hub && bun test` | **9 pass / 0 fail / 42 expect** | `evidence/g5/mcp-hub-tests.log` |
| 契约基线 | `centers/ROUTES.md` 75 ops；`ROUTES` opId 重复=0、not-in-openapi=0、mismatch=0；`x-p2-deferred` 8 项不进路由表 | `centers/ROUTES.md`、`centers/CONTRACT-DIFF.md` |
| 契约 diff | 各服务 `contract.test.ts`（冻结 openapi 为源） | 各服务 `test/contract.test.ts` |
| 错误码 | 两层模型：`409 precondition_failed + reason=gate_blocked`（无 412） | `centers/README.md` §2.2.1、`CENTERS` A2 |

---

## 3. DEGRADED 声明（lead 已授权转 G6/G7；不得冒充）

| 项 | 状态 | 声明/约束 |
| --- | --- | --- |
| 评测沙箱强隔离 + 逃逸拦截 | **DEGRADED** | 无 kind/gVisor/Kata；**mock Job 不能证明逃逸被拦截**。G6 必须在真实 K8s（kind 或 ACK runsc/Kata）执行 ≥10 条逃逸用例；未执行前 **G5 不得以"逃逸 100% 拦截"作为已达成结论** |
| 应用构建/部署（BuildKit/ACR/Ingress/证书） | DEGRADED | 无 Builder/ACR/真实 Ingress；构建产物、1C2G Deployment、证书签发未真机验证 → G6/G7 |
| LiteLLM 真实网关 | DEGRADED | 评测/app 的模型调用以 mock/stub；真实网关限流/配额/计费待 G6 与 G7 |
| opencode 真实安装 Skill | DEGRADED | 需工作区实例；G6 E2E-SKILL 补 |

---

## 4. KNOWN_GAPS / 范围

| 项 | 说明 |
| --- | --- |
| `x-p2-deferred` 8 端点 | G5 不实现（无 ADR 升版不得实现）；仅记录于 `ROUTES.md`/`README §2.2.1` |
| `/internal/*` 29 处 | 不注册公开网关、不进 SDK（契约测试覆盖） |
| 真实沙箱/构建/网关 | 见 §3 DEGRADED，转 G6/G7 行动项 |

---

## 5. 缺陷

| ID | 级别 | 问题 | 状态 | 证据 |
| --- | --- | --- | --- | --- |
| — | — | qa 独立复跑未发现 P0/P1/P2 缺陷 | — | 40/40 logs |

**汇总：P0 open = 0 / P1 open = 0 / P2 open = 0（本门禁范围内）；DEGRADED 项不作为缺陷，而是环境缺口（§3）。**

---

## 6. 行动项（PASS-WITH-ACTIONS）

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-G5-1 | 真实 K8s 强隔离执行 ≥10 条沙箱逃逸用例；无强隔离记 DEGRADED 且不得宣称通过 | infra-devops + qa | G6 前 | kind/ACK runsc 逃逸套件输出；TEST-PLAN §6.3 |
| A-G5-2 | 评测结果可复现真机验证（N=3/一致率≥95%/极差≤5%，固定 image digest/dataset sha256） | capability-centers + qa | G6 前 | 重跑报告 + gate 判定 |
| A-G5-3 | 应用构建→1C2G 部署→分享→SSO 真机闭环（BuildKit/ACR/Ingress/证书） | capability-centers + infra | G7 前 | E2E-APP-01/04/06 证据 |
| A-G5-4 | MCP 远程调用→审计→失效降级真机（Hub 代理、凭证不出 Hub） | capability-centers + qa | G6 前 | E2E-MCP-01/04 + 抓包/日志断言 |
| A-G5-5 | Skill 安装到真实 opencode 工作区（路径令牌续签、≤2min） | capability-centers + qa | G6 前 | E2E-SKILL-02 |
| A-G5-6 | 补齐 20 个已排期公开端点的 openapi 契约（G5 冻结前剩余）；8 个 P2 走 ADR 决策 | architect + capability | G6 前 | openapi diff + `ROUTES` 复核 |

---

## 7. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：四中心 40/40 独立复跑通过；契约 diff 0 差异（allowlist 除外）；P0/P1 open=0；**沙箱/构建/网关按 DEGRADED 转 G6/G7**（lead 已授权），A-G5-1…6 跟踪。
- lead（放行）：____（日期）—— 请确认：① G5 DEGRADED 范围（沙箱/构建/LiteLLM/真实安装）；② A-G5-1…6；③ G6 前置（真实 K8s 可用性）由谁提供。

---

## 8. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：五项检查、40/40 证据、DEGRADED 声明、KNOWN_GAPS、A-G5-1…6、qa 判定 PASS-WITH-ACTIONS | qa-reviewer |

---

## 9. lead 签署（补录）

- lead：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。
  - 确认 DEGRADED 范围：评测沙箱（无 K8s/gVisor，逃逸未真机）、应用构建/部署（无 BuildKit/ACR/Ingress）、LiteLLM 真实网关、Skill 安装到真实工作区；**不得以 mock 结果宣称真机 PASS**。
  - 确认 A-G5-1…6 台账，由 G6/G7 跟踪；P0/P1 open = 0。
  - 允许进入 G6（质量与安全）门禁；真实 K8s 由用户环境提供后补验。
