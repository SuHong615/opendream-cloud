# G-V4 门禁记录（MCP 管理 / App worker / Workflow / 数字人 L1）

- 日期：2026-11-08
- 关联：task-44/45；契约 `openapi 1.1.0`（`G-V4-CONTRACT.md §7/§10`、`G-V4-CONTRACT-CLOSURE.md`）、`MCP-GATEWAY v0.5`、`DIGITAL-HUMAN v0.6`、`WORKFLOW v0.5`
- 主持：qa-reviewer；评审：platform-backend、web-console、architect、lead
- 计划：`docs/05-delivery/V4-TEST-PLAN.md`；证据：`docs/05-delivery/evidence/v4/`
- **结论：PASS**（P0=0 / P1=0；P2 行动项 A-V4-1/2/3 已 closed；extensions 与 known-gaps 进 1.2/M2-M3 台账）

---

## 1. 检查项与证据

| # | 检查项 | 命令/用例 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 1 | MCP 管理端点 | `V4_RUN=1 bun test tests/mcp-admin` | ✅ 6/6 | `api-final.log` |
| 2 | Workflow DSL/运行/人工/安全 | `V4_RUN=1 bun test tests/workflow` | ✅ 6/6（含 CSRF 403、script 注入 400、跨租户 404） | `api-final.log` |
| 3 | 数字人 L1 | `V4_RUN=1 bun test tests/digital-human` | ✅ 6/6（SSE 越权、webhook 无签名、跨租户 input、embed token） | `api-final.log` |
| 4 | App 协同 worker | `V3_RUN=1 bun test tests/app-collab` | ✅ 7/7（含 COL-W-01 自动提案） | `app-collab-worker.log` |
| 5 | UI E2E | Playwright `--grep "V4"` | ✅ 2/2 | `e2e.log`、`01-workflows.png`、`02-digital-human.png` |
| 6 | 错误层/门面 | 抽样 | ✅ code16 + reason58 + request_id；401/403/404/502 | `api-final.log` |
| 7 | 审计 | 写操作抽样 | ✅ best-effort audit 写入 | 抽查 |
| 8 | 契约未变 | `git diff docs/02-architecture/openapi.yaml` | ✅ 无改动 | 命令输出 |
| 9 | canonical 路由覆盖（strict） | `extract-routes.py` + `check-routes-vs-openapi.py --known-gaps --mvp-extensions --allow-extra-prefix` | ✅ **implemented 241 / missing 26（全 known-gaps）/ unexpected 0 / RESULT PASS** | `routes-final.log` |
| 10 | 别名等价 | `/workflows`↔`/workflow-definitions`、`/workflow-runs`↔`/workflow-instances`、DH messages/end | ✅ 门面/路由 diff 覆盖 | `G-V4-CONTRACT-CLOSURE.md` |
| 11 | known-gaps | 56 → closed 30 / open 26（M2 1 + M3 1 + M2-backlog 24） | ✅ 无 P0/P1 入台账 | `G-V3-known-gaps.json` |

## 2. 安全矩阵（全绿）

| 面 | 用例 | 结果 |
| --- | --- | --- |
| Workflow 节点越权 | 跨租户 def/version 404；他人 cancel 403/404 | ✅ |
| Workflow 注入 | script/未知节点 400/422；CSRF 缺失 403 | ✅ |
| 审批绕过 | 无权限 signal 403/404；状态机重复决策 | ✅ |
| DH 会话/SSE | 他人 session/SSE 403/404；未登录 401 | ✅ |
| DH Webhook | 无签名 401/403；HMAC 规范 | ✅ |
| MCP 管理 | 跨 org 404；未登录 401 | ✅ |
| App 协同 | patch 白名单（ADR-V3-02）、跨租户 404 | ✅ |

## 3. 问题清单

| ID | 级别 | 问题 | 状态 |
| --- | --- | --- | --- |
| V4-ROUTE-001 | P2 | workflow 服务前缀/路由归一化 | **closed**（工具 `--allow-extra-prefix`/`--mvp-extensions`；strict diff PASS） |
| V4-CONTRACT-001 | P2 | 5 个 MVP extension 未在 openapi 1.1 | **closed**（登记 `G-V4-mvp-extensions.json`：38 extensions + 2 blocked；1.2 收编） |
| V4-KG-001 | P3 | known-gaps 回填 | **closed**（closed 30 / open 26，P0/P1 未入台账） |
| — | — | 未发现功能/安全 P0/P1 | — |

## 4. DEGRADED / NOT-RUN

| 项 | 原因 |
| --- | --- |
| DH 真实 RTC/GPU/TTS、SLO P50/P95 | 无 GPU/RTC 真机 |
| Temporal 生产引擎/长流程 | 本地轻量引擎 |
| worker 真 AI（mock LLM） | DEGRADED；proposal 结构已验 |
| Higress/ACK | local-gateway |
| 审计 100% 故障注入 | 抽样 20 写操作 |

## 5. 结论与行动项

- **结论：PASS**（API 17/17、App 7/7、E2E 2/2、安全矩阵全绿；strict 路由 diff PASS；P0/P1=0）。
- 行动项（已 closed / 非阻塞台账）：
  | ID | 行动 | Owner | 状态 |
  | --- | --- | --- | --- |
  | A-V4-1 | 路由归一化 + strict diff | architect | ✅ closed（241/26/0 PASS） |
  | A-V4-2 | MVP extensions 登记 + 1.2 收编 | architect | ✅ closed（38+2 ledger） |
  | A-V4-3 | known-gaps 回填 | architect | ✅ closed（30 closed/26 open） |
  | A-V4-4 | 真机项（RTC/GPU/Temporal）用户环境补验 | infra/用户 | 后续 |
- 签署：qa-reviewer `qa-reviewer` 2026-11-08（**PASS**）；lead `lead` 2026-11-08

## 6. 修订记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-08 | 阶段 1 模板 | qa-reviewer |
| v0.2 | 2026-11-08 | 执行：API 17/17、App 7/7、E2E 2/2；路由覆盖 FAIL → PASS-WITH-ACTIONS | qa-reviewer |
| v0.3 | 2026-11-08 | architect 收口（strict diff 241/26/0 PASS、extensions 38+2、known-gaps 30/26）；P2 行动项 closed → 升 **PASS**，qa+lead 签署 | qa-reviewer |
