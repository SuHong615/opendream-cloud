# 竞品与相似产品调研（COMPETITORS）

- 文档 ID：T1.1
- 版本：v1.0
- Owner：pm-research
- 访问/核验日期：**2026-11-04**（本文件所有"来源"均以该日期访问；价格与政策类信息以官网当日页面为准）
- 状态：待 G1 评审
- 关联：[PLAN](../00-program/PLAN.md) · [OPENCODE-BASELINE](../00-program/OPENCODE-BASELINE.md) · [JOURNEYS](JOURNEYS.md) · [PRD](PRD.md)

> **标注约定（G1 强制）**
> - `【事实】`：来源页面/仓库可直接读到的陈述，附来源编号。
> - `【推断】`：调研者基于事实与行业经验得出的判断，**不是**被调研产品的官方陈述。
> - `【未核实】`：本轮未取得一手页面证据（网络失败/需登录/需付费），给出待办而非编造。
> - 竞品的"是否支持某能力"一律以公开文档能证明者为事实；证明不了写"未核实"。

---

## 0. 结论摘要（先看这 10 条）

| # | 结论 | 类型 | 对 OpenDream Cloud 的影响 |
| --- | --- | --- | --- |
| C1 | "每用户一个持久云工作区 + 平台统一治理"已被 Coder 完整验证：Terraform 模板定义工作区、WireGuard 隧道接入、闲置自动关机、**AI Agent 在控制面执行、工作区不放 API Key**、AI Gateway 统一鉴权/审计/成本 | 【事实】S1 | 我们的 E2+E3 方向正确；应直接吸收"密钥不出工作区、Agent 循环在控制面"的设计 |
| C2 | Gitpod 品牌已并入 Ona，Gitpod Classic 按量付费于 2025-10-15 下线 | 【事实】S2 | "纯按量云 IDE"单卖不可持续；我们的差异化必须是**能力中心 + 应用发布**，不是更好用的云 IDE |
| C3 | Daytona 用"沙箱即服务"打 AI 生成代码执行：独立内核/文件系统/网络、<90ms 启动、快照持久化、SDK 多语言、内置 MCP server；2026-06 起主仓库停止维护、核心转私有 | 【事实】S3 | 评测中心（E5）的沙箱模型可参考其 snapshot/volume/limits 抽象；**不要**依赖其开源代码做长期底座 |
| C4 | OpenHands 已从"单一 Agent"转为"Agent 控制中心（Agent Canvas）"：可托管 OpenHands/Claude Code/Codex/Gemini/OpenCode 多种 Agent，支持每会话独立 Docker 沙箱 | 【事实】S5 | 我们的定位与 OpenHands 高度重叠——竞争力必须落在**多租户治理 + 4C8G 持久工作区 + 四中心闭环**，以及"以 opencode 为唯一引擎"的一致性 |
| C5 | 大厂"云端 Agent"普遍是**任务级沙箱**（一次性、分钟级、用完即弃），而非**用户级持久工作区**（人级、常驻、退出不销毁） | 【推断】S6/S7 | 这是我们的核心差异点，也是成本风险点（4C8G 常驻）；PRD 必须写清成本可见与休眠策略 |
| C6 | Skill 事实标准正在形成：Anthropic 的 `SKILL.md`（含 frontmatter）+ 渐进式披露；opencode v2 原生兼容该规范并支持 URL 源 | 【事实】S8 + BASELINE §2.3 | Skill 中心不需要发明新格式，应"兼容 SKILL.md + 增加平台元数据/版本/权限/签名" |
| C7 | MCP 能力市场已形成"目录"层：官方 MCP Registry 在登记 server 元数据【事实】S11；Smithery/Glama 聚合目录并朝 remote connector/托管代理演进【推断】S9/S10（站点可达性已核实，托管细节未核实） | 【事实+推断】S9/S10/S11 | MCP 中心（E7）价值不在"再做一个目录"，而在**企业凭证托管 + 代理审计 + 按用户/工作区授权 + 一键绑定 opencode** |
| C8 | 应用发布平台（Vercel/Railway/Replit/Lovable/Bolt）把"构建→部署→域名→分享"压缩到分钟级，但普遍**不提供**"组织内按人授权 + 强制 SSO"的企业内分享模型（其中 4 家定价/SSO 条款未逐一核实，见 §5-1，故本条整体为推断） | 【推断】S12–S15 | 我们的应用中心（E6）差异化 = 平台内 SSO + view/use/edit 细粒度 ACL + 固定 1C2G 配额，而不是拼构建速度 |
| C9 | 企业 AI 平台（Dify/Coze/FastGPT）强在"可视化编排 + 知识库 + 发布为 API/WebApp"，但**不是编码 Agent**，也没有"每用户开发工作区"概念 | 【事实】S16–S18 | 它们是"能力消费者"生态位；我们的 Skill/应用中心可以对接其 API，而非正面竞争 |
| C10 | 主流同类产品对"退出不销毁"都走**闲置关机 + 数据持久**（Coder）或**快照恢复**（Daytona）两条路线，没有一家把"默认永不销毁、仅显式销毁"作为默认策略 | 【事实】S1/S3 + 【推断】 | 这是用户明确要求的差异化承诺，但必须配套成本透明度（R3.10）与配额（R10.2），否则不可持续 |

