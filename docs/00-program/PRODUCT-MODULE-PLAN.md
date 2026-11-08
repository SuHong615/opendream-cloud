# OpenDream Cloud 产品模块与功能规划 v2（结合 opencode v2.2.5）

- 日期：2026-11-07
- 输入：`AGENTCORE-AGENTLOOP.md`（阿里云分析）、`OPENCODE-BASELINE.md`（opencode 2.2.5 基线）、G0–G7 交付物
- 目标：把现有"云工作区 + 四中心"升级为"**工作区即 Agent** 的构建—运行—观测—评测—优化"闭环产品
- 原则：opencode 为执行引擎（只读集成，锁定 2.2.5），外围控制面自研；本地 Docker 与 ACK 双模；不绑定云厂商

---

## 1. 产品定位（一句话）

> 给每个工程师/每个团队一间**云端 AI 工程工作室**：打开浏览器就有 4C8G 的 opencode 工作区；模型、Skill、MCP、应用即取即用；工作区产生的每一次会话都能被观测、评测、优化，并沉淀为团队资产。

与 AgentCore/AgentLoop 的差异：
- AgentCore = 通用 Agent 的构建/治理；我们 = **以编码工作区为运行单元的 Agent 平台**；
- AgentLoop = 通用 Agent 观测优化；我们 = 把观测/评测/经验**直接嵌入工作区与 Skill 生命周期**；
- 我们不造 Harness，用 opencode 的 Agent/Skill/MCP/Plugin 体系。

---

## 2. 模块总览（L0）

