# OpenDream Cloud 关键页高保真规格（SCREENS v1）

- 版本：v1.1（2026-11-04 与 architect 契约对齐）
- Owner：`web-console`
- 状态：**待 G3 评审**；G3 PASS 后进入 `apps/console` 实现（PLAN T4.8）
- 配套：[IA.md](IA.md)（流程/导航/异常总则） · [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)（tokens/组件） · [prototype/index.html](prototype/index.html)（可点击原型）
- 基准视口：**1440×900**（另测 1280、1024、768、390）；字体中文 zh-CN 默认
- 契约状态：`docs/02-architecture/openapi.yaml`（architect 2026-11-04 已定稿首批决策，文件落盘后以文件为准）。本文 API 表为**设计提案**，已按 architect 回复对齐：错误码小写下划线 + `X-Request-Id`、cursor 分页默认无 `total`、工作区 9 态、**进入工作区主路径为新标签页**（iframe 降为 P1）、`public` 跨租户可见、API 路径 uuid、`cost_usd` decimal string、`tokens` 整数。剩余差异见文末 §22。

---

## 0. 全局约定（所有页面适用）

| 项 | 约定 |
|----|------|
| 布局 | 控制台外壳：侧栏 240 + 内容（max 1440，边距 32）；页面 = 标题区 64 + 工具栏 48/56 + 内容区；详情页 8+4 栏 |
| 标题区 | H1 (`text-2xl 600`) + 描述 (`text-sm secondary` ≤2 行) + 主 CTA（右侧）；`tabIndex=-1` 供路由切换聚焦 |
| 数据加载 | 首屏骨架（保持布局）；筛选/翻页保留旧数据 + 顶部 2px 进度条；错误不破坏页面框架 |
| 分页 | 游标 `?cursor=&limit=20`（max 100）；响应 `{items, next_cursor}`；**默认无 `total`**，仅 `?include_total=true` 返回；UI 无 total 时用"加载更多/下一页"（architect 定稿） |
| 错误包络 | `{error:{code,message,details?,request_id}}`；`code` 为 16 个通用分类（小写下划线：`unauthorized/forbidden/not_found/validation_failed/conflict/precondition_failed/rate_limited/quota_exceeded/internal_error/database_unavailable/orchestrator_unavailable/model_gateway_unavailable` 等）；**领域原因在 `error.reason`**，可操作文案按 `reason` 分支；响应头 `X-Request-Id` 同值 |
| 写操作 | `Idempotency-Key: uuid`；重试**复用同一 key**；重复提交返回同一资源 + `Idempotency-Replayed: true`；成功后 Toast；失败定位字段/给 retry |
| 金额/token | `cost_usd` 为 decimal string、`tokens` 为整数（`input/output/reasoning/cache_read/cache_write`）；前端不得浮点累加，展示用字符串格式化 |
| 权限 | 前端按 RBAC 显隐；越权由服务端 403 兜底 → 统一 403 页/模块卡 |
| 状态推送 | SSE `GET /api/v1/events`（提案）+ 断线后 10s 轮询降级（IA §6.5） |
| 无障碍 | 每页 H1 唯一；表格 caption；表单 label；焦点环；axe critical=0（DESIGN-SYSTEM §10） |
| 埋点 | `page_view{route}` + 页面内关键事件（每屏末尾列） |
| 时区 | 服务端 ISO8601 UTC；前端按用户时区渲染（默认 Asia/Shanghai） |

---

## 1. 屏幕索引

| ID | 页面 | 路由 | 优先级 | 关键角色 | 关联流程 |
|----|------|------|--------|----------|----------|
| S1 | 登录 / SSO 回调 / 登录失败 | `/login`、`/auth/callback`、`/auth/error` | P0 | 全部 | F1 |
| S2 | 首次登录与自动拉起 | `/onboarding` | P0 | 全部 | F1 |
| S3 | 工作区列表 | `/workspaces` | P0 | member+ | F1/F2 |
| S4 | 工作区详情（状态页；MVP 新标签页进入 GUI，嵌入 P2 默认关） | `/workspaces/:id` | P0 | owner+ | F1/F2 |
| S5 | 工作区设置（销毁/快照/休眠） | `/workspaces/:id/settings` | P1 | owner+ | F2/F10 |
| S6 | 模型中心 | `/models`（含 `/models/policies`） | P0 | member+ / admin | E2 |
| S7 | Skill 中心 | `/skills` | P0 | member+ | F3/F4 |
| S8 | Skill 详情（安装/准入） | `/skills/:slug` | P0 | member+ | F3/F4 |
| S9 | 评测中心 + 新建运行 | `/evals`、`/evals/new` | P0 | member+ | F5 |
| S10 | 评测报告与对比 | `/evals/runs/:id/report` | P0 | member+ | F5 |
| S11 | 应用中心 | `/apps` | P0 | member+ | F6 |
| S12 | 应用创建向导 | `/apps/new` | P0 | member+ | F6 |
| S13 | 应用详情 | `/apps/:id` | P0 | owner+ | F6 |
| S14 | 分享设置 | `/apps/:id/share` | P0 | owner+ | F6 |
| S15 | MCP 中心 | `/mcp`（含 `/mcp/:id`） | P0 | member+ | F7 |
| S16 | 用量与配额 | `/usage` | P0 | member+ | F8 |
| S17 | 审计日志 | `/audit` | P0 | team_owner+ | F9 |
| S18 | 应用使用门户 | `/a/:slug` | P0 | app_user | F6 |

---

## 2. S1 登录 / SSO 回调 / 登录失败

**路由**：`/login`、`/auth/callback`、`/auth/error`
**权限**：匿名
**入口**：任意控制台 URL 未登录重定向（保留 `return_to`）；应用门户直链。
**目标**：≤2 次点击完成登录；失败可理解、可重试、不白屏。

### 2.1 布局（1440）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ OC Cloud                    [中文 ▾] [帮助] [状态页]                          │ 顶部 72
├───────────────────────────────┬──────────────────────────────────────────────┤
│  左：品牌与价值（640）         │  右：登录卡（480，垂直居中）                  │
│                               │  ┌────────────────────────────────────────┐  │
│  让你的 AI 工程              │  │ 登录 OpenDream Cloud                    │  │
│  云工作室随浏览器而来         │  │ 使用企业账号继续（SSO）                │  │
│                               │  │ [  使用企业账号登录（SSO）  ]          │  │
│  · 4C8G 云端工作区            │  │ ──────────── 或 ────────────           │  │
│  · 统一模型与配额             │  │ [ 使用 API Key 登录（CLI/SDK） ]       │  │
│  · Skill / 评测 / 应用 / MCP  │  │                                        │  │
│                               │  │ ⚠ 无法登录：身份提供方返回错误          │  │
│  插画/图形（内联 SVG）        │  │   AADSTS50020 · [重试] [联系管理员]     │  │
│                               │  └────────────────────────────────────────┘  │
│                               │  登录即表示同意《服务条款》《隐私政策》       │
└───────────────────────────────┴──────────────────────────────────────────────┘
```

栅格：12 列；登录卡 4 列（桌面右 1/3），<1024 登录卡居中全宽 400；<640 单列、隐藏左栏插画。

### 2.2 组件树

```
<AuthLayout>  (无侧栏/顶栏，仅语言/帮助/状态)
  <BrandPanel aria-hidden>  文案 + 3 条能力点 + SVG 插画
  <LoginCard>
    <h1>登录</h1>
    <Button variant=primary size=lg fullWidth loading>企业账号登录（SSO）
    <Divider>或</Divider>
    <Button variant=secondary fullWidth>使用 API Key 登录
    <InlineAlert tone=danger icon aria-live=assertive>登录失败：… + 重试 + 联系管理员
    <LegalText>条款/隐私（链接 target=_blank）
  <LocaleSwitcher/>  <ThemeToggle/>  <StatusLink/>
```

### 2.3 字段与校验

| 字段 | 类型 | 必填 | 校验 | 错误文案 |
|------|------|------|------|----------|
| `return_to`（query） | string(url) | 否 | 仅允许同源相对路径白名单；禁止 `//`、`http(s)://` 外域 | 非法时静默丢弃并跳 `/workspaces` |
| `lang`（query） | `zh-CN\|en-US` | 否 | 枚举 | 非法回退默认 |
| API Key 登录（P1） | password | 是 | `ock_` 前缀 + 长度 40–64 | "API Key 格式不正确，应以 ock_ 开头" |

### 2.4 交互与状态

- 点击 SSO：按钮进入 loading（防连点）→ 同窗口跳 IdP；返回 `/auth/callback` 显示"正在完成登录…"（≤3s，失败转 `/auth/error`）。
- 登录失败分类：`idp_unreachable`（身份提供方不可达）、`state_mismatch`（安全校验失败，重试）、`access_denied`（账号未开通/被禁用 → 显示管理员联系方式）、`org_not_provisioned`（组织未开通）。
- 开发/测试环境显示"演示登录"入口（仅 `NODE_ENV!==production`，构建时剔除）。
- 已登录访问 `/login` → 302 `/workspaces`。
- 暗色自动跟随系统；主题与语言选择在未登录状态也持久化。

### 2.5 API 映射（提案）

| 动作 | 方法/路径 | 关键请求/响应 | 错误码 |
|------|-----------|---------------|--------|
| 发起 SSO | `GET /api/v1/auth/login?return_to=` → 302 IdP | state + PKCE challenge（HttpOnly Cookie） | 503 `IDP_UNREACHABLE` |
| 回调换会话 | `GET /api/v1/auth/callback?code=&state=` | Set-Cookie 会话（HttpOnly/Secure/SameSite=Lax）；302 return_to | 400 `STATE_MISMATCH`、403 `ACCESS_DENIED` |
| 当前用户 | `GET /api/v1/me` | `{id,name,email,avatar_url,org,roles,permissions,locale,theme}` | 401 |
| 登出 | `POST /api/v1/auth/logout` | 清会话；不触发工作区销毁 | — |

### 2.6 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| IdP 不可达 | 卡内错误 + 错误码 | 重试 / 状态页 / 联系管理员 |
| state 不匹配 | 卡内错误（安全提示） | 重新登录 |
| 账号无权限 | 卡内错误 + 管理员邮箱 | 联系管理员 / 换账号 |
| 网络离线 | 顶部黄条 + 按钮禁用 | 恢复后重试 |
| 回调 5s 未完成 | 转 `/auth/error`（超时） | 重试登录 |
| 组织维护 | 全屏维护页（预计恢复时间） | 刷新 / 状态页 |

### 2.7 验收与埋点

- 键盘：Tab 顺序为 语言 → 帮助 → 主题 → SSO 按钮 → 条款；Enter 触发；焦点环可见。
- axe：0 critical；对比度全过；表单无需标签（仅按钮）。
- LCP <2.5s（静态资源 + 无阻塞第三方脚本）。
- 埋点：`auth_view`、`auth_start{method}`、`auth_success{elapsed}`、`auth_fail{code}`、`auth_retry`。

---

## 3. S2 首次登录与自动拉起 `/onboarding`

**权限**：已登录且无工作区（或 `?workspace_id=` 指定创建中工作区）
**目标**：把 90s 的等待变成可信、可离开、可恢复的进度体验（PLAN R3.2/R3.9）。

### 3.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ⬢ OC Cloud                                        [稍后继续 →]   [头像 ▾]   │ 56
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   欢迎，李雷                                          [组织: 星云科技]        │
│   正在为你准备工作区                                                        │
│                                                                              │
│   ✓ 账号已就绪            开发者 · 星云科技                                  │
│   ● 正在创建云端工作区     阶段：启动引擎 · 4C8G · 独立存储       [查看事件] │
│   ○ 进入工作区                                                              │
│                                                                              │
│   [▓▓▓▓▓▓▓▓▓▓░░░░░░]  不确定进度（阶段式）· 已用 1 分 12 秒                  │
│                                                                              │
│   等待时可以： [浏览 Skill 中心]  [查看可用模型]  [阅读快速上手]              │
│                                                                              │
│   ──────────────────────────────────────────────────────────────────────    │
│   遇到问题？[重试创建] [复制诊断 ID] [联系管理员]                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 组件树

```
<ProvisioningPage>
  <ProgressSteps>  ✓ 账号就绪 / ● 创建工作区（分配→拉镜像→启动引擎→就绪）/ ○ 进入工作区
  <IndeterminateProgress role=progressbar aria-busy=true> + 当前阶段 + 已用时间（MVP 无百分比）
  <TaskHint> 可离开的说明 + 3 个并行入口（Skill/模型/帮助）
  <ProvisionErrorCard hidden>（失败时替换进度区）
  <EventDrawer>（"查看事件"抽屉：时间线 + request_id）
```

### 3.3 状态机

