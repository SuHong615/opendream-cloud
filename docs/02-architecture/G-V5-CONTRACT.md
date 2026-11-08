# G-V5 契约收口（评测 / 记忆 / 可观测 / 组织）

- 日期：2026-11-08；Owner：architect（task-51）；评审：qa-reviewer（V5 gate / task-52）、lead；路径对齐：platform-backend（task-46/48/50）、model-backend（task-47）、capability-centers（task-46 eval）
- 基线：`openapi.yaml 1.1.0`（`frozen@1.1.0`：144 paths / 197 ops / 129 schemas；`ErrorReason` 58）
- 关联：`G-V4-CONTRACT.md`/`G-V4-CONTRACT-CLOSURE.md`、`ARCH-V3 §23/§25/§26`、`agents` 台账 `G-V3-known-gaps.json`、`G-V5-mvp-extensions.json`
- 状态：**契约前置裁决 + baseline strict diff 通过；M5 实现（task-46/47/48/49/50）进行中**。落盘后按 §7 复跑 strict diff 并回填 known-gaps，再交 QA V5。

---

## 1. 范围与原则

1. 契约唯一源 = `openapi.yaml 1.1.0`（不改）；M5 新增能力按 **MVP extension** 登记（`G-V5-mvp-extensions.json`），1.2 统一收编（`x-mvp-alias` 或正式新增）。
2. 公开面只经 control-plane 门面；`memory-service` 的 mem0 兼容 `/v1/memories*` 视为**数据面内部接口**（API Key + `x-oc-org-id`，不注册公开契约），由门面转换为 `/api/v1/memories*`。
3. 错误两层模型：`error.code`∈16、`error.reason`∈1.1.0 `ErrorReason` 58；**M5 不新增 reason**（1.2 再议）；需要表达配额/成员上限时用 `precondition_failed`/`conflict` + `details.quota`。
4. 租户与 RBAC：跨租户 404、同租户越权 403；org 写操作 owner/admin，observability viewer 可读，eval/memory 按现有 RBAC。

---

## 2. 路径裁决矩阵（与 backend 对齐口径）

### 2.1 评测（eval，task-46）

| 能力 | 公开路径（control-plane 门面） | 上游 | 契约归属 |
| --- | --- | --- | --- |
| 数据集/运行/结果/报告/基线 | `/api/v1/eval-datasets*`、`/eval-runs*`、`/eval-runs/{id}/results|report|baselines|cancel` | `eval-center:4102`（`EVAL_CENTER_URL`） | **1.1.0 canonical（已存在）** |
| 评估器（evaluators） | `GET/POST /api/v1/eval-evaluators`、`GET/PATCH/DELETE /api/v1/eval-evaluators/{id}` | eval-center | **MVP extension（1.2 新增）** |
| `eval-runs` 支持 `evaluator_ids[]` | 同上路径，body 扩展 | eval-center | 1.1.0 `EvalRunCreate` 兼容扩展（新增可选字段，1.2 补 schema） |

门面规则：`/api/v1/eval-*` 前缀代理 → `EVAL_CENTER_URL`；session+CSRF（写）+审计+上游停 502 `upstream_error`（与 workflow-dh 门面同口径）。

### 2.2 记忆/经验（memory/experience，task-47）

| 能力 | 公开路径（门面） | 上游 memory-service（内部） | 契约归属 |
| --- | --- | --- | --- |
| Memory CRUD/搜索 | `GET/POST /api/v1/memories`、`DELETE /api/v1/memories/{id}`、`POST /api/v1/memories/search` | `POST/GET /v1/memories`、`/v1/memories/search`、`DELETE /v1/memories/{id}`（mem0 兼容，:4107） | **MVP extension（1.2）** |
| Experience 库 | `GET/POST /api/v1/experiences`、`GET /api/v1/experiences/search` | 同服务 `/api/v1/experiences*` | **MVP extension（1.2）** |
| 鉴权 | 门面 session；上游服务 Bearer `MEMORY_API_KEY` + `x-oc-org-id` | — | 内部约定（不进 openapi） |

