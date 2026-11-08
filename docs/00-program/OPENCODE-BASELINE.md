# 上游 opencode 基线盘点（T0.2）

- 仓库：`https://github.com/anomalyco/opencode`（即原 `sst/opencode`，GitHub 会重定向）
- 拉取方式：`git clone --depth 1` → `upstream/opencode`（只读参考，不修改）
- 版本：`2.2.5`，commit `4f271bcd150a31d7e5e5430df9fe05e9046e131d`（2026-11-03）
- 运行时：Bun `1.4.4`，TypeScript，Effect 生态；License MIT
- 结构：Bun workspace monorepo，约 9,300 个文件

## 1. 包结构（与云平台相关的部分）

| 包 | 作用 | 对云平台的价值 |
| --- | --- | --- |
| `packages/schema` | 所有公共 Schema（config / skill / mcp / model / provider / session） | 生成平台侧类型与校验 |
| `packages/core` | 领域核心（session、config、skill、mcp、provider、permission） | 理解配置与扩展点，不直接复用（服务端内部） |
| `packages/protocol` | HttpApi 路由定义（`/api/...`） | 平台网关/契约测试的权威来源 |
| `packages/server` | HTTP 服务实现（handlers、auth、CORS、SSE） | 每工作区运行 `opencode serve` |
| `packages/client` | 生成式客户端（promise / effect / solid） | 控制台/网关调用工作区 API |
| `packages/sdk` | 组合 Client/Core/Server 的 SDK | 平台集成首选 |
| `packages/cli` | CLI/TUI 入口，`serve` 命令 | 容器入口 |
| `packages/tui` / `packages/app` / `packages/web` | TUI / Web GUI | 工作区 Web 界面 |
| `packages/console` | 官方控制台站点（SST） | 可参考的信息架构（非多租户后台） |
| `packages/plugin` `packages/plugins` | 插件体系（server/gui/tui） | 平台能力注入的扩展点 |

依赖方向（来自 `AGENTS.md`）：`Schema → Core/Protocol → Server`；客户端运行时代码只依赖 `Schema/Protocol`；`sdk` 组合三者。**云平台应通过 SDK/HTTP API 集成，不 fork 核心。**

## 2. 关键能力（已核实）

### 2.1 服务端：`opencode serve`

- 命令描述：**"Start the v2 API and web server"**（API + Web GUI 同进程同源）。
- 参数：`--hostname`、`--port`、`--cors`（可重复）、`--service`、`--stdio`。
- 认证（`packages/server/src/auth.ts` + `middleware/authorization.ts`）：
  - `OPENCODE_PASSWORD` / `OPENCODE_SERVER_PASSWORD` 设置服务密码，用户名固定 `opencode`；
  - 支持 HTTP Basic、`?auth_token=`、以及 HMAC 签名的会话 Cookie（`opencode_session[_<port>]`，TTL 30 天）；
  - Cookie 由服务密码派生签名，**知道服务密码即可为任意用户签发会话**；
  - 未认证时浏览器导航返回 401 + Basic challenge；fetch 不弹窗。
- 协议：Effect HttpApi，路由分组包括 `server.info`、`session`、`message`、`provider`、`model`、`config`、`skill`、`mcp`、`pty`、`permission`、`project`、`fs`、`agent`、`command`、`event` 等；SSE 事件流 `/api/event`。

### 2.2 配置体系（平台下发的主通道）

- 配置文件 JSONC：`opencode.json(c)`；来源优先级从低到高包含：托管策略（managed policy）、integration、remote、用户全局、项目；`Config` 服务监听文件变化并热加载。
- 关键字段（`packages/schema/src/config.ts`）：
  - `model`：默认模型；
  - `providers`：Provider 定义（可指向 OpenAI 兼容网关）；
  - `mcp`：MCP 服务配置（`mcp.servers`，支持 stdio 本地与 HTTP/SSE 远程、OAuth）；
  - **`skills: string[]`：额外的技能发现路径或 URL**；
  - `policies`：对 provider / tool / integration 的访问策略（托管策略可强制）；
  - `plugins`、`agents`、`commands`、`instructions` 等。