| 状态 | 依据 | UI |
|------|------|----|
| `creating` | 202 + `state=provisioning` | 阶段式进度（分配资源→拉取镜像→启动引擎→就绪）+ 已用时；**MVP 不显示百分比**（openapi 无 progress.pct，见 G2 评审项） |
| `slow` | 已用 >90s | 文案"比预期慢，仍在处理" + 事件抽屉 + 可继续等待/稍后继续；**>180s 判失败**（`ws_launch_timeout`） |
| `ready` | SSE `workspace.status_changed` → `ready` | 阶段完成 + 主 CTA「进入工作区」；**用户点击后用 `window.open` 打开新标签页，不自动打开**（避免被浏览器拦截） |
| `failed` | `state=error` + `error.reason` | 分诊卡（见 §3.4） |
| `quota` | 409 `ws_quota_exceeded` | 配额卡：上限/已用 + 申请提升 + 联系负责人 |
| `session_expired` | 401 | 登录 Dialog，回来续跑（任务不丢） |

### 3.4 失败分诊

| 原因 `error.reason`（UI 按 reason 分支） | 标题 | 说明 | 主 CTA |
|------------------|------|------|--------|
| `orchestrator_unavailable` | 集群资源紧张 | 当前没有可分配的 4C8G 资源（调度失败/资源不足），稍后重试或联系管理员扩容 | 重试（退避 10s） |
| `ws_image_pull_failed` | 运行时镜像拉取失败 | 镜像仓库或网络异常，系统已记录 | 重试 / 联系管理员 |
| `ws_quota_exceeded` | 工作区配额已用尽 | 你的组织允许 1 个工作区（HTTP 409） | 申请提升 / 管理配额 |
| `ws_launch_timeout` | 创建超时 | 已超过 180 秒，可重试或联系管理员 | 重试 |
| `config_stale` | 配置异常 | 组织模型策略或工作区模板不完整 | 联系管理员 |
| `unknown` | 创建失败 | 附诊断 ID | 重试 / 复制诊断 ID |

重试策略：手动重试最多 3 次，按钮显示冷却倒计时；连续失败 3 次 → 主 CTA 变"联系管理员"（预填诊断 ID）。

### 3.5 API 映射（提案）

| 动作 | 方法/路径 | 说明 |
|------|-----------|------|
| 查询我的工作区 | `GET /api/v1/workspaces` | 无则前端调创建 |
| 创建（幂等） | `POST /api/v1/workspaces` / `/workspaces/me/ensure` `Idempotency-Key` | 202 `{id,state:"provisioning",host}`；已有则 200 返回现有（openapi 实际字段） |
| 状态 | `GET /api/v1/workspaces/{id}` | `{state,state_reason,host,resources}`；`progress`/`estimated_ready_at` 需 openapi 补（G2 评审项） |
| 事件流 | `GET /api/v1/events`（SSE，`Last-Event-ID`） | 事件 `workspace.status_changed`（`{workspace_id,from,to,reason,at}`） |
| 重试 | `POST /api/v1/workspaces/{id}/retry` | 409 若已在创建；429 若超重试上限 |
| 事件时间线 | `GET /api/v1/workspaces/{id}/events` | 供抽屉展示 |

### 3.6 异常处理

- SSE 断线：显示"实时连接中断，正在重连"；降级 10s 轮询；进度条不停。
- 用户点"稍后继续"：回 `/workspaces`，创建继续；就绪后 Toast + 通知中心（站内 + 邮件 P1）。
- 刷新页面：重新进入 `/onboarding?workspace_id=`，状态不丢。
- 幂等：重复提交返回同一 workspace，不产生第二个。

### 3.7 验收与埋点

- 进度页可离开，离开后成功率不下降（服务端后台继续）。
- 180s 内无"假死"（已用时/阶段/事件始终更新）；>180s 判 `ws_launch_timeout`。
- 失败分诊覆盖 ≥5 类 reason；重试有冷却。
- 埋点：`provision_view`、`provision_progress{stage,elapsed}`、`provision_leave`、`provision_retry{count}`、`provision_success{elapsed}`、`provision_fail{reason}`。

---

## 4. S3 工作区列表 `/workspaces`

**权限**：登录用户（仅见自己；负责人可见团队，`?scope=team`）
**目标**：一眼看到"我的工作区状态 + 继续上次"，1 次点击进入。

### 4.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 工作区                                                        [+ 新建工作区]  │ H1 32
│ 你的云端 opencode 工作区；关闭浏览器不会销毁，下次回来继续。                │
├──────────────────────────────────────────────────────────────────────────────┤
│ [全部 ▾] [状态: 全部 ▾]   🔍 搜索名称/ID                       视图: 卡片|表 │ 48
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ● 就绪   oc-7f3a · 支付重构                              [ 进入工作区 → ]│ │ 主卡
│ │ 4C8G · PVC 20Gi · 最近活动 2 分钟前                                     │ │
│ │ Skill 4 · MCP 2 · 上次会话「修复登录超时」                              │ │
│ │ [设置] [快照] [更多 ▾]                                                  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────┐  ┌──────────────────────────────┐          │
│ │ ○ 空闲  oc-9c21 · 数据分析   │  │ 已销毁 oc-1a02（5 分钟可撤销）│          │
│ │ 最近活动 3 小时前            │  │ 可撤销 · 还剩 4 分钟          │          │
│ │ [进入] [更多 ▾]              │  │ [撤销销毁] [新建]            │          │
│ └──────────────────────────────┘  └──────────────────────────────┘          │
└──────────────────────────────────────────────────────────────────────────────┘
```

主卡（最近使用且 ready/idle）占满 12 列；其余卡片 6 列（≥1280）/12 列（<1024）。卡片严格显示：状态、名称、ID、资源规格、最近活动、上次会话、已装能力、主 CTA。

### 4.2 组件树

```
<PageHeader title="工作区" description …>
  <Button primary>+ 新建工作区（P2，配额允许时；否则"申请配额"）
<FilterBar> 状态 Select / 搜索 Input / 视图切换 Segmented
<WorkspaceGrid>
  <WorkspaceCard status=ready|starting|idle|stopped|error|deleting>
    <StatusBadge> <Name> <Id mono> <MetaRow> <CapabilitySummary>
    <Actions> 进入（primary）/ 设置 / 快照 / 更多（DropdownMenu：重命名、复制 ID、销毁、审计）
  <QuotaHintCard>（配额 1/1 时）
<EmptyState>（无工作区：创建中/失败/配额 三态）
```

### 4.3 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `name`（重命名） | string | 是 | 2–40 字符；允许中英文/数字/空格/-；不含控制字符 | 重名允许，ID 唯一 |
| `q`（搜索） | string | 否 | ≤64 | 名称/ID 模糊 |
| `status` | enum | 否 | §6.2 枚举 | 多选 P1 |
| `view` | `card\|table` | 否 | 枚举 | 持久化 |

### 4.4 交互与状态

- 进入：`ready` 直接换票并新标签页打开（`window.open`）；`idle` 是 ready 子态（资源常驻）**直接进入，无需唤醒**；`stopped` 先 `POST /api/v1/workspaces/{id}/start` 显示"正在唤醒（约 20s）"再打开；`starting` 主 CTA 为"查看进度"（跳详情/onboarding）。
- 卡片更多菜单：重命名、复制工作区 ID、快照、查看事件、销毁（danger，二次确认）、打开审计。
- 快照：确认后后台任务，完成后通知；快照列表在设置页。
- 刷新：`?refreshed=` 不做；提供手动刷新按钮，状态通过 SSE 自动更新。
- 负责人 `?scope=team`：显示归属人列/筛选；卡片多"接管诊断"（需原因）。

### 4.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 列表 | `GET /api/v1/workspaces?scope=mine\|team&state=&q=&cursor=` | `items[{id,name,state,resources,...}]`；**UI 需要 `last_active_at`/`last_session_title`/`skill_count`/`mcp_count`/`pvc_size`，openapi Workspace 未含 → G2 台账（需 enrichment）** | 403 越权 scope |
| 重命名 | `PATCH /api/v1/workspaces/{id}` | `{name}` | 400/409 |
| 快照 | `POST /api/v1/workspaces/{id}/snapshots` | `Idempotency-Key` | 409 状态冲突 |
| 销毁 | `POST /api/v1/workspaces/{id}/destroy` | `{confirm_name, acknowledge_data_loss:true, keep_snapshot:true}`；202 进入冷却；409 引用/状态阻断 |
| 撤销销毁 | `POST /api/v1/workspaces/{id}/destroy/cancel` | 冷却期内；409 已过冷却 |
| 实时状态 | SSE `workspace.status_changed` | 更新卡片徽标 | — |

### 4.6 异常处理

| 状态 | 卡片表现 | 主 CTA |
|------|----------|--------|
| 首屏加载 | 3 个卡片骨架 | — |
| 无工作区·创建中 | 卡片骨架 + "正在创建" | 查看进度 |
| 无工作区·失败 | 红卡 + 原因 + 诊断 ID | 重试创建 / 联系管理员 |
| 无工作区·配额 | 灰卡 + "配额 1/1" | 申请提升 |
| 列表 5xx | 错误卡（保留标题/筛选） | 重试 |
| 卡片状态 `error` | 红徽标 + 一句话原因 | 重试 / 查看事件 |
| 已销毁冷却中 | 删除线 + 倒计时 | 撤销销毁 / 新建 |
| 搜索无结果 | 表格内空态 | 清除搜索 |

### 4.7 验收与埋点

- 进入工作区 ≤1 次点击；状态变更 ≤2s 反映（PLAN R3.6）。
- 卡片在 360 宽度下不溢出；键盘可达每张卡的"进入"。
- 埋点：`workspace_list_view`、`workspace_enter{from,status}`、`workspace_rename`、`snapshot_create`、`workspace_destroy_start`。

---

## 5. S4 工作区详情（MVP：状态页；P2：嵌入容器，默认关闭）`/workspaces/:id`

**权限**：工作区 owner / 团队负责人（接管）/ org_admin
**目标**：MVP 让用户清楚看到状态、最近会话、事件与设置，并以**新标签页**一键进入 opencode；P1 提供可选嵌入模式，并明确"容器边界"：控制台只包壳，不复制 GUI。
**契约**：`POST /api/v1/workspaces/{id}/access-ticket` 返回 `{url, base_url, ticket, expires_in:60, mode:"redirect"|"embed", fallback_url}`；**主路径 new-tab 直达**（`https://w-<id>.ws.<domain>/`），ticket 一次、网关 302 后移除；iframe 为 **P2 实验、默认关闭**（MVP 不做嵌入承诺）。

### 5.1 布局（MVP 状态页，WorkspaceShell）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 工作区   ● 就绪（idle）  oc-7f3a · 支付重构      [打开工作区 ↗] [⋯]         │ 48 顶栏
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌ 状态 ────────────────────────┐ ┌ 最近会话 ────────────────────────────┐   │
│ │ 就绪 · 4C8G · PVC 20Gi        │ │ 修复登录超时 · 2 小时前              │   │
│ │ 最近活动 2 分钟前             │ │ [继续上次会话 ↗]                     │   │
│ │ 打开方式：新标签页（推荐）    │ │                                      │   │
│ └──────────────────────────────┘ └──────────────────────────────────────┘   │
│ ┌ 事件时间线 ─────────────────────────────────────────────────────────────┐ │
│ │ 09:12 workspace.ready     配置下发完成                                   │ │
│ │ 09:10 workspace.starting  运行时启动                                     │ │
│ │ [查看全部事件]                                                           │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ 快捷操作：[打开工作区（新标签页）] [设置] [快照] [复制 ID] [销毁（危险）]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 顶栏"打开工作区"为主 CTA：换票 → `window.open(url, '_blank', 'noopener')`；弹窗被拦截时同页 `location.assign(url)` 兜底。
- 状态条：规格、最近活动、状态（9 态）、SSE 连接状态；`idle` 显示"空闲（资源常驻，可直接进入）"。
- `⋯` 菜单：工作区设置、快照、查看全部事件、复制 ID、打开审计、销毁（danger）。
- 右侧可加"最近 Skill/MCP 变更"卡片（P1）。

### 5.1.1 嵌入模式（P2 实验，feature flag `console.embedWorkspace`，默认关）

启用后布局如下（仍不复制 opencode UI）：

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 工作区  ● 就绪  oc-7f3a · 支付重构   [⤢ 全屏] [↗ 新标签页] [⋯]           │ 48
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │   opencode Web GUI（iframe，P2 实验）                                    │ │
│ │   ┌────────────┬──────────────────────────────────────────┬───────────┐  │ │
│ │   │ 会话        │ 对话消息流                                │ 文件/终端  │  │ │
│ │   └────────────┴──────────────────────────────────────────┴───────────┘  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 状态条：4C8G · SSE 已连接 · 延迟 42ms · 本次会话 12 分钟        [隐藏状态条]  │ 28
└──────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 容器边界（P2 嵌入模式硬性规则；MVP new-tab 不受此限）

