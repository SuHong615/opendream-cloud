# AI Native 架构总纲独立评审（AI-NATIVE-ARCH-REVIEW）

- 评审人：qa-reviewer（独立评审，不参与总纲撰写）
- 日期：2026-11-18
- 评审对象：`docs/02-architecture/research/SYNTHESIS.md`、`docs/00-program/AI-NATIVE-OS.md`、`docs/02-architecture/ARCH-V5.md`、`docs/02-architecture/research/AGENTCORE-AGENTLOOP.md`、`docs/02-architecture/research/OPENCODE-LOOPFORGE.md`、`docs/02-architecture/research/ENTERPRISE-COMMAND.md`
- 方法：逐文档核对“职责/边界/接口/数据/安全/与实现差距”，**结论与措辞不复用原文**；不修改任何总纲文件。

---

## 1. 结论

**PASS-WITH-ACTIONS**（方向可进入下一阶段，但 **P0 未闭合前不得进入实现排期**）。

理由：
- 研究质量与证据分级（事实/推断/未核实）在同类架构文档中属于上乘；把“五层线性”改为“功能平面”的判断是正确的（`SYNTHESIS.md:52-62`、`AI-NATIVE-OS.md:41-49`）。
- 但五份文档目前是**方向级总纲**，不是**可执行架构**：平面之间的所有权、事件/数据契约、PEP/审批唯一性、命令语义、与现有代码的迁移路径均未固化，且存在跨文档口径冲突。
- 存在 4 个 P0（所有权、命名/复用决策、策略与审批唯一性、事件数据契约）与 5 个 P1；在这些闭合前开工，会重复过去“多层各自实现、最后靠重构收敛”的问题（`REFACTOR-PLAN.md` 已自述同类诊断）。

---

## 2. 五个最强设计点

1. **用“平面”替代“线性分层”是正确抽象**：平面之间是正交关系（执行/工程/编排/质量/应用），不再回答“谁在谁上面”，避免把产品能力误当责任边界（`SYNTHESIS.md:52-62`；`ARCH-V5.md:7-29`）。
2. **质量平面独立且跨运行时**：把 Trace/Eval/Dataset/Experiment/Backtest/Policy 验证收敛为横切能力，而不是塞进构建器或运行时的“附属页”（`AI-NATIVE-OS.md:83-91`；`AGENTCORE-AGENTLOOP.md:53-62`）。
3. **执行权与指挥权分离，且指挥中心只读投影 + 幂等命令**：这是对“控制台=指挥中心”反模式的明确否定（`AI-NATIVE-OS.md:64-68`；`ENTERPRISE-COMMAND.md:97-104`）。
4. **“回放/回测/仿真”分家**：识别出三者确定性/成本/分布不同，禁止用“重跑一遍”冒充回放（`AGENTCORE-AGENTLOOP.md:45-51`；`SYNTHESIS.md:136`）。
5. **研究证据纪律**：事实/推断/未核实分级、来源访问日期、营销声明不采信为事实（`ENTERPRISE-COMMAND.md:35-41, 429-451`；`AGENTCORE-AGENTLOOP.md:4-9`）；这在架构研究中很少见，应保留为后续所有 ADR 的硬要求。

---

## 3. 五个最大风险 / 漏洞

### R1 边界：工作区/沙箱/会话存在“三重所有权”（P0）
- `ARCH-V5.md:35` 把 Workspace/Sandbox 归 AgentCore；`SYNTHESIS.md:92` 又说 Harness 通过 Runtime API 管理；但 `OPENCODE-LOOPFORGE.md:86-88` 写“云侧：托管 server（沙箱）+ 平台快照”并把 Approval 放在 Harness 侧——读者无法判断**谁创建/销毁/快照工作区**，谁对 `session_id` 的租户与生命周期负责。
- `SYNTHESIS.md:93-94` 同时定义 “LoopForge ↔ AgentCore” 与 “LoopForge ↔ Harness” 两条接口，意味着编排可能绕过执行平面直接调 Harness；与“LoopForge 构建在 AgentCore 上”（`AI-NATIVE-OS.md:73`）矛盾。

### R2 重复：审批、门禁、策略各有 2–3 个“权威”（P0）
- 审批：LoopForge `Gate`（`AI-NATIVE-OS.md:57`）、AgentLoop “发布门禁”（`AI-NATIVE-OS.md:91`）、Command `ApprovalRequest`（`ENTERPRISE-COMMAND.md:216, 237`）；谁是决策事实源、谁写审批台账、谁可重放，未定义。
- 策略：AgentCore “边界 PEP”（`ARCH-V5.md:35`）、基础设施 “MCP Gateway PEP”（`SYNTHESIS.md:97`）、AgentLoop “Policy 验证”（`AI-NATIVE-OS.md:58`）三处都出现 policy；未说明“验证/建议”与“执行/拦截”的边界，存在策略绕过与双写风险。
- 质量门禁与编排门禁语义重叠：`Gate` 与 `EvalRun` 门禁失败时，谁阻断发布、谁回滚，未定义。

