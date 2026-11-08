# OpenDream Cloud · 项目总计划（需求拆解 / WBS / 里程碑 / 门禁）

- 版本：v0.1（P0 立项基线，待 G0 评审）
- 主持：Lead（技术总负责）
- 评审：pm-research / architect / qa-reviewer
- 状态：**待评审**（G0）

---

## 1. 背景与目标

### 1.1 背景

opencode 是开源的 AI 编码智能体（Bun + TypeScript），具备 `opencode serve` 服务端、HTTP/SSE API、JS/TS SDK、
多模型 Provider 配置、Agent/Plugin/MCP 扩展能力。当前形态以本地 CLI/TUI 为主，缺少云端的**多租户、统一治理、
持久工作区、能力市场**。

### 1.2 目标

构建 **OpenDream Cloud**：以 opencode 为执行引擎的云端平台。

1. **开箱即用**：用户 SSO 登录后自动获得独立云端 opencode 工作区（4C8G），浏览器内直接使用。
2. **统一治理**：模型配置、密钥、配额、审计由平台集中管理，用户无需配置模型。
3. **四个中心**：Skill 中心、评测中心、应用中心、MCP 中心，形成"能力生产 → 评测 → 消费 → 发布"闭环。
4. **可分享的应用**：用户可把工作区能力发布为云端应用（1C2G 容器），链接即域名，SSO 鉴权，按用户授权。
5. **可交付**：产出可部署到阿里云 ACK 的代码、Helm/Terraform 制品、运维手册与验收报告。

### 1.3 产品定位

> "给每个工程师一间随身的 AI 工程云工作室：打开浏览器就有 4C8G 的 opencode，模型、技能、MCP、应用全部即取即用。"

---

## 2. 角色与核心场景

| 角色 | 核心诉求 | 关键旅程 |
| --- | --- | --- |
| 终端开发者 | 免安装、随时可用、环境持久 | 登录 → 自动拉起工作区 → 对话/改代码 → 关浏览器 → 下次回来原样继续 |
| 团队负责人 | 统一模型预算、能力管控 | 配置模型策略/配额 → 审批 Skill/MCP → 查看用量 |
| 平台管理员 | 部署、运维、治理 | 部署 ACK → 管理用户/工作区 → 审计与告警 |
| 能力作者 | 发布 Skill/MCP/应用 | 开发 → 评测 → 上架 → 被安装/使用 → 看数据 |
| 应用使用者 | 用别人分享的 AI 应用 | 打开链接 → SSO → 按权限使用 |

---

## 3. 范围与边界

### 3.1 In Scope（本期）

- 多租户控制台（Web）、SSO、RBAC、用户 API Key
- 模型中心（注册表 + LiteLLM 网关 + 统一配置下发 + 配额计量）
- 每用户持久工作区（4C8G、PVC、自动拉起、显式销毁、域名访问）
- Skill 中心 / 评测中心（沙箱）/ 应用中心（1C2G、分享、SSO 域名）/ MCP 中心
- ACK 部署制品（Helm + Terraform）、CI/CD、可观测、备份
- 全套产品/架构/设计/评审/交付文档

### 3.2 Out of Scope（本期不做）

- 移动端原生 App
- 自研模型推理集群（走模型网关对接外部供应商）
- 复杂计费系统（仅做用量计量 + 配额，账单对接留接口）
- 多地域多活（单地域双可用区）
- 桌面端 opencode 客户端改造

### 3.3 关键假设

- A1：阿里云 ACK 为目标运行环境（K8s ≥ 1.28），已有或可创建 ACR、RDS PostgreSQL、Redis、OSS、SLB。
- A2：SSO 提供方优先支持标准 OIDC（Keycloak / 阿里云 IDaaS / 企业 IdP）；企业微信/钉钉/飞书需在 G2 增加适配 ADR 并作为前置决策。
- A3：模型通过 OpenAI 兼容协议接入（LiteLLM 网关统一出口）。
- A4：opencode 上游以只读方式集成，不 fork 核心；通过配置、SDK、插件扩展。
- A5：真实 ACK 部署需要云凭证与集群；无凭证时以 `terraform validate/plan` + 本地 kind 实跑 + 单测作为降级证据，门禁记录标注 `DEGRADED` 并由 lead 签署豁免；不得以 plan 代替 apply 声称"已部署"。