| # | 规则 | 理由 |
|---|------|------|
| B1 | 控制台**不复制** opencode 的会话/文件/终端/权限 UI；MVP 用 new-tab，P2 嵌入时 iframe 仅作可选入口 | 上游只读集成（A4/D3），避免双实现漂移 |
| B2 | 每次进入重新换票：`POST /access-ticket` → `{url,ticket,expires_in:60,mode}`；**ticket 一次性、60s、绑定 user+workspace**；ticket 只在 URL 出现一次，网关 302 后移除；`fallback_url` 用于换票失败重试；不透传 Basic 密码 | 不把服务密码暴露给浏览器（BASELINE §4.2） |
| B3 | 嵌入 iframe `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-popups"`；禁止 `allow-top-navigation` | 最小权限；防 iframe 劫持控制台 |
| B4 | 父页面与 iframe 仅允许 2 条 `postMessage`：`oc:ping`、`oc:fullscreen`；校验 `origin` | 防注入 |
| B5 | 降级链：① 换票/加载失败 → 重试同 URL 1 次 → ② 降级「在新标签页打开」（同一 URL）→ ③ 诊断 ID + 联系管理员；new-tab 本身即最终兜底 | 上游整页 SPA + 反代/子路径风险（BASELINE 待核实 #2） |
| B6 | 兼容性前置检查（**必须与 console 同 registrable domain** + 网关 `frame-ancestors` 白名单；第三方 Cookie / CSP / 键盘焦点冲突）任一不满足 → 默认走 new-tab | 键盘焦点/快捷键在嵌入下体验差；跨父域嵌入不支持（architect 结论） |
| B7 | 会话过期（401）：控制台顶层重新登录，登录后**重换票并重载**（嵌入模式）或重新打开（new-tab 由工作区自身处理） | 长连接稳定（R3.4） |
| B8 | 工作区状态非 ready：不渲染 iframe，显示对应状态页（创建中/异常/销毁中）；`idle` 可直接进入；`stopped` 先唤醒 | 避免错误嵌套 |
| B9 | 离开页面不销毁工作区；不弹"确认离开" | 退出不销毁（D1） |

### 5.3 进入流程状态机（MVP new-tab + P1 embed）

| 阶段 | 表现 | 超时/失败 → 降级 |
|------|------|------------------|
| `ticket_requesting` | 主 CTA loading ≤1s；按钮文案"正在打开…" | 5s → 错误 Toast + 重试 |
| `opening` | 已 `window.open`；当前页保持状态页 + 提示"已在新标签页打开" | 弹窗被拦截 → 同页跳转兜底 |
| `opened` | 显示"再次打开"链接 | — |
| `wake` | `stopped` → `POST /api/v1/workspaces/{id}/start`（幂等；ready/idle no-op），显示"正在唤醒（约 20s）" + 进度 | 60s → 重试 / 联系管理员 |
| `embed_loading`（P1） | iframe 骨架 | 15s → 重换 ticket 1 次 → 降级 new-tab |
| `embed_blocked`（P1） | 降级卡：无法嵌入（原因）+ 新标签页 | — |
| `workspace_unavailable` | 状态页（provisioning/error/deleting） | 重试/返回 |
| `session_expired` | 登录 Dialog | 登录后原位恢复 |

### 5.4 组件树

```
<WorkspaceShell>
  <TopBar>
     <BackButton aria-label=返回工作区列表>
     <StatusBadge workspace.status> <WorkspaceName> <Id mono>
     <Button primary icon=ExternalLink>打开工作区（new-tab）</Button>
     <DropdownMenu> 设置/快照/事件/复制ID/审计/销毁
  <WorkspaceOverview>  状态卡（规格/最近活动/SSE）· 最近会话卡 · 事件时间线
  <IframeContainer>（仅 P1 flag）
     <SkeletonWorkspace/> | <Iframe title="工作区 oc-7f3a" sandbox=…/> | <EmbedBlockedCard/> | <WorkspaceStatePage/>
  <ConnectionBar>（P2 嵌入）规格 · SSE 状态 · 延迟 · 会话时长 · 折叠
```

### 5.5 交互细节

- 打开工作区（MVP）：`POST /access-ticket` → `window.open(url, '_blank', 'noopener')`；每次点击都重新换票（旧 ticket 失效）。
- 弹窗拦截：检测 `window.open` 返回 null → 同页 `location.assign(url)`；仍失败 → 错误 Toast"请在浏览器允许弹窗"。
- 唤醒：仅 `stopped` 需要；`idle` 是 ready 子态，直接进入。
- 复制 ID / 打开审计 / 查看事件：Toast 或抽屉；写埋点。
- 嵌入模式（P1）：全屏 `requestFullscreen()`；Esc 退出；断线显示状态条红字，30s 未恢复给"重新加载/新标签页"。
- 键盘：主 CTA 可通过 `Enter` 触发；不拦截浏览器快捷键。

### 5.6 API 映射（提案）

| 动作 | 方法/路径 | 说明 |
|------|-----------|------|
| 详情 | `GET /api/v1/workspaces/{id}` | 状态/规格/最近活动/诊断 |
| 换票 | `POST /api/v1/workspaces/{id}/access-ticket` | `{url(带 ticket 一次性 URL), base_url, ticket(60s), expires_in, mode:"redirect"\|"embed", fallback_url}`；403 非 owner；409 非 ready；每次进入重新换票 |
| 事件 | `GET /api/v1/workspaces/{id}/events` | 时间线（分页） |
| 唤醒 | `POST /api/v1/workspaces/{id}/start` | **仅 stopped 需要**；ready/idle 为 no-op；202 → starting |
| 换票失败 | 使用 `fallback_url` 重试同 URL；连续失败给"新标签页打开/联系管理员" | 60s ticket 过期重新换票 |
| 状态流 | SSE `workspace.status_changed`（`Last-Event-ID`） | 更新徽标/状态页 |
| 兜底轮询 | `GET /api/v1/workspaces` + `ETag/If-None-Match` | SSE 断线降级 |

### 5.7 异常处理

| 场景 | UI | 出路 |
|------|----|------|
| `provisioning`/`starting` | 状态页：进度 + 预计时间 | 等待 / 稍后继续 |
| `idle` | 状态卡"空闲（资源常驻）" | 直接打开 |
| `stopped` | 状态页：休眠说明 + "唤醒并打开" | 唤醒（约 20s） |
| `error` | 状态页：原因 + 诊断 ID | 重试 / 联系管理员 |
| `deleting` | 状态页：销毁进度 | 返回列表 |
| 无权限 | 403 页（不暴露是否存在） | 返回 / 申请 |
| ticket 409（未就绪） | 状态页 | 等待 |
| ticket 过期（60s） | 重新换票（一次） | 重试 |
| 已销毁（404/410） | 已销毁页 | 新建 |
| 嵌入被拒（P1） | 降级卡 + 原因 | 新标签页 / 重试 |
| 会话过期 | 登录 Dialog | 登录后原位恢复 |

### 5.8 验收与埋点

- 打开工作区 ≤2 次操作（进入详情 → 打开；列表主卡可直接打开）；新标签页首帧 ≤2s。
- 长连接稳定 ≥30min（R3.4）由 opencode 页面自身保证；控制台状态 ≤2s 更新（R3.6）。
- 不出现 Basic Auth 弹窗；URL 不含密码；ticket 一次性 60s；不复制 opencode UI。
- 埋点：`workspace_enter{from,status}`、`ticket_ok`、`ticket_fail{code}`、`embed_ready{ms}`（P1）、`embed_blocked{reason}`（P1）、`workspace_wake`.

---

## 6. S5 工作区设置（销毁 / 快照 / 休眠）`/workspaces/:id/settings`

**权限**：owner / org_admin
**目标**：让"退出不销毁"可控、让销毁安全可撤销、让成本可见。

### 6.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 工作区设置 · oc-7f3a                                    [返回工作区]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌ 常规 ───────────────────────────────────────────────────────────────────┐ │
│ │ 名称 [支付重构            ]   工作区 ID oc-7f3a（复制）                  │ │
│ │ 规格 4C8G / PVC 20Gi（只读，固定规格）   区域 cn-hangzhou                │ │
│ │ 闲置休眠 [ ○─── ]  关闭 · 开启后闲置 30 分钟释放计算资源，保留数据       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌ 快照与恢复 ─────────────────────────────────────────────────────────────┐ │
│ │ [创建快照]  最近快照：11-03 18:20（保留最近 7 份）                        │ │
│ │ 表格：时间 / 大小 / 状态 / 恢复 / 删除                                   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌ 危险区（danger 边框）───────────────────────────────────────────────────┐ │
│ │ 销毁工作区  删除实例；系统先创建快照，PVC 默认保留 24h（可配）；个人不可直接删除 PVC。│ │
│ │ [销毁工作区]（danger）                                                   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 销毁确认对话框（AlertDialog）

```
标题：销毁工作区「支付重构」？
影响：
 · 实例立即停止，未提交的终端进程会结束
 · 系统先创建快照后删除（默认，不可取消）
 · PVC 保留 24h（可配）；个人不可直接删除 PVC（仅管理员/合规流程）
 · 冷却默认 5min（可配 5–1440），期间可撤销销毁
输入工作区名以确认：[________________]   （必须精确匹配「支付重构」或 oc-7f3a）
原因（可选，审计）：[____________________]
[取消]（默认焦点）                         [销毁工作区]（danger，输入匹配后启用）
```

### 6.3 字段与校验

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| `idle_sleep_enabled` | boolean | 是 | 默认 false（D1/PLAN） |
| `idle_sleep_minutes` | number | 条件必填 | 15–240，步进 15 |
| `confirm_name` | string | 是 | 精确匹配 display_name |
| `acknowledge_data_loss` | boolean | 是 | 必须为 true（勾选"我已知晓数据影响"） |
| `keep_snapshot` | boolean | 是 | **强制 true（系统自动先快照后删）** |
| `delete_pvc` | — | — | **个人不可设置**；仅管理员强制销毁/合规流程可删 PVC |
| `keep_snapshot` | boolean | 是 | **强制 true（系统自动先快照后删）** |
| `delete_pvc` | — | — | **个人不可设置**；仅管理员强制销毁/合规流程可删 PVC |
| `reason` | string | 否 | 0–200 字；org_admin 接管时必填 ≥8 字 |
| `snapshot_label` | string | 否 | ≤40 字 |

### 6.4 API 映射（提案）

| 动作 | 方法/路径 | 说明 |
|------|-----------|------|
| 更新设置 | `PATCH /api/v1/workspaces/{id}` | `UpdateWorkspaceRequest` 仅 `display_name`/`model_default`；**休眠策略字段 openapi 未定义（G2 评审项）** |
| 快照列表 | `GET /api/v1/workspaces/{id}/snapshots` | `WorkspaceSnapshot[]`（trigger=user/scheduled/pre_delete；status=creating/ready/error） |
| 创建快照 | `POST /api/v1/workspaces/{id}/snapshots` | `{label?}` → 202；**无删除快照端点（G2 评审项）** |
| 恢复 | `POST /api/v1/workspaces/{id}/restore` | body 含 `snapshot_id`；409 状态冲突 |
| 销毁 | `POST /api/v1/workspaces/{id}/destroy` | 见 §4.5 |
| 撤销 | `POST /api/v1/workspaces/{id}/destroy/cancel` | 冷却期内 |

### 6.5 异常处理

- 销毁被引用阻断（有运行中评测/构建）：列出引用 + 链接 → 先去处理。
- 销毁请求 5xx：保留对话框 + 错误 + 重试；不重复扣减。
- 快照失败：行内状态 `failed` + 原因 + 重试；不影响工作区。
- 非 owner 访问：403 页（负责人可接管）。
- 多标签页同时操作：409 `STATE_CONFLICT` → 提示刷新。

### 6.6 验收与埋点

- 销毁必须输入名称；默认焦点在"取消"；Esc 关闭。
- 冷却期内列表可撤销；审计记录包含 reason。
- 埋点：`workspace_settings_view`、`snapshot_create`、`destroy_dialog_open`、`workspace_destroy_confirm`、`destroy_undo`.

---

## 7. S6 模型中心 `/models`

**权限**：member+ 看目录；team_owner+ 看策略；org_admin 可管理。
**目标**：用户不需要配置模型；负责人能控预算与可用集合。

### 7.1 布局（Tabs）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 模型中心                                                    [管理策略]（有权）│
│ 平台统一配置；你只能看到被授权的模型。                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ [模型目录] [模型策略] [供应商] [密钥与 BYOK]                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 筛选：[供应商 ▾] [能力 ▾：代码/长上下文/视觉] [仅可用 ○]  🔍 搜索           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 模型                供应商    上下文   能力       状态    价格/1K  操作    │ │
│ │ claude-sonnet-4.5   Anthropic 200K    代码/推理   ● 可用  $3/$15  设为默认│ │
│ │ gpt-5-codex         OpenAI    400K    代码        ● 可用  $2/$10  …      │ │
│ │ qwen3-coder         Alibaba   128K    代码        ◐ 限流  $1/$4   …      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 说明：模型由组织策略授权；未授权模型不展示。调用异常请查看状态页。           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 组件树