---

## 1. 竞品总览矩阵

| # | 产品 | 类别 | 每用户容器/沙箱 | 多租户 + SSO | Skill/MCP | 应用分享/权限 | 许可/定价（粗粒度） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Coder | 云端开发环境 | 是（K8s Pod/VM/Docker，模板即基础设施）【事实】S1 | 是（组织/用户；OIDC 需核实具体配置）【事实】S1 + 【未核实】SSO 细节 | 通过 registry 模块跑 Claude Code/Codex/OpenCode；AI Gateway【事实】S1 | 工作区共享需核实；模板 ACL 存在【未核实】 | 开源（AGPL/企业版双轨，具体许可待核）+ Premium 付费【未核实】S1 |
| 2 | Gitpod（→ Ona） | 云端开发环境 | 是（Docker 工作区，短暂生命周期）【事实】S2 | 组织/SSO 企业版【事实】S2 文档目录含 Organizations | 无原生 Skill/MCP 市场【推断】 | 无应用发布；仅工作区/预览端口【推断】 | Classic 按量已下线（2025-10-15）；Ona 免费档 + 企业销售【事实】S2 |
| 3 | Daytona | AI 代码执行沙箱 | 是（每 sandbox 独立内核/FS/网络）【事实】S3 | Organizations/API Keys/Audit logs/Limits【事实】S3 | 内置 MCP server 能力【事实】S3 | 无应用分享；有 preview proxy【事实】S3 | 开源仓库 2026-06 起不再维护；商业版私有【事实】S3；具体许可见 LICENSE【未核实】 |
| 4 | DevPod | 云端开发环境（客户端型） | 是（provider：Docker/SSH/K8s/云 VM）【推断】S4 | 弱：客户端 + 自管基础设施，无企业控制台【推断】S4 | 无【推断】 | 无【推断】 | 开源（devcontainer 兼容）【事实】S4；许可待核【未核实】 |
| 5 | OpenHands Agent Canvas | AI Agent 控制中心 | 是（每会话 Docker 沙箱，可选多沙箱）【事实】S5 | 自托管单机为主；企业托管在 OpenHands Enterprise【事实】S5 | 可托管多 Agent；无 Skill 市场【事实】S5 | 无应用发布/分享 ACL【推断】 | 开源 + Cloud/Enterprise 商业版【事实】S5 |
| 6 | OpenAI Codex Cloud | AI Agent 云平台 | 是（云端任务沙箱）【未核实】S6 | ChatGPT 工作区/企业管理【未核实】S6 | 未见 Skill 市场；MCP 支持需核实【未核实】 | 任务结果以 PR 形式交付【未核实】 | 随 ChatGPT 套餐【未核实】S6 |
| 7 | Claude Code 云端会话 | AI Agent 云平台 | 是（云端沙箱会话）【事实】S7 | Pro/Max/Team 账号【事实】S7 | 原生 Skills（SKILL.md）【事实】S8；MCP 支持【未核实】 | 无应用发布【推断】 | 随订阅【事实】S7 |
| 8 | Claude Agent Skills | Skill 事实标准 | N/A | N/A | **规范定义者**：SKILL.md + frontmatter【事实】S8 | N/A | 文档公开【事实】S8 |
| 9 | Smithery | MCP 市场 | N/A（托管 remote MCP）【推断】 | 账号 + API Key【未核实】 | MCP 目录 + 托管连接【事实】S9 | 无 | 免费 + 付费托管【未核实】 |
| 10 | Glama | MCP 目录/网关 | N/A | 账号【未核实】 | 宣称最大 MCP 目录（91,894 servers / 23,982 remote）【事实·站点声明】S10 | 无 | 免费目录 + 网关付费【未核实】 |
| 11 | MCP Registry（官方） | MCP 注册中心 | N/A | 命名空间所有权（GitHub/DNS 验证）【推断】S11 | 官方 server 元数据注册表【事实】S11 | N/A | 规范开放【事实】S11 |
| 12 | Vercel | 应用发布 | 否（Serverless/Edge）【推断】 | Teams + SSO（Enterprise）【推断】 | 无 Skill；支持 MCP 连接器于 AI SDK【未核实】 | 预览部署 + 密码保护/团队可见【推断】 | 免费 Hobby + Pro/Enterprise 订阅【事实】S12 |
| 13 | Railway | 应用发布 | 否（容器 PaaS）【推断】 | Teams + SSO（企业）【推断】 | 无 | 项目成员角色 + 公开域名【推断】 | 按用量计费（by the second）【事实】S13 |
| 14 | Replit | 云端 IDE + 应用发布 | 是（每 Repl 容器）【推断】 | Teams/组织 + SSO（企业）【未核实】 | Agent 可装 MCP/集成【未核实】 | Deployments 公开/私有 + 团队【推断】 | 订阅 + AI 计费【事实】S14 |
| 15 | Lovable / Bolt | AI 全栈应用生成 | 否/临时（生成 + 托管）【推断】 | 团队空间【未核实】 | 无 | 一键发布 + 公开链接【推断】 | 订阅制【未核实】 |
| 16 | Dify | 企业 AI 应用平台 | 否（应用容器/Serverless）【推断】 | 多工作区 + 成员角色 + SSO（企业版）【未核实】 | 可视化编排 + 工具/插件；MCP 支持需核实【未核实】 | 发布为 WebApp/API，可嵌入；细粒度分享弱【推断】 | 开源（Apache-2.0 含附加条款，待核）+ Cloud【事实】S16 +【未核实】 |
| 17 | Coze Studio（扣子开源版） | 企业 AI 应用平台 | 否【推断】 | 工作空间 + 成员【推断】 | 插件/工作流/知识库；MCP 待核【未核实】 | 发布到飞书/微信/API【推断】 | 开源（Apache-2.0，含商用限制条款，待核）【事实】S17 +【未核实】 |
| 18 | FastGPT | 企业 AI 应用平台 | 否【推断】 | 团队 + 成员角色【推断】 | 工作流 + 知识库；MCP 待核【未核实】 | 发布为应用/API【推断】 | 开源（有开源版许可限制，待核）【事实】S18 +【未核实】 |

