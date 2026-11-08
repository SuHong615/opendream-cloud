# OpenDream Cloud

> **企业 AI Native 基础设施（AI Native Infrastructure）**
>
> **4 个功能平面 + 1 个横切质量平面 + 基础设施**：
> **AgentCore（执行）· OpenCode Harness（工程）· LoopForge（编排）· 数字军团指挥中心（应用）**，由 **AgentLoop（质量/治理）** 横切，底座是模型/MCP/Skill/身份/审计/配额。
>
> > 说明：这不是“五层线性堆叠”。AgentCore 提供运行时与边界治理原语；AgentLoop 是跨运行时的质量平面；OpenCode Harness 是协议与工程入口；LoopForge 是持久化编排；指挥中心只读投影 + 幂等控制命令。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)](docs/04-reviews/COMPLETION-AUDIT.md)
[![Bun](https://img.shields.io/badge/runtime-Bun%201.4-black.svg)](https://bun.sh)
[![Next.js](https://img.shields.io/badge/console-Next.js%2015-black.svg)](https://nextjs.org)
[![Self-hosted](https://img.shields.io/badge/deploy-self--hosted-526ce8.svg)](deploy/local/docker-compose.yml)

> ⚠️ **Alpha / 非生产级**：当前适合方案验证、私有化试点与二次开发；真实 AgentCore Runtime、AgentLoop 回测/安全闭环、K8s HA、企业 SSO/SCIM 仍需补齐。详见 [完成度审计](docs/04-reviews/COMPLETION-AUDIT.md)。
>
> **非官方声明**：OpenDream Cloud 是独立项目，基于开源 [opencode](https://github.com/anomalyco/opencode) 构建 Harness 工程，**不是** opencode 官方发行版/云服务；LoopForge 为独立实现，与 [Tencent/LoopForge](https://github.com/Tencent/LoopForge) 无隶属关系。

## 1. 我们建设什么

**企业 AI Native 基础设施**，不是聊天框，不是单点 Agent 搭建器。

```text
┌─────────────────────────────────────────────────────────────────────┐
│ 应用平面：数字化军团指挥中心                                        │
│ 数字孪生指挥作战中心：任务/军团/资源/风险/审批/干预/复盘/组合        │
│ 只读投影 + 幂等控制命令；不持有编排状态                              │
├─────────────────────────────────────────────────────────────────────┤
│ 编排平面：LoopForge                                                 │
│ SOP/角色数字人/小队/军团/门禁；事件历史/信号/定时器/补偿            │
│ 构建在 AgentCore 之上                                               │
├─────────────────────────────────────────────────────────────────────┤
│ 工程平面：OpenCode Harness                                          │
│ 一个 Harness 协议，两种运行时（云端/端侧）                          │
│ 会话/工具循环/权限/MCP/工作区；不定义业务流程                       │
├─────────────────────────────────────────────────────────────────────┤
│ 执行平面：AgentCore Runtime                                         │
│ Session/Run/Tool/Workspace/Sandbox/State/Memory + 边界 PEP          │
├─────────────────────────────────────────────────────────────────────┤
│ 横切质量平面：AgentLoop                                             │
│ Trace/审计/评测/数据集/实验/回放/回测/安全/发布门禁                 │
├─────────────────────────────────────────────────────────────────────┤
│ 基础设施：模型 / MCP / Skill / Prompt / 身份 / 审计 / 配额 / 数据    │
└─────────────────────────────────────────────────────────────────────┘
```

### 平面职责

| 平面 | 定位 | 关键能力 | 不拥有 |
| --- | --- | --- | --- |
| **AgentCore** | 执行平面 | Session、Run、Tool、Workspace、Sandbox、State、Memory、边界 PEP | 业务流程/评测/指挥 |
| **OpenCode Harness** | 工程平面 | 云/端 Harness 协议、工具循环、权限、MCP、工作区 | 跨会话 SOP/审批台账 |
| **LoopForge** | 编排平面 | SOP、角色数字人、小队/军团、门禁、事件历史 | 运行时/沙箱/评测 |
| **AgentLoop** | 横切质量平面 | Trace、审计、Eval、Dataset、Experiment、回放/回测、门禁 | Agent 执行/沙箱生命周期 |
| **数字军团指挥中心** | 应用平面 | 数字孪生态势、风险、干预、复盘、组合 | 执行 Agent/编排状态 |

## 2. 面向谁

- **AI Native Builder**：用 OpenCode Harness 快速构建/接入/分享应用；
- **领域专家/角色设计师**：用 LoopForge 从流程识别角色，定义角色数字人，编成军团；
- **开发者**：扩展 AgentCore、工具、MCP、Harness；
- **平台/质量工程师**：用 AgentLoop 做可观测、评测、实验、安全、回测；
- **作战指挥官/业务负责人**：在军团指挥中心指挥、干预、复盘；
- **平台/IT 管理员**：私有化、权限、成本、安全；
- **企业高管**：组合价值与 AI Native 转型；
- **普通员工**：用数字同事完成日常工作。

## 3. 面向任何业务

平台是横向 AI Native 基础设施，行业差异由 **角色包 + SOP 包 + MCP 连接器 + 行业模板** 解决：

- 软件研发：需求→实现→测试→评审→发布；
- 客户运营：工单→分诊→答复→升级；
- 财务：票据→对账→异常→审批；
- 供应链：预测→补货→异常→协同；
- HR/IT：入职→政策→工单；
- 销售/售前：线索→方案→报价；
- 数据：取数→分析→报告。

## 4. 为什么是现在：5 看 3 定与 SWOT

### 5 看

| 维度 | 判断 |
| --- | --- |
| **看宏观** | AI Native 成为企业底座；Agent 从问答走向执行；私有化/治理/成本成为刚需 |
| **看行业** | 编码 Agent 强但偏单点；云 Agent 平台强但绑定；企业缺少自己的 AI Native 基建 |
| **看客户** | Builder 缺构建/分享；领域专家缺角色化；指挥官缺指挥台；质量团队缺闭环 |
| **看竞争** | LoopForge/Codex/Claude Code、云 Agent 平台、Dify/Coze、RPA、自研框架 |
| **看自己** | 4+1+1 平面叙事 + 全栈私有化是优势；AgentCore/AgentLoop 真实能力、IA/UX、案例是短板 |

### 3 定

- **定战略**：企业 AI Native 基础设施，不做单点工具/封闭 SaaS。
- **定目标**：先以软件交付为楔子，建立设计伙伴与真实闭环，再复制行业包与伙伴生态。
- **定路径**：AgentCore → AgentLoop → OpenCode Harness → LoopForge → 指挥中心 → 行业包/生态。

### SWOT 摘要

| | 机会（O） | 威胁（T） |
| --- | --- | --- |
| **优势（S）** | 4+1+1 平面叙事 + 全栈私有化；opencode Harness 云边一致；LoopForge/指挥中心差异化 | 用私有化/治理对抗云厂商；用行业深度对抗价格战；用开源对抗克隆 |
| **劣势（W）** | 用设计伙伴补案例；行业包补交付；开源补品牌 | 收缩范围，先做一条真实闭环，避免大而全 |

**机会点**：软件交付军团（P0）→ OpenCode Harness 构建/分享（P0）→ 军团指挥中心（P1）→ 行业包（P1）→ 生态市场（P2）。

## 5. 产品规划与 90 天

| 阶段 | 目标 |
| --- | --- |
| **Phase 0 收口** | 导航收敛为「指挥 / 编排 / 构建 / 质量 / 能力 / 治理」；旧路由重定向；IA/领域模型定稿 |
| **Phase 1 骨架** | AgentCore Runtime 抽象、LoopForge 编排、OpenCode Harness 统一接入、指挥中心原型 |
| **Phase 2 闭环** | AgentLoop 可观测/评测/实验/安全/沙箱/回测；真实执行器；NATS |
| **Phase 3 规模化** | 行业包、伙伴、市场、K8s HA/SSO/安全 |

**90 天硬指标**：3 家设计伙伴；一条真实闭环；Builder 首个应用 < 30 分钟；指挥官从态势到干预 ≤ 3 次点击；角色复用率 ≥ 40%；AgentCore/AgentLoop PoC。

## 6. 当前可用能力（Alpha）

### LoopForge 编排

入口：`/orchestration/loopforge`

- 工作台：Main Bot → 军团战役；
- SOP：模板/定义/节点预览/画布设计器（拖拽/连线/版本对比/回滚）；
- 角色：Role 注册表（Prompt/模型/执行器/Skills/MCP/Rules/交付物/门禁）；
- 军团/需求/审批/能力/评测/治理。

### 能力中心

- 模型中心、MCP 中心、Skill/Prompt、Agent 模板、凭证中心。

### 双 Harness

| Harness | 定位 |
| --- | --- |
| 云端 OpenCode Harness | 云端工作区、沙箱、opencode、MCP |
| 桌面 OpenDream Code | 本地文件/终端/Git、opencode、模型/MCP 同步 |

## 7. 业务飞轮

```text
业务目标 → 流程识别角色数字人 → 编成小队/军团
→ AgentCore 执行 / AgentLoop 质量闭环 / 人工门禁
→ 交付物 + 成本 → 指挥中心复盘
→ 角色/SOP/Skill 沉淀 → 更多业务复用
```

## 8. 快速开始（Docker）

```bash
cd deploy/local
cp .env.example .env
docker compose up -d --build
docker compose ps
```

| 入口 | 地址 |
| --- | --- |
| 企业门户 | http://localhost:3000/ |
| 控制台 | http://localhost:3000/workspaces |
| **LoopForge 编排** | **http://localhost:3000/orchestration/loopforge** |
| 工作流中心 | http://localhost:3000/workflows |
| 控制面 | http://localhost:4000/healthz |
| **AgentCore Runtime** | `http://localhost:4110/healthz` |
| **OpenCode Harness** | `http://localhost:4111/healthz` |
| **AgentLoop** | `http://localhost:4112/healthz` |
| **Command Center** | `http://localhost:4113/healthz` |
| Postgres（可选） | `localhost:55432` |

## 9. 本地开发

```bash
bun install
bun run --cwd apps/control-plane start
bun run --cwd apps/console dev
bun run lint
bun run test
```

## 10. 目录结构

```text
apps/console / apps/desktop / apps/control-plane
services/workflow-engine / agent-workforce / mcp-hub / skill-center
services/eval-center / experiment-center / app-center / memory-service
packages/shared / packages/schema
deploy/local / deploy/gateway
docs / scripts / tests
```

## 11. 文档地图

- [AI Native OS 总纲](docs/00-program/AI-NATIVE-OS.md)
- [架构研究合并与审视](docs/02-architecture/research/SYNTHESIS.md)
- [平面契约 v1](docs/02-architecture/PLANE-CONTRACT.md)
- [P1-1 文件级迁移矩阵](docs/02-architecture/MIGRATION-MATRIX.md)
- [M2 AgentCore Runtime](docs/02-architecture/M2-AGENTCORE.md)
- [M2b Legacy Run 迁移](docs/02-architecture/M2B-MIGRATION.md)
- [M3 OpenCode Harness](docs/02-architecture/M3-HARNESS.md)
- [M4 Orchestration 迁移](docs/02-architecture/M4-ORCHESTRATION.md)
- [M5 AgentLoop](docs/02-architecture/M5-AGENTLOOP.md)
- [M6 Command Center](docs/02-architecture/M6-COMMAND-CENTER.md)
- [M7 旧路由下线](docs/02-architecture/M7-DEPRECATION.md)
- [ADR-018 平面模型](docs/02-architecture/adr/ADR-018-ai-native-planes.md)
- [独立架构评审](docs/04-reviews/AI-NATIVE-ARCH-REVIEW.md) · [闭环记录](docs/04-reviews/AI-NATIVE-ARCH-REVIEW-RESOLUTION.md)
- [AgentCore/AgentLoop 研究](docs/02-architecture/research/AGENTCORE-AGENTLOOP.md)
- [OpenCode/LoopForge 研究](docs/02-architecture/research/OPENCODE-LOOPFORGE.md)
- [企业指挥中心研究](docs/02-architecture/research/ENTERPRISE-COMMAND.md)
- [SP/BP](docs/00-program/SP-BP.md)
- [5 看 3 定 / SWOT](docs/01-research/OPPORTUNITY-5-3-SWOT.md)
- [价值分析](docs/01-research/VALUE-ANALYSIS.md)
- [用户旅程](docs/01-research/USER-JOURNEY.md)
- [产品定位](docs/01-research/PRODUCT-POSITIONING.md)
- [产品定义](docs/01-research/PRODUCT-DEFINITION.md)
- [产品设计](docs/03-design/PRODUCT-DESIGN.md) · [UX](docs/03-design/UX-DESIGN.md)
- [ARCH-V5](docs/02-architecture/ARCH-V5.md) · [LoopForge 整合](docs/02-architecture/LOOPFORGE-INTEGRATION.md)
- [测试方案](docs/04-reviews/TEST-PLAN.md) · [重构方案](docs/04-reviews/REFACTOR-PLAN.md)
- [全部文档](docs/README.md)

## 12. 质量与门禁

- `bun run test` / `tests/e2e` / `bun run check:license` / CI

## 13. 开源许可

- 自研代码 Apache-2.0，作者 suhong；
- 第三方组件保留各自许可证；
- 上游 OpenCode MIT；
- 本项目不是 OpenCode 官方发行版，也不是 LoopForge 官方项目。

## 14. 参与贡献

见 CONTRIBUTING / CODE_OF_CONDUCT / SECURITY。