```
<Tabs>
  <ModelsCatalog>
     <FilterBar> 供应商 Select / 能力多选 / 仅可用 Switch / 搜索
     <DataTable columns=[模型,供应商,上下文,能力标签,健康,价格,默认,操作]>
       行展开：能力详情 + 定价 + 最近 7 天可用率 + "设为我的默认"
     <EmptyState> 无可用模型（管理员未配置/未授权）
  <ModelPolicies>（负责人+）
     <PolicyList> 组织默认 / 团队覆盖 / 角色白名单 / 可用集合（多选模型）
     <PolicyEditorDrawer> 默认模型 / 允许集合 / 预算 / 生效范围 / 预览受影响用户数
  <Providers>（org_admin）健康状态、BaseURL（脱敏）、最近探测、启用开关
  <Keys>（org_admin）平台 Key / BYOK 列表：创建人、状态、轮换、吊销（一次展示明文）
```

### 7.3 字段与校验（策略编辑器）

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `default_model` | select | 是 | 必须在允许集合内 | 影响新会话 |
| `allowed_models` | multi-select | 是 | ≥1；≤50 | 未选不可见/不可调用 |
| `scope` | enum | 是 | `org\|team\|role` | 生效范围 |
| `role` | enum | 条件 | org_admin/team_owner/member/viewer | scope=role 必填 |
| `monthly_budget_cny` | number | 否 | 0–1,000,000；≥已用 | 超预算 429 |
| `max_tokens_per_request` | number | 否 | 256–200,000 | — |

### 7.4 交互与状态

- 模型目录只读；"设为我的默认"写用户偏好（P1，可存本地/服务端）。
- 策略编辑：抽屉内编辑 → "预览影响"（显示 N 名成员、M 个工作区受影响）→ 保存 → Toast "≤30s 生效"（R2.6）。
- 供应商健康：每 30s 刷新；异常显示"降级/不可用"+ 最近错误时间；管理员可手动探测。
- 密钥：BYK 创建后明文仅显示一次（复制 + 已复制提示 + 关闭后不可再查看）；轮换需二次确认。
- 未授权用户：目录只列出可用集合；URL 直访未授权模型详情 → 403 模块卡。

### 7.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 可用模型 | `GET /api/v1/models?available=true` | `{id,name,provider,context_window,capabilities,status,price_in,price_out,is_default}` | — |
| 模型详情 | `GET /api/v1/models/{id}` | 同上 + `availability_7d` | 403 未授权 |
| 我的默认 | `PUT /api/v1/me/preferences` | `{default_model}` | 400 不在集合 |
| 策略列表 | `GET /api/v1/model-policies?scope=` | `{id,scope,role,default_model,allowed_models,budget}` | 403 |
| 保存策略 | `PUT /api/v1/model-policies/{id}` | 见 §7.3 | 409 版本冲突（乐观锁 `version`） |
| 预览影响 | `POST /api/v1/model-policies/{id}/preview` | `{affected_users,affected_workspaces}` | — |
| 供应商 | `GET /api/v1/model-providers` | 健康/延迟/最近探测（`healthy/degraded/down/unknown`） | — |
| 密钥 | `GET/POST/DELETE /api/v1/provider-keys` | **P2；MVP 隐藏 BYOK 入口**；明文仅创建响应一次 | 403 |

### 7.6 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 无可用模型 | 空态："组织尚未为你授权模型" | 联系管理员 / 查看帮助 |
| 健康 `degraded` | 行内橙徽标 + 提示"可能变慢" | 切换模型 / 重试 |
| 限流 429 | Toast + 行内"限流中" | 稍后重试 |
| 策略保存冲突 | 表单错误条 + 版本号 | 刷新后重编辑 |
| 密钥明文丢失 | 说明"仅创建时可见" | 轮换新 Key |
| 模型被下架 | 目录移除 + 使用中工作区提示"已切换默认" | 选新模型 |

### 7.7 验收与埋点

- 未授权模型不出现在列表与搜索（前端过滤 + 服务端 403 兜底）。
- 策略保存后 ≤30s 生效提示；批量授权可多选。
- 埋点：`models_view`、`model_set_default`、`policy_save`、`model_unavailable_view`。

---

## 8. S7 Skill 中心 `/skills`

**权限**：member+（目录）；author（我的/草稿）
**目标**：发现 → 详情 → 安装 ≤3 次点击；可见性/权限/评测结论透明。

### 8.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Skill 中心                                      [上传 Skill]  [我的 ▾]       │
│ 扩展 opencode 的工具与工作流；通过评测才能上架。                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [全部] [已安装] [组织私有] [我的]        （我的：草稿/审核中/已上架）  │
│ [🔍 搜索名称/标签/作者] [分类 ▾] [排序: 热门 ▾]              视图: 卡片|表   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐     │
│ │ code-review   │ │ test-gen      │ │ api-design    │ │ data-clean    │     │
│ │ ★4.8 · 1.2k 装│ │ ★4.5 · 860 装 │ │ 组织私有 🔒   │ │ 新上架        │     │
│ │ 代码审查      │ │ 单测生成      │ │ 需申请访问    │ │ 数据清洗      │     │
│ │ [已安装 ✓]    │ │ [安装]        │ │ [申请访问]    │ │ [安装]        │     │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘     │
│                                                           [1] 2 3 … 12  >     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 组件树

```
<PageHeader> + Upload / 我的 Dropdown
<Tabs> 全部 | 已安装 | 组织私有 | 我的
<FilterBar> 搜索 / 分类 / 排序 / 视图
<SkillGrid>（卡片）或 <SkillTable>
  <SkillCard>
    <Name+Slug> <VisibilityBadge private|org|public> <Rating+InstallCount>
    <Description 2 行> <TagList> <Version> <AdmissionBadge 已过评测|未过评测>
    <Action: 安装 / 已安装 / 申请访问 / 管理>
<EmptyState> 无 Skill / 无搜索结果 / 无权限（组织私有）
<Pagination>
```

### 8.3 字段与校验（筛选）

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| `q` | string | 否 | ≤64，支持名称/标签/作者 |
| `category` | enum | 否 | `code\|testing\|docs\|data\|ops\|security\|other`（提案） |
| `visibility` | enum | 否 | `public\|org\|private` |
| `sort` | enum | 否 | `popular\|recent\|rating\|name` |
| `tab` | enum | 否 | `all\|installed\|org\|mine` |
| `view` | enum | 否 | `card\|table` |

### 8.4 交互与状态

- 安装：卡片直接安装（默认范围"仅我"）→ 权限声明抽屉确认（见 S8）→ `installing` → `installed`（≤2min，R4.3）。
- 已安装：显示"已安装 v1.2.0 · 禁用/更新"。
- 组织私有：无权限时卡片显示"申请访问"（提交访问申请 → 审批），不展示 README 内容。
- 我的：按 `draft/scanning/evaluating/in_review/published/rejected/deprecated` 分组，行内显示下一步 CTA（去评测/提交审核/查看驳回原因）。
- 审核中：卡片状态徽标 + "预计 1 个工作日"。

### 8.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 列表 | `GET /api/v1/skills?tab=&q=&category=&visibility=&sort=&cursor=` | `items[{id,slug,name,description,tags,visibility,rating,install_count,version,admission_status,installed}]` | — |
| 安装 | `POST /api/v1/skills/{skillId}/install`（先 by-slug 解析 id） | `{scope?"user"\|"project", workspace_id?}` | 403 权限不足、409 已安装、422 权限声明超限 |
| 卸载 | `DELETE /api/v1/skill-installations/{installationId}` | — | — |
| 访问申请 | `POST /api/v1/skills/{id}/access-requests` | `{reason}` | 409 重复 |
| 我上传的 | `GET /api/v1/skills?mine=true` | 含 `review_status` | — |
| slug 解析 | `GET /api/v1/skills/by-slug/{org_slug}/{skill_slug}` | 返回 `{id, ...}`；页面 URL 用 slug，API 用 id（architect 定稿） | 404 |

### 8.6 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 首屏 | 6 卡片骨架 | — |
| 无 Skill | 空态："还没有可用的 Skill" | 上传 / 浏览模板 |
| 搜索无结果 | 小空态 | 清除筛选 |
| 无权限（组织私有） | 卡片锁定 + 申请访问（不显示详情） | 申请 |
| 安装失败（权限超限） | Toast + 详情抽屉红条 | 提交审批 / 取消 |
| 安装超时 | Toast"仍在安装，稍后查看" + 任务中心 | 查看任务 |
| 列表 5xx | 错误卡 | 重试 |
| 安装态过期（Skill 下架） | "已安装版本仍可用" 标注 | 保持 / 卸载 |

### 8.7 验收与埋点

- 安装 ≤3 次点击（列表→详情→安装）；安装后 ≤2min 在 opencode 可见（R4.3）。
- 埋点：`skills_view`、`skill_filter`、`skill_install_start/confirm/success/fail`、`skill_access_request`.

---

## 9. S8 Skill 详情 `/skills/:slug`

**权限**：可见用户；管理操作限作者/负责人。
**目标**：安装前完整知情（权限、评测、版本、统计）；作者可管理版本与上架。

### 9.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Skill 中心   code-review        [组织可见] [★4.8] 1.2k 安装               │
│ 自动审查 PR 中的代码问题并给出修复建议。                                     │
│ v1.4.0 · 更新于 3 天前 · 作者 Skill 平台组          [安装到工作区] [更多 ▾]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [概览] [版本] [评测与准入] [权限] [统计] [反馈]                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ 概览（8 列）                                     │ 侧栏（4 列）                │
│ README（Markdown 渲染，安全）                    │ 版本 / 体积 / 许可证        │
│ 使用示例（代码块 + 复制）                        │ 兼容 opencode ≥2.2          │
│                                                 │ 权限摘要（工具/网络/MCP）   │
│                                                 │ 评测基线：✓ 通过 92%        │
│                                                 │ 安装量 / 评分 / 最近更新    │
│                                                 │ [安装] [查看评测报告]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 安装抽屉（核心）

```
标题：安装 code-review v1.4.0
范围：( ) 仅我（默认）  ( ) 当前工作区 oc-7f3a        （project 范围 P1）
权限声明（来自包元数据，只读）：
  · 工具：read / grep / edit（写操作需确认）
  · 网络：无
  · MCP：无
  · 文件：项目目录（只读），/tmp（读写）
提示：安装后 opencode 会加载该 Skill 的指令与工具；可在工作区 Skill 列表禁用。
[取消]                                       [确认安装]
```

### 9.3 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `scope` | enum | 是 | `user`（MVP）/`workspace`（P1） | 默认 user |
| `workspace_id` | uuid | 条件 | scope=workspace 必填且属于当前用户 | — |
| `version` | semver | 是 | 来自可用版本列表 | 默认 latest 稳定版 |
| `enable_after_install` | boolean | 否 | 默认 true | — |

### 9.4 交互与状态

- 安装抽屉关闭（Esc/遮罩）不触发安装；确认后按钮 loading → 任务中心出现"安装 Skill"任务。
- 未通过准入的 Skill：安装按钮禁用 + "未通过评测准入"标签（作者本人与 org_admin 可安装用于调试）。
- 版本 Tab：版本列表（版本、状态、发布时间、评测结论、操作：查看/回滚/下架）；作者上传新版本（跳 `/skills/:slug/versions/new`）。
- 评测 Tab：最近评测运行摘要 + 通过率 + "查看报告"；未评测显示"运行基线评测"（跳 `/evals/new?preset=skill-baseline&skill_slug=`）。
- 权限 Tab：完整权限声明 + "为什么需要这些权限"的说明（来自 Skill 元数据）。
- 统计 Tab：安装趋势/调用次数/评分分布（≥30 天，匿名聚合）。
- 反馈 Tab：提交评分（1–5）+ 评论（≤1000 字）；举报违规（去重、写审计）。

### 9.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 解析 | `GET /api/v1/skills/by-slug/{org_slug}/{skill_slug}` | 返回 `{id,...}`；前端再用 id 取详情 | 404 |
| 详情 | `GET /api/v1/skills/{id}` | `{name,description,readme,visibility,owner,latest_version,versions,admission,permissions,stats}` | 403/404 |
| 版本列表 | `GET /api/v1/skills/{id}/versions` | `[{version,status,created_at,admission}]` | — |
| 安装 | `POST /api/v1/skills/{skillId}/install` | 见 S7 | 422 权限超限 |
| 评测 | `POST /api/v1/eval-runs` | `{preset:"skill-baseline",skill_id,version}` | 422 |
| 反馈 | `POST /api/v1/skills/{id}/reviews` | `{rating,comment}` | 409 已评价 |
| 举报 | `POST /api/v1/skills/{id}/reports` | `{reason}` | — |
| 下架/回滚 | `POST /api/v1/skills/{id}/versions/{version}/rollback` | 作者/管理员 | 409 |

### 9.6 异常处理

