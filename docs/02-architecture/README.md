# docs/02-architecture · 架构包索引（G2 交付）

> Owner：architect。本目录是 G2 评审的**根交付**；子目录 `services/`、`centers/`、`deploy/` 分别由 platform-backend、capability-centers、infra-devops 负责，**不在 architect 写作用域内**。

## 1. 根交付（本目录）

| 文件 | 内容 | G2 检查项映射 |
| --- | --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | C4 四视图（上下文/容器/组件/部署）+ 6 条关键数据流 + 控制面/数据面分离 + 容量模型 + 失败模式 + 技术选型表 + **附录 A：BASELINE §5 八项关闭结论（含证据行号）** | C4 四视图、关键数据流、隔离可证明、状态机、容量可推导、失败降级、技术选型 |
| [DATA-MODEL.md](DATA-MODEL.md) | ER 图 + 23 张表清单（租户键/主键/索引/保留策略/RLS）+ RLS 策略模板 + 分区与一致性边界 | 多租户数据模型、每表租户键、RLS |
| [openapi.yaml](openapi.yaml) | OpenAPI 3.1，`/api/v1`：**131 个 operation / 96 个路径 / 98 个 schema**；统一错误码、cursor 分页、Idempotency-Key、SSE、JWKS | API 可生成 SDK、错误码/分页/幂等/版本化 |
| [SECURITY.md](SECURITY.md) | STRIDE 全表（S/T/R/I/D/E）+ 租户隔离证明（身份/网络/存储/运行时）+ 密钥生命周期 + SSRF/IDOR/沙箱/供应链对策 + 审计与合规 | STRIDE、隔离证明、密钥管理、专项对策 |
| [adr/](adr/README.md) | **16 条 ADR（001–016）** + 索引 + 依赖图 | ≥8 条 ADR、含备选与否决理由 |

## 2. 子目录（其他人的交付，本文档只做交叉引用）

| 子目录 | Owner | 关键契约点 |
| --- | --- | --- |
| `services/` | platform-backend | `BACKEND.md`：认证/SSO/RBAC、`ock_` Key、模型中心、工作区编排、CRD `OpencodeWorkspace` 契约、与 openapi 对齐 |
| `centers/` | capability-centers | `CENTERS.md` + 分册：Skill 包规范、评测 schema、应用构建/分享、MCP Hub |
| `deploy/` | infra-devops | `DEPLOYMENT.md`：ACK 拓扑、Operator/Agent、镜像、gVisor/Kata、Helm/Terraform、可观测 |

## 3. G2 自检结果（architect 侧，2026-11-04）

| # | G2 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | C4 上下文/容器/组件/部署四视图齐全 | ✅ | ARCHITECTURE §2–§5 |
| 2 | 关键数据流覆盖 登录/拉起/模型/技能/应用/MCP | ✅ | ARCHITECTURE §6.1–§6.6（sequenceDiagram） |
| 3 | 每用户 4C8G 隔离可证明（资源/网络/存储/身份） | ✅ | SECURITY §3.1–§3.5（四层 + 可执行验证）；ARCHITECTURE §5 |
| 4 | 退出不销毁 / 显式销毁 状态机与回收策略明确 | ✅ | ARCHITECTURE §7.2（9 态 + 冷却期 5min + 两段式 PVC/快照）；ADR-012 |
| 5 | 数据模型满足多租户（每表租户键 + RLS） | ✅ | DATA-MODEL §3（23 表逐表）+ §4（策略模板/覆盖矩阵/防绕过） |
| 6 | API 契约可生成 SDK；错误码/幂等/分页/版本化 | ✅ | openapi.yaml（3.1.0，131 ops / 96 paths / 98 schemas，operationId 唯一，全部 `$ref` 可解析）；§4 自检 |
| 7 | 安全：STRIDE、密钥、SSRF/越权/逃逸/供应链 | ✅ | SECURITY §2（6 类全表）、§4、§6 |
| 8 | 部署拓扑与 1000 工作区容量可推导 | ✅ | ARCHITECTURE §5、§9 |
| 9 | ≥8 条 ADR（含备选与否决理由） | ✅ | 13 条 |
| 10 | 失败模式与降级（LiteLLM/K8s API/DB 等） | ✅ | ARCHITECTURE §10（F-01…F-13） |
| 11 | **BASELINE §5 八项 8/8 关闭（新增要求）** | ✅ | ARCHITECTURE 附录 A 第 1–8 行，均含 `文件:行` 证据；另附 10 项补充核实（A.9 第 9–18 行） |

## 4. openapi 自检细节