### R3 数据：两套事件目录 + 实体重复 + 无契约版本（P0）
- `ARCH-V5.md:86-99` 的事件是 `agent.* / harness.* / loopforge.* / agentloop.* / command.*`；`ENTERPRISE-COMMAND.md:246-259` 的事件是 `task.* / run.* / step.* / tool.* / approval.* / intervention.*`。两套目录无映射、无版本、无 owner，无法做跨平面投影。
- 实体重复：`Run` 同时出现在 AgentCore（`ARCH-V5.md:110`）与 Command（`ENTERPRISE-COMMAND.md:212`）；`ApprovalRequest` 与 `Gate`、`PolicyDecision` 关系未定义；`TwinSnapshot` 的“事实源”未指明。
- 租户/保留/PII：`ARCH-V5.md:117` 只说“所有表带 org_id”，但事件信封用 `tenant_id`（`ENTERPRISE-COMMAND.md:265`）；RLS、保留期、Trace 脱敏、数据集跨租户共享均无约束（`AGENTCORE-AGENTLOOP.md:90-97` 只有字段，没有隔离策略）。

### R4 执行：现有代码与目标平面之间没有可执行迁移（P1）
- 仓库现状是 `apps/control-plane` 单体 + `services/agent-workforce`（`server.ts` 内 Run/Task/Mission 原型）、`workflow-engine`（轻量状态机）、`experiment-center`、`memory-service`、`eval-center` 等；**没有** `agentcore` 运行时抽象、`opencode-harness` 协议、`loopforge` 持久化引擎、`command-center` 投影服务（`REFACTOR-PLAN.md` 的目标目录仍是计划）。
- 总纲差距表（`SYNTHESIS.md:116-125`）只到“混合/分散”级别，没有文件级映射、改造顺序、兼容期双写策略、回滚点；对“复用 AgentCore/LoopForge”的表述容易被误读为直接复用第三方产品（它们分别是 AWS 与腾讯的产品名，见 `AGENTCORE-AGENTLOOP.md:6-22`、`OPENCODE-LOOPFORGE.md:118`），而实际必须**自建内部实现或适配器**。
- 干预语义自相矛盾：`ENTERPRISE-COMMAND.md:244` 要求“任何 Intervention 可回滚或可补偿”，但同一文档的 `pause/resume/takeover/terminate`（`:217, 237`）中 `takeover/terminate` 本质不可逆；缺少可逆/可补偿/不可逆分类与补偿设计。

### R5 安全：多租户/命令/PII 三条攻击面未闭合（P0）
- 指挥中心“只读投影 + 幂等命令”没有命令总线契约：谁可发 `intervention.issued`、如何防重放/越权（`ENTERPRISE-COMMAND.md:216-217, 255`；`ARCH-V5.md:78-82`）。若命令总线被直接调用，等于绕过 LoopForge 审批。
- Trace/Eval 数据集含 prompt、工具参数、输出内容；`AGENTCORE-AGENTLOOP.md:90-97` 的 `args_hash` 只覆盖工具参数哈希，未覆盖模型输入/输出脱敏、跨租户 Trace 隔离、保留期（企业合规必需）。
- PEP 位置未唯一：网关边界 vs 沙箱边界（`SYNTHESIS.md:97`；`ARCH-V5.md:144-147`）不同实现可能给出不同决策；`policy_decision_id` 未要求贯穿 ToolCall/Step/审计。

---

## 4. 逐平面审查表