- README 渲染失败 → 显示纯文本 + "查看原始内容"。
- 版本列表加载失败 → 区域错误卡，不影响安装（安装用 latest 接口）。
- 安装中关闭抽屉 → 任务继续，Toast + 任务中心可查。
- 无权限查看组织私有 Skill → 403 模块卡（不提资源存在）；列表页只显示锁定卡。
- 作者版本上传失败 → 显示校验清单（SKILL.md 缺失/字段错误/签名失败/扫描未过）。

### 9.7 验收与埋点

- 安装前 100% 展示权限声明（R4.4）。
- 未通过准入不可安装/上架（R5.5）。
- 埋点：`skill_detail_view`、`skill_install_drawer_open`、`skill_install_scope_change`、`skill_install_confirm`、`skill_review_submit`。

---

## 10. S9 评测中心 + 新建运行 `/evals`、`/evals/new`

**权限**：member+（自己/团队的运行）
**目标**：建立质量基线、可复现、可对比；沙箱默认禁网（R5.2）。

### 10.1 列表布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 评测中心                                                [新建评测] [数据集]   │
│ 在沙箱中运行，结果可复现；Skill 上架前必须通过基线评测。                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ [状态: 全部 ▾] [对象: 全部 ▾] [时间: 近 7 天 ▾]   🔍 搜索运行名/ID          │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 运行               对象            状态     通过率  耗时   成本   创建时间 │ │
│ │ code-review v1.4   Skill 基线     ● 已通过  92%    3m12s  $1.20  2h 前   │ │
│ │ invoice-helper     App 回归       ◐ 运行中  68%…    —      —      5m 前   │ │
│ │ qwen3-coder 对比   Model A/B      ✕ 失败    41%    4m01s  $2.30  昨天    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 说明：最近 30 天运行 42 次 · 平均通过率 86%                  [1] 2 3 …       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 新建运行向导（3 步）

```
步骤 1/3 选择对象与数据集
  对象：[Skill ▾ code-review v1.4.0] [模型 ▾ gpt-5-codex] [应用 ▾ invoice-helper]
  数据集：[skill-baseline-30 (30 用例) ▾]  [查看数据集] [+ 新建数据集]
  基线对比：[不对比 ▾ | 上次运行 | 指定运行]
步骤 2/3 评分与执行
  评分器：[规则：含关键词/正则] [LLM-as-judge：gpt-5-codex] [人工复核（P1）]
  超时：单用例 [120s] 总时长 [30min]
  资源：沙箱 [1C1G 默认]（只读）
  网络：[禁用（推荐）| 白名单域名]（默认禁用）
  可复现：☑ 固定随机种子（seed 由服务端记录）
步骤 3/3 确认
  摘要：对象/数据集/评分器/超时/网络/预计成本 $1.20（cost_usd）
  [上一步] [取消] [开始评测]
```

### 10.3 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `target_type` | enum | 是 | `skill\|model\|app` | 决定对象选择器 |
| `target_id` + `version` | uuid+semver | 是 | 存在且可用 | — |
| `dataset_id` | uuid | 是 | 存在；≥1 用例 | — |
| `scorers` | array | 是 | ≥1；规则必须给出表达式 | — |
| `timeout_per_case_s` | number | 是 | 10–600 | 默认 120 |
| `timeout_total_s` | number | 是 | 60–7200 | 默认 1800 |
| `network_policy` | enum | 是 | `disabled\|allowlist` | 默认 disabled；allowlist 需填写域名（≤10） |
| `sandbox_spec` | enum | 是 | `1c1g`（固定 MVP） | 只读 |
| `baseline_run_id` | uuid | 否 | 同 target/dataset | — |
| `notes` | string | 否 | ≤500 | — |

### 10.4 交互与状态

- 创建后 202 → 跳运行详情；`queued` 显示排队位次（若有）；`running` 实时进度（用例级流式结果，轮询 2s/SSE）。
- 运行中可取消（确认）；取消后保留已完成用例结果。
- 失败分阶段展示：`image`/`dataset`/`sandbox`/`scoring`/`timeout`，并给诊断 ID。
- 运行完成 → Toast + 通知中心 + 列表状态更新；报告入口。
- 数据集管理（P1）：`/evals/datasets` 列表/新建（CSV/JSONL 上传，≤50MB，用例 schema 校验）。
- CI 集成（P1）：详情显示 PR 检查回写状态。

### 10.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 运行列表 | `GET /api/v1/eval-runs?status=&target_type=&from=&to=&cursor=` | `items[{id,name,target,status,pass_rate,duration_s,cost,created_at}]` | — |
| 创建运行 | `POST /api/v1/eval-runs` `Idempotency-Key` | §10.3 | 422 数据集/评分器无效、429 配额 |
| 运行详情 | `GET /api/v1/eval-runs/{id}` | 进度/阶段/用例结果分页 | — |
| 取消 | `POST /api/v1/eval-runs/{id}/cancel` | — | 409 已结束 |
| 报告 | `GET /api/v1/eval-runs/{id}/report` | 见 S10 | 404 未生成 |
| 数据集 | `GET/POST /api/v1/eval-datasets` | `{name,case_count,format}` | 413 文件过大 |
| 实时 | SSE `eval.progress` / `eval.completed` | — | — |

### 10.6 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 无运行 | 空态 + "新建评测" | 新建 / 看数据集 |
| 排队中 | 状态"排队中 · 第 3 位" + 预计时间 | 取消 |
| 沙箱启动失败 | 阶段失败卡 + 原因 + 诊断 ID | 重试 / 联系管理员 |
| 评测超时 | `TIMEOUT` 徽标 + 已完成用例结果 | 查看报告 / 调整超时重跑 |
| 评分器失败 | 失败用例标注"评分失败"（不记为不通过） | 查看日志 / 换评分器 |
| 429 配额 | 配额卡 | 申请提升 |
| 报告未生成 | 报告页骨架 + 预计时间 | 等待 / 刷新 |

### 10.7 验收与埋点

- 同输入同配置结果可复现（R5.3）：报告显示 seed/配置快照。
- 默认禁网；白名单需显式配置并展示风险提示。
- 埋点：`evals_view`、`eval_create_start`、`eval_create_submit`、`eval_cancel`、`eval_report_view`.

---

## 11. S10 评测报告与对比 `/evals/runs/:id/report`

**权限**：运行可见者；分享链接需登录（只读）。
**目标**：一眼判断"能不能上架"；支持 A/B 与回归定位。

### 11.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 评测中心  code-review v1.4 · 基线评测         [导出 ▾] [复制报告链接]      │
│ 已通过 · 92% 通过率 · 3m12s · $1.20 · 2026-11-04 09:12                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌ 通过率 92% ┐ ┌ 用例 30 ┐ ┌ P50 8.2s ┐ ┌ P95 14.1s ┐ ┌ token 128k ┐       │
│ ├────────────┴─┴──────────┴─┴──────────┴─┴───────────┴─┴────────────┴───────┤
│ │ 对比基线：▼ 通过率 +4pp  · 成本 +$0.18  · 延迟 +0.8s       [选择基线 ▾] │
│ ├──────────────────────────────────────────────────────────────────────────┤
│ │ 用例结果（筛选：全部/通过/失败/超时/评分失败）                            │ │
│ │ #  用例名           结果   耗时   token  评分理由（可展开）  操作         │ │
│ │ 1  登录超时修复     ✓     6.1s   3.2k    —                  [查看轨迹]   │ │
│ │ 7  空指针边界       ✕     9.4s   4.1k    缺少空值检查        [查看轨迹]   │ │
│ ├──────────────────────────────────────────────────────────────────────────┤
│ │ 失败聚类：空值边界 4 例 · 错误处理 3 例 · 性能 2 例                       │ │
│ │ 配置快照：模型/评分器/超时/网络/seed（可展开 JSON）                       │ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 组件树

```
<ReportHeader> 状态/对象/时间/操作（导出 CSV/JSON、复制链接）
<KpiCards> 通过率/用例数/P50/P95/token/成本
<ComparisonBar> 基线选择 + Δ指标（通过率↑、成本、延迟）
<FilterTabs> 全部/通过/失败/超时/评分失败
<ResultTable> 可展开行：输入、期望、实际、评分理由、轨迹链接
<FailureClusters> 聚类卡片（每类计数 + 代表用例）
<ConfigSnapshot> 折叠 JSON（只读，复制）
```

### 11.3 字段与校验（导出/分享）

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `baseline_run_id` | uuid | 否 | 同对象/数据集；不能等于当前 | — |
| `export_format` | enum | 是 | `csv\|json` | — |
| `share_expires_in` | enum | 否 | `24h\|7d\|never`（never 仍要求登录） | 默认 7d |
| `filter` | enum | 否 | `all\|passed\|failed\|timeout\|scoring_failed` | — |

### 11.4 交互与状态

- 对比：选择基线后 KPI 卡显示 Δ（颜色：通过率↑绿、↓红；成本↑红、↓绿；延迟同理），并列出"新增失败/新增通过"用例。
- 用例行展开：输入/期望/实际输出/评分理由/耗时/token；链接到 opencode 轨迹（只读快照，P1）。
- 导出：≤1 万行同步下载；超过走后台任务 + 通知（Toast）。
- 复制链接：生成带 `share_token` 的只读链接（登录后可见；无权限者 403）。
- 报告页在运行中可访问：显示部分结果 + "运行中，结果将持续更新"。

### 11.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 报告 | `GET /api/v1/eval-runs/{id}/report?baseline_run_id=` | `{summary,comparison,cases:[{id,name,status,duration_ms,tokens,reason}],clusters,config}` | 404 未生成 |
| 用例分页 | `GET /api/v1/eval-runs/{id}/results?filter=&cursor=` | — | — |
| 导出 | `POST /api/v1/eval-runs/{id}/exports` | `{format}` → 202 或直接文件 | 429 |
| 分享 | `POST /api/v1/eval-runs/{id}/shares` | `{expires_in}` → `{url,token}` | 403 |
| 基线候选 | `GET /api/v1/eval-runs?target_id=&dataset_id=` | 供选择器 | — |

### 11.6 异常处理

- 报告生成失败 → 错误卡 + 重试（重新聚合，不重跑）。
- 基线运行已删除 → 对比区提示 + 只显示当前指标。
- 用例结果为空（全超时）→ 表格空态 + 失败聚类说明。
- 分享链接过期 → 提示"链接已过期，请重新分享"。
- 导出失败 → Toast + 重试。

### 11.7 验收与埋点

- 通过率 = 通过用例数/总执行用例数（排除评分失败，报告口径标注）。
- Δ 计算口径与导出文件一致。
- 埋点：`report_view`、`report_compare{baseline}`、`report_export{format}`、`report_share`。

---

## 12. S11 应用中心 `/apps`

**权限**：member+（自己的 + 被分享的）
**目标**：应用状态与访问入口清晰；未授权应用不泄露。

### 12.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 应用中心                                                          [+ 创建应用]│
│ 从工作区发布，1C2G 运行；链接即域名，SSO 鉴权。                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [我的应用] [与我共享] [全部（管理员）]                                 │
│ [🔍 搜索应用名/域名] [状态 ▾]  视图: 卡片|表                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐          │
│ │ ● 运行中  发票助手            │ │ ◐ 构建中  周报生成           │          │
│ │ invoice-helper.apps.oc.dev    │ │ 构建中 42% · 预计 2 分钟      │          │
│ │ 1C2G · 3 个版本 · 组织内可见  │ │ [查看日志]                    │          │
│ │ [打开] [分享] [详情]          │ │ [取消]                        │          │
│ └──────────────────────────────┘ └──────────────────────────────┘          │
│ 被分享给我：┌──────────────────────────────┐                                │
│             │ 发票助手  [查看 view] [打开] │                                │
│             └──────────────────────────────┘                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 组件树

```
<PageHeader> + 创建
<Tabs> 我的 / 与我共享 / 全部
<FilterBar>
<AppGrid>
  <AppCard status> <StatusBadge> <Name/Slug> <Domain> <Meta 1C2G/版本/可见人数>
  <Actions> 打开（新窗口，SSO）/ 分享 / 详情 / 更多（重建、回滚、日志、删除）
<EmptyState> 无应用 / 无共享 / 筛选无结果
```

### 12.3 字段与校验（筛选）

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| `q` | string | 否 | ≤64，名称/slug/域名 |
| `status` | enum | 否 | `building\|deploying\|running\|failed\|suspended` |
| `tab` | enum | 否 | `mine\|shared\|all` |

### 12.4 交互与状态

- 卡片主 CTA："打开"→ 新窗口 `/a/{slug}`（SSO 会话复用）；未授权用户打开显示 403 门户。
- 构建中：进度 + "查看日志"（跳 `/apps/:id/logs`）；可取消。
- 失败：红卡 + 错误摘要 + "查看日志/重试"。
- 被分享：显示权限徽标（view/use/edit）；无编辑权时隐藏详情配置入口。
- 删除应用：二次确认（输入应用名）+ 默认保留镜像 7 天。