**裁决**：`/v1/memories*` **不进 openapi**（数据面语义，与 MCP `/v1/{orgSlug}/{serverSlug}` 同类）；公开只暴露 `/api/v1/memories*`、`/api/v1/experiences*`；memory-service 必须校验 API Key，门面不得透传外部请求到 `/v1/*`（逐路径白名单）。

**实现（platform-backend，V5-A7 已修）**：门面已改为**纯代理 `MEMORY_URL:4107`**（无本地 Map）；`/api/v1/memories*`→`/v1/memories*`、`/api/v1/experiences*`→服务同名路径；Bearer `MEMORY_API_KEY` + `x-oc-org-id`；响应**不归一、以 memory-service 形状透传**；`/api/v1/memory` 与 `/api/v1/evaluators` 均 404；写审计 `memory.proxy.*`。

> 回执（model-backend）：上游 `/v1/memories*` **及** `/api/v1/experiences*` 全部要求 `Authorization: Bearer MEMORY_API_KEY` + `x-oc-org-id`；`/healthz` 开放；错误 401/404/400 两层；seed 落 `DEFAULT_ORG_ID`。

### 2.3 可观测（observability，task-48）

| 能力 | 公开路径 | 契约归属 |
| --- | --- | --- |
| 总览 | `GET /api/v1/observability/overview` | **MVP extension（1.2 新增）** |
| 时序 | `GET /api/v1/observability/timeseries?metric=tokens|cost|runs&window=24h` | **MVP extension（1.2 新增）** |

规则：只读、session 必填、viewer 可读；聚合超时 ≤1s（单服务探测超时 1s，失败降级为 `status=degraded`，不 5xx）；不暴露其他租户数据。

### 2.4 组织/成员/配额（org，task-48）

| 能力 | 公开路径（M5 实现） | canonical 对照 | 契约归属 |
| --- | --- | --- | --- |
| 当前组织+配额 | `GET /api/v1/organizations/current` | `GET /orgs/{orgId}` | **MVP alias（1.2）**；建议后端同时支持字面量 `/orgs/current` 以减少分叉 |
| 成员列表/邀请 | `GET/POST /api/v1/organizations/current/members` | `GET/POST /orgs/{orgId}/members` | MVP alias |
| 成员角色/移除 | `PATCH/DELETE /api/v1/organizations/current/members/{memberId}` | `PATCH/DELETE /orgs/{orgId}/members/{memberId}` | MVP alias |
| 配额读写 | `GET/PUT /api/v1/organizations/current/quotas` | 无（`/quotas` 属 M2-backlog） | **MVP extension（1.2 新增 org 子资源或复用 /quotas）** |
| 组织信息更新 | `PATCH /api/v1/organizations/current` | `PATCH /orgs/{orgId}` | MVP alias |

**裁决**：`/api/v1/organizations/current*` 与 `/api/v1/organizations/{orgId}*`（members/quotas）均为 **1.2 `x-mvp-alias`**（canonical 仍是 `/orgs/{orgId}`）；**实现已同时挂 `/api/v1/orgs/{orgId}*` canonical**（本轮关闭 4 项台账）。成员上限/配额超限：`409 precondition_failed` + `details.quota`（不新增 reason）。

---

## 3. MVP extensions 清单（M5）

登记于 `G-V5-mvp-extensions.json`（已合并 G-V4 清单，共 **62 extensions + 2 blocked**；M5 新增 24 条）：

- eval：`eval-evaluators` 5 ops
- memory：`memories` 4 ops、`experiences` 3 ops
- observability：`overview`、`timeseries` 2 ops
- org：`organizations/current*` 9 ops（含 quotas 2）
- workflow 补：`POST/GET /workflows/{id}/runs` 2 ops（M3 遗留别名）