---

## 4. 需求拆解（Epic → Feature → 验收标准）

### E1 身份、组织与访问控制

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R1.1 | OIDC SSO 登录/登出/会话续期 | 登录 p95 ≤ 3s；会话可配置时长；支持强制重新认证 |
| R1.2 | 组织/团队/成员管理；角色 owner/admin/member/viewer | 角色权限矩阵有测试覆盖；越权返回 403 |
| R1.3 | 用户 API Key（`ock_` 前缀）：创建/scope/过期/吊销/轮换 | 明文仅创建时展示一次；库中只存 HMAC-SHA256(pepper) 哈希；吊销 5s 内生效 |
| R1.4 | 审计日志：登录、Key、工作区、发布、分享、MCP 调用 | 所有写操作 100% 落审计；可按用户/资源/时间检索 |
| R1.5 | API Key 泄露应急：一键吊销全部 Key/会话 | 吊销 ≤5s 全平台生效；触发安全通知与审计事件 |

### E2 模型中心（统一模型配置）

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R2.1 | 模型/供应商注册表（上下文、价格、能力标签、健康状态） | 管理台可增删改查；变更实时生效 |
| R2.2 | 模型策略：默认模型、可用集合、按组织/角色授权 | 未授权模型不可见、不可调用 |
| R2.3 | 密钥托管：MVP 平台统一 Key（KMS 加密）；BYOK 为 P2（需管理员审批） | 密钥不下发明文到客户端；轮换不停机 |
| R2.4 | LiteLLM 网关：OpenAI 兼容、路由、重试、限流、预算 | 兼容 OpenAI SDK；故障自动切换；限流返回 429 |
| R2.5 | 用量计量：token/请求数，按用户/工作区/模型聚合 | 5 分钟内可查；可导出 |
| R2.6 | 配置下发：控制面生成 opencode 配置并同步工作区 | 修改模型策略 ≤30s 生效，无需重启工作区 |

### E3 云端工作区（核心）

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R3.1 | 每用户独立工作区：**4C8G**（requests=limits），独立 PVC | 资源隔离可验证；单用户不可见他人工作区 |
| R3.2 | 自动拉起：首次进入/调用时创建 | 创建到可交互 p95 ≤ 90s（预热池命中）/ ≤ 180s（冷启动）；进度页 <2s 可见 |
| R3.3 | 生命周期：**退出不销毁**；仅用户显式销毁 | 无自动销毁动作，PVC/Pod 按 D1 保留；`idle` = 无活跃会话但 Pod 仍运行；销毁 = 二次确认 + **冷却期默认 5min（可配 5–1440min，期间可取消）**，删除前快照；PVC 保留 24h、快照 30 天；验证见 TEST-PLAN LMT-3 |
| R3.4 | 访问：HTTPS 域名 + SSO 会话，SSE/WebSocket 透传 | 未登录跳转 SSO；断线自动重连、事件可见连续性（不承诺零丢事件，凭快照/重放补偿） |
| R3.5 | 运行时：opencode serve + git + 常用工具链 + Web 终端 | 常见语言工具链可用；版本可配置 |
| R3.6 | 健康与状态：starting/ready/idle/error，事件推送 | 状态变更 ≤2s 推送控制台 |
| R3.7 | 持久化：代码/会话/配置持久；快照与恢复 | Pod 重建后数据不丢；快照可恢复 |
| R3.8 | （P2）每用户多工作区与配额 | 默认 1 个，可配置上限 |
| R3.9 | 拉起过程体验：可离开进度页、后台继续拉起、失败可重试、失败原因可分诊 | 进度页 <2s 可见并分阶段；离开页面拉起不中断、可回来查看；失败给出错误码 + 重试 |
| R3.10 | 成本可见：工作区常驻成本提示、闲置状态徽标、可选"闲置休眠"（保留 PVC，默认关闭） | 用户可在工作区设置中看到成本与休眠开关；默认不销毁、不休眠 |