### 12.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 列表 | `GET /api/v1/apps?tab=&state=&q=&cursor=` | `items[{id,name,slug,state,host,url,visibility,my_role}]` | — |
| 删除 | `DELETE /api/v1/apps/{id}` | `{confirm_name}` | 409 部署中 |
| 重建 | `POST /api/v1/apps/{id}/deployments` | `Idempotency-Key` | 409 已有构建 |
| 打开 | `GET /a/{slug}`（前端路由） | 服务端鉴权 | 403/404 |

### 12.6 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 无应用 | 空态 + 创建 | 创建 / 看模板 |
| 无共享 | 空态说明"别人分享给你的应用会出现在这里" | 返回我的应用 |
| 构建失败 | 红卡 + 错误摘要 | 日志 / 重试 |
| 部署失败 | 红卡 + "已回滚到 v2" | 日志 / 详情 |
| 应用休眠 | 灰卡 + "唤醒中" | 打开（自动唤醒） |
| 域名证书未就绪 | 黄条 + "证书签发中，预计 ≤10min" | 等待 / 用默认域名 |
| 无权限查看 | 不显示（列表） / 403（直链） | 申请 |

### 12.7 验收与埋点

- 应用访问必须 SSO；未授权 403（R6.5）。
- 埋点：`apps_view`、`app_open{via}`、`app_share_click`、`app_rebuild`。

---

## 13. S12 应用创建向导 `/apps/new`

**权限**：member+ 且至少 1 个工作区
**目标**：从工作区产物到可访问应用，≤4 步；构建失败可定位。

### 13.1 布局（WizardPage）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 应用中心  创建应用                                    步骤 2/4：构建配置    │
├───────────────┬──────────────────────────────────────────────────────────────┤
│ ① 来源        │  来源：工作区 oc-7f3a · 支付重构                            │
│ ② 构建配置 ●  │  入口类型：(•) Node.js  ( ) Python  ( ) 静态站点  ( ) Dockerfile│
│ ③ 访问与域名  │  启动命令：[npm run start              ]（自动探测，可改）   │
│ ④ 确认        │  构建命令：[npm run build              ]                     │
│               │  构建上下文：[./                       ] 📁 选择目录         │
│               │  端口：[3000]（应用监听端口，1C2G 固定资源）                 │
│               │  环境变量：+ 添加（引用密钥，不落明文；最多 20 个）          │
│               │  ⓘ 构建在沙箱内进行（rootless BuildKit），不访问你的其他目录 │
├───────────────┴──────────────────────────────────────────────────────────────┤
│ [上一步]                                                      [下一步 →]     │
└──────────────────────────────────────────────────────────────────────────────┘
```

步骤 1 来源：从工作区（选择工作区 + 预览目录树）/ 模板（Node/Python/静态）/ Git 仓库（P1）。
步骤 3 访问：应用名、slug（自动生成可编辑，2–40，小写字母数字-）、域名（默认 `*.apps.<平台域>`，自定义域名 P1）、可见范围（默认仅自己，可后面改）。
步骤 4 确认：摘要 + 资源 1C2G（只读）+ 预计构建 2–5 分钟 + "创建并构建"。

### 13.2 字段与校验

| 字段 | 类型 | 必填 | 校验 | 错误文案 |
|------|------|------|------|----------|
| `source_type` | enum | 是 | `workspace\|template\|git` | — |
| `workspace_id` | uuid | 条件 | 属于当前用户且 ready | "请选择一个就绪的工作区" |
| `entry_type` | enum | 是 | `node\|python\|static\|dockerfile` | — |
| `build_command` | string | 条件（node/python） | ≤200；禁止 `&&` 之外的分隔符？允许常见 shell；后端白名单校验 | "构建命令包含不允许的字符" |
| `start_command` | string | 条件 | ≤200 | — |
| `context_path` | string | 是 | 相对路径，不得越界 `..` | "构建上下文必须在工作区内" |
| `port` | number | 是 | 1–65535；建议 3000 | "端口无效" |
| `env` | array | 否 | key `[A-Z][A-Z0-9_]*`；value 引用 secret 或明文（警告）；≤20 | "环境变量格式不正确" |
| `name` | string | 是 | 2–40 字符 | "应用名 2–40 字符" |
| `slug` | string | 是 | `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`；全局唯一 | "该链接已被占用" |
| `custom_domain` | string | 否 | 域名格式；≤253 | "域名格式不正确" |

### 13.3 组件树

```
<WizardLayout steps=[来源,构建配置,访问与域名,确认] current=2>
  <StepSource> WorkspaceSelect(含状态) / TemplateRadioCards / GitForm(P1)
  <StepBuild>
     <EntryTypeRadio> <CommandInput build/start> <ContextPathPicker> <PortInput>
     <EnvVarEditor>（可增删，secret 引用选择器）
     <Alert info> 构建沙箱与权限说明
  <StepAccess> <NameInput> <SlugInput(自动+可用性检查 debounce)> <DomainPreview> <VisibilityRadio>
  <StepReview> 摘要表 + 资源提示 + 风险提示（首次构建时长）
  <WizardFooter> 上一步 / 下一步 / 创建并构建（loading）
