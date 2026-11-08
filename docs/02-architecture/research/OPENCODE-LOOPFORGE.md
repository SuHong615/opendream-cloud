# OpenCode Harness 与 LoopForge 编排层研究（精炼版）

> v1.0 · 2026-11-18 · capability-centers · 仅研究，不改总纲
> 标注：**【事实】**=公开文档/仓库原文；**【推断】**=基于事实的设计判断。

## 0. 结论先行

1. **Harness 与编排必须分层**：Harness 管"Agent 如何跑"（会话/工具循环/权限/MCP/本地工作区）；编排管"团队如何按 SOP 交付"（流程/角色/人工门禁/重试补偿/运行证据）。
2. **LoopForge 值得吸收**：Chat+SOP 双模、Role 复用、Human gate 可回退/重跑、节点级证据、Executor 适配。
3. **LoopForge 不适合多域**：可信团队单实例、Main Bot 单权威、Docker socket 沙箱、无持久化执行、项目级分享。
4. **OpenCode 云/端统一**：做"一个 Harness 协议、两种运行时"——端侧本地 opencode server + 本地 worktree，云侧托管 server + 平台沙箱；统一 Session/Event/Tool/Permission/MCP/WorkspaceSnapshot 契约。
5. **OpenDream 五层**：AgentCore 独占运行时/沙箱/工作区；AgentLoop 只做观测/评测/治理/回测；Harness 是协议+工程入口；LoopForge 补 Temporal 式持久化语义；指挥中心只读态势+幂等控制命令。

---

## 1. 功能矩阵（精炼）

| 维度 | OpenCode | LoopForge | Claude Code / Codex CLI | OpenHands | Temporal / LangGraph |
| --- | --- | --- | --- | --- | --- |
| Harness 形态 | TUI/桌面/Web；server + client + `@opencode/sdk` 可嵌入【事实】 | Main Bot 对话 + 角色 subagent + CLI 执行器【事实】 | 本地 CLI/IDE；Claude 有 subagents/hooks/权限；Codex CLI 本地、Codex Web 另属云产品【事实】 | Agent Canvas/SDK/Cloud/Enterprise；对话绑定 sandbox【事实】 | 非 Harness；提供执行引擎/SDK【事实】 |
| 工具/工作区 | 工具受 agent permissions 控制；workspace=location/project dir + worktree，非云沙箱【事实+推断】 | Docker/native 沙箱、按需 clone、Git 凭据按发言人注入、租约/快照【事实】 | 本地文件/终端/Git；工作区=本地目录【事实+推断】 | 每 conversation 绑 sandbox【事实】 | Activity/Node 调外部系统【事实】 |
| 编排能力 | 无 SOP/团队编排；subagent 由父 agent 后台发起【事实】 | SOP 节点 Agent/Script/Human gate/Sub-SOP/Preview；DAG、失败回退、版本发布【事实】 | 无跨会话编排；hooks 做生命周期扩展【事实+推断】 | 多 conversation/automation，偏 agent 平台【推断】 | 持久化 Workflow/Graph、重试、定时器、信号、子流程、Saga【事实】 |
| 角色抽象 | agent=prompt+model+permissions+mode；内置 build/plan/general/explore【事实】 | Role=prompt/executor/model/rules/Skills/MCP/artifacts/gates，跨 SOP 与聊天复用【事实】 | custom subagents + 工具/权限；无团队编制【事实+推断】 | agent 配置/技能/插件【推断】 | 无角色概念【事实】 |
| 沙箱 | 本地进程权限；无内置云沙箱【事实】 | 自建 Docker/native；明确"可信团队、非多租户强隔离"【事实】 | 取决于用户本地环境【事实+推断】 | 平台 sandbox 服务【事实】 | 无沙箱；Worker 执行 Activity【事实】 |
| 审批/门禁 | allow/ask/deny；approve once/always；policy hard-deny【事实】 | Human gate：approve/add-context/send-back/retry/rerun；Needs review 收件箱【事实】 | 权限提示/审批在客户端；hooks 可拦截；无跨 run 台账【事实+推断】 | 平台审批/对话控制【推断】 | Signal/Update 可承载人工决策；无内建审批 UI【事实】 |
| 运行证据 | 事件流、session/tool 数据；实时订阅无 replay【事实】 | 节点状态、tool traces、logs、artifact 快照、token/cost、insights【事实】 | 本地日志；企业证据需自建【推断】 | 对话/运行记录、可观测集成【推断】 | Event History 全量可 replay；UI/CLI 可查【事实】 |
| 分享 | 项目/会话共享有限；无企业级分享 ACL【推断】 | 项目成员、共享会话/工作区、交付 MR；偏项目级权限【事实】 | 无平台分享模型【推断】 | Cloud/Enterprise 团队能力【推断】 | 无分享概念【事实】 |