### E4 Skill 中心

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R4.1 | Skill 包规范：`SKILL.md` + 资源 + 元数据 + semver；MVP 包 ≤10MB（超限走异步分发） | 规范文档 + JSON Schema + 校验器；超限有明确错误码 |
| R4.2 | 注册/上传/审核/发布/下架；组织私有 + 平台公开 | 顺序固定为"基线评测通过 → 人工审核"；审核 SLA ≤30min；可回滚版本 |
| R4.3 | 安装到工作区（按用户/项目启用，自动同步） | 发布→安装→opencode 可用 ≤2min |
| R4.4 | 依赖与权限声明（工具/MCP/网络） | 安装前展示权限；超权拒绝 |
| R4.5 | 安全：签名、静态扫描、危险能力审批 | 高危 Skill 默认不可上架 |
| R4.6 | 使用统计与反馈 | 安装量/调用量/评分可查 |

### E5 评测中心（沙箱）

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R5.1 | 评测任务定义：数据集、用例、评分器、超时、资源 | YAML/JSON 规范 + 校验 |
| R5.2 | 沙箱执行：K8s Job + RuntimeClass 强隔离（优先 gVisor runsc；ACK 安全沙箱 Kata/runV 可替代），默认禁网/白名单 | 逃逸测试用例全部拦截；无强隔离 RuntimeClass 时记 `DEGRADED` 且不得宣称 G5 PASS |
| R5.3 | 评分：规则 / LLM-as-judge / 人工复核 | 同输入同配置结果可复现 |
| R5.4 | 报告与版本对比（通过率、耗时、成本、token） | 报告可分享；支持 A/B |
| R5.5 | 上架准入：Skill 发布前必须通过基线评测 | 未通过不可发布 |
| R5.6 | 与 CI 集成：PR 触发评测并回写结论 | GitHub Check 可见 |

### E6 应用中心

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R6.1 | 从工作区创建应用（项目/入口/运行时模板） | 支持 Node/Python/静态站点模板 |
| R6.2 | 构建：BuildKit 无根构建，推 ACR | 构建日志可查；失败可重试 |
| R6.3 | 部署：每应用 **1C2G** 容器 + Service + 域名 | 资源限额强制；超限 OOM 可观测 |
| R6.4 | 分享：组织内公开/指定用户/指定团队；角色 view/use/edit。**`public` = 平台内已登录用户可见；互联网免登录访问为禁止项** | 权限变更/撤销 ≤5s 生效；未授权 403；链接过期返回 410 `SHARE_LINK_EXPIRED`；未登录一律跳 SSO |
| R6.5 | SSO：应用访问走平台 SSO，应用级授权 | 未授权用户无法通过直链访问 |
| R6.6 | 自定义域名 + 证书自动签发（依赖用户完成 ICP 备案与 DNS 解析） | 域名绑定 → 证书就绪 ≤10min；未备案域名给出明确提示与文档 |
| R6.7 | 版本、回滚、日志、指标、休眠策略 | 回滚 ≤2min；日志可检索 |
| R6.8 | 从工作区发布应用：入口选择、构建上下文识别、发布前预检 | 工作区详情可进入发布向导；构建上下文可配置并校验 |

### E7 MCP 中心

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R7.1 | MCP 注册（stdio / SSE / streamable HTTP）+ 健康检查 | 注册后自动探活；状态可见 |
| R7.2 | 企业目录：分类、搜索、组织可见性、审批上架 | 未授权不可见 |
| R7.3 | 凭证托管：远程 MCP 凭证不出 Hub；stdio MCP 仅限无凭证白名单（凭证型 stdio 降为 M5.2，需安全审批） | 凭证可轮换；工作区不可读取远程 MCP 凭证 |
| R7.4 | 授权：用户/工作区/应用可绑定的 MCP 与工具 | 越权调用被拒绝并告警 |
| R7.5 | 代理与审计：调用日志、脱敏、限流 | 调用 100% 可追溯 |
| R7.6 | 一键绑定到 opencode 配置 | 绑定后工具列表出现且可调用 |