> 说明：本表用于**定位对比**，不用于采购决策；凡是【未核实】项，P2 架构阶段不引用为设计前提。

---

## 2. 分类详述

### 2.1 云端开发环境

#### 2.1.1 Coder（最直接对标）

- 链接：GitHub <https://github.com/coder/coder>；官网 <https://coder.com>；文档 <https://coder.com/docs>；定价 <https://coder.com/pricing>；Registry <https://registry.coder.com>
- 定位【事实】S1：**自托管的云开发环境 + AI 编码 Agent 平台**。"Workspaces are defined with Terraform, connected through a secure Wireguard® tunnel, and automatically shut down when not used."
- 核心架构【事实】S1：
  - 模板 = Terraform，可定义 EC2 VM / Kubernetes Pod / Docker 容器等工作区；
  - 每个工作区经 WireGuard 隧道接入，不直接暴露端口；
  - 闲置自动关机（成本控制）；
  - **Coder Agents：Agent 循环在控制面的自托管基础设施中执行，工作区内不放任何 API Key**；模型可选 Anthropic/OpenAI/Google/Bedrock/自托管；
  - **AI Gateway**：集中鉴权、审计、成本控制；"Centralized model governance, cost tracking, and audit logging"；每个动作携带用户身份。
- 多租户/SSO【部分事实】：提供组织/用户/模板/管理员文档（S1 链接 `docs/admin`、`docs/user-guides/workspace-management`）；OIDC/SAML 等具体配置本轮未逐页核实【未核实】。
- Skill/MCP【事实】S1：Registry 提供 "Coding Agents" 模块，可在 Coder 工作区内隔离运行 **Claude Code、Codex、OpenCode**；未提供"Skill 市场/Skill 生命周期管理"这一层【推断】。
- 应用分享/权限【未核实】：工作区共享与端口共享机制存在，但"应用发布 + 按人 ACL"不是其主线【推断】。
- 定价/License【部分核实】：开源仓库 + Premium 付费档（S1 明确 "Premium"）；具体开源许可（AGPL-3.0 或类似）本轮未读 LICENSE【未核实】。
- **可借鉴**：
  1. 密钥/模型凭证**永不进入工作区**，由控制面 AI Gateway 代持（直接对应我们的 R2.3/R2.4）；
  2. 工作区定义即代码（Terraform/CRD 声明式），与我们 `OpencodeWorkspace` CRD 同构；
  3. 闲置关机 + 成本可见，是"默认不销毁"的必要配套（对应 R3.10）；
  4. Registry 模式聚合 Agent/Skill 运行方式，说明"能力市场"在开发者工具链里成立。
- **不可借鉴**：
  1. Coder 把"工作区形态"完全交给用户模板，**平台无法保证统一体验**；我们要求每用户固定 4C8G + 固定 opencode 引擎，必须收敛模板；
  2. 其闲置即关机与用户"退出不销毁"诉求冲突，不能照搬默认值；
  3. 面向"已有 K8s/云资源的平台团队"，自助注册与零运维体验不是其目标，我们要做 SaaS 式上手。

#### 2.1.2 Gitpod（已更名 Ona）