---

## 2. Harness 与编排层边界

| 能力 | 归属 | 理由 |
| --- | --- | --- |
| 模型调用、上下文、工具循环、流式事件 | **Harness** | Agent loop 本体；编排不应理解 token/工具协议 |
| 单会话本地文件/终端/Git | **Harness（端侧）** | 延迟/离线/本地权限天然在端侧 |
| 云沙箱、快照、租约、配额 | **AgentCore（运行时）** | 跨租户隔离/调度是平台能力，Harness 仅调 Runtime API |
| MCP 连接/工具发现/OAuth | **Harness 客户端 + MCP Gateway** | 协议在 Harness；凭证/策略在网关 |
| agent 定义（prompt/model/permissions） | **Harness** | 与执行强相关 |
| SOP/角色分配/人工门禁/重试补偿/跨 run 状态 | **编排层** | 需持久化、跨会话、可审计 |
| 运行证据/成本/评测/审批台账 | **编排产出 + AgentLoop 消费** | 运行事实由编排产生，质量/合规由 AgentLoop 闭环 |
| 分享/权限/配额 | **平台控制面** | 统一身份与 ACL |

**【事实】** LoopForge 把 Main Bot、Role、SOP、沙箱、Git、审批、insights 放在同一自托管产品；对话与 SOP 共享 requirements 与证据。  
**【推断】** 这适合可信团队/单实例；企业多域会把对话权威、沙箱、编排、证据耦合在一个进程/DB，难按域隔离/计费/审计。OpenDream 应拆成 Harness 协议、Runtime API、Orchestration API、Evidence/Policy API 四个边界。

---

## 3. LoopForge 评估

### 3.1 值得吸收

1. **双模入口**：Chat 探索 → SOP 固化；两者共用需求/交付/成本口径，解决"好用但不可复现"【事实】。
2. **Role 一等资产**：prompt/executor/model/rules/Skills/MCP/artifacts/gates 打包，SOP 节点与聊天 subagent 共用【事实】。
3. **Human gate 完整动作**：approve / add-context / send-back 到指定节点 / retry / rerun from node，审批是流程控制而非二态【事实】。
4. **节点级证据**：node status、tool traces、logs、artifact snapshot、workspace preview、token/cost【事实】。
5. **Executor 适配**：同一 Role 可选 CodeBuddy/Codex/Claude Code/OpenCode/Cursor CLI 等 10 种 CLI【事实】；企业应吸收为 Executor Adapter 契约。
6. **对话工作区=运行时**：按需开沙箱、per-turn lease、checkpoint、切环境/回收、Git 凭据按发言人注入【事实】——比"每次 clone 新目录"更接近云工作区产品。

### 3.2 不适合企业多域

| LoopForge 设计 | 问题 | 改造 |
| --- | --- | --- |
| 可信团队单实例、跨项目可读、Docker socket | 多租户强隔离/跨域边界不成立 | 每域 namespace/密钥；K8s/gVisor 托管沙箱；禁宿主 socket |
| Main Bot 单对话权威 | 多业务域上下文污染 | 域级 Main Bot + 共享 Harness 协议；跨域只走编排/指挥中心 |
| SOP 仅 DAG+人工门禁+失败回退 | 缺持久化定时器/事件回放/幂等信号/Saga 补偿 | 引入 Temporal 式 Event History/Durable Execution |
| Role/executor 配 DB，无策略评审 | 角色变更=权限变更，缺版本/审批/回滚 | Role 作为版本化策略对象，走发布审批与审计 |
| 分享=项目成员 | 无外部分享/分享 token/运行分享 | 平台 ACL + share token + 证据脱敏分享 |
| Insights 按项目/团队 | 集团多域需按域/军团/成本中心核算 | Evidence 层统一事件，跨域聚合不泄露明细 |

---

## 4. OpenCode 云侧/端侧统一架构

**原则：一个 Harness 协议，两种运行时。**

```
端侧：opencode server(本地) + worktree/shell/MCP + 本地 ask 决策
云侧：托管 server(沙箱) + 平台快照/仓库 + MCP Gateway + Approval Service
                    ↓ 统一协议
Session/Event/ToolCall/PermissionRequest/WorkspaceSnapshot/Artifact
                    ↓
编排层(LoopForge) / AgentLoop(证据/评测/治理)
```