### E8 控制台与体验

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R8.1 | 登录、组织、个人设置、API Key 管理 | 按 IA 的"点击预算表"验收：从任意控制台页到目标任务 ≤3 次点击/按键（表格见 SCREENS） |
| R8.2 | 工作区入口：一键进入，嵌入式会话/终端 | 首屏 LCP < 2.5s |
| R8.3 | 模型中心管理页 | 支持批量授权与预览 |
| R8.4 | 四个中心页面（Skill/评测/应用/MCP） | 均有空态/加载/错误态 |
| R8.5 | 分享与权限管理面板 | 支持复制链接 + 权限预览 |
| R8.6 | 用量、配额、审计页面 | 数据可导出 CSV |
| R8.7 | 响应式、无障碍（WCAG 2.1 AA）、中英双语（默认 zh-CN，en-US 可选；用户生成内容不强制翻译） | axe 扫描 0 critical；桌面优先（≥1280 最佳，1024–1279 可用，<1024 只读/列表） |

### E9 平台工程与部署

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R9.1 | ACK 基线 Terraform（VPC/ACK/ACR/RDS/Redis/OSS/SLB） | `terraform plan` 可复现；变量化 |
| R9.2 | Helm Chart 一键部署，dev/staging/prod | 新环境 ≤30min 可用 |
| R9.3 | CI/CD：lint/test/build/scan/deploy（Argo CD） | main 分支自动到 staging |
| R9.4 | 可观测：指标/日志/追踪/告警/成本看板 | SLO 面板 + 告警规则 |
| R9.5 | 备份与灾备（DB/PVC/配置） | RPO ≤ 15min、RTO ≤ 2h；每季度恢复演练通过并留证 |
| R9.6 | 灰度与回滚 | 回滚 ≤5min |

### E10 治理与运营

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| R10.1 | 计量（资源时长 + token），账单接口 | 账单可对账 |
| R10.2 | 配额与预算（组织/用户） | 超限阻断并可申请提升 |
| R10.3 | 合规：数据保留、导出、删除 | 用户内容删除请求 30 天内完成；审计日志属合规留存（≥180 天），不随删除请求删除但脱敏；提供导出 |
| R10.4 | 运营后台 | 管理员可完成 6 类操作：用户/工作区/应用/Skill/MCP/模型策略的查询与处置，每类有审计 |
| R10.5 | 帮助中心与文档 | 关键流程 5 篇图文教程（拉起/模型策略/Skill 发布/应用分享/MCP 绑定）可站内访问 |

---

## 5. 非功能需求（NFR）

所有时效/性能指标按 `docs/05-delivery/TEST-PLAN.md` §2 的测量口径（Q-01..Q-09：并发、样本量、观测点、环境、预热）执行；无口径的指标不得作为门禁证据。

| 维度 | 指标 |
| --- | --- |
| 性能 | 控制台 LCP < 2.5s；工作区就绪 p95 ≤ 90s；API p95 < 300ms（读）/ < 800ms（写） |
| 可用性 | 控制面 99.9%；工作区 99.5%；单可用区故障不丢数据 |
| 隔离 | 每用户独立 Pod + PVC + 网络策略；用户间零信任；沙箱 gVisor |
| 安全 | OWASP ASVS L2；密钥 KMS 加密；镜像签名与扫描；最小权限 RBAC |
| 扩展性 | 支持 1,000 个**同时活跃**工作区（并发=活跃，不是常驻总数；常驻/休眠比例由容量模型定义）；10,000 用户 |
| 成本 | 单工作区 4C8G 常驻成本可观测；提供 scale-to-zero（保留数据）选项，默认关闭 |
| 可维护 | 一键部署、声明式配置、结构化日志、SLO 告警 |
| 合规 | 审计留存 ≥180 天；数据不出境（按部署地域） |

---