```

### 13.4 交互与状态

- slug 可用性：**MVP 前端本地格式校验 + 创建时 409 兜底**（`GET /apps/slug-available` 契约未定义，不依赖）；冲突显示字段错误与建议后缀。
- 步骤校验：点"下一步"校验当前步；错误聚焦首个字段；步骤条可回退（保留数据）。
- 创建：`POST /apps` 202 → 跳 `/apps/:id`（状态 `building`）→ 日志流式；构建完成 Toast。
- 取消向导：有草稿时确认"放弃创建？"（草稿本地保存 24h，P1）。
- 资源固定 1C2G：只读展示，不提供选择；说明"超出限制会被 OOM 终止"。
- 敏感环境变量：默认要求引用平台密钥；允许明文但显示风险提示并写审计。

### 13.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 可用工作区 | `GET /api/v1/workspaces?state=ready` | 选择器 | — |
| 构建上下文 | 默认 `./`；**MVP 不做目录浏览**（`/workspaces/{id}/files` 契约未定义，G3-22）；高级路径 P2 |
| 创建 | `POST /api/v1/apps` `Idempotency-Key` | §13.2 | 409 slug 占用、422 构建配置 |
| 触发构建 | `POST /api/v1/apps/{id}/deployments` | 自动由创建触发 | 409 |
| 构建日志 | `GET /api/v1/apps/{id}/logs?deployment_id=`（SSE/分页） | 流式 | — |

### 13.6 异常处理

- 无可用工作区：步骤 1 阻断 + "先去创建工作区/等待就绪"。
- 构建失败：跳详情日志页，摘要"依赖安装失败（npm ERR! 404）"+ 建议 + 重试（不重填表单）。
- slug 冲突：字段级错误 + 建议值。
- 校验失败 422：字段错误映射 `details[].field`。
- 请求超时：保留表单 + 幂等重试（同一 Idempotency-Key 不重复创建）。
- 配额超限（应用数上限）：429 → 配额卡。

### 13.7 验收与埋点

- 从工作区创建到 running ≤5 分钟（典型 Node 应用）；失败有可执行建议。
- 埋点：`app_create_start`、`app_create_step{step}`、`app_create_submit`、`app_create_success{elapsed}`、`app_create_fail{reason}`。

---

## 14. S13 应用详情 `/apps/:id`

**权限**：owner/edit；view/use 只读（隐藏配置）。
**目标**：状态、版本、日志、指标、分享、域名一页可查；回滚 ≤2min。

### 14.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 应用中心  发票助手  [● 运行中]  invoice-helper.apps.oc.dev  [打开 ↗] [分享]│
│ 1C2G · 版本 v3 · 最近部署 12 分钟前 · 组织内可见             [更多 ▾]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [概览] [部署与版本] [日志] [指标] [分享] [域名] [设置]                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ 概览（8 列）                                       侧栏（4 列）              │
│ 状态卡：运行中 / 健康检查 / 最近 24h 可用率 99.9%   访问链接（复制）          │
│ 最近部署：v3（成功）→ 查看日志                      可见范围：组织内可见    │
│ 流量：近 24h 请求 1.2k / 错误率 0.4%                我的权限：所有者           │
│ 快速操作：重新构建 / 回滚 / 暂停 / 删除              资源：1C2G / 1 副本       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 字段与校验（部署/回滚/暂停）

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `version_id` | uuid | 是（回滚） | 属于该应用 | — |
| `reason` | string | 否 | ≤200 | 写审计 |
| `suspended` | boolean | 是（暂停） | — | 暂停后访问显示休眠页 |

### 14.3 交互与状态

- 部署与版本：时间线（版本、状态、镜像 digest、提交信息、部署人、耗时、操作：回滚/查看日志）；回滚二次确认 + 进度 + Toast（≤2min）。
- 日志：构建日志与运行日志切换；搜索/下载；默认跟随最新（可暂停跟随）；错误行高亮。
- 指标：请求数/错误率/P50/P95/CPU/内存（近 1h/24h/7d）；OOM 事件标注（R6.3）。
- 分享：跳/内嵌 S14（同屏抽屉）。
- 域名：默认域名 + 自定义域名（状态：待验证/签发中/已生效/失败），证书信息。
- 设置：应用名/slug（slug 修改需确认旧链接失效）/环境变量/删除（输入名称）。

### 14.4 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 详情 | `GET /api/v1/apps/{id}` | `{state,host,url,visibility,my_role?,default_deployment_id,resources,updated_at}` | 403/404 |
| 版本 | `GET /api/v1/apps/{id}/deployments` | 分页 | — |
| 回滚 | `POST /api/v1/apps/{id}/rollback` | `{version_id,reason}` | 409 部署中 |
| 暂停/恢复 | `POST /api/v1/apps/{id}/suspend` / `resume` | — | 409 |
| 日志 | `GET /api/v1/apps/{id}/logs?deployment_id=&level=&q=` | SSE/分页 | — |
| 指标 | **MVP 使用 App 内嵌摘要字段**；`/apps/{id}/metrics` 契约未定义（G3-21），P2 再补 | — | — |
| 删除 | `DELETE /api/v1/apps/{id}` | 409 部署中 | — |

### 14.5 异常处理

- 部署失败 → 状态卡红 + 错误摘要 + 自动回滚说明 + 日志链接。
- 日志流中断 → 提示"实时日志中断" + 重连/刷新。
- 指标无数据 → 空态"暂无指标（应用可能未收到请求）"。
- 暂停中访问 → 休眠页（SSO 后提示"应用已暂停，请联系所有者"）。
- 无权限 → 403 模块卡（隐藏配置 Tab）。
- 域名证书失败 → 行内错误 + 重试签发 + 文档。

### 14.6 验收与埋点

- 回滚 ≤2min（R6.7）；日志可检索。
- 1C2G 限制在 UI 明示；OOM 在指标中可见。
- 埋点：`app_detail_view`、`app_rollback`、`app_suspend`、`app_log_search`。

---

## 15. S14 分享设置 `/apps/:id/share`

**权限**：owner/edit；`view/use` 只读可见（不可改）。
**目标**：让权限变更**可理解、可预览、≤5s 生效**；公开发布不裸奔。

### 15.1 布局（也是抽屉形态）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 分享「发票助手」                                                        [×]  │
│ 链接：https://cloud.example.com/a/invoice-helper      [复制] [二维码]        │
├──────────────────────────────────────────────────────────────────────────────┤
│ 访问范围                                                                    │
│  ( ) 仅自己   (•) 组织内（需登录）   ( ) 指定用户/团队   ( ) 平台内公开      │
│  ⓘ 所有范围都需 SSO；平台内公开 = 平台内已登录用户（可跨租户发现/使用），     │
│    互联网免登录访问禁止；公开建议配合失效时间与审计                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 成员与权限（仅「指定用户/团队」时显示）                           [+ 添加]   │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 张伟  zhangwei@xingyun.com  团队负责人  [使用 use ▾]  [移除]             │ │
│ │ 李雷  lilei@xingyun.com     开发者      [查看 view ▾] [移除]             │ │
│ │ 产品设计组  team:design                  [编辑 edit ▾] [移除]             │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 权限预览：组织内成员可见（人数仅管理员可见）；指定成员 3（其中 1 组）；编辑 1 / 使用 1 / 查看 1│
│ 链接设置：失效时间 [永不 ▾]   允许下载产物 [关]   需要重新认证 [关]          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 最近变更：李雷 2 分钟前 将「王芳」权限从 edit 改为 view（审计）               │
│                                                    [取消] [保存并生效 ≤5s]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 15.2 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `audience` | enum（UI 映射） | 是 | 仅自己 / `org` / `users` / `public` | 仅自己 = 删除全部 share；API `ShareScope` 仅 `public\|org\|users`（openapi.yaml 定稿）；**应用本体可见性用 `App.visibility` 管，与 ACL 分离** |
| `grants` | array | 条件（users） | ≥1；subject 存在；role 枚举 | — |
| `subject_type` | enum | 是 | `user\|team\|org` | org 仅 org_admin |
| `role` | enum | 是 | `view\|use\|edit` | 不可授予 owner |
| `expires_in` | enum | 否 | `never\|24h\|7d\|30d` | — |
| `allow_download` | boolean | 否 | 默认 false | 控制产物下载 |
| `require_reauth` | boolean | 否 | 默认 false | 重新认证（敏感应用） |

### 15.3 交互与状态

- 范围切换：切到"仅自己"时清空 grants（提示将移除全部）；切到"指定用户/团队"显示 grant 编辑；切到"平台内公开"需确认"其他组织的已登录用户也可发现并使用"，并建议设置失效时间。
- 添加成员：Combobox 搜索组织成员/团队（≤50 结果，服务端搜索）；重复添加提示；不能给自己降权（owner 恒有 edit）。
- 保存：`PUT /apps/{id}/shares` 全量替换（幂等）；成功后 Toast "已保存，5 秒内生效"；关闭抽屉。
- 复制链接：写入剪贴板 + Toast；链接不携带权限信息（服务端鉴权）。
- 权限预览：实时显示"组织内成员可见（人数仅管理员可见）"（scope=org）/ "平台内已登录用户可见（跨租户）"（public）/ 指定成员统计（仅可解析的 user/team；**org 级不展开人数，避免向非管理员泄露成员列表**）；悬停角色徽标解释能力（DS §8.9）。
- 只读用户（view/use）：隐藏保存与成员编辑，显示"仅所有者或编辑者可修改分享"。
- 撤销自己权限（被分享者）：不在此页，在"与我共享"列表操作。

### 15.4 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 读取分享 | `GET /api/v1/apps/{appId}/shares` | `{items:[AppShare], next_cursor}`；AppShare=`{id,app_id,scope,role,subject_type,subject_id,subject_name,expires_at,created_by,created_at}` | 403 |
| 添加分享 | `POST /api/v1/apps/{appId}/shares` `Idempotency-Key` | `{scope:public\|org\|users, role:view\|use\|edit, subject_type?, subject_id?, expires_at?}`；`scope=users` 必填 subject，`public` 不允许 subject；201 返回 AppShare | 400、403、409 |
| 修改角色/有效期 | `PATCH /api/v1/apps/{appId}/shares/{shareId}` | `{role?, expires_at?}` | 404 |
| 撤销分享 | `DELETE /api/v1/apps/{appId}/shares/{shareId}` | 204 | 404 |
| 搜索成员 | `GET /api/v1/orgs/{orgId}/members?q=` / `teams?q=` | 选择器 | — |
| 链接 | `GET /api/v1/apps/{id}` → `url` | 展示用访问链接（不含 ticket，服务端鉴权） | — |
| 审计 | `GET /api/v1/audit-logs?resource_type=app&resource_id=` | 最近变更 | — |

> **契约说明（openapi.yaml 已落盘）**：`share` 为**逐条 AC** 模型（一次 POST 一条 subject，PATCH/DELETE 单条），不是全量 PUT 替换；页面保存时按 diff 提交多条请求（新增/修改/删除），**全部成功才 Toast 成功，部分失败回滚并提示失败条目**；后端 Redis 主动失效保证 **≤5s 生效**。`App.visibility` 管应用本体可见性，ACL 管人/团队/org/public 授权，二者分离。UI 的"仅自己"= **不存在任何 share 记录**（API `ShareScope` 无 `private`）。

### 15.5 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 保存 403 | 错误条 + 说明 | 联系所有者 |
| 保存 409（并发） | "权限已被他人修改，请刷新" | 重新加载 |
| subject 已离职 | 行内标记"已失效" | 移除 |
| 添加不存在成员 | 字段错误 | 重输 |
| 网络失败 | 保留编辑 + 重试 | 重试 |
| 组织成员数加载失败 | 预览显示"—" + 重试 | — |
| 范围 org 但组织未启用 SSO | 阻止 + 提示管理员 | 联系管理员 |

### 15.6 验收与埋点

- 权限变更 ≤5s 生效（R6.4）；未授权 403（R6.5）。
- 保存前可预览"谁能访问"；不出现"公开到互联网"选项。
- 埋点：`share_panel_open`、`share_audience_change{from,to}`、`share_grant_add/remove`、`share_save{duration}`、`share_link_copy`。

---

## 16. S15 MCP 中心 `/mcp`

**权限**：member+ 目录/绑定；author/org_admin 注册与凭证。
**目标**：企业 MCP 目录可用、健康可见、绑定 ≤30s 生效、调用可审计。

### 16.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ MCP 中心                                                 [注册 MCP]（有权）   │
│ 绑定企业 MCP 后，opencode 可直接调用其工具；凭证由平台托管。                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Tabs: [目录] [我的绑定] [注册管理]                                           │
│ [🔍 搜索名称/工具] [分类 ▾] [可见性 ▾]                                       │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ● github      远程 HTTP · 健康 42ms   工具 12    [已绑定 oc-7f3a] [详情] │ │
│ │ ◐ postgres    远程 SSE · 降级 1.2s    工具 6     [绑定]                  │ │
│ │ ✕ internal-cmdb 远程 HTTP · 不可用    工具 —     [查看原因]              │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 16.2 绑定抽屉

```
标题：绑定 github 到工作区 oc-7f3a
范围：(•) 我的工作区 oc-7f3a   ( ) 项目（P1）   ( ) 应用（P1）
凭证：(•) 平台托管（管理员配置）  ( ) 我的 OAuth 授权
工具授权：[全选] read_* / write_* / admin_*  （危险工具默认不选，需说明）
生效：保存后 ≤30s 注入 opencode 配置（R7.6）
[取消] [确认绑定]
```

### 16.3 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `server_type` | enum | 是 | `stdio\|sse\|http` | 注册时 |
| `endpoint` | url | 条件（sse/http） | https；内网地址需管理员白名单 | SSRF 防护 |
| `name` | string | 是 | 2–40；唯一 | — |
| `command`/`args` | string/array | 条件（stdio） | 仅白名单镜像内命令 | — |
| `tools` | array | 是 | ≥1；危险工具需二次确认 | — |
| `scope` | enum | 是 | `workspace`（MVP） | — |
| `credential_mode` | enum | 是 | `platform\|user_oauth` | — |
| `visibility` | enum | 是 | `org\|team\|private` | — |

### 16.4 交互与状态

- 注册（author+）：表单 → 保存后自动探活（≤10s）→ 健康 `healthy/degraded/down/unknown`；失败显示原因（DNS/TLS/超时/401）。
- 绑定：选择范围 + 工具授权 → 保存 → "正在注入"→ 成功 Toast "opencode 中工具列表将在 30s 内出现"。
- 绑定后：卡片"已绑定 N 个工作区"；解绑需确认（不影响历史审计）。
- 健康：每 60s 刷新；`degraded` 显示延迟；**健康 `down` 禁止新绑定**（已有绑定保持并告警）。
- 凭证：re-auth 按钮（OAuth 过期）；平台托管凭证仅管理员可轮换。
- 审计：每个 MCP 行"查看调用"→ `/audit?resource_type=mcp&resource_id=`。

### 16.5 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 目录 | `GET /api/v1/mcp-servers?tab=&q=&category=&visibility=` | `items[{id,name,type,health,latency_ms,tool_count,bound}]` | — |
| 详情 | `GET /api/v1/mcp-servers/{id}` | 工具列表/健康历史/凭证模式 | 403 |
| 注册 | `POST /api/v1/mcp-servers` | §16.3 | 400 endpoint 非白名单、409 重名 |
| 探活 | `POST /api/v1/mcp-servers/{id}/probe` | 同步返回健康 | 502 |
| 绑定 | `POST /api/v1/mcp-bindings` | `{server_id,workspace_id,tools,mode}` | 409 已绑定、422 工具未授权 |
| 解绑 | `DELETE /api/v1/mcp-bindings/{id}` | — | — |
| 工具列表 | `GET /api/v1/mcp-servers/{id}/tools` | `[{name,description,dangerous}]` | — |

### 16.6 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 探活失败 | 注册表单错误 + 原因 | 修改/重试 |
| 健康 `down` | 红徽标 + 最近错误时间 | 查看详情 / 联系管理员 |
| 绑定超时 | Toast"仍在注入" + 任务中心 | 稍后查看 |
| OAuth 过期 | 行内黄条 + "重新授权" | 授权 |
| 工具未授权 | 绑定失败 + 列出未授权工具 | 申请 |
| 调用被拒（越权） | 工作区内 opencode 报错 + 审计告警 | 查看审计 |
| 内网地址被拒（SSRF） | 字段错误"仅允许白名单域名" | 联系管理员加白 |

### 16.7 验收与埋点

- 绑定 → opencode 工具可见 ≤30s（R7.6）；调用 100% 可审计（R7.5）。
- 埋点：`mcp_view`、`mcp_register`、`mcp_bind_start/success`、`mcp_probe_fail{reason}`、`mcp_reauth`。

---

## 17. S16 用量与配额 `/usage`

**权限**：member（自己）；team_owner（团队）；org_admin（组织）
**目标**：5 分钟内可查（R2.5）、可导出、超限有出路。

### 17.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 用量与配额              [今日|7天|30天|custom] [维度: 用户 ▾] [导出 CSV]     │
│ 数据延迟 ≤5 分钟 · 更新于 09:35 · 单次查询跨度 ≤90 天 · 时区 Asia/Shanghai    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┐┌────────────┐┌────────────┐┌────────────────────────────────┐ │
│ │ 请求数     ││ Token      ││ 成本（USD）││ 配额  ████████░░ 78%           │ │
│ │ 128,402    ││ 12.4M      ││ $86.20     ││ 9.36M / 12M · 11-01 重置       │ │
│ └────────────┘└────────────┘└────────────┘└────────────────────────────────┘ │
│ 趋势（近 30 天，按模型堆叠，可切换 token/请求/成本）                        │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 分组          请求数   输入token  输出token  成本USD   占比   操作        │ │
│ │ 李雷          82,140   7.2M       1.1M      $52.10    60%    [下钻]      │ │
│ │ 王芳          46,262   2.1M       0.6M      $34.10    40%    [下钻]      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ [加载更多]                                                 导出记录（最近 5 次）│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 17.2 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `range` | enum | 是 | `today\|7d\|30d\|custom` | 默认 30d |
| `from`/`to` | date | 条件（custom） | **跨度 ≤90 天**；to≥from；不晚于今天；必填（architect 定稿） | "时间跨度不能超过 90 天" |
| `group_by` | enum | 是 | `user\|workspace\|model\|day` | 权限决定可用值 |
| `scope` | enum | 是 | `me\|team\|org` | 可见范围 |
| `model_id`/`workspace_id` | uuid | 否 | — | 下钻筛选 |
| `export_format` | enum | 是 | `csv` | MVP 仅 CSV |

### 17.3 交互与状态

- 区间切换即时刷新（保留趋势图旧数据 + 顶部进度）；自定义区间弹出日期选择器（RangePicker，双月）。
- KPI 卡：除成本外均为整数/1 位小数；配额卡显示上限/已用/重置日/负责人。
- 图表：堆叠面积图（默认 token），图例可点击筛选；悬停十字准线；键盘可聚焦数据点（aria-label 摘要）。
- 表格：可排序（请求/成本），行下钻→带筛选跳回本页（面包屑可返回）。
- 导出：≤10 万行、生成 ≤60s；**超过 90 天的区间必须改用异步导出**（任务中心 + 通知，下载链接 24h 有效）；导出请求、生成与下载均写审计（R1.4）。
- 配额提示：≥80% 顶部黄条（可关闭，24h 内不再提示）；100% 红条常驻 + 申请提升。

### 17.4 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 汇总 | `GET /api/v1/usage?from=&to=&group_by=&workspace_id=&model_id=` | `{items:[{bucket:{...},requests,tokens:{input,output,reasoning,cache_read,cache_write},cost_usd}],summary:{...}}`（金额为 decimal string，token 为整数） | 403 scope、`validation_failed`（from/to 缺失或 >90 天） |
| 分组/明细 | 同上（`group_by=user\|workspace\|model\|day`，cursor 分页） | `items[]` + `next_cursor`（默认无 total） | — |
| 趋势 | `GET /api/v1/usage?from=&to=&group_by=day&metric=` | `items[]` 按天/模型 | — |
| 导出 | `POST /api/v1/usage/exports` | `{from,to,group_by}` → 202 `{export_id}` | 429 |
| 导出状态 | `GET /api/v1/usage/exports/{id}` | `{status,download_url,expires_at}` | 404 |
| 配额申请 | `POST /api/v1/quota-requests` | `{target_limit,reason}` | 409 已有待审 |

### 17.5 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 区间无数据 | 图表空态 + KPI 0 | 换区间 |
| 计量延迟 | 提示"数据更新于 HH:mm（延迟 ≤5min）" | 等待 / 刷新 |
| 查询失败 | 保留上次数据 + 错误条 | 重试 |
| 配额查询失败 | 配额卡显示"—" + 重试 | 重试 |
| 导出超时/失败 | Toast + 任务中心重试 | 重试 |
| 无权限 scope=team | 403 模块卡 | 切回自己 |
| 超 90 天跨度 | 表单校验 | 缩短区间，或改用异步导出（≤60s、≤10 万行） |

### 17.6 验收与埋点

- 5 分钟内可查（R2.5）；CSV 可导出（R8.6）。
- 数字格式：千分位；`cost_usd` 保留 2 位小数（decimal string 原样格式化，不做浮点运算）；token 用 `12.4M` 简写 + tooltip 精确整数。
- 埋点：`usage_view`、`usage_range_change`、`usage_group_change`、`usage_drilldown`、`usage_export{rows,async}`、`quota_upgrade_click`.

---

## 18. S17 审计日志 `/audit`

**权限**：team_owner（团队范围）/ org_admin（组织）/ platform_admin（全局）
**目标**：所有写操作可检索（R1.4）；证据可导出。

### 18.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 审计日志                                            [导出 CSV] [查看保留策略]  │
│ 留存 180 天 · 覆盖登录、Key、工作区、发布、分享、MCP 调用                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ [时间: 近 7 天 ▾] [操作者 🔍] [动作 ▾] [资源类型 ▾] [结果 ▾]  [重置]        │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ 时间               操作者      动作              资源         结果  IP    │ │
│ │ 11-04 09:31:02    李雷         share.update      应用 invoice 成功 10.2… │ │
│ │ 11-04 09:30:18    李雷         workspace.destroy oc-1a02      成功 10.2… │ │
│ ├──────────────────────────────────────────────────────────────────────────┤ │
│ │ ▸ 展开详情：request_id / 操作者 UA / 变更前后（脱敏）/ 关联资源跳转       │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 共 1,284 条（?include_total=true）            [加载更多]  [每页 20 ▾]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 18.2 字段与校验

| 字段 | 类型 | 必填 | 校验 | 说明 |
|------|------|------|------|------|
| `from`/`to` | datetime | 是 | 默认近 7 天；**单次跨度 ≤90 天**（数据留存 180 天，可分两段查） | 超限错误 |
| `actor_id` | uuid/email | 否 | 存在 | Combobox 搜索 |
| `action` | enum | 否 | `auth.*`、`api_key.*`、`workspace.*`、`skill.*`、`eval.*`、`app.*`、`share.*`、`mcp.*`、`quota.*` | 分组下拉 |
| `resource_type` | enum | 否 | 同上资源 | — |
| `resource_id` | string | 否 | — | 从详情页带参 |
| `result` | enum | 否 | `success\|failure` | — |
| `request_id` | string | 否 | ≤64 | 精确搜索 |

### 18.3 交互与状态

- 筛选变更写 URL，刷新/分享保持；点击行展开详情抽屉（不整页跳转）。
- 详情：时间（本地时区 + 原始 UTC）、操作者（姓名/邮箱/角色）、动作、资源（可跳转）、结果、来源 IP（脱敏如 `10.2.*.*`）、UA、`request_id`（复制）、变更前后 diff（JSON，密钥字段 `***`）。
- 导出：单次查询跨度 ≤90 天；更大范围或 >10 万行走**异步导出**（≤60s 生成、任务中心/通知下载、链接 24h 有效）；导出请求与下载均写审计（R1.4）。
- 保留策略说明 Popover：数据留存 180 天；单次查询跨度 ≤90 天，可分两段查询或异步导出。
- 保留策略说明 Popover：180 天（PLAN NFR）；更早数据不可查。
- 实时：默认不自动刷新；提供"刷新"与"最近更新 HH:mm"。

### 18.4 API 映射（提案）

| 动作 | 方法/路径 | 关键字段 | 错误 |
|------|-----------|----------|------|
| 列表 | `GET /api/v1/audit-logs?from=&to=&actor_id=&action=&resource_type=&resource_id=&result=&request_id=&cursor=` | `items[{id,created_at,actor{},action,resource{type,id,name},result,ip,request_id}]` | 403/422 |
| 详情 | `GET /api/v1/audit-logs/{id}` | `{metadata,diff,user_agent}` | 404 |
| 导出 | `POST /api/v1/audit-logs/exports` | 同筛选 → 文件/202 | 429 |
| 动作字典 | `GET /api/v1/audit-logs/actions` | 枚举 + 显示名（i18n） | — |

### 18.5 异常处理

| 场景 | 表现 | 出路 |
|------|------|------|
| 无权限 | 403 页（负责人以下） | 返回 / 申请 |
| 无记录 | 表格空态 | 重置筛选 |
| 时间超 180 天 | 字段错误 | 缩短 |
| 详情 404（已归档） | 提示"记录已超出保留期" | 返回 |
| 导出过大 | 提示缩小范围/后台任务 | 调整 |
| 加载失败 | 错误卡 | 重试 |

### 18.6 验收与埋点

- 所有写操作 100% 落审计（R1.4）；可按用户/资源/时间检索；导出 CSV（R8.6）。
- 脱敏：不展示密钥、token、完整 IP；diff 中敏感字段 `***`。
- 埋点：`audit_view`、`audit_filter`、`audit_detail_open`、`audit_export{rows}`.

---

## 19. S18 应用使用门户 `/a/:slug`

**权限**：SSO 登录用户 + 应用 ACL（view/use/edit）
**目标**：链接即用；无权限不白屏；与应用本身边界清晰。

### 19.1 布局

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ⬢ 发票助手       由 星云科技 · 李雷 分享       [我的权限: 可使用] [头像 ▾]   │ 56
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                          │ │
│ │              应用内容（应用 iframe / 独立页面）                           │ │
│ │              平台注入：SSO 身份头（X-OC-User / X-OC-Role，服务端签名）    │ │
│ │                                                                          │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ 由 OpenDream Cloud 托管 · 隐私 · 报告问题                                     │ 32
└──────────────────────────────────────────────────────────────────────────────┘
```

