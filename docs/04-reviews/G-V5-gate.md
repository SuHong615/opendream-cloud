# G-V5 门禁记录（评测 / 记忆 / 可观测 / 组织）

- 日期：2026-11-08（阶段执行）
- 关联：task-52；契约 `G-V5-CONTRACT.md` + `ARCH-V3 §26` + `G-V5-mvp-extensions.json`（architect interim diff）
- 主持：qa-reviewer；评审：platform-backend、web-console、architect、lead
- 计划：`docs/05-delivery/V5-TEST-PLAN.md`；证据：`docs/05-delivery/evidence/v5/`
- **结论：PASS（2026-11-08）**：P0=0 / P1=0；API **20/20**、UI E2E **4/4**、final strict diff **PASS**（268/21/0、known-gaps 35/21、extensions 70+2）；V5-A7 closed。

## 1. 检查项

| # | 检查项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | Eval evaluators/run/results/report | ✅ 5/5（eval-evaluators、run 状态机、跨租户、注入拒绝） | `api-run3.log` |
| 2 | Memory add/list/search/delete + 隔离/API key/注入 | ✅ 6/6（含超长 413/400、tenant/user 隔离、key 401） | `api-run3.log` |
| 3 | **Memory 双源一致性（V5-A7）** | ✅ **已修复**：`m5.ts` 纯代理 `MEMORY_URL:4107`；`MEM-CONSISTENCY-01` 通过（门面写→直连可见；DELETE→404 语义） | `api-run4.log` |
| 4 | Observability overview/timeseries/隔离 | ✅ 3/3 | `api-run3.log` |
| 5 | Org members/roles/quotas/跨租户/alias | ✅ 6/6（含 `/organizations/current*`） | `api-run3.log` |
| 6 | 安全矩阵 | ✅ 跨租户 404、CSRF 403、未登录 401、注入拒绝、key 无效 401 | `api-run3.log` |
| 7 | UI E2E（eval/memory/obs/org） | ✅ **4/4 PASS**（console 已重建；`/eval`、`/memory`、`/observability`、`/org`） | `e2e-final.log`、`e2e-*.png` |
| 8 | 契约 strict diff（final） | ✅ implemented **268** / missing **21**（known-gaps）/ unexpected **0** / PASS；known-gaps 35/21；extensions **70+2 blocked** | `G-V5-gate-rerun.log`、`G-V5-final-routes.json` |
| 9 | 路径口径 | ✅ eval-evaluators、memories*、organizations/current*、observability/* 已对齐（T7 别名不退化） | `V5-TEST-PLAN §8/§9` |
| 10 | 回归 | 待 M5 全落盘后跑（control-plane/eval-center/memory-service/console build） | 待 |

## 2. 问题清单

| ID | 级别 | 模块 | 位置 | 问题 | Owner | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| **V5-A7** | **P1** | control-plane | `apps/control-plane/src/routes/m5.ts` | 已修：纯代理 `MEMORY_URL:4107`（Bearer+`x-oc-org-id`、响应透传、审计 `memory.proxy.*`）；QA `MEM-CONSISTENCY-01` 通过，API **20/20** | platform-backend | **closed（运行时已验证）** |
| V5-UI-001 | P2 | console | `/eval`、`/memory`、`/observability`、`/org` | **closed**：页面已落盘，UI E2E 4/4 通过 | web-console | closed |
| V5-KG-001 | P3 | 契约 | known-gaps | 21 open（M2/M3/M2-backlog）待台账跟踪 | architect | open（非阻塞） |

## 3. DEGRADED / NOT-RUN

| 项 | 原因 |
| --- | --- |
| UI E2E（4 页） | console 页面未落盘（task-49） |
| 向量检索真模型 | 无向量库；memory 检索降级 |
| Prometheus/Grafana 真后端 | mock 指标 |
| SSO/IdP | dev-login |

## 4. 结论

- **结论：PASS**（P0/P1=0；API 20/20、UI 4/4、final strict diff PASS；V5-A7 closed）。
- 签署：qa-reviewer `qa-reviewer` 2026-11-08（**PASS**）；lead `lead` 2026-11-08

## 5. 修订记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-08 | 阶段 1 模板 + 计划/脚手架 | qa-reviewer |
| v0.2 | 2026-11-08 | 执行：API 19/20（V5-A7 双源 P1）、UI 4 skip、interim diff PASS → PASS-WITH-ACTIONS | qa-reviewer |
| v0.3 | 2026-11-08 | V5-A7 修复验证：API **20/20**、consistency 通过；final strict diff 268/21/0 PASS（70+2）；P0/P1=0；仅剩 UI task-49 | qa-reviewer |
| v0.4 | 2026-11-08 | console 重建后 UI E2E **4/4**；API 20/20；P0/P1=0 → 升 **PASS**，qa+lead 签署 | qa-reviewer |