- **平台可利用**：托管策略 + 全局配置 + 文件监听，实现"模型/技能/MCP 配置统一下发、秒级生效、无需重建工作区"。

### 2.3 Skill 能力（原生，适合做 Skill 中心）

- 技能规范：`SKILL.md` + frontmatter（`name`、`description`、`disable-model-invocation` 等），支持目录与**远程 URL 源**（`Skill.Source = directory | url | embedded`）。
- 发现：`ConfigSkillPlugin` 汇集 `~/.claude/skills`、`.agents/skills`、`.opencode/skill(s)`、配置 `skills` 路径/URL；`SkillDiscovery` 支持从 URL 拉取。
- 服务端 API：`GET /api/skill` 列出；`POST /api/experimental/session/:id/skill` 激活技能。
- **平台可利用**：Skill 中心托管"技能源 URL"，按用户/项目下发 `skills` 配置；版本化、审核、评测在平台侧完成。

### 2.4 MCP 能力

- 配置 `mcp.servers`：本地 stdio 与远程 HTTP（含 OAuth）；CLI `opencode mcp add/list/auth`。
- 服务端 handlers：`mcp.ts`；事件 `mcp-event`。
- **平台可利用**：MCP 中心维护企业目录 → 生成 `mcp.servers` 片段 → workspace-agent 注入；凭证由网关/代理托管。

### 2.5 模型与 Provider

- `models.dev` 目录 + 自定义 provider；Provider/Model handlers 暴露运行时模型列表；`policies` 控制访问。
- **平台可利用**：Provider 指向 LiteLLM Gateway（OpenAI 兼容），按用户发虚拟 Key；模型策略通过 `model` + `policies` + 网关三重控制。

### 2.6 其他

- 权限系统（permission）、PTY/终端、文件系统、worktree、snapshot、usage、job/schedule、websearch、voice 等 handler 已具备。
- 插件体系可在 server 侧注入工具/技能；`packages/plugin-browser` 展示了 `skill://` 虚拟技能与工具授权模式。

## 3. 与云平台需求的映射

| 平台需求 | opencode 现状 | 平台侧要补的能力 |
| --- | --- | --- |
| 每用户 4C8G 独立环境 | 单进程单用户 server | K8s Operator：Pod/PVC/Service/Ingress、生命周期、就绪探针 |
| 统一模型配置 | `providers` + `model` + `policies` + 热加载 | 模型注册表、LiteLLM 网关、按用户虚拟 Key、配额 |
| 用户 API Key | 仅服务密码（单租户） | 平台 `ock_` Key、OIDC SSO、RBAC、审计、网关换票 |
| 退出不销毁 | 进程内状态 + 本地磁盘 | PVC 持久化、独立生命周期、显式销毁 API |
| Skill 中心 | `skills` URL/目录 + `SKILL.md` | 注册/版本/审核/分发/安装/统计 + 评测准入 |
| 评测中心 | 无内置评测编排 | 沙箱 Job、数据集、评分器、报告、排行榜 |
| 应用中心 | 无应用概念 | 从工作区构建镜像、1C2G 部署、分享 ACL、域名、SSO |
| MCP 中心 | `mcp.servers` + OAuth | 企业目录、凭证托管、代理审计、授权绑定 |
| Web 访问 | `serve` 内置 Web GUI | 域名 + SSO 反代 + 上游 Basic 注入 + WS 透传 |

## 4. 集成策略（初版，待架构门禁确认）