| 平面 | 职责是否清晰 | 是否越界 | 接口是否可验收 | 主要问题 |
| --- | --- | --- | --- | --- |
| **AgentCore（执行）** | 中：Session/Run/Tool/Sandbox/State 清楚，但把 Model Gateway、Identity、Policy PEP 也纳入后与“基础设施”重叠（`ARCH-V5.md:35` vs `:40`） | **是**：Workspace/Sandbox 与 Harness 云侧、LoopForge 工作区语义冲突（`OPENCODE-LOOPFORGE.md:86-88`） | **否**：REST 示例无 schema、无租户/鉴权/幂等/状态机/错误码/事件契约（`ARCH-V5.md:50-57`） | 需定义“执行原语”最小集与唯一所有权；Model/Identity 下沉基础设施或明确为边界原语 |
| **OpenCode Harness（工程）** | 高：一个协议两种运行时、不定义业务（`AI-NATIVE-OS.md:93-100`） | **是**：云侧“托管 server（沙箱）+ Approval”把沙箱与审批放进 Harness（`OPENCODE-LOOPFORGE.md:86-87`），与 AgentCore/审批唯一性冲突 | **否**：Session/Event/Permission 只有对象名，无事件顺序、断线重连、权限决策幂等语义（`AI-NATIVE-OS.md:56`、`ARCH-V5.md:58-62`） | 需把云侧 sandbox 委托写清、Approval 委托到统一审批服务；Harness 只保留协议与客户端职责 |
| **LoopForge（编排）** | 高：SOP/Role/Squad/Legion/Gate/Artifact 清晰（`AI-NATIVE-OS.md:102-109`） | **是**：“构建在 AgentCore 上”同时保留 Harness 直连（`SYNTHESIS.md:93-94`）；Gate 与 AgentLoop 发布门禁、Command 审批重叠 | **否**：只有 `POST /orchestration/*` 示例；缺事件历史/信号/定时器/补偿/重放契约（`ARCH-V5.md:64-69`） | 需定义 durable execution 语义与“Gate=编排门禁”的唯一语义；Artifact 归属与 AgentLoop 证据分工 |
| **AgentLoop（质量）** | 高：跨运行时质量平面，不执行 Agent（`AGENTCORE-AGENTLOOP.md:53-62`） | **部分**：定义“Policy 验证”而非“执行”；但“发布门禁”与 LoopForge Gate、Command 审批重叠（`AI-NATIVE-OS.md:58,91`） | **部分**：`/quality/*` 接口有对象名，缺 Trace 写入协议（OTEL/OpenInference 兼容）、数据集租户隔离、门禁决策格式 | 需明确“验证/建议 vs 执行/拦截”；门禁只产结论、不双写审批 |
| **Command Center（应用）** | 高：只读投影 + 幂等命令、明确 non-goals（`AI-NATIVE-OS.md:111-118`、`ENTERPRISE-COMMAND.md:397-403`） | **是**：`ApprovalRequest` 与 LoopForge Gate 并存；`Intervention` 可回滚要求与 takeover/terminate 不可逆矛盾（`ENTERPRISE-COMMAND.md:216-217,244`） | **否**：`GET /command/fronts`、`POST /command/interventions` 无命令 schema、幂等键、权限、可逆性分类、与投影一致性要求（`ARCH-V5.md:78-82`） | 先定义命令总线与投影契约，再谈 9 大能力 UI |

---

## 5. 与当前代码的差距是否诚实

**部分诚实，但不足以作为执行依据。**

- 诚实之处：三份文档都有差距表（`SYNTHESIS.md:116-125`；`AI-NATIVE-OS.md:148-157`；`ARCH-V5.md:149-158`），承认“AgentCore 未抽象、AgentLoop 分散、LoopForge 只有页面+内存/部分 DB、指挥中心只有概览”；`REFACTOR-PLAN.md` 也自述“五层边界没落到产品结构”。
- 不诚实/不充分之处：
  1. **文件级映射缺失**：没有列出仓库中 `apps/control-plane`、`services/agent-workforce`（`server.ts` 内 Run/Task/Mission）、`workflow-engine`、`experiment-center`、`memory-service`、`eval-center` 各自的归属/改造动作；读者无法据此排期。
  2. **“复用”措辞误导**：AgentCore/LoopForge 是外部产品名；文档未说明是“对齐概念、内部自建实现，还是接入第三方适配器”。若按字面“复用”，与现有代码差距被低估。
  3. **验收缺失**：差距表没有 owner、时间、验收方式、兼容期与回滚；`REFACTOR-PLAN.md` 的目标目录（agentcore/agentloop/loopforge/command-center）仍是目标态，不是迁移计划。
  4. **研究结论被当成事实用于定位**：“市场空位/无一家合成”属【推断】（`ENTERPRISE-COMMAND.md:45,131`），却直接进入总纲定位句；缺少客户访谈/需求验证的说明。
  5. **实现验证不足**：未列出“已可运行/仅原型/仅文档”的三态清单（如 memory-service 已是独立服务、agent-workforce 仍是单文件原型），导致“差距”看起来比实际小。

---

## 6. 必须修改项

### P0（未闭合不得进入实现排期）