- 链接：GitHub <https://github.com/gitpod-io/gitpod>；Ona <https://ona.com>；文档 <https://www.gitpod.io/docs>
- 定位【事实】S2：README 首行声明 **"Gitpod has been renamed to Ona"**，定位为 "mission control for software projects and software engineering agents"；Gitpod Classic 是"on-demand, pre-configured development environments in the cloud"，以 `.gitpod.yml` 配置，基于 Docker，工作区**短暂（ephemeral）**。
- 关键事实【事实】S2：
  - 集成 GitHub/GitLab/Bitbucket/Azure DevOps；
  - 有 Organizations 配置文档；
  - **Gitpod Classic 按量付费（pay-as-you-go）于 2025-10-15 下线**；
  - 官方推荐转向 Ona 免费档或企业销售。
- 多租户/SSO：组织与团队能力存在；SSO 属企业档【未核实】。
- Skill/MCP：无原生 Skill/MCP 市场【推断】。
- 定价：Ona 免费档 + 企业售卖【事实】S2；具体价格【未核实】。
- **可借鉴**：`.gitpod.yml`/devcontainer 的"仓库即环境"体验；预构建（prebuild）加速冷启动——对应我们 R3.2 的"预热池"。
- **不可借鉴**：ephemeral 生命周期模型（用完即弃）与"退出不销毁"直接冲突；纯云 IDE 商业模式已被验证难独立（PAYG 下线），不能只卖 IDE。

#### 2.1.3 Daytona

- 链接：GitHub <https://github.com/daytonaio/daytona>；官网/文档 <https://www.daytona.io/docs>
- 定位【事实】S3："Secure and Elastic Infrastructure for Running Your AI-Generated Code"；核心抽象是 **sandbox**（"full composable computers with complete isolation, a dedicated kernel, filesystem, network stack, and allocated vCPU, RAM, and disk"）。
- 关键事实【事实】S3：
  - 启动 "<90ms from code to execution"（站点声明）；
  - OCI/Docker 兼容、大规模并行、unlimited persistence；
  - **snapshots** 使 agent 跨会话保持状态；volumes；regions；
  - SDK：Python/TypeScript/Ruby/Go/Java + REST API + CLI；
  - 平台能力：Organizations、API Keys、Limits、Billing、**Audit logs**、OpenTelemetry；
  - Agent tools 含 **MCP server**、LSP、computer use、PTY、git operations；Human tools 含 web terminal、SSH、VNC、preview、custom preview proxy；
  - **2026-06 起该仓库不再维护**，核心开发转入私有代码库；仓库仍可按 LICENSE 自由 fork/使用，无支持。
- 多租户/SSO：Organizations + API Keys + limits/audit【事实】S3；SSO/OIDC 具体能力【未核实】。
- Skill/MCP：内置 MCP server 对接能力【事实】S3；无 Skill 市场【推断】。
- 定价/License：商业 SaaS + 开源仓库（许可见 LICENSE，本轮未读）【未核实】。
- **可借鉴**：
  1. 沙箱抽象 = snapshot + volume + limits + network policy，正好用于**评测中心（E5）**的用例隔离与可复现；
  2. "preview proxy" 思路可直接用于工作区/应用域名反代（R3.4/R6.6）；
  3. 审计日志、限流、用量计费内建，说明沙箱平台必须一开始就把计量做进去（R2.5/R10.1）。
- **不可借鉴**：把主仓库当长期依赖——已停止维护；其"毫秒级无状态沙箱"面向代码执行，不面向"人机共用的持久 IDE 工作区"。

#### 2.1.4 DevPod

- 链接：GitHub <https://github.com/loft-sh/devpod>；官网 <https://devpod.sh>
- 定位【推断】S4：开源、客户端优先的 "Codespaces 替代品"，用 `devcontainer.json` 描述环境，通过 provider 在本地 Docker / SSH 主机 / K8s 集群上创建开发环境。
- 事实边界：本轮仅能确认其为开源 DevContainer 客户端项目；provider 清单、许可、是否含 SSO/多租户【未核实】。
- **可借鉴**：DevContainer 兼容带来的生态（镜像、feature 复用）；"客户端轻、环境重"的职责切分。
- **不可借鉴**：无服务端多租户控制面，与平台型产品模型不同；不提供能力市场与应用托管。

### 2.2 AI Agent 云平台

#### 2.2.1 OpenHands（Agent Canvas，最直接竞争者）

- 链接：GitHub <https://github.com/OpenHands/OpenHands>；文档 <https://docs.openhands.dev>；商业版 OpenHands Cloud/Enterprise
- 定位【事实】S5："self-hosted developer control center for coding agents and automations"；"Run OpenHands, Claude Code, Codex, Gemini, Pi, **OpenCode**, or any ACP-compatible agent across local, remote, and cloud backends."
- 关键事实【事实】S5：
  - 支持 Agent Server 后端：本机 / Docker / VM / 公司基础设施 / OpenHands Cloud；
  - "Option 3: With Multiple Docker Sandboxes"——**每个新会话独立 Docker 容器**，各自 Agent Server 与工具；workspace 与持久状态挂载，容器替换后文件与对话历史仍在；
  - Automation Server 支持定时/事件（Slack/GitHub/Linear webhook）触发；
  - BYO model（LLM profiles）；ACP 协议接入第三方 Agent；
  - 前端可嵌入宿主应用（`@openhands/agent-canvas` npm 包 + styles）。
