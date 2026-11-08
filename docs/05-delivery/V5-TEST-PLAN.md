# V5 测试计划（评测 / 记忆 / 可观测 / 组织）

- 版本：v0.1（阶段 1：计划 + 脚手架；实现回执后执行）
- 关联：task-52；契约 `openapi 1.1.0`（org/eval 已有）+ V5 增量（evaluators/memory/observability，待 1.2/CONTRACT-DIFF）
- 环境：本地 Docker（console:3000 / control-plane:4000 / eval-center / app-center:4103 / mcp-hub:4104）；V5 新服务端口待回执
- 证据：`docs/05-delivery/evidence/v5/`；门禁：`docs/04-reviews/G-V5-gate.md`
- 运行门控：`V5_RUN=1`（未就绪时 suite 干净 skip）

---

## 1. 评测（eval evaluators / run）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| EV-01 | evaluator 列表/创建 | GET/POST `/api/v1/evaluators`；内置评分器可见；创建校验（name/type/config） | P1 |
| EV-02 | evaluator 更新/删除 | PATCH/DELETE 权限 owner/admin；member 403；被 run 引用时删除 409 | P1 |
| EV-03 | 创建 run | POST `/api/v1/eval-runs`（dataset+version、evaluator_ids、model）；201 pending；幂等键 | P0 |
| EV-04 | 轮询/状态机 | pending→running→succeeded/failed/canceled；非法迁移拒绝；cancel 幂等 | P0 |
| EV-05 | results/report/baseline | GET results/report；报告含分数/样本；baseline 对比 | P1 |
| EV-06 | 跨租户 | 他人 dataset/run/evaluator → 404 | P0 |
| EV-07 | 注入/越权 | evaluator config 恶意脚本/命令 → 400/拒绝；script 沙箱 network none | P0 |
| EV-08 | 配额/限流 | 超配额 429 `*_quota_exceeded` | P2 |

## 2. 记忆（memory / experience）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| MEM-01 | add | POST `/api/v1/memory`（mem0 兼容 add）→ id；scope user/agent_space 隔离 | P0 |
| MEM-02 | list/search | GET list + search（语义/关键词）；只返回调用者 scope | P0 |
| MEM-03 | delete | DELETE 幂等；删除后 search 不含 | P0 |
| MEM-04 | 租户/用户隔离 | 跨 org/跨 user → 404/空；API key scope 不足 403 | P0 |
| MEM-05 | API key | `Authorization: Bearer ock_...`；无效/吊销 → 401；scope `memory:read/write` | P0 |
| MEM-06 | 注入 | memory 内容含 prompt/命令注入样本 → 存储转义、检索不执行；超长/非法 UTF-8 拒绝 | P1 |
| MEM-07 | experience | experience 检索/注入 Skill；权限与分页 | P2 |

## 3. 可观测（observability）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| OBS-01 | overview | GET `/api/v1/observability/overview`（range/since）；返回 QPS/错误率/延迟/用量 | P1 |
| OBS-02 | timeseries | GET timeseries（metric/step/range）；时间点升序、无空洞/NaN | P1 |
| OBS-03 | 参数校验 | 非法 range/step/metric → 400 两层错误；超大范围拒绝 | P2 |
| OBS-04 | 租户隔离 | 仅本 org 数据；跨 org 404；member 只读 | P0 |
| OBS-05 | 审计/成本 | 用量与 audit 一致（抽样）；无敏感信息泄露 | P1 |

## 4. 组织（org / members / quotas）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| ORG-01 | 成员列表 | GET `/api/v1/orgs/{id}/members`；owner/admin/member/viewer 角色 | P0 |
| ORG-02 | 邀请/添加 | POST members（email/role）；重复邀请 409；非法 role 400 | P1 |
| ORG-03 | 角色变更/移除 | PATCH role（仅 owner/admin）；不能移除最后一个 owner（409）；member 写 403 | P0 |
| ORG-04 | 配额 | GET/PUT `/api/v1/orgs/{id}/quotas`（workspaces/GPU/model tokens）；仅 owner/admin 可写；非法值 400 | P0 |
| ORG-05 | 跨租户 | 他人 org → 404（D19）；未登录 401；CSRF 缺失 403 | P0 |
| ORG-06 | UI | `/settings/org` 或 `/org`：成员表/角色/配额表单；testid 待回执 | P1 |

## 5. 安全矩阵（P0 重点）