| ID | 必须修改项 | Owner | 验收标准 |
| --- | --- | --- | --- |
| **AI-NATIVE-P0-1** | **唯一所有权矩阵 + 平面契约 v1**：为 Session/Run/Workspace/Sandbox/Artifact/Approval/PolicyDecision/Event 指定唯一 owner，定义接口 schema、租户/鉴权、幂等、状态机、错误码、事件顺序；**禁止跨平面双写**（尤其工作区/沙箱/审批） | architect | 新增 `PLANE-CONTRACT.md` + openapi 1.2（或契约文件）；契约测试：同一资源仅一个写入口；对抗测试（绕过写）失败；跨文档引用一致（0 处矛盾表述） |
| **AI-NATIVE-P0-2** | **命名与“复用/自建/适配”决策 ADR**：明确 AgentCore/Harness/LoopForge 是“OpenDream 内部概念”还是“外部产品适配器”；给出内部实现边界与 adapter 契约，禁止继续使用“复用 AgentCore/LoopForge”而不说明实现主体 | architect + lead | ADR 通过（含备选与否决理由）；术语表；文档/代码命名一致；评审记录引用 |
| **AI-NATIVE-P0-3** | **PEP 与审批唯一化**：全平台一个策略执行点（AgentCore 边界或 MCP Gateway，二选一并说明沙箱侧兜底）+ 一个审批服务（LoopForge Gate/AgentLoop 门禁/Command 审批全部消费同一事实源）；`policy_decision_id` 贯穿 ToolCall/Step/审计 | architect + platform-backend | 威胁模型（绕过路径清单）+ 测试：越权/绕过/重复审批均被拒；三处审批同一 `approval_id`；审计可回放 |
| **AI-NATIVE-P0-4** | **事件/数据契约 v1**：统一事件信封与命名（合并 `agent.*`/`task.*` 两套目录）、版本化、subject 引用、tenant/RLS、保留期、PII 脱敏、回放确定性规则；明确 TwinSnapshot 事实源与 freshness/source_seq | architect | 事件 schema + 示例 + conformance 测试；`replay` 测试（确定性）；跨租户 404；PII 扫描通过；保留策略落地 |

### P1（本轮修，随 P0 一起进 ADR/计划）

| ID | 必须修改项 | Owner | 验收标准 |
| --- | --- | --- | --- |
| AI-NATIVE-P1-1 | **可执行差距/迁移计划**：按仓库文件列出“保留/改造/新建/废弃”，含依赖顺序、双写兼容期、回滚点、里程碑 | architect + lead | 文件级矩阵（path → action → owner → 日期）+ 迁移 dry-run |
| AI-NATIVE-P1-2 | **命令总线契约**：幂等键、authz、可逆/可补偿/不可逆分类、冲突与审计；修正“所有干预可回滚”的表述 | platform-backend + web-console | 命令 schema + 重放/越权测试；不可逆动作强制二次确认+审计 |
| AI-NATIVE-P1-3 | **durable execution 规格**：事件历史/信号/定时器/重试/补偿/重放的语义映射到 workflow-engine（或引入 Temporal 适配），给出与 LoopForge 的接口 | platform-backend | 状态机/时序图 + 契约测试（重复信号、超时、补偿、replay） |
| AI-NATIVE-P1-4 | **质量平面 SLO/保留/PII/成本归集**：Trace 采样/保留、数据集租户隔离、评测门禁指标、成本 attribution | architect + capability-centers | SLO 表 + 保留策略 + 脱敏测试 + 成本报表抽样 |
| AI-NATIVE-P1-5 | **市场空位验证**：把“无人合成”的推断降级为待验证假设，补 3–5 个客户访谈/竞品 PoC 结论后再用于定位 | pm-research + lead | 访谈记录/结论；定位句标注证据等级 |

---

## 7. 一页结论

**方向对，证据好，但不能按现状开工。**

- **对**：用功能平面取代线性五层；质量、编排、执行、工程、应用各自有明确“拥有/不拥有”；指挥中心坚持只读投影+幂等命令；回放/回测/仿真分家；研究证据分级——这五点应保留，作为后续 ADR 的基线。
- **不够**：五份文档仍停留在“概念平面”，**没有一份可被实现直接消费的契约**。四个 P0 分别对应所有权、命名/复用、策略/审批唯一性、事件/数据契约；任一未闭合，都会在实现期以“各平面各自定义、最后重构”收场——`REFACTOR-PLAN.md` 已经证明这种代价。
- **最高风险**不是技术，而是**重复权威**：工作区/沙箱三处归属、审批三处入口、策略三处出现、事件两套命名。必须在写第一行业务代码前收敛。
- **建议**：按 PASS-WITH-ACTIONS 处理——保留总纲作为方向文档；由 architect 在 1 周内产出 P0 四项的最小契约（不必一次完备，但必须可测试）；P1 五项随 ADR 排期；**P0 全部通过后再进入平面实现**。在此之前，现有 `apps/`/`services/` 继续按既有契约演进，不做大规模目录重构。

> 评审声明：本评审仅基于上述六份文档与仓库目录/文件现状，不引用未标注来源的外部事实；未修改任何总纲文件。