- 多租户/SSO：默认单机自托管；企业能力在 OpenHands Enterprise【事实】S5；SSO/OIDC【未核实】。
- Skill/MCP：无 Skill 市场；可托管多 Agent【事实】S5；MCP 支持【未核实】。
- 定价/License：开源 + 商业【事实】S5；具体许可【未核实】。
- **可借鉴**：
  1. "一个前端控制台 + 多个 agent backend"的解耦方式，对我们的"控制面/数据面分离"是强力验证；
  2. 每会话独立沙箱 + 持久挂载（workspace + state），是"会话级隔离"的可落地参考；
  3. ACP 多 Agent 兼容提醒我们：**不要把产品绑定在"只有 opencode 能跑"的叙事上**，但引擎仍应统一为 opencode 以保证体验一致。
- **不可借鉴/威胁**：
  1. 它没有"每用户常驻 4C8G 工作区 + 四中心（Skill/评测/应用/MCP）"的完整闭环，这是我们相对它的差异；
  2. 它默认单机/自托管，多租户与计费不是一等公民——**多租户治理是我们的护城河**；
  3. 风险：OpenHands 已支持把 OpenCode 当后端 Agent 运行，**它可能比我们先做出"多 Agent 托管 + 团队共享"**，需在 PRD 中明确差异化优先级（见 PRD §6 风险 R-03）。

#### 2.2.2 OpenAI Codex Cloud

- 链接：文档 <https://developers.openai.com/codex/>（manual：`/codex/codex-manual`）；产品页 <https://openai.com/codex/>
- 定位【推断】S6：把编码任务委派给云端 Agent，在隔离环境中执行，结果以 PR/补丁返回；与 ChatGPT 账号体系打通。
- 事实边界：本轮网络失败，未能读取其一二手页面，**定价档位、沙箱规格、MCP 支持、企业 SSO 均标【未核实】**，不做推断性细节描述。
- **可借鉴（方向性，非事实）**：任务级异步执行 + 结果评审（PR）的交互范式；快速失败与可重试的任务队列。
- **不可借鉴**：其"一次性任务"模型不满足"退出不销毁的持久工作区"诉求。

#### 2.2.3 Claude Code 云端会话 / Claude Agent Skills

- 链接：<https://claude.com/blog/claude-code-on-the-web>；Skills 文档 <https://claude.com/docs/skills/how-to>；Claude Code Skills <https://code.claude.com/docs>
- 定位【事实】S7：Claude Code 云端会话（原 Claude Code on the web）已 **GA，面向 Pro、Max、Team 用户**，在云端沙箱中运行编码会话。
- Skills【事实】S8：Anthropic 定义 **Agent Skills = 含 `SKILL.md` 的目录 + frontmatter**（`name`、`description`、`disable-model-invocation` 等），供 Claude 在相关任务中自动发现并按需加载；支持自定义/团队分发。
- 多租户/SSO：Team/Enterprise 账号体系【事实】S7；企业 SSO【未核实】。
- MCP：Claude 生态广泛支持 MCP【推断】；云端会话的 MCP 支持边界【未核实】。
- **可借鉴**：
  1. **Skill 规范直接复用**：我们的 R4.1 不应自创格式，`SKILL.md + frontmatter` 应为子集，再叠加平台字段（`version`、`permissions`、`signature`、`eval_baseline`）；
  2. 云端会话 = "账号即沙箱"的轻量模型，验证了"浏览器里用 Agent"的需求；
  3. 订阅制 + 用量限额的商业模型（Pro/Max/Team 分层）可参考为我们 R10.2 的配额分层。
- **不可借鉴**：Skill 仅有"分发"没有"评测准入/签名/回滚"，我们必须在 E5 上做强（这是安全红线）。

### 2.3 Skill / Agent 能力市场（MCP 市场）

#### 2.3.1 Smithery

- 链接：<https://smithery.ai>（搜索页 <https://smithery.ai/search>）
- 定位【推断】S9：MCP server 的注册/发现/托管平台，提供目录检索与（远程）连接托管，降低把 MCP 接入 Agent 的成本。
- 事实边界：本轮仅取得搜索页 URL 与站点可达性；server 数量、定价、托管地域、鉴权模型【未核实】。
- **可借鉴**：目录的检索维度（按能力/厂商/传输方式）、"一条命令安装"的开发者体验、托管连接免部署。
- **不可借鉴**：消费级目录不解决**企业凭证托管 + 按用户授权 + 调用审计**，这正是我们 MCP 中心的核心（R7.3–R7.5）。