| 检查 | 结果 |
| --- | --- |
| YAML 可解析 | ✅ `openapi: 3.1.0` |
| 路径/操作 | 63 paths / 94 operations，无重复 `operationId`，无缺失 `operationId` |
| `$ref` 完整性 | 104 个内部引用全部可解析（无悬空） |
| 统一错误信封 | ✅ `ErrorEnvelope` + **两层错误模型**：`error.code`（16 个通用分类）+ `error.reason`（20 个领域原因，= PRD/JOURNEYS 产品码 lower_snake） |
| 分页 | ✅ 所有列表端点 `cursor` + `limit`（默认 20，上限 100），响应 `{items, next_cursor}`；`total` 仅 `include_total=true` |
| 幂等 | ✅ 所有 POST/PATCH 写操作接受 `Idempotency-Key`；冲突 409 `idempotency_conflict` |
| 版本化 | ✅ 全部 `/api/v1`；`Sunset` 头策略见 info.description |
| 租户上下文 | ✅ 无端点接受客户端自由传入的 `orgId`（org 从会话解析）；资源路径统一 `{id}` uuid |
| SSE | ✅ `GET /api/v1/events`（text/event-stream，Last-Event-ID 续传，事件类型表） |
| 幂等/状态冲突 | ✅ 409 语义统一（`conflict` / `idempotency_conflict` / `workspace_not_ready` / `gate_blocked`） |

## 5. 阅读顺序建议

1. 先看 `ARCHITECTURE.md §0 结论摘要`（10 行掌握全貌）。
2. 再看 `adr/README.md` 的决策表（知道为什么这么设计）。
3. 需要实现时看 `openapi.yaml` + `DATA-MODEL.md`（契约与表）。
4. 安全评审看 `SECURITY.md`（含"验证方式"列，可直接转测试用例）。
5. 有争议时回 `ARCHITECTURE.md 附录 A`（上游事实证据）。

## 5.1 契约变更记录（G2 后）

| 日期 | 变更 | 触发 |
| --- | --- | --- |
| 2026-11-04 | openapi 补齐 G5 排期公开端点 20 个（Skill submit-review/review/yank/rollback/stats；Eval dataset-versions/report/baselines；App preflight/domains/verify/shares-preview/sleep/wake；MCP review/publish/rotate-token/oauth-callback）→ **96 paths / 131 ops / 98 schemas** | capability-centers G2-06 对齐 + G5 契约冻结 |
| 2026-11-04 | `AppState` 5 态、`AppDeploymentStatus` 6 态、新增 `AppBuild`/`AppBuildStatus`/`AppDomainStatus`；`AppDeployment.build_no/scan_status` → `build_id`；`WorkspaceError.code` → `ErrorReason` | qa G2-07 复核 |
| **2026-11-04** | **契约冻结（FROZEN）**：`x-contract-status: frozen`；G5 公开 API 定稿（96 paths / 131 ops / 98 schemas）；`x-p2-deferred` 8 项明确 P2。冻结后变更须 **ADR → minor 版本（1.1.0）→ changelog → 通知 qa/backend/capability** | capability-centers 复核通过（44 matched + 8 P2） |
| **2026-11-08** | **openapi `1.1.0` 冻结**：**144 paths / 197 ops / 129 schemas**；新增 **65 ops**（MCP 生命周期 17、App 协同平铺 13 + v3 目标 8、数字人 9、工作流/人工任务 15；另含 v2 补漏）；`x-mvp-alias` 16 / `x-v3-target` 8；`ErrorReason` 23→**58**；兼容脚本 PASS。SDK 生成待 CI/联网执行 | lead 冻结裁决（MVP 已实现 + v3 目标别名，不让实现反向改契约） |
| 2026-11-04 | **1.1.0**：新增 `GET /api/v1/auth/csrf`（`getCsrfToken`，返回 `{csrf_token}`，未登录 401）→ 97 paths；control-plane allowlist 移除该路径，契约 diff 归零 | G6-02 P2 + 控制台联调；[ADR-017](adr/ADR-017-csrf-endpoint.md) |

## 5.2 G5 契约基线与验证（2026-11-04）

- 基线文件：`centers/ROUTES.md`（capability-centers 产出，**只读**）+ `openapi.yaml`（FROZEN）。
- 独立验证（architect 脚本，占位符归一化后比对）：
  - ROUTES 路由行 **75**，operationId **无重复**；**not-in-openapi = 0**；
  - matched 的 method/path **0 mismatch**；
  - 四中心相关 openapi operations = **75**，**未在 ROUTES 列出 = 0**（双向覆盖）；
  - `x-p2-deferred` 8 项 **0 项**出现在路由表（且这 8 项在 openapi 中本就无 operation，属"禁止实现"清单，正确）；
  - `/internal/` 仅出现在 ROUTES 的隔离说明段，未混入公开路由表。
