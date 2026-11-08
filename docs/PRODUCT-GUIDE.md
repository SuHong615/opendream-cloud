# 产品指引（Product Guide）

> **当前定位：Alpha / 可演示、可二次开发，不是生产级产品。**
> 本版本没有完成高可用、真实企业 SSO、生产数据库、密钥托管、审计合规与容量验证；请勿直接承载生产流量。

## 1. 一句话

**OpenDream Cloud** 是一个以 [opencode](https://github.com/anomalyco/opencode) 为执行引擎的企业 AI 工程平台：
为每个用户提供持久化云端工作区，并在此基础上提供模型中心、MCP 中心、Skill/Prompt 资产、应用中心、工作流、评测、实验、记忆、可观测、组织配额，以及**数字员工 / 专家小队**（Agent Workforce）。

## 1.1 企业价值与落地场景

企业需要的不是“另一个聊天框”，而是把模型、企业系统（MCP）、知识、流程、权限组合成**可治理、可复用、可计量的数字员工/专家小队**，嵌入现有业务系统。

| 场景域 | 可落地场景 | 企业提效点 |
| --- | --- | --- |
| 研发交付 | 需求拆解、编码、代码审查、测试生成、发布自查 | 缩短需求→合并→发布周期，减少重复劳动 |
| 客户服务 | 工单分诊、知识检索、回复草稿、7×24 多语言 | 降低首响时间与单票成本，人工只做升级/兜底 |
| 财务合规 | 发票抽取、对账、合同审查、付款审批 | AI 初筛 + 人工终审，缩短周期、降低错误 |
| 数据决策 | 自然语言取数、经营周报、异常归因 | 业务自助取数，释放数据团队产能 |
| HR/内部服务 | 入离职办理、政策问答、面试安排、IT 支持 | 高频流程自动化，提升员工体验 |
| 销售/专业服务 | 投标方案、客户拜访简报、报价/合同初稿 | 资料整合与初稿提速，人做判断与客户关系 |

**推荐试点方法**：

1. 选 1–2 个高频、规则清晰、结果可校验、风险可控的场景；
2. 用真实基线定义指标：节省工时、周期时间、自动解决率、人工接管率、风险事件；
3. 2–4 周 POC（10–30 名种子用户）→ 4–8 周部门试点 → 规模化；
4. 高风险动作（付款/合同/生产变更）始终保留人工门禁与全量审计。

完整的场景库、ROI 测算示例、分阶段落地路径与企业级边界见 **[企业价值与 AI 落地场景](ENTERPRISE-VALUE.md)**。

## 1.2 双引擎与门户

- **OpenDream Cloud**：托管工作区、应用中心、团队协作、治理与审计；
- **OpenDream Code（桌面端）**：本地文件/终端/Git、本地 opencode 引擎，**不含应用中心**；模型与 MCP 从云端自动同步。

控制台「设备与桌面端」可生成一次性配对码、查看/断开已连接设备。企业门户首页 `/` 展示双引擎介绍与下载，右上角「控制台」登录后进入原有全部功能。详见 [双引擎架构](02-architecture/DUAL-ENGINE.md)。

## 2. 目标用户与角色
| 角色 | 典型诉求 | 平台能力 |
| --- | --- | --- |
| 开发者 | 随时打开 4C8G 工作区写代码、调用模型/MCP | 工作区、模型中心、MCP、Skill |
| 平台管理员 | 接企业模型、管配额、审计 | 模型供应商、组织/配额、审计、可观测 |
| 业务团队 | 不写代码也能用专家小队完成业务 | 数字员工、专家小队、工作流、应用中心 |
| 质量/算法 | 评测、对比模型/Prompt | 评测中心、实验中心、Memory |
| 外部客户 | 在企业应用内使用 AI 能力 | 应用分享、embed token、SSO（规划） |

## 3. 功能地图| 模块 | 页面 | 服务/端口 | 说明 |
| --- | --- | --- | --- |
| 工作区 | `/workspaces` | control-plane :4000 + workspace :4096 | 4C8G、PVC 持久化、显式销毁 |
| 模型中心 | `/models` | control-plane | 供应商 CRUD、密钥加密、连通测试、配置下发 |
| MCP 中心 | `/mcp` | mcp-hub :4104 | 生命周期、版本/渠道、工具目录、EdDSA Ticket 网关 |
| Skill 中心 | `/skills` | skill-center :4101 | 上传式新增、卡片分页、内容/代码/审查/调试/版本/启用六页签 |
| Prompt 库 | `/prompts` | control-plane | 系统预置 + 组织自定义 |
| 应用中心 | `/apps` | app-center :4103 | 权限/分享、协同修改、diff/审批/版本 |
| 工作流 | `/workflows` | workflow-engine :4105 | DSL、11 模板、运行、人工任务、补偿 |
| 数字员工 | `/employees` | agent-workforce :4106 | 岗位/技能/MCP/记忆/自治、Guardrails、版本快照 |
| 专家小队 | `/squads` | agent-workforce :4106 | lead+members 编排、人工门禁、定时排班、运行时间线 |
| 评测中心 | `/eval` | eval-center :4102 | 数据集、评估器、运行、报告 |
| 实验中心 | `/experiments` | experiment-center :4108 | A/B 变体、指标、winner |
| 记忆/经验 | `/memory` | memory-service :4107 | mem0 兼容内部面 + experience |
| 可观测 | `/observability` | control-plane | 工作区/Token/成本/服务健康 |
| 组织与配额 | `/org` | control-plane | 成员、角色、配额 |
| 用量 | `/usage` | control-plane | requests/tokens/cost 汇总 |
| 审计 | `/audit` | control-plane | 操作审计 |

## 4. 快速开始

### 4.1 Docker（推荐体验）

```bash
cd deploy/local
cp .env.example .env   # 按需修改
docker compose up -d --build
docker compose ps
```

访问：

- 控制台：http://localhost:3000/login
- 控制面：http://localhost:4000/healthz
- 工作区网关：http://localhost:8080
- MCP 网关：http://localhost:8080/mcp/v1/{orgSlug}/{serverSlug}

**演示账号**：`lilei@xingyun.example`（开发登录，任意邮箱可创建新组织；演示账号已有工作区与 Mock 模型）。

### 4.2 本地开发

```bash
bun install
bun run --cwd apps/control-plane start   # :4000
bun run --cwd apps/console dev           # :3000
bun scripts/smoke-api.ts http://127.0.0.1:4000
```

## 5. 核心使用流程

1. **接入模型**：模型中心 → 添加供应商（API Key 可选，本地推理可留空）→ 测试连通 → 设为默认；
2. **绑定 MCP**：MCP 中心 → 新建/发布服务 → 创建 binding → 工作区获得工具；
3. **创建 Skill/Prompt**：上传 SKILL.md/代码 → 审查 → 发布/启用；
4. **使用数字员工/专家小队**：选择小队 → 输入目标 → 小队拆解/执行 → 人工门禁审批 → 交付物；
5. **搭建工作流**：模板/DSL → 发布 → 运行 → 人工任务/补偿；
6. **评测/实验**：数据集 + 评估器 → 运行 → 报告；实验中心对比变体；
7. **应用协同**：应用中心创建 → 分享/协同 → 对话生成提案 → diff → 审批 → 新版本；
8. **治理**：组织成员/配额、Guardrails、审计、可观测。

## 6. 关键边界与已知限制（Alpha）

| 领域 | 当前实现 | 生产要求 |
| --- | --- | --- |
| 数据 | 多数服务内存 store；control-plane SQLite | PostgreSQL + 迁移/备份/恢复 |
| 身份 | dev-login；OIDC/SCIM 未接 | 企业 IdP、RBAC/ABAC、会话管理 |
| 模型 | Mock/OpenAI 兼容；密钥 AES-GCM 本地 | KMS/Vault、租户级密钥 |
| 工作流 | 轻量内存引擎 | Temporal + 持久化/重试/可观测 |
| 数字员工 | 内存运行、mock LLM | 持久化、真实模型、配额/审计 |
| 网关 | 本地 local-gateway + 模板 | Higress/agentgateway 真机 |
| 高可用 | 单机 Docker | 多副本、PDB、HPA、灾备 |
| 合规 | 基础审计 | 等保/审计留存/数据脱敏 |
| 旧数字人 | avatar/RTC legacy，已下线导航 | 不属于数字员工能力 |

详见 [COMPLETION-AUDIT.md](04-reviews/COMPLETION-AUDIT.md)。

## 7. 目录结构

```
apps/
  console/            Next.js 控制台
  control-plane/      控制面 API（认证/工作区/模型/MCP/应用/审计/配额）
services/
  mcp-hub/            MCP Registry + 网关
  skill-center/       Skill 资产
  eval-center/        评测
  experiment-center/  实验
  app-center/         应用权限/协同
  workflow-engine/    工作流
  agent-workforce/    数字员工/专家小队
  memory-service/     记忆/经验
  local-gateway/      本地工作区网关
  mock-model/         本地模型占位
  workspace-operator/ K8s Operator（Go）
packages/
  shared/             共享库
  schema/             工作流 DSL Schema/校验器
deploy/
  local/              本地 Docker Compose
  gateway/            Gateway API / Higress 模板
docs/                 产品/架构/交付/评审文档
scripts/              开发/验证/工具脚本
tests/                单测/契约/E2E
```

## 8. 版权与许可

- 自研代码：**Apache License 2.0**（`LICENSE`），作者 **suhong**；
- 第三方组件：遵循各自许可证，见 `THIRD_PARTY_NOTICES.md`；
- 上游 OpenCode：MIT，见其仓库 LICENSE；
- 本项目不是 OpenCode 官方发行版。