## 6. 技术栈与架构原则

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 引擎 | opencode（Bun/TS，`opencode serve` + SDK） | 用户指定；原生 Agent/MCP/Provider 能力 |
| 控制台 | Next.js 15 + React 19 + Tailwind + shadcn/ui | 行业通用、SSR、生态成熟 |
| 控制面 API | NestJS（Fastify） + TypeScript + OpenAPI | 模块化、契约优先、易测试 |
| 数据 | PostgreSQL 16（RDS）+ Redis 7 + OSS | 事务、缓存/队列、对象存储 |
| 编排 | ACK + Helm + Terraform + Argo CD | 阿里云标准交付路径 |
| 工作区 Operator | Go + controller-runtime（CRD `OpencodeWorkspace`） | K8s 生态标准，reconcile 可靠 |
| 模型网关 | LiteLLM Proxy | OpenAI 兼容、路由/预算/多供应商 |
| 身份 | OIDC（Keycloak / 阿里云 IDaaS）+ oauth2-proxy | 标准 SSO，应用侧零改造 |
| 沙箱 | gVisor（runsc）或 Kata Containers + K8s Job | 强隔离，标准调度 |
| 构建 | BuildKit（rootless）+ ACR | 无根构建、缓存 |
| 可观测 | OpenTelemetry + Prometheus + Grafana + Loki | 云原生标准 |
| 测试 | Vitest + Playwright + k6 + Trivy | 单测/端到端/压测/扫描 |

**架构原则**：控制面与数据面分离；每用户单实例强隔离；声明式 + reconcile；默认拒绝；一切可审计；配置即代码；上游 opencode 只读集成。

---

## 7. 交付里程碑与评审门禁

> 规则：**每个门禁由对应智能体评审，PASS 后才能进入下一阶段**；PASS-WITH-ACTIONS 需行动项关闭后放行；REJECT 打回重做。

| 里程碑 | 内容 | 门禁 | 主持 | 评审人 | 通过标准 |
| --- | --- | --- | --- | --- | --- |
| M0 立项 | 需求拆解、团队、门禁、WBS | G0 | Lead | pm-research, architect, qa-reviewer | 范围/验收/依赖/风险无歧义 |
| M1 调研与定义 | 竞品调研、用户旅程、PRD、优先级 | G1 | pm-research | architect, web-console, platform-backend, capability-centers, qa-reviewer | 结论有来源；旅程覆盖全部角色；PRD 可验收 |
| M2 架构 | 总体架构、领域模型、API 契约、安全模型、ADR | G2 | architect | infra-devops, platform-backend, qa-reviewer | 无单点；隔离可证明；API 可生成 SDK |
| M3 设计 | 信息架构、关键流程、设计系统、高保真 | G3 | web-console | pm-research, architect, qa-reviewer | 全流程可走通；组件与规范一致 |
| M4 平台核心 | 认证/模型中心/工作区/控制台 MVP | G4 | platform-backend | architect, infra-devops, qa-reviewer | E2E 冒烟通过；隔离与配额验证 |
| M5 能力中心 | Skill/评测/应用/MCP | G5 | capability-centers | architect, platform-backend, qa-reviewer | 四中心主流程可用；沙箱逃逸测试通过 |
| M6 质量与安全 | 测试、性能、安全、成本 | G6 | qa-reviewer | 全体 | 无 P0/P1 缺陷；SLO 达标；安全扫描通过 |
| M7 部署验收 | ACK 部署、灰度、回滚、运维 | G7 | infra-devops | architect, qa-reviewer, Lead | 一键部署可复现；回滚演练通过；验收报告签署 |

评审记录写入 `docs/04-reviews/Gx-*.md`，模板见 [REVIEW-GATES.md](REVIEW-GATES.md)。

---

## 8. WBS 任务清单

> 写作用域为建议范围；同域任务需串行或拆分文件。所有实现任务在 G2 通过后才可开工，G3 通过后才可进入前端联调。

### P0 立项（Lead）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T0.1 | 需求拆解、团队与门禁定义 | Lead | PLAN/ROLES/REVIEW-GATES | - | `docs/00-program/` |
| T0.2 | 上游 opencode 代码拉取与能力盘点 | Lead | `docs/00-program/OPENCODE-BASELINE.md` | T0.1 | 同上 |

### P1 调研与产品定义（pm-research）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T1.1 | GitHub 竞品/相似产品调研（≥12 个） | pm-research | `docs/01-research/COMPETITORS.md` | T0.1 | `docs/01-research/` |
| T1.2 | 用户画像与端到端旅程（5 角色） | pm-research | `docs/01-research/JOURNEYS.md` | - | 同上 |
| T1.3 | PRD v1（含优先级、指标、开放问题） | pm-research | `docs/01-research/PRD.md` | T1.1 | 同上 |