1. **运行形态**：每个工作区一个 Pod（4C8G），跑 `opencode serve --hostname 0.0.0.0 --port 4096`，Web GUI 与 API 同源；PVC 挂载 `/home/opencode` 与 `/workspace`。
2. **鉴权**：公网 → Ingress → oauth2-proxy（OIDC SSO）→ 内部网关校验用户-工作区归属 → 向上游注入 `Authorization: Basic base64(opencode:<workspace-password>)`；密码由控制面生成并存入 K8s Secret，用户不可见。
3. **配置下发**：workspace-agent 从控制面拉取 `opencode.json`（含 provider=LiteLLM、model、skills URL、mcp.servers、policies），写入全局配置目录；利用文件监听热更新；关键策略同时写入 managed policy 防篡改。
4. **模型**：LiteLLM 为每个用户/工作区签发虚拟 Key（预算、限流、可撤销），opencode provider 的 `baseURL` 指向 LiteLLM，`apiKey` 为虚拟 Key。
5. **技能**：Skill 中心暴露版本化技能源 URL（含签名、按用户鉴权），通过 `skills` 配置注入；评测通过才允许发布。
6. **MCP**：MCP Hub 生成 `mcp.servers` 片段；远程 MCP 走 Hub 代理（凭证托管、审计、限流）；stdio MCP 由镜像内置白名单。
7. **应用**：应用中心基于工作区产物构建镜像 → 1C2G Deployment + Service + Ingress；分享 ACL 在网关鉴权；SSO 复用同一 OIDC。
8. **上游升级**：锁定镜像 tag（对应 commit），升级走"新镜像 → 金丝雀工作区 → 回归门禁"。

## 5. 风险与待核实项

| # | 事项 | 状态 | 结论 / 证据 |
| --- | --- | --- | --- |
| 1 | `serve` 默认端口与健康检查路径 | ✅ 已关闭 | 默认 4096，被占用 +1 递增；`GET /api/info` 200/503/500。证据：`ARCHITECTURE.md` 附录 A#1（`server/src/process.ts:150-160`） |
| 2 | Web GUI 是否支持子路径（`/w/{id}/`）反代 | ✅ 已关闭 | 不支持；根路径资源 + 绝对 `/_assets/*`；`opencode_session` Cookie `path=/` 会串会话。采用独立子域名。证据：附录 A#2（`web-ui.ts`） |
| 3 | URL 技能源的目录索引格式 | ✅ 已关闭 | 固定 `GET {url}/index.json`，同 origin 相对文件；query 签名被 URL 解析丢弃 → 令牌必须放路径。证据：附录 A#3（`core/src/skill/discovery.ts:92-145`） |
| 4 | managed policy 文件位置与优先级 | ✅ 已关闭 | Linux `/etc/opencode/opencode.json(c)`；`managedSettings` 最后加载压过一切，`policies` 为最终权威。证据：附录 A#4（`core/src/config/discovery.ts`、`config.ts`） |
| 5 | PTY/WebSocket 经反代的 ticket 机制 | ✅ 已关闭 | PTY 使用 ticket query + `auth_token` 机制；网关透传 WS/SSE，超时 3600s。证据：附录 A（`protocol/src/groups/pty.ts`） |
| 6 | 多租户下服务端 SQLite 的并发与备份 | ✅ 已关闭 | 每工作区独立 PVC 上的单实例 SQLite；并发由单用户约束；备份走 PVC 快照。证据：`DEPLOYMENT.md` §8 |
| 7 | `usage` 事件能否作为计量来源 | ✅ 已关闭 | 否；权威源 = LiteLLM spend log，上游 session/stats 仅对账。证据：附录 A#7 + ADR-013 |
| 8 | 是否可关闭自动更新（容器内） | ✅ 已关闭 | 是；`config.update = "disable"`，托管配置强制。证据：附录 A#8 + ADR-009 |

> 结论：opencode v2 已具备"配置热加载 + 原生 Skill/MCP + 内置 Web GUI + 可编程 API"四项关键能力，
> 云平台应以**外围控制面 + 每用户实例**的方式构建，而不是改造核心。§5 的 8 项待核实项已于 G2 前全部关闭
> （证据见 `docs/02-architecture/ARCHITECTURE.md` 附录 A）。