处置：全部 **1.2 收编**（alias 或正式新增）；1.1.0 不改；`CONTRACT-DIFF` 追加 §8（M5）。

---

## 4. known-gaps 台账（2026-11-08 更新）

- `updateWorkflowDefinition`（M3 `PATCH /workflow-definitions/{id}`）已实现并 **closed**。
- 当前：**total 56，closed 35，open 21**（M2 1：version 级 `submit-review`；M2-backlog 20）。本轮新关闭：`listMembers`/`inviteMember`/`updateMember`/`removeMember`（canonical `/orgs/{orgId}/members*` 已实现）。
- M5 新增能力不在 1.1.0，**不进入 missing 台账**（作为 MVP extensions 管理）；`/quotas`、`/quota-requests` 等 M2-backlog 仍 open，V5 不关闭、不阻塞。
- P0/P1 端点不得进入台账（维持）。

---

## 5. strict route diff（baseline，M5 实施前）

```
openapi ops: 189 expected, 8 x-v3-target, 16 x-mvp-alias
implemented: 268
missing required: 21 (known-gaps: 21 / unexpected: 0)
extra routes: 92 (allowed-by-default: x-v3-target; mvp-extensions: 72)
unexpected extras: 0
RESULT: PASS
```

命令（M5 落盘后复跑同一命令，输出 `G-V5-final-routes.json` / `G-V5-gate-rerun.log`）：

```bash
python docs/02-architecture/tools/extract-routes.py --out docs/02-architecture/G-V5-impl-routes-baseline.json
python docs/02-architecture/tools/check-routes-vs-openapi.py \
  --routes docs/02-architecture/G-V5-impl-routes-baseline.json \
  --known-gaps docs/02-architecture/G-V3-known-gaps.json \
  --mvp-extensions docs/02-architecture/G-V5-mvp-extensions.json \
  --allow-extra-prefix '/internal/' --allow-extra-prefix '/v1/' \
  --allow-extra '/healthz' --allow-extra '/readyz' --allow-extra '/openapi.json' \
  --allow-extra '/.well-known/' --allow-extra '/s/'
```

---

## 6. 错误 / reason / 响应口径（M5）

| 场景 | code | reason / details |
| --- | --- | --- |
| memory API Key 无效/缺失 | 401 | `unauthenticated`（门面）；上游 `unauthorized` |
| memory 跨租户读取 | 404 | `not_found`（不泄露存在性） |
| memory 搜索参数非法 | 400 | `validation_failed` |
| evaluator 不存在 | 404 | `not_found` |
| evaluator 删除被引用中 | 409 | `conflict` + `details.runs` |
| org 成员上限超限 | 409 | `precondition_failed` + `details.quota=members` |
| 配额值非法/超预算 | 400/409 | `validation_failed` / `precondition_failed` + `details.quota` |
| 非 owner 修改配额 | 403 | `forbidden` + `details.required_role` |
| observability 聚合降级 | 200 | `{status:"degraded", services:{...}}`（不 5xx） |
| 上游不可用 | 502 | `upstream_error`（门面） |

**禁止**：M5 不得新增未入 1.1.0 的 `reason`（如 `memory_not_found`、`org_member_limit`）；1.2 再统一收编。

---

## 7. M5 落盘后执行（architect → qa 证据）

1. 重新抽取路由（含 eval-center 新增 evaluators、control-plane memory/observability/org 代理）；
2. strict diff 复跑：要求 **unexpected extras = 0**；M5 新端点命中 extensions；canonical `/eval-*`、`/orgs*` 覆盖不退化；
3. known-gaps 回填（若有新关闭项）；
4. 输出 `G-V5-gate-rerun.log` + `G-V5-final-routes.json`，发 qa 并入 `G-V5-gate`；
5. V5 gate 验收重点（qa 参考）：
   - 跨租户 memory/experience 404；member 写 403；memory key 无效 401；
   - observability 聚合正确、超时降级不 5xx、viewer 可读；
   - org 配额 owner-only、成员上限 409 `precondition_failed`、审计；
   - eval evaluators CRUD + eval-runs `evaluator_ids[]` 结果维度；
   - `/v1/memories` 不经公网暴露；门面逐路径白名单。