```
┌─────────────────────────────────────────────────────────────┐
│                      控制台 / OpenAPI / CLI                  │
├───────────────┬──────────────────┬──────────────────────────┤
│  构建与治理    │   运行与能力      │   观测与优化              │
│  Agent 构建    │   云工作区 4C8G   │   Trajectory / 审计       │
│  Team 任务     │   模型中心        │   评测中心                │
│  Agent 模板    │   Skill 中心      │   实验中心                │
│  纳管/注册     │   MCP 中心        │   记忆 / 经验库           │
│  凭证中心      │   应用中心 1C2G   │   成本 FinOps             │
├───────────────┴──────────────────┴──────────────────────────┤
│  身份与租户（SSO/RBAC/API Key/配额）  |  平台工程（ACK/本地）  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 模块与功能清单（L1 / L2）

### M1 身份、租户与工作空间（已有，需增强）

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| OIDC SSO | 控制面唯一 RP；本地 dev-login | 设计完成，代码待接 IdP |
| 组织/团队/成员/RBAC | owner/admin/member/viewer | 基础完成 |
| 用户 API Key | `ock_`、HMAC、scope、轮换/吊销 | 完成 |
| **AgentSpace** | 团队级资源边界（模型/技能/MCP/评测/记忆/配额） | **新增**（借鉴 AgentCore Workspace / AgentLoop AgentSpace） |
| 配额与预算 | 工作区数、CPU/内存、Token、并发 | 部分完成 |
| 审计 | 登录/Key/工作区/发布/分享/MCP/工具调用 | 完成（哈希链待补） |

### M2 云工作区（核心，已有）

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 4C8G 独立工作区 | requests=limits，QoS Guaranteed，PVC/emptyDir | ACK 已验证；本地容器已验证 |
| 生命周期 | 退出不销毁、显式销毁（5min 冷却 + 快照） | 完成（mock/K8s） |
| 秒级自动拉起 | 预热池/冷启动分档 | 设计完成 |
| 访问网关 | subdomain + ticket → 上游 Basic，SSE/WS | 本地 gateway 完成；ACK gateway 待部署 |
| 工作区模板 | 镜像/工具链/模型/技能/MCP/资源规格 | **新增**（借鉴 Agent 模板） |
| 快照/恢复 | PVC 快照、30 天保留 | 设计完成，ACK 余额受限未验证 |
| 多工作区 | 每用户 N 个、配额 | P2 |

### M3 Agent 构建与治理（新增，借鉴 AgentCore）

| 功能 | 说明 | 优先级 |
| --- | --- | --- |
| Agent 定义 | 基于 opencode `agent` 配置（模型/提示词/工具/权限） | P0 |
| **Harness 模板** | 模板 = 工作区模板 + agent 配置 + Skill/MCP 绑定 + 资源规格 | P1 |
| SubAgent | opencode 原生 agent 委托；平台可视化编排 | P1 |
| **纳管 Agent** | 注册外部 CLI/SaaS（Claude Code、Codex、自研）统一治理 | P1 |
| Agent 版本 | 配置版本、灰度、回滚 | P1 |
| **Team 任务** | Leader/Worker/子任务/任务房间/评审人（复用工作区为 Worker） | P2 |
| 凭证中心 | AK/SK Key-Value，供模型连接/MCP/工具引用 | P1 |
| IM 渠道 | 钉钉/飞书/企微 对话入口 | P2 |

> 与 opencode 的映射：`opencode.json` 的 `agent`、`model`、`tools`、`permission`；平台只做"模板化 + 版本化 + 分发"，不重写 Agent 引擎。

### M4 模型中心（已有）

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 模型连接/注册表 | provider/endpoint/protocol/credential | 完成（mock LiteLLM） |
| 模型策略 | 按 AgentSpace/角色/用户授权、deny 优先 | 完成 |
| 虚拟 Key/预算/限流 | 每工作区一把 Key | 完成（mock） |
| 配置热下发 | provider/model/policies ≤30s | 完成（本地/设计） |
| 用量与对账 | LiteLLM spend log 权威 | 设计完成 |
| 模型评测/路由 | 按任务选模型、fallback、成本路由 | P2 |

### M5 资产中心（Skill / Prompt / 模板）

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| Skill 规范/注册/版本/审核 | SKILL.md + skill.yaml 平台清单 | 完成 |
| 分发 | 签名 URL 源（`skills[]`） | 完成 |
| 安装/启用/回滚 | 工作区 agent 同步 | 完成（mock） |
| **Prompt 资产** | 版本化、灰度、变更审计（借鉴 AgentLoop Agent 资产） | P1 |
| **Agent 模板市场** | 团队内共享模板 | P2 |
| 使用统计/评分 | 安装/调用/评分 | 完成（基础） |

### M6 MCP 中心（已有）

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 注册/探活/目录 | stdio/SSE/HTTP | 完成 |
| 代理与凭证托管 | 远程 MCP 凭证不出 Hub | 完成（mock） |
| 授权/审计/限流 | 用户/工作区/应用 × 工具 | 完成 |
| 企业目录/审批 | 上架审批、组织可见性 | 完成 |
| **MCP 工具级观测** | 调用轨迹进入 Trajectory | P1 |

### M7 应用中心（已有）

| 功能 | 说明 | 状态 |
| --- | --- | --- |
| 从工作区发布应用 | 入口/构建上下文/预检 | 完成 |
| 构建/部署 1C2G | BuildKit/ACR/Ingress | mock（ACK 未验证） |
| 分享 ACL | 公开(组织内)/指定用户/团队 × view/use/edit | 完成 |
| 域名 + SSO | 自定义域名/证书/SSO | 设计完成 |
| 版本/回滚/日志/指标 | 基础 | 完成（mock） |
| **Agent 应用** | 应用可暴露 Agent 对话（opencode SDK） | P1 |

### M8 观测与审计（新增，借鉴 AgentLoop）

| 功能 | 说明 | 优先级 |
| --- | --- | --- |
| Trajectory 采集 | opencode session/message/tool/usage → 标准 Trajectory | P1 |
| 全栈拓扑 | Agent → Tool → Model（UModel 思路） | P2 |
| 审计证据链 | 不可篡改轨迹、越权/外发检测 | P1 |
| 回放 | 按会话/步骤回放 | P1 |
| 指标 | 时延/Token/成本/失败率/工具错误率 | P1 |
| 告警 | 质量退化、成本异常、越权 | P1 |

> opencode 已有 `/api/event` SSE、session/message、usage、permission 事件，可作为 Trajectory 数据源；平台侧只需采集/标准化/存储，无需自研探针。

### M9 评测中心（已有，升级为三层）

| 层 | 功能 | 状态 |
| --- | --- | --- |
| L1 数据集 | Dataset CRUD/Schema/版本/检索/SQL | **新增** |
| L2 评估器 | 预置 + 自定义；**Agent-as-Judge**（工具/多步） | 部分 |
| L3 任务 | 批量/在线/CI 门禁；报告/对比 | 完成（基础） |
| 沙箱 | K8s Job + gVisor/Kata | 设计完成（未真机） |
| Pipeline | Trace → Dataset 自动加工 | P2 |
| 排行榜/准入 | Skill 上架准入 | 完成 |

### M10 实验中心（新增，借鉴 AgentLoop）

| 功能 | 说明 | 优先级 |
| --- | --- | --- |
| Playground | 工作区/模型/Prompt 即时对比 | P1 |
| 实验计划 | 数据集 × 评估器 × 变量组 | P1 |
| A/B 与显著性 | 准确性/质量/延迟/Token/成本 | P2 |
| 质量门禁 | 变更前回归，未通过不可发布 | P1 |

### M11 记忆与经验库（新增，P2）

| 功能 | 说明 |
| --- | --- |
| Memory API | mem0 兼容，按 AgentSpace/用户隔离 |
| 记忆来源 | 对话、Trajectory、Dataset |
| Experience | 从轨迹挖掘最佳实践，组织级共享 |
| 注入 | 作为 Skill / 上下文注入 opencode |

### M12 运营与 FinOps（已有/增强）

| 功能 | 说明 |
| --- | --- |
| 运营后台 | 用户/工作区/Agent/应用/模型/MCP |
| 计量计费 | 资源时长 + Token，按 AgentSpace 归因 |
| 成本看板 | 工作区/模型/工具/应用维度 |
| 配额/预算 | 组织/用户/AgentSpace |
| 合规 | 数据保留/导出/删除、审计留存 |

---

## 4. 与现有代码的映射

| 产品模块 | 现有实现 | 缺口 |
| --- | --- | --- |
| M1 身份 | `apps/control-plane` auth/RBAC/API Key | 真实 OIDC、AgentSpace 表 |
| M2 工作区 | `workspace-operator` + `services/workspace-agent` + `local-gateway` | ACK gateway、模板、快照 |
| M3 Agent 构建 | opencode `agent` 配置 + control-plane 模型/策略 | 模板化、纳管、Team |
| M4 模型 | control-plane models/policies + mock LiteLLM | 真实 LiteLLM |
| M5 Skill | `services/skill-center` | Prompt 资产、市场 |
| M6 MCP | `services/mcp-hub` | 工具级观测 |
| M7 应用 | `services/app-center` | 真实构建/部署/域名 |
| M8 观测 | opencode event/usage + audit | Trajectory 标准、回放、告警 |
| M9 评测 | `services/eval-center` | Dataset、Agent-as-Judge、Pipeline |
| M10 实验 | — | Playground、实验计划 |
| M11 记忆/经验 | — | Memory API、Experience |
| M12 运营 | control-plane audit/usage | FinOps 看板 |

---

## 5. 分期路线（在 G0–G7 已完成基础上）

### P0（已完成）
本地/ACK 工作区、控制面、四中心、应用发布骨架、评测基础、门户与网关。

### P1（下一阶段，建议 6–8 周）
1. **Agent 模板 + AgentSpace**：把工作区、模型策略、Skill/MCP、评测/记忆收进团队边界；
2. **Trajectory 标准 + 观测页**：采集 opencode 会话/工具/用量，做轨迹/成本/失败率；
3. **评测升级**：Dataset + Agent-as-Judge + 回归门禁；
4. **纳管 Agent**：注册 Claude Code/Codex/自研，统一模型/审计/配额；
5. **凭证中心**：AK/SK 产品化；
6. **真实 OIDC + LiteLLM** 接入。

### P2（3–6 个月）
1. **Team 任务**（Leader/Worker/任务房间/评审），以工作区为 Worker；
2. **实验中心**（Playground/A-B/显著性）；
3. **Memory/Experience**（mem0 兼容 + 经验注入 Skill）；
4. **IM 渠道**（钉钉/飞书/企微）；
5. **MCP 工具级观测 + 企业目录治理**；
6. **多工作区/多 AgentSpace 配额与计费**。

---

## 6. 关键产品决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| Agent 引擎 | opencode 2.2.5（锁定 commit/镜像 digest） | 成熟编码 Agent，原生 Skill/MCP/SDK |
| Agent 构建方式 | 配置模板（Harness 轻量）+ 高代码（工作区代码）+ 纳管 | 覆盖三类用户，不重造框架 |
| Team 编排 | 平台任务层 + 工作区 Worker | 复用 4C8G 隔离单元，避免共享进程 |
| 观测 | OTel + opencode 事件流，不自研探针 | 零侵入、可私有化 |
| 评测 | Dataset + Agent-as-Judge + 沙箱 | 对齐 AgentLoop 但绑定 Skill 生命周期 |
| 记忆 | mem0 兼容 API | 生态兼容、可替换 |
| 部署 | 本地 Docker / ACK 双模 | 离线与云上统一 |

---

## 7. 指标（北极星与模块）

- **北极星**：周成功会话数（WSS）= 完成且有产出的 opencode 会话数；
- 激活：首日创建并进入工作区比例；
- 工作区：拉起 P95（C1 ≤90s）、7 日留存（不销毁）；
- 能力：Skill 安装→使用率、MCP 工具调用成功率；
- 质量：评测通过率、Bad Case 率、变更回归拦截率；
- 成本：单会话 Token/成本、工作区利用率、FinOps 节省；
- 治理：越权/审计事件数、配额超限率。

---

## 8. 风险与开放问题

1. opencode 升级（2.2.5 → 更高版本）可能改配置/事件结构：锁定版本 + 适配层 + 回归门禁；
2. Team/多 Agent 协作的计费与配额归属：按 AgentSpace 归因；
3. Trajectory 存储成本：采样 + 分层保留（热 30 天/冷归档）；
4. Agent-as-Judge 的可靠性与成本：预置评估器 + 人工校准；
5. 纳管 Agent 的安全边界：凭证托管 + 网络策略 + 审计；
6. 本地 Docker 与 ACK 能力差异需在产品中显式标注（DEGRADED）。

---

## 9. 参考

- 阿里云 AgentCore / AgentLoop 分析：[AGENTCORE-AGENTLOOP.md](../01-research/AGENTCORE-AGENTLOOP.md)
- opencode 基线：[OPENCODE-BASELINE.md](OPENCODE-BASELINE.md)
- 现有验收：[ACCEPTANCE.md](../05-delivery/ACCEPTANCE.md)
- 本地部署：[LOCAL-DEPLOYMENT.md](../05-delivery/LOCAL-DEPLOYMENT.md)