#### 2.3.2 Glama

- 链接：<https://glama.ai>；MCP 目录 API <https://glama.ai/mcp/reference>；`llms.txt` <https://glama.ai/llms.txt>
- 定位【事实·站点声明】S10：自述为 "The largest MCP directory"，站点声明 91,894 个 servers、23,982 个 remote connectors（数字为其自述，未独立审计）。
- 事实边界：目录 API 存在【事实】S10；商业化与 SLA【未核实】。
- **可借鉴**：提供 **MCP Directory API**（机器可读目录），我们的 MCP 中心可直接把它作为"外部目录源"接入，节省自建目录冷启动。
- **不可借鉴**：聚合目录≠企业级网关；不能替代审批、脱敏与配额。

#### 2.3.3 MCP Registry（官方）

- 链接：<https://modelcontextprotocol.io/registry/about>
- 定位【事实】S11：MCP 官方注册中心，登记 server 元数据，供客户端/市场发现与校验。
- **可借鉴**：命名空间所有权验证（GitHub/DNS）机制，可用于我们 MCP/Skill 的**发布者身份绑定**；元数据 schema 可复用。
- **不可借鉴**：只解决"发现"，不解决"运行、鉴权、审计"。

### 2.4 应用发布平台

#### 2.4.1 Vercel

- 链接：<https://vercel.com>；定价 <https://vercel.com/pricing>；文档 <https://vercel.com/docs/pricing>
- 定位【推断】S12：前端/全栈部署平台，Git 推送即预览部署，Serverless/Edge 运行时，团队协作与域名管理。
- 事实边界：提供 Hobby/Pro/Enterprise 分层与 Teams/SSO（企业版）【推断】；本轮未逐页核实价格与 SSO 条款。
- **可借鉴**：Preview Deployment + 团队可见性 + 密码保护预览，正是我们 R6.4 分享模型的成熟形态；域名自动证书（R6.6）是其标配体验。
- **不可借鉴**：面向公网发布，**没有"必须 SSO、默认不对互联网开放"的企业内分享模型**（我们的红线：public 仅限平台内已登录用户）。

#### 2.4.2 Railway

- 链接：<https://railway.com>；定价 <https://railway.com/pricing>（`pricing.md` 可机读）
- 定位【事实】S13：容器 PaaS，按秒计费（"Pay only for what your app uses, by the second"），从仓库直接部署。
- **可借鉴**：按秒计量 + 明确资源上限的表达方式（对应 R10.1/R10.2 的计量口径）；一键部署模板。
- **不可借鉴**：无"组织内按人 ACL + 强制 SSO"；计费模型是外部账单，不适合我们以配额为主的内部治理。

#### 2.4.3 Replit

- 链接：<https://replit.com>；定价 <https://docs.replit.com/help/pricing-and-plans>；AI 计费 <https://docs.replit.com/billing/ai-billing>
- 定位【推断】S14：浏览器内 IDE + Agent + 一键 Deploy 的一体化平台，每个 Repl 有容器化运行环境。
- 事实边界：存在订阅与 AI 用量计费【事实】S14；Teams/SSO【未核实】。
- **可借鉴**："IDE 内直接 Deploy"的零上下文切换体验——对应 R6.8（从工作区发布应用）。
- **不可借鉴**：公网分享为主，权限粒度粗；不适合作为企业内应用分发的权限模型参考。

#### 2.4.4 Lovable / Bolt

- 链接：<https://lovable.dev>、<https://bolt.new>
- 定位【推断】S15：Prompt 驱动的全栈应用生成 + 一键发布，面向非专业开发者/产品原型。
- 事实边界：产品定位与"生成后托管"模式【推断】；定价、开源程度、权限模型【未核实】。
- **可借鉴**：从自然语言到可访问 URL 的极短路径；可作为"应用使用者"角色的体验标杆。
- **不可借鉴**：以公开分享为主的增长模型与我们"企业内受控分享"相悖。

### 2.5 企业内部 AI 平台

#### 2.5.1 Dify

- 链接：GitHub <https://github.com/langgenius/dify>；文档 <https://docs.dify.ai>
- 定位【事实】S16：开源 LLM 应用开发平台（可视化编排/Agent/知识库/工作流），文档明确有"publish"（发布为应用）路径。
- 事实边界：多工作区、成员角色、SSO 多为企业版能力【未核实】；开源许可为含附加条件的开源协议【未核实，需读 LICENSE】。
- **可借鉴**：应用发布形态（WebApp/API/嵌入）与"工作流即应用"的心智；知识库/工具插件的分类法可用于我们的 Skill 分类。
- **不可借鉴**：不是编码 Agent，没有开发工作区；其"应用"是 LLM 编排产物，与我们的"从工作区构建部署真实服务"不同层。

