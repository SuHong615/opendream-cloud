# 模型中心 测试计划（MODEL-CENTER-TEST-PLAN）

- 关联：shared task `task-21`（M-04 QA 质量门禁）；上游 `task-18`（model-backend）、`task-19`（web-console `/models`）、`task-20`
- 状态：**阶段 1（计划 + 脚手架 + 门禁模板）**；执行待 task-18/19 依赖完成
- 环境：本地 Docker 栈 `http://localhost:3000`（console）/ `http://localhost:4000`（control-plane，dev-login）；**API 测试不依赖 Docker**（独立实例 + 临时 DB + 内嵌 mock OpenAI 兼容服务）
- 证据目录：`docs/05-delivery/evidence/model-center/`
- 门禁记录：`docs/04-reviews/G-MODEL-gate.md`

---

## 0. 被测范围

1. 后端（task-18）：`/model-provider-presets`、`/model-providers`（GET/POST/PATCH/DELETE）、`/model-providers/:id/test|sync|activate`、`/model-config/preview`、opencode 配置生成与 `OPENCODE_CONFIG_OUT` 写入、`api_key_cipher` AES-256-GCM 只存密文 / 列表仅 `api_key_masked`。
2. 前端（task-19）：`/models` CC Switch 风格卡片 + 抽屉；`data-testid`：`models-page`、`provider-card`、`provider-add`、`provider-form`、`provider-name`、`provider-kind`、`provider-base-url`、`provider-api-key`、`provider-preset`、`provider-test`、`provider-save`、`provider-activate`、`provider-edit`、`provider-delete`、`provider-models`、`model-row`、`toast`。
3. 回归：control-plane 43 单测、四中心 40 测试、console `next build` 12 路由、控制面 17/17 smoke。

---

## 1. 功能矩阵（API）

| ID | 场景 | 步骤 | 期望 |
| --- | --- | --- | --- |
| F-01 | 预设列表 | GET `/model-provider-presets` | 200；≥10 项（openai/azure/anthropic/google/deepseek/qwen/kimi/glm/ollama/vllm/openai-compatible）；每项 {id,name,kind,base_url,default_models,docs_url} |
| F-02 | 创建（预设） | POST `/model-providers`（preset=deepseek + api_key） | 201/200；返回 id；列表可见；`api_key_masked` 形如 `sk-****abcd`；**响应无明文** |
| F-03 | 创建（自定义） | kind=openai_compatible + base_url + models[] | 201/200；models 落库；`models_count` 正确 |
| F-04 | 创建（重复名） | 同名 POST 两次 | 4xx（409/400）且文案明确；不产生重复 provider（契约待确认，当前按 409 断言并注明） |
| F-05 | 修改 | PATCH（name/base_url/api_key 空=不改/models/default_model/enabled） | 200；api_key 省略/空串不改原密文；models 替换；`api_key_masked` 稳定 |
| F-06 | 删除 | DELETE（无引用） | 204；列表移除；后续 GET 404 |
| F-07 | 测试连通（成功） | POST `:id/test`（mock 返回 /v1/models） | 200 `{ok:true,latency_ms,models[],request_id}`；health=healthy；models upsert；`last_check_at` 更新 |
| F-08 | 测试连通（失败 401） | mock 返回 401 | **200** `{ok:false,error_code,message}`（非 5xx）；health=unhealthy |
| F-09 | 测试连通（超时） | mock 延迟 > `MODEL_PROVIDER_TEST_TIMEOUT_MS`(默认 10s) | 200 `{ok:false,error_code=timeout}`；health=unhealthy |
| F-10 | 测试连通（网络错误） | base_url 指向关闭端口/不可解析域名 | 200 `{ok:false,error_code}`；health=unhealthy |
| F-11 | 同步模型 | POST `:id/sync` | 200；models 更新；`models_synced_at` 更新 |
| F-12 | 激活默认 | POST `:id/activate`（A→B） | 200；**org 内唯一 is_active**；A 自动失效；默认模型策略更新 |
| F-13 | 配置预览 | GET `/model-config/preview` | 200；含 `$schema`、`model=<providerKey>/<modelId>`、`providers.<key>.settings.baseURL`；**apiKey 为掩码**（lead 口径：preview 用 `redactSecrets`，真实 key 只在写入的 `OPENCODE_CONFIG_OUT` 文件中）；响应体不得出现任何明文 key（出现即 P0） |
| F-14 | 配置写入 | 变更后 | `OPENCODE_CONFIG_OUT` 原子写入成功；内容与 preview 一致；失败不阻塞主请求（日志） |
| F-15 | 种子 | 空库启动 | 存在「企业模型（Mock）」provider（`http://mock-model:9100/v1`，models 2 个，is_active=1） |