- **端侧**：本地 server；worktree/shell 本地；MCP 本地或企业网关；离线可用；ask 由本地 UI 决策。  
- **云侧**：同一 opencode server 镜像跑平台沙箱；工作区注入快照/仓库；MCP 统一走 Gateway；ask 转成 ApprovalRequest（异步/可审计）；事件写 Evidence。  
- **统一契约**：以 `@opencode/client` 的 session/event API 为基线；平台只加 `workspace snapshot / policy / approval / artifact` 扩展，不 fork agent loop。  
- **边界**：Harness 不直连业务 DB、不持长期凭证、不定义 SOP、不承担跨 run 状态；Runtime 管沙箱/快照/隔离；编排管流程/角色/门禁。

**落地顺序**：① Harness 协议（Session/Event/Permission/MCP/WorkspaceSnapshot）→ ② MCP Gateway + Approval Service → ③ Role/SOP/gate 映射到 Orchestration API → ④ 证据/分享/指挥中心视图。先协议、后编排、最后应用层。

---

## 5. 对 OpenDream 五层的映射与批判

| 层 | 应承担 | 映射 | 批判/建议 |
| --- | --- | --- | --- |
| 0 基础设施 | 模型/MCP/Skill/身份/审计/配额 | MCP、模型网关、身份 | 增加 **Evidence/Artifact 平面** 与 **Policy 平面**，避免各层重复审计 |
| 1 AgentCore | Session/Run/Tool/Workspace/Sandbox/State/Memory | opencode server + 沙箱 + Runtime API | **沙箱/工作区唯一归属**；避免 Harness/LoopForge 重复持有 |
| 2 AgentLoop | 可观测/评测/实验/治理/安全/沙箱/回测 | Temporal 式证据、评测器、策略 | **不重复持有沙箱**；沙箱是 AgentCore 能力；AgentLoop 做策略/评测/回测 |
| 3 OpenCode Harness | 云/端工程入口、协议、SDK、MCP 接入 | opencode client/server/sdk/agents/permissions | 定位"协议+工程入口"，不是运行时底座 |
| 4 LoopForge | SOP/角色/小队/军团/审批/交付 | LoopForge Role/SOP/gate + Temporal 持久化 | 补 durable execution（事件历史/信号/定时器/补偿），否则长任务/人工等待不可靠 |
| 5 指挥中心 | 态势/干预/复盘/组合 | 消费 LoopForge/AgentCore/AgentLoop 数据 | 只能"读+幂等控制命令"；**禁止双写编排状态** |

**总体批判**：五层是"产品能力分层"，不是"责任/数据/故障边界分层"。需补横切：① 身份权限（域内谁可做什么）；② Evidence/Artifact（证据产生/存储/分享）；③ 控制命令总线（指挥中心→LoopForge/AgentCore，幂等/审计）。否则会出现 Harness、AgentCore、LoopForge 三重管工作区/沙箱。

---

## 6. 来源（8 个主来源，均可核验）

1. OpenCode 文档 Intro — https://opencode.ai/docs/
2. OpenCode Agents — https://opencode.ai/docs/agents/
3. OpenCode Permissions — https://opencode.ai/docs/permissions/
4. OpenCode MCP servers — https://opencode.ai/docs/mcp-servers/
5. OpenCode SDK — https://opencode.ai/docs/build/sdk/
6. Tencent LoopForge README — https://github.com/Tencent/LoopForge
7. LoopForge Architecture — https://github.com/Tencent/LoopForge/blob/main/docs/architecture.md
8. LoopForge Conversation Workspaces — https://github.com/Tencent/LoopForge/blob/main/docs/conversation-workspaces.md

---

## 7. 一页结论

- **分层**：Harness 管"Agent 怎么跑"，编排管"团队怎么按 SOP 交付"；OpenCode 可做 Harness 内核，LoopForge 可做编排参考。
- **统一**：一个 Harness 协议、两种运行时——端侧本地 server+worktree，云侧托管 server+平台沙箱；统一 Session/Event/Tool/Permission/WorkspaceSnapshot 契约，差异下沉。
- **吸收**：Chat+SOP 双模、Role 复用、Human gate 可回退、节点级证据、Executor 适配。
- **拒绝**：可信团队单实例、Main Bot 单权威、Docker socket 沙箱、无持久化执行、项目级分享。
- **落地**：AgentCore 独占运行时/沙箱/工作区；AgentLoop 只做观测/评测/治理/回测；Harness 做协议+工程入口；LoopForge 补 Temporal 式事件历史/信号/定时器/补偿；指挥中心只读态势+幂等控制命令。先协议、后编排、最后应用层。