无控制台侧栏/导航；用户菜单仅：退出登录、切换账号、帮助。

### 19.2 状态与页面

| 状态 | 页面 | 内容 |
|------|------|------|
| 未登录 | 跳 `/login?return_to=/a/{slug}` | 登录后回跳 |
| 无权限 | 403 门户页 | 应用名/分享者 + "申请权限"（通知 owner/管理员）+ 返回 |
| 不存在 | 404 门户页 | "链接无效或应用已删除" + 联系分享者 |
| 已暂停 | 休眠页 | "应用已暂停，请联系所有者" + 请求恢复 |
| 唤醒中 | 加载页 | "应用唤醒中，约 10–30 秒" |
| 应用 5xx | 错误页 | 应用名 + request_id + 联系所有者 |
| 会话过期 | 登录 Dialog | 登录后原位恢复 |
| view 权限 | 正常渲染但提交类操作由应用侧禁用 | 权限提示条（可关闭） |

### 19.3 API 映射（提案）

| 动作 | 方法/路径 | 说明 |
|------|-----------|------|
| 应用元信息 | `GET /api/v1/apps/public/{slug}` | 返回应用名/描述/分享者/我的权限；未授权 403（不泄露详情） |
| 访问票据 | `POST /api/v1/apps/{id}/access-ticket` | 短期 ticket，用于应用侧身份注入 |
| 申请权限 | `POST /api/v1/apps/{id}/access-requests` | `{reason}` |
| 应用状态 | `GET /api/v1/apps/{id}` 的 `state`/`host`/`url`（无独立 health 端点，G3-21） | 唤醒状态/可访问性 |

### 19.4 异常处理

- 未授权直链：403 门户（不 302 到登录后再 403 的循环）。
- 应用构建中/未部署：显示"应用未就绪"页。
- 第三方 Cookie 被禁：应用 iframe 降级"在新窗口打开"。
- 账号被禁用：403 门户 + 管理员联系方式。

### 19.5 验收与埋点

- 未登录访问必须跳 SSO；未授权必须 403（R6.5）；不暴露应用内容。
- 埋点：`portal_view`、`portal_403{reason}`、`portal_access_request`、`portal_open{result}`.

---

## 20. 全局页面（403 / 404 / 500 / 维护 / 会话过期）

| 页面 | 路由 | 内容 | 主 CTA |
|------|------|------|--------|
| 403 | 任意 | 缺什么权限 / 谁能给 / 怎么申请；`request_id` | 申请权限 / 返回 |
| 404 | 任意 | 资源类型 + 可能原因（删除/链接错误） | 返回列表 / 搜索 |
| 500 | 任意 | 人话说明 + `request_id` + 状态页链接 | 重试 / 状态页 |
| 维护 | 全局拦截 503 | 预计恢复时间 + 状态页 + 通知订阅 | 刷新 / 状态页 |
| 会话过期 | 全局 Dialog | 会话已过期，请重新登录（不丢当前表单？表单保留本地草稿） | 重新登录 |
| 离线 | 全局黄条 | 网络已断开，部分功能不可用 | 重试 |

统一规格：`ErrorPage` 组件（插画 200 + 标题 + 描述 + 主/次 CTA + request_id 可复制 + 帮助链接）；403 不泄露资源存在性（IA §6.6）。

---

## 21. 自检（G3 清单逐条）

| # | G3 检查项 | 证据 | 结论 |
|---|-----------|------|------|
| 1 | 信息架构覆盖全部中心与角色 | IA §2 站点地图 + §1 角色矩阵；SCREENS S1–S18 | ✅ |
| 2 | 关键流程可点击走通（登录→拉起→使用→发布→分享） | IA F1–F10 + prototype（login→workspace→share）+ S1–S14 规格 | ✅（原型覆盖主流程，其余为规格） |
| 3 | 空态/加载/错误/无权限/配额超限状态齐全 | IA §6 状态矩阵（12 类）+ 每屏"异常处理"表 | ✅ |
| 4 | 设计系统 tokens/组件/暗色亮色/响应式规范完整 | DESIGN-SYSTEM §2–§9（30 组件 + 6 断点 + 明暗） | ✅ |
| 5 | 无障碍 WCAG 2.1 AA 检查项 | DESIGN-SYSTEM §10（逐条 + 键盘 + 焦点 + 测试方法） | ✅ |
| 6 | 与 API 契约一致（字段/状态/错误码） | 已对 `openapi.yaml` 落盘版本复核：错误包络/小写下划线 code、cursor 分页默认无 total、workspace 9 态、access-ticket 字段、share `public\|org\|users` 逐条 ACL、uuid 路径、`cost_usd`/`tokens` 口径均一致 | ✅ 主体一致（剩余项见下） |

**已知缺口（非阻塞，进入 G4 前关闭）**
1. `openapi.yaml` 已落盘并完成主体对齐；剩余：Skill 详情"按 by-slug 解析后取 id"的加载顺序、MCP 状态枚举（`healthy/degraded/down`）与徽标文案、评测报告字段名（`cost_usd`/`tokens` 嵌套）需在 G4 联调前逐项复核。
2. 应用门户身份注入头（`X-OC-User`/`X-OC-Role`）格式需与 SECURITY.md 对齐。
3. 评测"轨迹快照"、CI 回写、数据集管理为 P1，本文给最小规格。
4. 运营后台 `/admin/*` 本文未展开（P1，另立规格）。
5. PRD E8-02③「嵌入式会话/终端（不新开窗口）」已由 lead 裁决为 MVP 新标签页、iframe **P2 实验默认关闭**；本文 S4 已按裁决修订（G3-10 closed）。

---

## 22. 变更记录

| 版本 | 日期 | 变更 | 作者 |
|------|------|------|------|
| v1.0 | 2026-11-04 | 初版：18 屏规格（登录/拉起/工作区×3/模型/Skill×2/评测×2/应用×3/分享/MCP/用量/审计/门户）+ 全局错误页 + G3 自检 | web-console |
| v1.1 | 2026-11-04 | 对齐 `openapi.yaml` 与 architect 定稿：S4 改为"状态页 + 新标签页进入，iframe 降为容器边界"；错误码通用小写下划线 + `error.reason` + X-Request-Id；分页默认无 total；workspace 9 态（idle 为 ready 子态）；access-ticket 字段；分享逐条 ACL（public/org/users，无 private；App.visibility 分离）；金额 USD string；用量/审计跨度 ≤90 天；Skill API by-slug+uuid | web-console |
| v1.2 | 2026-11-04 | G3 行动项关闭（A-G3-2…5）：S2 reason/180s/409/new-tab、S4 嵌入改 P2、销毁 5min + 快照不可取消、`state=`/`/start`/`/model-providers`/`/skills/{id}/install` 等 6 处契约修正、MCP `down`、默认域名/指标/模板降级说明 | web-console |
| v1.3 | 2026-11-04 | G3 P2/P3 收尾：移除未定义端点依赖（slug-available/app-templates/app metrics/app health/workspace files）、应用列表 `state=`、补 access-ticket base_url/fallback_url 重试、原型标注"仅鼠标路径（a11y 由 G6 覆盖）" | web-console |