#### 2.5.2 Coze Studio（扣子开源版）

- 链接：GitHub <https://github.com/coze-dev/coze-studio>；开源公告 <https://www.byteplus.com/zh-CN/blog/coze-open-sources-ai-agent-tools>
- 定位【事实】S17：字节跳动 Coze 的开源版本，提供可视化 Agent/工作流/插件/知识库构建；开源公告确认"Coze 拥抱开源"。
- 事实边界：许可含商用限制条款的可能性【未核实，必须读 LICENSE】；工作空间/成员与发布渠道【未核实】。
- **可借鉴**：插件（plugin）市场的组织方式与"发布渠道"抽象（多渠道分发同一 Agent）。
- **不可借鉴**：面向对话式 Agent 而非编码；其插件模型与我们 opencode Skill/MCP 不通用。

#### 2.5.3 FastGPT

- 链接：GitHub <https://github.com/labring/FastGPT>；开源许可 <https://doc.fastgpt.io/zh-CN/guide/version/opensource/license>
- 定位【事实】S18：开源知识库/工作流 AI 应用平台，官方文档单列"开源协议"页，说明存在**开源版使用限制**。
- 事实边界：具体限制条款（是否限制商用/多租户 SaaS）【未核实，必须读协议页】。
- **可借鉴**：知识库 + 工作流的组合、以及"开源版/商业版功能切分"的许可策略（对我们自建平台选型有参考意义）。
- **不可借鉴**：领域不同（知识问答 vs 编码工作区）。

---

## 3. 交叉对比：我们的差异点与威胁

| 维度 | 市场主流做法 | OpenDream Cloud 选择 | 依据 |
| --- | --- | --- | --- |
| 工作区生命周期 | 闲置即关（Coder）/ephemeral（Gitpod）/任务级（Codex/Claude） | **退出不销毁，仅显式销毁**，可选休眠 | 用户明确要求；差异点，需成本配套 |
| 身份与治理 | 平台团队自管（Coder）/厂商账号（Claude、Codex） | OIDC SSO + 组织/团队 RBAC + 平台 API Key | R1.x |
| 模型凭证 | 控制面代持（Coder AI Gateway） | LiteLLM 网关 + 虚拟 Key，密钥不出网关 | R2.3/R2.4 |
| Skill | Anthropic SKILL.md 生态 + 目录分发（Smithery/Glama 针对 MCP） | Skill 中心兼容 SKILL.md + 版本/权限/签名 + **评测准入** | R4.x/R5.5 |
| MCP | 目录发现（Smithery/Glama/官方 Registry） | 企业目录 + 凭证托管 + 代理审计 + 一键绑定 | R7.x |
| 应用 | 公网发布 + 团队可见（Vercel/Railway/Replit） | 1C2G、组织内 ACL（view/use/edit）、**强制 SSO**、自定义域名 | R6.x |
| 引擎 | 多 Agent 兼容（OpenHands）/自有 Agent（Claude） | 统一 opencode 引擎（体验一致 + 可替换模型） | BASELINE §4 |

**威胁清单（供 PRD 风险章引用）**

| ID | 威胁 | 依据 | 缓解 |
| --- | --- | --- | --- |
| T-01 | OpenHands 已支持托管 OpenCode 作为后端 Agent，可能先占据"团队级 Agent 控制台"心智 | 【事实】S5 | 差异化押注"四中心闭环 + 多租户治理 + 持久工作区"；G2 前确认 opencode 集成深度 |
| T-02 | Coder 的 "AI Gateway + Agent in control plane" 已是企业级完整方案，我们功能上不新 | 【事实】S1 | 我们面向"无 K8s 团队的自助 SaaS 体验"定位，赢在开箱即用与中文生态 |
| T-03 | 沙箱/评测赛道（Daytona 停维护）说明该层竞争激烈且易被商品化 | 【事实】S3 | 评测中心不做通用沙箱服务，只做"Skill 上架准入"的最小闭环 |
| T-04 | MCP 目录已被 Smithery/Glama/官方 Registry 占据 | 【事实】S9–S11 | MCP 中心做"企业内网 + 凭证 + 审计"，不做公网目录 |
| T-05 | 大厂云端 Agent 免费或含在订阅内，价格锚点低 | 【事实】S7 | 价值锚点放在"团队治理 + 应用交付"，而非"聊天/写代码"本身 |

---

## 4. 来源清单（全部访问日期 2026-11-04）