### P2 架构与契约（architect）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T2.1 | 总体架构（C4/部署/数据流） | architect | `docs/02-architecture/ARCHITECTURE.md` | G1 | `docs/02-architecture/` |
| T2.2 | 领域模型与数据模型（ER/DDL 草案） | architect | `docs/02-architecture/DATA-MODEL.md` | T2.1 | 同上 |
| T2.3 | API 契约（OpenAPI v1） | architect + platform-backend | `docs/02-architecture/openapi.yaml` | T2.2 | 同上 |
| T2.4 | 租户隔离与安全威胁模型 | architect（qa 评审） | `docs/02-architecture/SECURITY.md` | T2.1 | 同上 |
| T2.5 | 技术选型 ADR（≥8 条） | architect | `docs/02-architecture/adr/` | T2.1 | 同上 |

### P3 产品设计（web-console）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T3.1 | 信息架构、导航、关键流程线框 | web-console | `docs/03-design/IA.md` | G1 | `docs/03-design/` |
| T3.2 | 设计系统（tokens/组件/规范） | web-console | `docs/03-design/DESIGN-SYSTEM.md` | T3.1 | 同上 |
| T3.3 | 高保真关键页（控制台/工作区/分享） | web-console | `docs/03-design/SCREENS.md` | T3.2 | 同上 |

### P4 平台核心（platform-backend + infra-devops + web-console）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T4.1 | Monorepo 脚手架 + CI 基线 | infra-devops | `package.json`/`turbo.json`/`.github/` | G2 | 根配置、`.github/` |
| T4.2 | 认证、SSO、API Key、RBAC | platform-backend | `apps/control-plane/src/auth` | T4.1 | `apps/control-plane/` |
| T4.3 | 模型中心 + LiteLLM 集成 + 计费采集 | platform-backend | `apps/control-plane/src/models` | T4.2 | 同上 |
| T4.4 | 工作区编排 API（CRUD/生命周期/URL） | platform-backend | `apps/control-plane/src/workspaces` | T4.2 | 同上 |
| T4.5 | workspace-operator（4C8G/PVC/就绪探针） | infra-devops | `services/workspace-operator/` | T2.1 | `services/workspace-operator/` |
| T4.6 | workspace-agent（配置/技能同步、健康） | infra-devops | `services/workspace-agent/` | T4.5 | 同上 |
| T4.7 | 运行时镜像 + 入口脚本 | infra-devops | `deploy/docker/workspace/` | T4.6 | `deploy/docker/` |
| T4.8 | 控制台 MVP（登录/工作区/模型） | web-console | `apps/console/` | G3 | `apps/console/` |

### P5 能力中心（capability-centers）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T5.1 | Skill 中心（规范/注册/发布/安装） | capability-centers | `services/skill-center/` | G2 | `services/skill-center/` |
| T5.2 | 评测中心 + 沙箱 Job 调度 | capability-centers | `services/eval-center/` | T5.1 | `services/eval-center/` |
| T5.3 | 应用中心（构建/部署/分享/域名/SSO） | capability-centers | `services/app-center/` | T4.4 | `services/app-center/` |
| T5.4 | MCP 中心（注册/代理/审计/绑定） | capability-centers | `services/mcp-hub/` | T4.6 | `services/mcp-hub/` |

### P6 质量与安全（qa-reviewer）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T6.0 | 测试环境（kind / staging）搭建与数据准备 | infra-devops | `deploy/kind/`、环境说明 | T4.1 | `deploy/` |
| T6.1 | 测试策略 + E2E + 契约测试 | qa-reviewer | `tests/`、`docs/05-delivery/TEST-PLAN.md` | G2（契约冻结） | `tests/` |
| T6.2 | 安全测试（越权/逃逸/密钥/OWASP） | qa-reviewer | `docs/04-reviews/G6-quality-security.md` | G5 | `docs/04-reviews/` |
| T6.3 | 性能与成本压测 | qa-reviewer + infra | `docs/05-delivery/PERF.md` | G5 | 同上 |

### P7 部署与验收（infra-devops）