---

## 8. 待回执 / 行动项

| ID | 项 | Owner | 状态 |
| --- | --- | --- | --- |
| V5-A1 | 确认 §2.1 eval 路径与 `EVAL_CENTER_URL` 代理方式 | platform-backend | eval-center 已落盘 `/api/v1/eval-evaluators*`；门面 `eval.ts` 已按前缀代理（待 platform 回执确认） |
| V5-A2 | 确认 §2.2 memory/experience 公开路径 + `/v1/*` 仅内部 | model-backend + platform-backend | **model-backend 已回执（2026-11-08）：无偏差**；上游 experiences 也要求 key+org 头；platform-backend 门面待回执 |
| V5-A3 | 确认 §2.3 observability 两条路径 + 降级语义 | platform-backend | 待回执 |
| V5-A4 | 确认 §2.4 org 路径（alias）+ 配额子资源处置 | platform-backend | 实现已落盘：`/organizations/current*`、`/organizations/{orgId}*`、`/orgs/{orgId}*`（members/quotas）；待回执 |
| V5-A5 | 落盘后 strict diff / known-gaps / G-V5 证据 | architect + qa | 待实现 |
| V5-A6 | 1.2 收编 M5 extensions（合并后 74+2）+ G-V4 38 条 | architect | 1.2 窗口 |
| **V5-A7** | memory 门面双源（本地 Map vs MEMORY_URL） | platform-backend | ✅ **已修复（2026-11-08）**：`m5.ts` 删除本地 Map，改纯代理；`apps/control-plane` 78/78；`/api/v1/memory`、`/api/v1/evaluators` 404。**运行时需重启 control-plane 使新代码生效**（QA MEM-CONSISTENCY-01 原先失败为旧进程） |

---

## 9. 复现与证据

- 最终快照：`G-V5-final-routes.json`（**268** 条实现路由）；基线中间快照 `G-V5-impl-routes-baseline.json`（同源）
- 扩展登记：`G-V5-mvp-extensions.json`（**70 extensions + 2 blocked**）
- 台账：`G-V3-known-gaps.json`（**closed 35 / open 21**）
- 工具：`tools/extract-routes.py`、`tools/check-routes-vs-openapi.py`、`tools/known-gaps-status.py`


---

## 10. 阶段性实现复核（2026-11-08）

- 已落盘：`memory-service`(:4107，`/healthz` 200，memories=3/experiences=2)、`eval-center` 的 `/api/v1/eval-evaluators*` 5 ops、control-plane `eval.ts` 代理（`/eval-datasets|runs|evaluators`）、`m5.ts` 的 `/api/v1/memory*`/`memories*`/`experiences*`/`observability/*`/`organizations/current*`/`organizations/{orgId}*`/`orgs/{orgId}*`（members/quotas）。
- **strict diff（2026-11-08 复跑）**：**276 implemented / 21 known-gaps missing / 0 unexpected extras / PASS**；extensions 76（74+2 blocked）。
- **工具改进**：`extract-routes.py` 支持同文件 route-helper 模板展开（`memoryRoutes("/api/v1/memories")`、`orgRoutes("/api/v1/orgs")`）与 TS 参数类型注解。
- ~~P1 风险（V5-A7）~~ **已修复**：control-plane `m5.ts` 删除本地 Map，改为纯代理 `MEMORY_URL`（响应透传 memory-service 形状）；`/api/v1/memory`、`/api/v1/evaluators` 404。**QA 复跑前需重启 control-plane 进程**（原失败为旧进程）。
- 待落盘：task-50 compose memory-service + 代理 env 生效验证；task-49 UI。