- 跨租户：eval/memory/observability/org 全部 404（D19）。
- member 写：evaluator/run/memory/org 写操作 → 403（API 强制，非 UI 隐藏）。
- memory API key：无效/吊销 401；scope 越权 403；key 不落日志。
- 注入：eval config/DSL、memory 内容、observability 查询参数（SQL/表达式注入）→ 拒绝/转义。
- 审计：org 变更/配额/memory 删除/eval run 100% 审计（抽样）。

## 6. UI E2E

| ID | 页面 | testid（待回执） |
| --- | --- | --- |
| UI-EVAL | `/eval` 或 `/skills?tab=eval` | eval-page/eval-run/eval-result |
| UI-MEM | `/memory` | memory-page/memory-add/memory-search/memory-row |
| UI-OBS | `/observability` | obs-page/obs-range/obs-chart |
| UI-ORG | `/org` | org-page/member-row/member-role/org-quota |

## 7. 环境与门禁

- V5 服务端口/启动命令待回执；eval-center 可能复用 4101/4102（待确认）；memory/observability 新服务待定。
- 判定：P0/P1=0 → PASS；DEGRADED：向量检索真模型、GPU、真实指标后端（Prometheus 不可用则 mock）。
- 证据：`evidence/v5/{eval,memory,observability,org,e2e,regression}.log`。

---

## 8. V5 契约路径口径（architect `G-V5-CONTRACT.md` + `ARCH-V3 §26`，QA 断言依据）

| 域 | 路径 | 说明 |
| --- | --- | --- |
| eval | 门面 `/api/v1/eval-*` → eval-center(:4102)；`eval-datasets`/`eval-runs` 为 1.1.0 canonical；**新增 `eval-evaluators` 5 ops 为 MVP extension** | 评测 |
| memory/experience | 公开 `/api/v1/memories*`、`/api/v1/experiences*`（MVP extension）；**内部 mem0 `/v1/memories*` 不公开**（API Key + `x-oc-org-id`） | 记忆/经验 |
| observability | `GET /observability/overview`、`/timeseries`（MVP extension）；只读、viewer 可读、**1s 超时降级不 5xx** | 可观测 |
| org | `/api/v1/organizations/current*`（含 quotas）为 1.2 alias；canonical `/orgs/{orgId}` | 组织 |

**错误口径**：不新增 reason；成员/配额超限 **409 `precondition_failed` + `details.quota`**；越权 403、跨租户 404、memory key 无效 401、门面上游停 **502 `upstream_error`**。
**Baseline strict diff（M5 前）**：237 implemented / 25 known-gaps / 0 unexpected / PASS；known-gaps closed 31 / open 25。V5 落盘后要求：unexpected extras=0、M5 新端点命中 `G-V5-mvp-extensions.json`、canonical `/eval-*`/`/orgs*` 不退化（证据 `G-V5-gate-rerun.log` + `G-V5-final-routes.json`）。

---

## 9. M5 实现态与阶段执行（2026-11-08）

**最终契约（architect final）**：implemented **268** / missing **21（known-gaps 21 / unexpected 0）** / extra 92（extensions 72）/ **PASS**；known-gaps 56→closed **35**/open **21**；extensions **70+2 blocked**；4105/4106/**4107** health 200（memory-service 0.1.0-m5）。

**路径修正（已对齐测试）**：eval canonical `/api/v1/eval-evaluators*`（无 `/evaluators`）；memory 主 `/api/v1/memories*` + 别名 `/memory*`，内部 `/v1/memories*` 不公开；org `/organizations/current*` + `/organizations/{orgId}*` + canonical `/orgs/{orgId}*`；observability `/observability/*`。**`/api/v1/memory`、`/api/v1/evaluators` 断言 404**。

**阶段执行结果**：`V5_RUN=1 MEMORY_API_KEY=local-memory-key bun test tests/eval tests/memory tests/observability tests/org` → **20 pass / 0 fail**（V5-A7 修复后 consistency 通过；`evidence/v5/api-final.log`）。UI E2E 4 个 spec → **4/4 PASS**（console 已重建；`evidence/v5/e2e-final.log` + `e2e-*.png`）。

**V5-A7（已 closed）**：control-plane `m5.ts` 已改纯代理 `MEMORY_URL:4107`（Bearer `MEMORY_API_KEY` + `x-oc-org-id`、响应透传、审计 `memory.proxy.*`）；`MEM-CONSISTENCY-01` 通过（门面写→直连可见）。