| ID | 任务 | Owner | 交付物 | 依赖 | 写作用域 |
| --- | --- | --- | --- | --- | --- |
| T7.1 | Terraform（ACK 基线） | infra-devops | `deploy/terraform/` | G2 | `deploy/terraform/` |
| T7.2 | Helm Chart（平台/工作区/应用） | infra-devops | `deploy/helm/` | G4 | `deploy/helm/` |
| T7.3 | 发布/回滚/运维手册 | infra-devops | `docs/05-delivery/RUNBOOK.md` | T7.2 | `docs/05-delivery/` |
| T7.4 | 验收报告与门禁结论 | qa-reviewer + Lead | `docs/05-delivery/ACCEPTANCE.md` | G6 | 同上 |

---

## 9. 风险与对策

| # | 风险 | 影响 | 对策 |
| --- | --- | --- | --- |
| 1 | 无 ACK 集群/云凭证 | 无法真实部署 | 交付 Terraform plan + kind 本地验证；真实部署作为用户输入后的执行项 |
| 2 | 4C8G 常驻成本高 | 成本超支 | 默认不销毁；提供可选 scale-to-zero（保留 PVC）；成本看板 + 配额 |
| 3 | opencode 单实例面向单用户 | 并发与隔离 | 一人一实例；控制面限流；不共享 server |
| 4 | 浏览器访问 opencode 的鉴权方式 | 体验/安全 | 网关 SSO + 短期票据 + 反代注入，避免 basic auth 暴露 |
| 5 | Skill/MCP 任意代码执行 | 安全事件 | 沙箱评测、签名、权限声明、审批、MCP 代理审计 |
| 6 | 应用构建逃逸/供应链 | 集群风险 | rootless BuildKit、镜像扫描、网络策略、资源限额 |
| 7 | 多租户数据越权 | 合规 | 每请求租户上下文、行级隔离、自动化越权测试 |
| 8 | 上游 opencode 破坏性变更 | 集成不稳 | 锁定版本 + 适配层 + 升级回归门禁 |
| 9 | opencode 服务密码 = 工作区根凭证（持有即可签发任意会话） | 工作区被接管 | 仅存 K8s Secret + 网关内存；不注入用户环境、不落日志；轮换即吊销全部会话；G2 SECURITY 专章 |
| 10 | 1,000 工作区常驻成本约 ¥72 万/月（infra 估算，单工作区 ≈¥721/月） | 商业模式不可持续 | 默认常驻（D1）+ 可选休眠档（保留 PVC）；容量分批 100→300→1000；成本看板 + 配额；G2 输出单位经济模型，定价需用户确认 |
| 11 | 工作区为 runc 半可信（共享内核），非 gVisor | 容器逃逸影响节点 | 工作区最小权限、只读根、seccomp、禁特权、NetworkPolicy；强隔离仅用于评测沙箱；SECURITY 明确"工作区=半可信"信任边界 |

---

## 10. 开放问题（需产品/客户确认，不阻塞 P1/P2）

1. 云厂商已确定为阿里云 ACK？地域与 K8s 版本？是否已有集群与 ACR？
2. SSO 提供方：Keycloak 自建 / 阿里云 IDaaS / 企业微信 / 钉钉 / 飞书？
3. 计费模式：按席位 / 按资源时长 / 按 token？是否需要真实账单？
4. 模型密钥：平台统一采购还是允许用户 BYOK？是否需要私有化模型？
5. 数据合规：是否要求数据不出境、审计留存期限？
6. 域名与证书：主域名是什么？是否支持用户自定义域名？
7. 每用户工作区数量：严格 1 个还是可多开？

---

## 11. 完成定义（DoD）

一个任务"完成"需同时满足：

- [ ] 交付物已合并到仓库对应路径，格式/链接可访问
- [ ] 验收标准逐条自测通过，证据（命令/日志/截图/测试报告）归档到 `docs/05-delivery/evidence/Gx/<runid>/`（规则见 TEST-PLAN §11.2）
- [ ] 对应门禁评审 PASS（或 PASS-WITH-ACTIONS 且行动项关闭）
- [ ] 安全与租户隔离检查无 P0/P1 问题
- [ ] 文档更新（README/架构/API/运维）
- [ ] 无新增 lint/type/test 失败
