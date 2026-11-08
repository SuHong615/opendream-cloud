# G-MODEL 模型中心 门禁记录

- 日期：2026-11-08（最终，MODEL-001 复跑通过）
- 关联：shared task `task-21`（M-04 QA 质量门禁）；上游 `task-18`（model-backend）、`task-19`（web-console `/models`）、`task-20`
- 主持（Owner）：`qa-reviewer`（qa-gate）
- 评审人：`model-backend`、`web-console`、`lead`
- 被评交付物：
  - 后端：`apps/control-plane/src/routes/models.ts`、`src/services/{model-presets,opencode-config,secret-box}.ts`、`db/migrations/0002_model_center.sql`
  - 前端：`apps/console/app/models/page.tsx`（CC Switch 卡片 + 抽屉，含 Esc/dialog/焦点陷阱修复）
  - 测试：`tests/model-center/api.spec.ts`（9 用例）、`tests/e2e/model-center.spec.ts`（6 用例）、`docs/05-delivery/MODEL-CENTER-TEST-PLAN.md`
- 证据：`docs/05-delivery/evidence/model-center/`
  - `api.log`（9/9）、`e2e-final.log`（**6/6**）、`regression.log`（54+40+build）、截图 `01..05-*.png`
- 前置：G4 PASS-WITH-ACTIONS（签署）；模型中心为 G4 后增量功能
- 结论：**PASS**
  - **P0 = 0 / P1 = 0 / P2 open = 0**（MODEL-001 已修复并复跑）；P3 = 1（MODEL-002 backlog）
  - 后端 API **9/9**、UI E2E **6/6**（含 U-12 Esc）、回归 **54/54 + 40/40 + console build**
  - DEGRADED/NOT-RUN：真实第三方模型未接（仅 mock-model）；axe 自动化/375px 未入 CI

---

## 1. 缺陷分级（P0/P1 清零才 PASS）

| 级别 | 定义 |
| --- | --- |
| **P0** | 密钥明文回显/落日志/进 preview；跨 org 读写；未登录/未授权可写；5xx 崩溃；配置泄露密钥 |
| **P1** | test 失败返回 5xx；activate 不唯一；配置写失败；member 可写；删除后仍可访问 |
| **P2** | 重复名未提示；超时文案不明确；编辑回填明文；移动端溢出；a11y（键盘/焦点/语义） |
| **P3** | 文案/间距/排序 |

---

## 2. 检查项与证据

| # | 检查项 | 命令/用例 | 证据 | 结论 |
| --- | --- | --- | --- | --- |
| 1 | 功能（预设/CRUD/加密/测试/默认唯一/配置生成） | `bun test tests/model-center` → **9 pass / 0 fail / 63 expect** | `api.log` | ✅ |
| 2 | 安全（401/403/跨 org 404/密钥不回显/CSRF） | 未登录 401；member 403（签名会话注入 admin org）；跨 org owner 404；列表/preview 无明文、apiKey 掩码；CSRF 缺失 403 | `api.log` | ✅ |
| 3 | UI（卡片/抽屉/空态/编辑/删除/默认徽标/错误态） | `E2E_READY=1 E2E_BASE_URL=http://localhost:3000 PLAYWRIGHT_CHANNEL=chrome bunx playwright test -c tests/e2e --grep "模型中心"` → **6 passed (9.0s)** | `e2e-final.log`、`01..05-*.png` | ✅ |
| 4 | 错误态（401/超时/网络错误/测试失败） | test 失败（401/超时/网络）→ **200 `{ok:false}` + unhealthy**（非 5xx） | `api.log` | ✅ |
| 5 | 配置 preview/写盘（apiKey 掩码；真实 key 仅在写入文件） | preview 含 `$schema`/`model`/`settings.baseURL`，**无明文**、apiKey 掩码；`OPENCODE_CONFIG_OUT` 写入（异步提示） | `api.log` | ✅ |
| 6 | 回归 | control-plane **54 pass**；四中心 **40 pass**；console `next build` 通过（`/models` 10.6kB） | `regression.log` | ✅ |
| 7 | 可访问性（键盘/焦点/对比度） | U-12 **Esc 关闭通过**；代码已有 `role="dialog"`/`aria-modal`/焦点陷阱/焦点恢复（`models/page.tsx:159-212`） | `e2e-final.log` + 代码审查 | ✅ |

---

## 3. 问题清单

| ID | 级别 | 模块 | 位置 | 问题 | Owner | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| **MODEL-001** | P2 | console | `apps/console/app/models/page.tsx`（provider 抽屉） | 原：抽屉不支持 Esc、缺 `role=dialog`/`aria-modal`/焦点陷阱/焦点恢复 | web-console | **closed**（已修复：Escape/onKeyDown、dialog 语义、焦点陷阱/恢复；U-12 复跑通过，`models/page.tsx:159-212`） |
| MODEL-002 | P3 | 测试覆盖 | — | axe 自动化未安装；375px 移动端未入 CI | qa-reviewer | open（backlog） |

**P0 open = 0 / P1 open = 0 / P2 open = 0。**

---

## 4. DEGRADED / NOT-RUN

| 项 | 原因 | 处理 |
| --- | --- | --- |
| 真实第三方模型供应商 | 仅 mock-model（`http://mock-model:9100/v1`，3 模型） | **DEGRADED**：真实 key/供应商、限流/配额/计费由用户环境验证 |
| axe 自动化 | 未安装 `@axe-core/playwright` | **NOT-RUN** → 手测 + MODEL-002 backlog |
| 移动端 375px | 未入自动化 | **NOT-RUN** → 手测/后续补 |

---

## 5. 结论与行动项

- **结论：PASS**（P0/P1/P2 = 0；核心 API/UI/安全/回归全绿；MODEL-001 已修复复跑）
- 行动项：
  | ID | 行动 | Owner | 截止 | 验证 |
  | --- | --- | --- | --- | --- |
  | ~~A-MODEL-1~~ | ~~修 MODEL-001（Esc/dialog/焦点）~~ | web-console | ✅ 已完成 | E2E 6/6 通过（`e2e-final.log`） |
  | A-MODEL-2 | 真实供应商连通/密钥轮换在用户环境验证 | model-backend + 用户 | 环境可用后 | 真实 key test + 列表掩码 |
  | A-MODEL-3 | 引入 axe 自动化 + 375px 用例（P3 backlog） | qa-reviewer | 下轮 | CI 报告 |
- 签署：qa-reviewer `qa-reviewer` 2026-11-08 —— 判定 **PASS**；lead `lead` 2026-11-08 —— 同意 PASS，P3 与 DEGRADED 项保留为后续（A-MODEL-2/A-MODEL-3）。

## 6. 修订记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-07 | 阶段 1 模板 | qa-reviewer |
| v0.2 | 2026-11-08 | 首次执行：api 9/9、e2e 5 通过 + U-12 expected-fail；MODEL-001 登记；PASS-WITH-ACTIONS | qa-reviewer |
| v0.3 | 2026-11-08 | MODEL-001 修复后复跑：**E2E 6/6**；缺陷 closed；结论升级 **PASS**；补 DEGRADED（真实供应商/axe/375px） | qa-reviewer |