## 2. 安全矩阵

| ID | 场景 | 期望 |
| --- | --- | --- |
| S-01 | 列表/详情不回显明文 | 响应体不含 `sk-mock-key` / 提交的明文；仅 `api_key_masked`；DB 中 `api_key_cipher` 非明文 |
| S-02 | 未登录 | 全部端点 401 `unauthorized` |
| S-03 | member 只读 | GET 200；POST/PATCH/DELETE/test/activate/sync → **403**（owner/admin 才可改）。**测试实现**：dev-login 会话的 org 固定为个人 org，故测试用 `signCookie` **注入"admin org 内 member 角色"的签名会话**（DB 先插 membership）；跨租户另用"另一 org 的 owner 访问本 org provider → 404"覆盖 |
| S-04 | 跨 org | B 访问 A 的 provider（GET/PATCH/DELETE/test）→ **404**（D19，不泄露存在性） |
| S-05 | 预设注入 | `preset_id` 非法/伪造 base_url → 4xx 或忽略；不得 SSRF 内网（127.0.0.1 可配置但需 admin；`169.254.169.254` 等拒绝，契约待补） |
| S-06 | CSRF | 写操作缺 `x-csrf-token` → 403 |
| S-07 | api_key 回填 | 编辑抽屉只显示 masked；提交空串不覆盖原 key |
| S-08 | 错误信息 | 失败原因不含内部堆栈/密钥；request_id 存在 |

## 3. UI 矩阵（`/models`，Playwright chrome）

| ID | 场景 | 期望（testid） |
| --- | --- | --- |
| U-01 | 登录→/models | `models-page` 可见；空态或 provider 卡片；无 demo banner（真实 API） |
| U-02 | 添加供应商 | `provider-add` → 抽屉 `provider-form`；预设 `provider-preset` 选择后自动带出 kind/base_url |
| U-03 | 表单校验 | 必填缺失/非法 URL → 内联错误；`provider-save` 禁用或提交后 `toast` 明确 |
| U-04 | 测试连通 | `provider-test` → 成功 toast + 模型列表；失败 toast 含 error_code 与可操作文案 |
| U-05 | 保存/卡片 | 保存后新 `provider-card` 出现，显示名称/kind/baseURL/models_count/health |
| U-06 | 设为默认 | `provider-activate` → 该卡片显示"默认"徽标且全局唯一 |
| U-07 | 编辑 | `provider-edit` → 抽屉预填（api_key 仅 masked，不回填明文）；保存后卡片更新 |
| U-08 | 删除 | `provider-delete` → 二次确认 → 卡片消失；默认项删除后默认态明确 |
| U-09 | 模型列表 | `provider-models`/`model-row` 展示同步模型；空时态 |
| U-10 | 错误态 | API 500/网络断开 → `error-state` + 重试；不白屏 |
| U-11 | 只读（member） | 只读角色无保存/删除按钮或 disabled；无越权调用 |
| U-12 | 键盘/焦点 | Tab 顺序合理；抽屉焦点陷阱；Esc 关闭；焦点返回触发按钮 |
| U-13 | 对比度/可访问性 | axe 无 critical/serious；默认徽标不只靠颜色（图标+文本） |
| U-14 | 移动端（375px） | 卡片堆叠、抽屉全屏可用、按钮不溢出 |

