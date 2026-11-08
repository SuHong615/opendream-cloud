# 实时状态看板（STATUS）

- 更新时间：2026-11-08
- 当前阶段：**v3 架构战役 + 双引擎（云 + OpenDream Code 桌面端）**
- 目标 ID：`goal-73c966cf-7b71-4fa9-8e90-e7f3f20e1a53`

## 0. v3 架构与 M2/M3（2026-11-08）

| 项 | 状态 |
| --- | --- |
| 企业门户 / 桌面端 | ✅ 公开门户 `/`（双引擎介绍/下载/控制台入口）；`/devices` 配对与设备管理；`apps/desktop` Electron；模型经控制面代理、MCP 自动同步；桌面端不含应用中心 |
| V4 私有化架构 | ✅ [ARCH-V4-ONPREM](../02-architecture/ARCH-V4-ONPREM.md)：AgentCore 对标、云依赖→开源矩阵、异步/HA；凭证中心、Agent 类型/模板、**DatabasePort + Postgres 双适配器测试**、**Outbox + NATS + Redis + DLQ 页面**、K8s HA/观测/备份演练 |
| --- | --- |
| 总体架构 v3 | ✅ [ARCH-V3](../02-architecture/ARCH-V3.md) §1–§24 + 8 张图；C1–C4 冻结 |
| 契约 | ✅ `openapi 1.1.0` **frozen**（144 paths / 197 ops / 129 schemas，新增 65/删 0，兼容 PASS） |
| MCP 全生命周期/网关 | ✅ MVP 实现（mcp-hub 19 测试、control-plane 62）；E2E **14/14 PASS**；P0/P1 修复中（task-32） |
| App 权限/协同 | ✅ API + UI（app-center 13 测试、`/apps/[id]` 权限/分享/协同/版本）；API E2E **10/10 PASS** |
| 数字人/工作流 | ✅ 设计 v0.6/v0.5，DATA-MODEL 46 表；M2 范围已定 |
| AI 网关 | ✅ Higress 默认 + agentgateway 可选；18 YAML 校验；7x24 |
| QA G-V3 | ✅ **PASS**（P0/P1=0；MCP 3×8/8、App 6/6、CI/回归全绿；P2 与 KNOWN_GAPS 台账保留） |
| MCP 管理端点/UI | ✅ 版本详情/审核/发布/撤回、channels、tools；control-plane+mcp-hub；QA 6/6 |
| 应用协同 worker | ✅ 消息→自动 proposal→diff→approve；App 7/7 |
| 工作流引擎 | ✅ workflow-engine :4105（DSL/模板/运行/人工任务/补偿）；QA 工作流 6/6 |
| Agent Workforce | ✅ 数字员工/专家小队（7 员工/3 小队，运行/委派/人工审批/embed token/**Guardrails/版本快照/定时排班**）；控制台 `/employees`、`/squads` |
| 数字人（legacy） | ⚠️ 头像/音色/RTC 为旧演示，已从主模块下线；不作为“数字员工”能力 |
| 控制台 | ✅ `/workflows`、`/digital-human`、MCP 生命周期；UI E2E 2/2 |
| QA G-V4 | ✅ **PASS**（P0/P1=0；API 17/17、App 7/7、E2E 2/2、strict 路由 diff 241/26/0 PASS；38 extensions 与 26 known-gaps 进 1.2/M2-M3 台账） |
| 评测中心 | ✅ evaluator CRUD + 4 预置 + run 维度/报告；控制面 `/api/v1/eval-*` 代理；QA eval 5/5 |
| Memory/Experience | ✅ memory-service :4107（mem0 内部 + experience）；门面 `/api/v1/memories*`/`experiences*`；QA 7/7 |
| 可观测/组织 | ✅ overview/timeseries + `/organizations/current*` members/quotas；QA obs 3/3、org 6/6 |
| 实验中心 | ✅ `experiment-center:4108` A/B 变体/启动/指标/winner；`/experiments`；E2E PASS |
| 完成度审查 | ✅ [COMPLETION-AUDIT.md](../../docs/04-reviews/COMPLETION-AUDIT.md)：核心模块全部 MVP；门户/桌面端双引擎已补；真实 IdP 联调/生产后端为剩余 P2 |
| 控制台 | ✅ `/eval`、`/memory`、`/observability`、`/org`；UI E2E 4/4 |
| QA G-V5 | ✅ **PASS**（P0/P1=0；API 20/20、UI 4/4、strict diff PASS；V5-A7 closed；**known-gaps 56/56 closed**；70+2 extensions 进 1.2） |

> 详细：[ARCH-V3](../02-architecture/ARCH-V3.md) · [WBS-V3](WBS-V3.md) · [MCP-GATEWAY](../02-architecture/centers/MCP-GATEWAY.md) · [AI-GATEWAY](../02-architecture/deploy/AI-GATEWAY.md) · [G-V3 gate](../04-reviews/G-V3-gate.md)


## 1. 门禁状态

| 门禁 | 内容 | 主持 | 状态 | 结论/备注 |
| --- | --- | --- | --- | --- |
| G0 | 需求拆解 / 团队 / 门禁 / WBS | lead | ✅ PASS | 2026-11-04 签署；qa 15 项 + pm 10 项意见全部关闭 |
| G1 | 产品定义（竞品/旅程/PRD） | pm-research | ✅ PASS-WITH-ACTIONS | 2026-11-04 签署；A1–A12（15 项 P1）须在 G2 结论前关闭 |
| G2 | 架构（架构/数据/API/安全/ADR） | architect | ✅ PASS-WITH-ACTIONS | 2026-11-04 签署；18 P1，硬门槛 G2-01…09；architect 已关 9 项 |
| G3 | 产品设计（IA/设计系统/高保真） | web-console | ✅ PASS-WITH-ACTIONS | 2026-11-04 签署；P0=0；A-G3-2…5 为前端联调前置 |
| G4 | 平台核心实现 | platform-backend | ✅ PASS-WITH-ACTIONS | 2026-11-04 签署；43 单测/86.99% 覆盖/17 冒烟/13 浏览器断言；#4 DEGRADED |
| G5 | 能力中心实现 | capability-centers | ✅ PASS-WITH-ACTIONS | 2026-11-04 签署；四中心 40 测试；沙箱/构建/网关 DEGRADED |
| G6 | 质量与安全 | qa-reviewer | ✅ PASS-WITH-ACTIONS | 覆盖率 76–87%；SAST/DAST 替代；P0/P1=0；G6-01 复测 401 |
| G7 | 部署验收 | infra-devops | ✅ PASS-WITH-ACTIONS | Terraform/Helm/kind 静态 + sqlite 备份 RTO≈8ms；ACK 真机 DEGRADED |

## 2. 任务板

| ID | 任务 | Owner | 状态 | 写作用域 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| task-1 | P1 产品定义（竞品/旅程/PRD） | pm-research | ✅ complete | `docs/01-research/` | - |
| task-2 | P2 架构包（架构/数据/API/安全/ADR） | architect | ✅ complete | `docs/02-architecture/` | - |
| task-3 | P3 产品设计（IA/设计系统/高保真） | web-console | ✅ complete | `docs/03-design/` | - |
| task-4 | P2-S 平台后端子设计 | platform-backend | ✅ complete | `docs/02-architecture/services/` | - |
| task-5 | P2-C 能力中心方案 | capability-centers | ✅ complete | `docs/02-architecture/centers/` | - |
| task-6 | P2-D 部署架构 | infra-devops | ✅ complete | `docs/02-architecture/deploy/` | - |
| task-7 | P6-Q 测试策略与门禁基线 | qa-reviewer | ✅ complete | `docs/05-delivery/`、`docs/04-reviews/` | - |
| task-8 | G1 门禁记录 | qa-reviewer | ✅ complete（PASS-WITH-ACTIONS） | `docs/04-reviews/` | task-1 |
| task-9 | G2 门禁记录 | qa-reviewer | blocked | `docs/04-reviews/` | task-2/4/5/6 |
| task-10 | G3 门禁记录 | qa-reviewer | blocked | `docs/04-reviews/` | task-3 |

## 3. 决策记录（持续更新）

| ID | 决策 | 理由 | 状态 |
| --- | --- | --- | --- |
| D1 | 工作区默认**不自动销毁**；仅用户显式销毁；提供可选的 scale-to-zero（保留 PVC/数据） | 用户明确要求"退出不销毁"；兼顾成本 | 已定 |
| D2 | 每用户一个独立 `opencode serve` 实例（4C8G），不做多用户共享进程 | 隔离简单可证明；opencode 单租户设计 | 已定 |
| D3 | 上游 opencode 锁定 commit/镜像 tag，只读集成，不 fork | 降低升级风险 | 已定 |
| D4 | Skill 分发优先用 opencode 原生 `skills: string[]` URL 源 | 零改造、可热更新 | 待 G2 确认 |
| D5 | 模型统一走 LiteLLM Gateway，opencode provider 指向网关 + 用户虚拟 Key | 统一配置/配额/审计 | 待 G2 确认 |
| D6 | SSO 用 OIDC + oauth2-proxy；工作区/应用访问由网关注入上游凭证 | 标准方案、应用零改造 | 待 G2 确认 |
| D7 | 应用固定 1C2G，工作区固定 4C8G；配额硬限制 | 用户明确要求 | 已定 |
| D8 | 沙箱强隔离用 RuntimeClass 抽象：优先 gVisor，ACK 安全沙箱 Kata/runV 可替代 | 避免绑定单一运行时；无强隔离记 DEGRADED | 已定 |
| D9 | 远程 MCP 凭证不出 Hub；stdio 仅无凭证白名单，凭证型 stdio 延后 M5.2 | 解决 R7.3 与 stdio 的矛盾 | 已定 |
| D10 | Skill MVP 包 ≤10MB，超限异步分发 | 保 2min 安装生效 | 已定 |
| D11 | 控制台与应用使用独立可注册域 / Host-only Cookie（`__Host-`） | 防止父域 Cookie 互串 | 已定 |
| D12 | 可复现性三层口径；LLM 评测 N=3、方差 ≤5% | LLM 非确定性无法绝对复现 | 已定 |
| D13 | 工作区 = runc 半可信（共享内核）；强隔离仅用于评测沙箱 | PTY/工具链兼容性；成本；SECURITY 明确边界 | 待 G2 确认 |
| D14 | 容量分批 100→300→1000；默认常驻 + 可选休眠档；单位经济模型 G2 输出 | 常驻成本 ≈¥72 万/月，需商业模式支撑 | 待用户确认 |
| D15 | **单一 OIDC RP = 控制面**；MVP 移除 oauth2-proxy；工作区/应用网关用控制面签发的短期 access ticket 换票 | 避免双 RP 双会话/登出不一致；支持 5s 吊销 | 待 G2 确认 |
| D16 | API Key 存储 = HMAC-SHA256(server pepper)，不做 Argon2id | 高熵随机 Key 无需慢哈希，需可检索与常数时间比较 | 已定 |
| D17 | 销毁冷却期默认 5min（可配 5–1440）+ PVC 24h + 快照 30d | 兼顾误删保护与用户体验 | 已定 |
| D18 | SSE 只承诺"可重连的可见连续性"，不承诺零丢事件 | 上游 `/api/event` 为 volatile SSE | 已定 |
| D19 | 跨租户访问返回 404（防枚举）；同租户越权 403 | 安全最佳实践 | 已定 |
| D20 | MVP 平台统一模型 Key；BYOK 为 P2，需管理员审批 | 简化治理与计量 | 已定 |

## 4. 待用户确认（不阻塞设计）

1. ACK 集群/地域/K8s 版本与云凭证是否已具备
2. SSO 提供方（Keycloak / 阿里云 IDaaS / 企业微信 / 钉钉 / 飞书）
3. 计费模式（席位 / 资源时长 / token）
4. 模型采购方式（平台统一 / BYOK / 私有化）
5. 主域名与证书、数据合规地域
6. 每用户工作区数量（严格 1 个 / 可多开）

## 5. 并行策略说明（G0-05）

P1/P2/P3 三条设计流并行推进，但：
- G2 以 PLAN 的 E1–E10 为需求基线；G1 PASS 后追加"PRD ↔ 架构一致性复核"；
- 任何实现代码（G4/G5）必须等 G1 + G2 + G3 全部 PASS；
- G0 签署前不得宣称进入 M1/M2 里程碑完成态。

## 6. G0 行动项状态（qa-reviewer 15 项）

| ID | 级别 | 问题 | 处置 | 状态 |
| --- | --- | --- | --- | --- |
| G0-01 | P1 | 时效指标无测量口径 | PLAN §5 引用 TEST-PLAN §2 Q-01..Q-09 | 已关闭 |
| G0-02 | P1 | G2 未要求关闭上游 8 项待核实 | REVIEW-GATES G2 清单新增 8/8 关闭前置 | 已关闭 |
| G0-03 | P1 | ROLES 安全基线职责冲突 | RACI 改为 architect 撰写、qa 独立审计 | 已关闭 |
| G0-04 | P1 | 缺陷级别缺 P3 | REVIEW-GATES §2 增补 P3 与映射 | 已关闭 |
| G0-05 | P1 | G1/G2/G3 并行 vs 顺序矛盾 | 本文件 §5 明确并行边界与一致性复核 | 已关闭 |
| G0-06 | P1 | 审计留存 vs 删除冲突 | R10.3 明确审计留存≥180 天且脱敏 | 已关闭 |
| G0-07 | P1 | R3.3 不可 CI 验证 / idle 未定义 | R3.3 改为可验证表述并引用 LMT-3 | 已关闭 |
| G0-08 | P1 | 备份无 RPO/RTO | R9.5 量化 RPO≤15min、RTO≤2h | 已关闭 |
| G0-09 | P1 | 无云凭证时证据等级缺失 | A5 增加 DEGRADED + lead 豁免规则 | 已关闭 |
| G0-10 | P2 | T6.1 依赖/文件名不符 | 依赖改 G2、文件统一 G6-quality-security.md | 已关闭 |
| G0-11 | P2 | 服务密码=根凭证未列威胁 | PLAN 风险 9 单列，G2 SECURITY 专章 | 已关闭 |
| G0-12 | P2 | 证据目录未规定 | DoD 引用 evidence/Gx/<runid>/ | 已关闭 |
| G0-13 | P2 | 缺测试环境搭建任务 | 新增 T6.0（infra-devops） | 已关闭 |
| G0-14 | P2 | G0 清单缺基线/NFR | G0 Checklist 增两项 | 已关闭 |
| G0-15 | P2 | E10 验收偏定性 | R10.4/R10.5 量化为 6 类操作/5 篇教程 | 已关闭 |

> 结论：qa 15 项 + pm 10 项 + architect（无 P0/P1，同意 PASS）全部处置；`docs/04-reviews/G0-requirements.md` 已由 lead 签署 **PASS**（2026-11-04）。

## 6.1 G1 行动项（A1–A12，P1，G2 结论前必须关闭）

| ID | 行动 | Owner | 状态 |
| --- | --- | --- | --- |
| A1 | 三档时效（C0/C1/C2）+ 9 态状态机 + SSE 可见连续性 | pm + architect | ✅ closed（PRD v1.4 + openapi） |
| A2 | 错误码两层模型（code 16 类 + reason lower_snake）落地 PRD/JOURNEYS | pm | ✅ closed |
| A3 | new-tab、子域名、SSE 连续性；lead 确认 P0 降级 | pm + architect + lead | ✅ closed |
| A4 | 路径令牌 15min + 5min 双 token 续签；SKILL.md 与 skill.yaml 分离 | pm + capability | ✅ closed |
| A5 | 计量权威（LiteLLM）+ 对账口径 | pm | ✅ closed |
| A6 | 上游 8 项关闭形态改写；Skill 权限闭环 | pm + architect | ✅ closed |
| A7-A12 | 跨租户 404、销毁口径、配置生效时效、策略解析、登出、view/use/edit、分享防遍历、SSRF | pm + architect | ✅ closed |
| A13-A15 | 转 G2/G3 台账（容量/成本、G2 一致性、G3 设计） | qa | ✅ closed |

## 7. 收尾状态（2026-11-04）

- **G0–G7 全部完成并签署**；契约冻结；实现与契约 diff = 0（allowlist 除外）。
- **本地可运行**：控制面（Fastify + SQLite）+ 控制台（Next.js）+ 四中心服务；`bun run test`、`smoke-api`、控制台真实浏览器冒烟均通过。
- **可部署制品**：Terraform（ACK 基线）、Helm、kind manifests、workspace Dockerfile、Operator。
- **DEGRADED（需用户环境补验）**：ACK 真机 4C8G Pod/PVC/NetworkPolicy、gVisor/Kata 逃逸、LiteLLM 真实网关与用量对账、BuildKit/ACR/Ingress 应用发布、真实 OIDC SSO、SSE/WS 长连接、terraform plan/apply、helm install。
- **遗留 P2**：~~`/auth/csrf` 契约缺口（G6-02）~~ → **已关闭**：ADR-017 将 `GET /api/v1/auth/csrf` 纳入契约 **1.1.0**（97 paths），control-plane allowlist 移除、契约 diff 归零；G6-01 已撤回。
- **契约版本**：1.1.0（ADR-017，仅加法），其余 G0–G7 结论不变。

## 9. 真实 ACK 部署（2026-11-05，用户提供 kubeconfig）

- 集群：ACK `v1.37.1-aliyun.1`，3 节点（8C+4C+4C），cn-hangzhou；无 IngressClass/RuntimeClass。
- 已完成：CRD + **in-cluster operator** + `demo-ws` CR → **Pod 1/1 Running，QoS Guaranteed，requests=limits=4C8G**；opencode **v2.2.5** 在 ACK 内提供 API（`/api/info` 200、无认证 401）与 Web UI（截图见证据）。
- **平台组件 in-cluster**：control-plane、workspace-operator、skill/eval/app/mcp 四中心全部 **1/1 Running**；控制面冒烟 17/17；四中心 healthz 200；operator 自愈（删 Pod 31s 重建）。
- 退出不销毁：删除 Pod 后 operator **36s 重建**，CR 保持 Ready。
- DEGRADED：PVC 因**账号余额不足**无法开通（`InvalidAccountStatus.NotEnoughBalance`），演示用 emptyDir（不持久）；operator 在集群外；镜像启动时从 npmmirror 安装；NetworkPolicy 临时删除以允许 npm 出网；节点 taint 临时移除；无 Ingress/SSO/LiteLLM。
- 详情与复现/回滚命令：[REAL-ACK-DEPLOYMENT.md](../05-delivery/REAL-ACK-DEPLOYMENT.md)。

## 10. 本地 Docker 部署（2026-11-07，D 盘 / 不依赖云）

- Docker 26.1.5 安装在 WSL2 发行版 `opencode-docker`（VHD 位于 `D:\wsl\opencode-docker`），数据目录 `/var/lib/docker` 在 D 盘。
- `deploy/local/docker-compose.yml` 一键起 **7 个容器**：control-plane、console、skill/eval/app/mcp 四中心、opencode workspace。
- 实测：控制面 `/healthz` 200 + 冒烟 **17/17 PASS**；控制台 Playwright **2/2 PASS**；四中心 healthz 200；opencode **v2.2.5** `/api/info` 401/200 + Web UI 200；截图见 `evidence/local/`。
- 一键启动：`powershell -File D:\opencode\deploy\local\start.ps1`。
- 详情：[LOCAL-DEPLOYMENT.md](../05-delivery/LOCAL-DEPLOYMENT.md)。

### 模型中心（2026-11-08，P1 首块落地）

- **opencode 不再依赖自带模型**：生成配置含 `disabled_providers:["opencode"]`，模型全部由平台下发。
- 支持企业/第三方供应商：11 个预设（OpenAI/Azure/Anthropic/Google/DeepSeek/通义/Kimi/GLM/Ollama/vLLM/自定义）、Base URL、API Key（AES-256-GCM 加密、接口仅回掩码）、模型拉取/测试连通、默认切换、opencode 配置原子下发。
- UI 为 **CC Switch 风格**：供应商卡片 + 添加/编辑抽屉 + 测试/设为默认/删除。
- 本地端到端：`model-center-e2e` **17/17 PASS**；控制面 **54/54**；QA API **9/9**、Playwright **6/6**；门禁 **PASS-WITH-ACTIONS**（P0=0/P1=0，MODEL-001 P2 已修）。
- 证据：[G-MODEL-gate](../04-reviews/G-MODEL-gate.md)、[MODEL-CENTER-TEST-PLAN](../05-delivery/MODEL-CENTER-TEST-PLAN.md)。

## 11. 最终证据（2026-11-04）

| 证据 | 命令 | 结果 |
| --- | --- | --- |
| 安装 | `bun install` | 260 packages，无错误 |
| 类型检查 | `bun run typecheck` | 0 error |
| 根测试 | `bun run test` | **51 pass / 3 skip / 0 fail**（54 tests） |
| 控制面单测 | `cd apps/control-plane && bun test` | **43 pass / 0 fail / 115 expects** |
| 控制面覆盖率 | `bun test --coverage` | **86.99% 行 / 88.82% 函数** |
| API 全链路 | `bun scripts/smoke-api.ts :4001` | **17/17 PASS** |
| 控制台构建 | `bun run --cwd apps/console build` | 12/12 路由 |
| 控制台浏览器 | `smoke-real.mjs`（Chrome CDP） | **13/13 PASS** |
| Playwright E2E（系统 Chrome） | `-c tests/e2e/playwright.config.ts` | **2/2 PASS**：登录→工作区列表（真实数据/无 DEMO）→创建→ready→详情；A-G4-4 关闭 |
| CI | `.github/workflows/ci.yml` | typecheck/test/coverage/console build/go build/manifest/OpenAPI 全流水线（本地已逐项验证） |
| 四中心测试 | `bun test services/...` | **40 pass / 0 fail**（13/8/10/9） |
| 四中心并行 | `bun run scripts/verify/all-services.mjs` | **ALL-SERVICES PASS**（4101–4104 健康 + 两层错误） |
| 验收报告+风险 | ✅ | ACCEPTANCE §1–§7，qa+lead 已签，含遗留风险 |
| 四中心部署清单 | `deploy/kind/35-centers.yaml` + Helm `centers.yaml` | 4 个 Deployment/Service（4101–4104），非 root/只读根/探针；manifest 校验 PASS |
| Operator | `GOROOT=D:\Go go build/test` | 通过 |
| Manifest 校验 | `bun run scripts/validate-manifests.mjs` | PASS |
| 备份恢复 | `python scripts/verify/sqlite-backup.py` | 15 表 MATCH；RTO≈8ms |
| Terraform 静态 | `python scripts/verify/terraform-static.py` | PASS（11 resources，prevent_destroy×3） |
| 契约 | yaml + `$ref` | **1.1.0 / 97 paths / 131 ops / 98 schemas**，csrf 已纳入 |
| 契约 diff | `bun test apps/control-plane/test/contract.test.ts` | **5/5 PASS**，allowlist 仅 dev-login/healthz/readyz |