- 结论：**ROUTES.md 可作为 G5 实现基线**；G5 完成的"实现路由 vs 冻结契约"diff 必须保持 `not-in-openapi = 0`、`mismatch = 0`、`P2 出现 = 0`。
- 复核口径（5 条，与 ROUTES §6 一致）：① 路由子集与 operationId 一致；② P2 不存在于实现；③ cursor 分页；④ 两层错误码；⑤ internal 不公开。

## 6. G2 台账：G1 行动项与差异闭环（architect 负责项）

### 6.1 G1 行动项（architect 复核/修订）

| 项 | 内容 | 状态 | 证据 |
| --- | --- | --- | --- |
| G1-A01 | 三档时效定义（C0/C1/C2） | ✅ 已定义 | `ARCHITECTURE §11`（就绪 p50/p95 场景化）+ 已向 qa 提交定义；PRD 行由 pm 改 |
| G1-A03 | new-tab / 子域名 / SSE 连续性 | ✅ 已定稿 | ADR-003（子域名）、`ARCHITECTURE §7.3`（ticket→新标签页）、`§11`（SSE 只承诺可重连的可见连续性）、openapi `/events` |
| G1-A05 | 子域名证据（BASELINE §5-2 关闭） | ✅ 已给证据 | `ARCHITECTURE 附录 A#2`（`web-ui.ts`/`assetsDir`）+ ADR-003 否决理由 |
| G1-A09 | 计量权威源 | ✅ 已定 | ADR-013（LiteLLM spend log 权威，session/stats 仅对账 >2%） |
| G1-A11 | 跨租户 404 / 同租户 403 | ✅ 已进契约 | openapi `getWorkspace`/`access-ticket` 404 + `Forbidden` 语义；`DATA-MODEL §4.3`（防探测） |
| G1-A15 | G2 台账 | ✅ 本节 | 本文件 §6 |
| **D15** | 单一 OIDC RP = 控制面（Lead 裁决） | ✅ 已改造 | ADR-004 重写；`ARCHITECTURE §0/§3/§5/§6.1/§7.3/§8`；`SECURITY §1/§2/§4`；openapi cookie/`/auth` 语义 |

### 6.2 DATA-MODEL 与 platform-backend 的 5 处差异闭环

| # | 差异 | 结论 |
| --- | --- | --- |
| 1 | 缺 4 张表 | ✅ 已补：`litellm_keys` / `quota_limits` / `workspace_config_revisions` / `audit_chain_heads`（表数 23→27，均含租户键 + RLS） |
| 2 | API Key 哈希 | ✅ 已改 **HMAC-SHA256 + per-env pepper（KMS）** + `key_version`，不用 Argon2id |
| 3 | 跨租户返回码 | ✅ 跨租户 **404**、同租户越权 **403**（openapi + DATA-MODEL §4.3） |
| 4 | 审计留存 | ✅ 热 **≥180 天**（目标 365）+ 归档 **3 年**（OSS/WORM）；`audit_chain_heads` 提供防篡改锚点 |
| 5 | 错误码扩展 | ✅ 两层模型：16 通用 `code` + 23 领域 `reason`（含 `workspace_destroy_cooldown`/`ticket_reused`/`tenant_context_missing`；`model_not_allowed`→统一 `model_not_authorized`，`oidc_unavailable`→`idp_unavailable`） |

### 6.3 G2 证据索引（供 qa 逐项核对）

| G2 检查项 | 证据位置 |
| --- | --- |
| BASELINE §5 八项 8/8 | `ARCHITECTURE 附录 A` 第 1–8 行（每条含 `文件:行`），另 10 项补充核实（A.9 第 9–18 行） |
| 四中心 RLS | `DATA-MODEL §3`（skills/skill_versions/eval_*/apps/app_shares/mcp_*）+ §4 策略模板与覆盖矩阵 |
| 4C8G 四维隔离 | `SECURITY §3.1–§3.5`（身份/网络/存储/运行时 + 可执行验证）；`ARCHITECTURE §5` |
| 销毁状态机 | `ARCHITECTURE §7.2`（9 态 + 冷却 5min + PVC 24h/快照 30d）；ADR-012；openapi `/destroy`、`/destroy/cancel` |
| SSO 换票 | `ARCHITECTURE §7.3` + ADR-004/005 + openapi `/access-ticket`、JWKS |
| 容量模型 | `ARCHITECTURE §9`（32C128G×160 双方案）；ADR-015（单位经济/分阶段 100→300→1000） |
| ≥8 ADR | `adr/` 15 条 + 索引 + 依赖图 |
| 失败降级 | `ARCHITECTURE §10`（F-01…F-13）；`SECURITY §9`（残余风险） |