## 4. 回归矩阵

| 范围 | 命令 | 门槛 |
| --- | --- | --- |
| control-plane 单测 | `cd apps/control-plane && bun test` | 43+ 全绿（新增不破坏） |
| 四中心 | `bun test services/skill-center services/eval-center services/app-center services/mcp-hub` | 40 全绿 |
| 控制台构建 | `bun run --cwd apps/console build` | 12+ 路由通过 |
| 契约 | `bun test apps/control-plane/test/contract.test.ts` | 不破坏冻结契约（新增端点按 KNOWN_GAPS/P2） |
| API 冒烟 | `bun scripts/smoke-api.ts http://127.0.0.1:4000` | 17/17（不回归） |

## 5. 环境与数据

- API 测试：独立 control-plane 实例（随机端口，`PORT=0` listen 后取端口）+ 临时 DB（mkdtemp）+ 内嵌 mock OpenAI（Bun.serve，支持 success/401/timeout 三种模式）；`MODEL_PROVIDER_TEST_TIMEOUT_MS=300`；`OPENCODE_CONFIG_OUT=<tmp>/opencode.json`；**不依赖 Docker**。
- E2E：`E2E_BASE_URL=http://localhost:3000`、`E2E_READY=1`、Playwright `channel: "chrome"`（本机无 Playwright Chromium）；登录用 `login-email`/`login-submit`；测试数据：`qa-model-<ts>@example.com`，结束清理 provider（保留证据）。
- 双租户：API 测试内建 A/B（B 为 A org 的 member；C 为独立 org 用于跨 org 404）。

## 6. 缺陷分级与门禁

| 级别 | 定义 | 例 |
| --- | --- | --- |
| P0 | 安全/数据/核心不可用 | 明文密钥回显/落日志；跨 org 可改；未授权可写；配置生成泄露密钥；服务 5xx 崩溃 |
| P1 | 核心功能失败/严重错误 | test 失败返回 5xx；默认唯一失效；配置写失败导致工作区不可用；member 可写 |
| P2 | 一般功能/体验 | 重复名未提示；超时文案不明确；编辑回填明文；移动端溢出 |
| P3 | 轻微 | 文案/间距/排序 |

**门禁判定**：P0/P1 清零才 PASS；P2 需 owner+排期；P3 backlog；证据逐项附日志/截图；未执行项记 `NOT-RUN` 并 lead 豁免。

## 7. 执行顺序（依赖完成后）

1. `bun test tests/model-center/api.spec.ts`（先在本地独立实例）
2. 起 Docker 栈（console 3000 / control-plane 4000）→ `E2E_READY=1 bunx playwright test -c tests/e2e/model-center.spec.ts`
3. 回归 §4
4. 汇总 → `docs/04-reviews/G-MODEL-gate.md` + 证据归档 `evidence/model-center/`

---

## 8. 执行结果（2026-11-08，stack ready）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| API（`bun test tests/model-center`） | **9 pass / 0 fail / 63 expect** | `evidence/model-center/api.log` |
| UI E2E（Playwright chrome） | **6 passed / 0 failed**（MODEL-001 修复后复跑，含 U-12 Esc） | `evidence/model-center/e2e-final.log`、截图 `01..05-*.png` |
| 回归 | control-plane **54 pass**、四中心 **40 pass**、console `next build` 通过（`/models` 10.6kB） | `evidence/model-center/regression.log` |
| 门禁结论 | **PASS-WITH-ACTIONS**（P0=0 / P1=0；P2=1 MODEL-001） | `docs/04-reviews/G-MODEL-gate.md` |

已知缺陷：**MODEL-001（P2，owner web-console）**——provider 抽屉不支持 Esc 关闭且缺 `role=dialog`/`aria-modal`/焦点陷阱；修复后删除 E2E 的 expected-fail 并重跑 6/6。
DEGRADED：仅 mock-model（真实供应商/密钥用户环境补验）；axe 自动化未装（手测覆盖，U-12 除外）。