| 编号 | 来源 | URL | 用于 |
| --- | --- | --- | --- |
| S1 | Coder GitHub README / 官网 / 定价 | <https://github.com/coder/coder> · <https://coder.com/pricing> · <https://registry.coder.com> | C1、2.1.1、T-02 |
| S2 | Gitpod GitHub README / Ona | <https://github.com/gitpod-io/gitpod> · <https://ona.com> | C2、2.1.2 |
| S3 | Daytona GitHub README / 文档 | <https://github.com/daytonaio/daytona> · <https://www.daytona.io/docs> | C3、2.1.3、T-03 |
| S4 | DevPod GitHub | <https://github.com/loft-sh/devpod> | 2.1.4 |
| S5 | OpenHands GitHub README / 文档 | <https://github.com/OpenHands/OpenHands> · <https://docs.openhands.dev> | C4、2.2.1、T-01 |
| S6 | OpenAI Codex 文档 | <https://developers.openai.com/codex/> | 2.2.2（本轮未读成，标未核实） |
| S7 | Claude Code on the web 公告 | <https://claude.com/blog/claude-code-on-the-web> | C5、2.2.3、T-05 |
| S8 | Claude Skills 文档 | <https://claude.com/docs/skills/how-to> · <https://code.claude.com/docs> | C6、2.2.3 |
| S9 | Smithery | <https://smithery.ai> | 2.3.1、T-04 |
| S10 | Glama | <https://glama.ai> · <https://glama.ai/llms.txt> · <https://glama.ai/mcp/reference> | 2.3.2 |
| S11 | MCP Registry（官方） | <https://modelcontextprotocol.io/registry/about> | 2.3.3 |
| S12 | Vercel 定价/文档 | <https://vercel.com/pricing> · <https://vercel.com/docs/pricing> | 2.4.1 |
| S13 | Railway 定价 | <https://railway.com/pricing> | 2.4.2 |
| S14 | Replit 定价/AI 计费 | <https://docs.replit.com/help/pricing-and-plans> · <https://docs.replit.com/billing/ai-billing> | 2.4.3 |
| S15 | Lovable / Bolt | <https://lovable.dev> · <https://bolt.new> | 2.4.4 |
| S16 | Dify GitHub / 文档 | <https://github.com/langgenius/dify> · <https://docs.dify.ai> | C9、2.5.1 |
| S17 | Coze Studio GitHub / 开源公告 | <https://github.com/coze-dev/coze-studio> · <https://www.byteplus.com/zh-CN/blog/coze-open-sources-ai-agent-tools> | 2.5.2 |
| S18 | FastGPT GitHub / 许可页 | <https://github.com/labring/FastGPT> · <https://doc.fastgpt.io/zh-CN/guide/version/opensource/license> | 2.5.3 |

---

## 5. 调研局限与待补（G1 评审需知）

### 5.1 未核实清单（精确到条目，共 **7 个条目**）

> 口径更正：此前汇总时曾简写为"6 个"，实际为 7 个条目（Lovable/Bolt 合计为 1 行）。以下按 §1 行号列出，便于 G1 逐条核对。

| 条目 | 产品 | 未核实内容 | 受影响的结论 | 是否被 PRD 用作事实依据 |
| --- | --- | --- | --- | --- |
| #6 | OpenAI Codex Cloud | 定价档位、沙箱规格、MCP 支持、企业 SSO | C5（任务级沙箱，本身为【推断】） | 否 |
| #9 | Smithery | server 数量、定价、托管地域、鉴权模型 | C7 中"托管连接"部分（已降级为【推断】） | 否 |
| #10 | Glama | 商业化/SLA；"91,894 servers / 23,982 remote"为站点自述 | C7 目录规模表述（标"站点声明"） | 否 |
| #12 | Vercel | 具体价格、企业版 SSO 条款 | C8（整体【推断】） | 否 |
| #13 | Railway | 具体价格（仅确认"按秒计费"） | C8（整体【推断】） | 否 |
| #14 | Replit | Teams/SSO 条款、MCP 支持 | C8（整体【推断】） | 否 |
| #15 | Lovable / Bolt | 定价、开源程度、权限模型 | 2.4.4 仅方向性参考 | 否 |

**影响评估**：不存在"仅靠未核实来源支撑"的产品事实结论；C7 的托管演进部分与 C8 整体已明确标为推断。**PRD 无任何验收标准建立在上述未核实项上。**

### 5.2 其他局限

1. **网络不稳定**：本轮多次 web_search/web_fetch 失败（`TypeError: fetch failed`），导致上表 7 项未能逐页核实。已按纪律标【未核实】，**未编造**。
2. **许可条款必须读 LICENSE 原文**：Coder、Daytona、DevPod、Dify、Coze Studio、FastGPT 的开源协议均未逐字核验，涉及选型/复用前必须补（建议 architect 在 G2 的 ADR 中关闭）。
3. **"事实/推断"边界**：表格中"多租户 + SSO"多为【推断】，凡【推断】项不作为 PRD 需求依据，仅用于竞品定位。
4. 补证计划（G1 行动项，不阻塞 PASS）：P2 前由 pm-research 补齐 #6/#9/#10/#12–#15 的一手页面证据，更新本文件 v1.1；若届时仍取不到，则相关结论保持【未核实】并转入 PRD 开放问题。
