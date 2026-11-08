# 应用中心：权限 + 在线协同 UI 规格（APP-COLLAB-UI v0.1）

- 版本：v1.0（platform-backend v1 契约已定稿，2026-11-08）
- Owner：`web-console`
- 依据：[ARCH-V3.md](../02-architecture/ARCH-V3.md) §5（权限矩阵/协同流程）、[SCREENS.md](SCREENS.md) S11–S14、[DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)
- 状态：**UI 规格 + MVP 已实现**（`apps/console/app/apps/*`）；契约以 platform-backend v1 为准，app-center/控制面未启动时 mock 降级
- 契约状态：成员/权限/分享/协同 API v1 已定稿（见 platform-backend 2026-11-08 消息）；`subject_name`/头像为后续非破坏字段，UI 先用 id 兜底

---

## 1. 范围

### 1.1 本期（MVP UI）
1. `/apps`：应用列表（真实 API 或 mock 降级）。
2. `/apps/[id]`：应用详情 + **权限面板**（协作者 × 角色）+ **分享设置**（public/org/team/user + 链接有效期 + SSO 提示）+ **审计入口** + **版本列表/回滚**。
3. **对话式修改抽屉**：对话 → patch 提案 → diff 预览 → 批准/拒绝 → 新版本；冲突提示。
4. `data-testid` 全链路，供 QA Playwright。

### 1.2 非目标（后续）
- 评论/@提及、实时多人光标、WebSocket 推送（本期用轮询/本地状态模拟）。
- 构建流水线真实执行；批准提案后仅生成新版本（部署由 App Center 后续接入）。
- 密码保护分享（ARCH-V3 可选）；本期只做链接有效期 + SSO 强制。

---

## 2. 角色与权限矩阵

来自 ARCH-V3 §5.2（唯一权威）：

| 角色 \ 动作 | view | use | edit | share | deploy | rollback | delete |
|---|---|---|---|---|---|---|---|
| owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| editor | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| operator | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ |
| viewer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### 2.1 UI 映射

| 能力 | 可见控件 | 无权限表现 |
|---|---|---|
| view | 详情/版本只读 | 页面 403 |
| use | 「打开应用」 | 按钮禁用 + tooltip「需要 use 权限」 |
| edit | 编辑配置/协同修改 | 隐藏协同入口；面板只读 |
| share | 分享设置可编辑 | 分享面板只读 + 「仅 owner/admin 可修改」 |
| deploy | 「构建并部署」 | 隐藏 |
| rollback | 版本行「回滚」 | 隐藏（历史仍可查看） |
| delete | 「删除应用」 | 隐藏 |

> 角色来源：`GET /apps/{id}` 的 `my_role` 或 `GET /apps/{id}/permissions`；前端只做显隐，服务端 403 兜底。所有者/org owner/admin 隐式最高权限。

---

## 3. 页面与布局

### 3.1 `/apps` 应用列表

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 能力 / 应用中心                                           [+ 创建应用]        │
│ 把工作区能力发布为应用：1C2G 运行、链接即域名、SSO 鉴权、按角色分享。         │
├──────────────────────────────────────────────────────────────────────────────┤
│ [全部] [我拥有的] [与我共享]      🔍 搜索应用名/域名                           │
│ ┌─────────────────────────────┐ ┌─────────────────────────────┐              │
│ │ ● 运行中  发票助手           │ │ ◐ 构建中  周报生成           │              │
│ │ invoice-helper.apps.oc.dev   │ │ 构建中 42%                   │              │
│ │ 我的角色：owner  [打开] [详情]│ │ 我的角色：viewer [查看日志]  │              │
│ └─────────────────────────────┘ └─────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- 卡片字段：状态、名称、域名、我的角色徽标、资源 1C2G、最近更新；主 CTA「打开」，次 CTA「详情」。
- 空态：无应用 → 「从工作区发布第一个应用」+ 创建入口（创建流程仍走工作区，MVP 按钮提示）。
- 加载：2 张卡片骨架；错误：内联错误卡 + 重试；无权限：403 页。

### 3.2 `/apps/[id]` 应用详情

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← 应用中心   ● 运行中 发票助手            [打开应用 ↗] [对话式修改] [更多 ▾] │
│ invoice-helper.apps.oc.dev · 我的角色：owner · v3 · 1C2G                   │
├───────────────────────────────────────────────┬──────────────────────────────┤
│ 左 8 列                                        │ 右 4 列                      │
│ ┌ 协作者与权限 ─────────────────────────────┐ │ ┌ 对话式修改 ─────────────┐ │
│ │ 角色矩阵摘要 · 协作者列表 · 添加协作者     │ │ │ 最近协同会话 / 提案状态  │ │
│ ├ 分享设置 ─────────────────────────────────┤ │ │ [打开协同抽屉]           │ │
│ │ public/org/team/user · 角色 · 有效期      │ │ ├ 审计 ───────────────────┤ │
│ │ SSO 提示 · 链接复制 · 保存                │ │ │ 最近 3 条事件 / 查看全部 │ │
│ ├ 版本与回滚 ───────────────────────────────┤ │ ├ 应用信息 ───────────────┤ │
│ │ 版本列表 / 查看 diff / 回滚               │ │ │ 模板/资源/创建时间/域名  │ │
│ └───────────────────────────────────────────┘ │ └──────────────────────────┘ │
└───────────────────────────────────────────────┴──────────────────────────────┘
```

### 3.3 权限面板

- 头部：`协作者与权限` + 「添加协作者」；只读角色不显示添加/删除/改角色。
- 行：头像/名称/邮箱（或团队名）· 角色 Select（owner 固定，不可改）· 移除（danger ghost）。
- 角色说明 Popover：viewer=只读；operator=使用+发布/回滚；editor=可编辑内容；admin=除删除全权限；owner=全部。
- 校验：同一 subject 不可重复添加；不能把最后一个 owner 降级/移除（前端拦截 + 服务端兜底）。
- 权限矩阵：默认折叠「查看权限矩阵」，展开表格（ARCH-V3 §5.2）。
- 操作反馈：保存中行内 loading；失败 Toast + 回滚到原值。

### 3.4 分享设置

```
访问范围  ( ) 公开（平台内已登录用户）  (•) 组织内  ( ) 指定团队/用户
指定对象  [团队/用户选择器] [添加]   （scope=users 时显示）
权限      [可使用 use ▾]（view/use/edit）
链接有效期 [永久 ▾] 24h / 7d / 30d
ⓘ 所有范围都要求登录（SSO）；公开 = 平台内已登录用户可发现，互联网匿名访问禁止。
链接：https://invoice-helper.apps.oc.dev/s/shr_xxx   [复制链接]
[保存分享设置]
```

- 当前生效分享列表：对象、角色、有效期、创建者、移除（owner/admin/share 权限）。
- 分享变更 ≤5s（HTTP）生效；保存后 Toast。
- 公开范围需二次确认文案「其他组织的已登录用户也可发现/使用」。

### 3.5 版本与回滚

- 行：`v3`（当前）· 状态（active/superseded/rolled_back）· 作者 · 时间 · 变更摘要 · `hash` 前 8 位 · 操作「查看 diff」「回滚」。
- 回滚二次确认：说明「回滚将发布新版本指向 v2 的构建，不影响已存在分享链接」；成功后 Toast + 版本列表更新。
- 并发/冲突：409 时 Toast「版本已变化，请刷新后重试」。

### 3.6 对话式修改抽屉（核心）

宽度 640，右侧抽屉；状态机：

```
idle ──发送修改描述──▶ generating（AI 生成中，可取消）
  ──收到提案──▶ proposal_open（展示 summary + 影响文件 + 测试建议）
  ──查看 diff──▶ diff_view（文件列表 + unified diff）
  ──批准──▶ approving ──► approved（生成新版本 vN+1，版本列表追加）
  ──拒绝──▶ rejected（填写/选择原因，可重新发起）
  ──base_version 冲突──▶ conflict（提示 rebase/重新生成，禁止批准）
```

```
┌ 协同修改「发票助手」 ─────────────────────────── [×] ┐
│ 会话 base v3 · 参与者 李雷（editor） · SSE 已连接       │
├──────────────────────────────────────────────────────┤
│ 李雷：把导出按钮改成 CSV，并加一行说明                │
│ AI：已生成修改提案（2 个文件，+18 −4）                │
│ ┌ 提案 #p1 · 待审批 ──────────────────────────────┐  │
│ │ 影响：src/App.tsx, src/export.ts                  │  │
│ │ 测试建议：导出空数据、中文表头                    │  │
│ │ [查看 diff] [批准并生成 v4] [拒绝]                │  │
│ └──────────────────────────────────────────────────┘  │
│ [输入描述要修改的内容…]                     [发送]     │
├──────────────────────────────────────────────────────┤
│ [取消]                                                │
└──────────────────────────────────────────────────────┘
```

- 每个应用一个 collab session（绑定 app + base_version）；消息按时间排序。
- 发送后 AI 生成中显示打字/骨架，可取消；失败显示错误 + 重试。
- 提案卡必须展示：summary、影响文件、增删行数、测试建议、base_version、作者。
- diff 预览：文件级折叠；绿 `+` / 红 `-` / 灰上下文；增加「只显示变更行」开关。
- 批准：带 `base_version` 乐观锁；成功后新版本插入版本列表并 Toast；失败 409 显示冲突卡。
- 拒绝：选择原因（不符合预期/有安全风险/稍后处理）+ 可选备注；提案标记 rejected，可继续对话。
- 审计：消息/提案/审批/版本全部记录；抽屉底部「查看本次协同审计」。

---

## 4. 数据与 API 契约（提案，待对齐）

| 能力 | 方法/路径（提案） | 关键字段 |
|---|---|---|
| 应用列表 | `GET /api/v1/apps?cursor=&limit=&state=` | `items[{id,name,slug,state,host,url,my_role,updated_at}]` |
| 应用详情 | `GET /api/v1/apps/{appId}` | `{...App, my_role}` |
| 我的权限 | `GET /api/v1/apps/{appId}/permissions` | `{role, actions:["view","use","edit","share","deploy","rollback","delete"]}` |
| 协作者列表 | `GET /api/v1/apps/{appId}/members` | `{items:[{id,subject_type,subject_id,name,email?,role,created_at}]}` |
| 添加协作者 | `POST /api/v1/apps/{appId}/members` | `{subject_type:user\|team, subject_id, role}` |
| 改角色 | `PATCH /api/v1/apps/{appId}/members/{memberId}` | `{role}` |
| 移除 | `DELETE /api/v1/apps/{appId}/members/{memberId}` | — |
| 分享列表 | `GET /api/v1/apps/{appId}/shares` | `{items:[AppShare]}` |
| 创建分享 | `POST /api/v1/apps/{appId}/shares` | `{scope:public\|org\|users, subject_type?, subject_id?, role:view\|use\|edit, expires_at?}` |
| 修改/撤销 | `PATCH/DELETE /api/v1/apps/{appId}/shares/{shareId}` | `{role?, expires_at?}` |
| 协同会话 | `GET /api/v1/apps/{appId}/collab` | `{session_id,base_version,status,updated_at}` |
| 消息列表 | `GET /api/v1/apps/{appId}/collab/messages?cursor=` | `{items:[{id,role:user\|assistant,sender_name,content,created_at}]}` |
| 发送消息 | `POST /api/v1/apps/{appId}/collab/messages` | `{content}` → `{message, proposal?}` |
| 提案列表 | `GET /api/v1/apps/{appId}/collab/proposals?status=` | `{items:[CollabProposal]}` |
| 批准 | `POST /api/v1/apps/{appId}/collab/proposals/{proposalId}/approve` | `{expected_base_version}` → `{version, applied:true}`；409 `collab_conflict` |
| 拒绝 | `POST /api/v1/apps/{appId}/collab/proposals/{proposalId}/reject` | `{reason, note?}` |
| 版本列表 | `GET /api/v1/apps/{appId}/versions` | `{items:[AppVersion]}` |
| 回滚 | `POST /api/v1/apps/{appId}/versions/{versionId}/rollback` | → `{version}` |
| 审计 | `GET /api/v1/audit-logs?resource_type=app&resource_id=` | 复用 |

`CollabProposal`：`{id, app_id, session_id, base_version, status:open|approved|rejected|conflict, summary, files:[{path,status:added|modified|deleted, additions, deletions, unified_diff}], test_suggestions:string[], created_by, created_at}`。

> v1 契约要点：`scope` 为 `public|org|team|users`（team/users 分离）；成员/分享响应暂不含 `subject_name`，UI 用 `subject_id` 兜底；`permissions.actions` 为运行时权威（owner 全量、admin 除 delete、editor view/use/edit、operator view/use/deploy/rollback、viewer view）；proposal 用 `open`；消息 POST 带 `client_msg_id` 幂等；approve 返回 `{version,proposal}`，rollback 返回 `{version,rolled_back_to}`；异步 worker 未生成提案时 UI 轮询 messages/proposals。

---

## 5. 状态与异常

| 状态 | 列表 | 详情 | 协同抽屉 |
|---|---|---|---|
| loading | 卡片骨架 | 页面骨架 | 会话骨架 |
| empty | 空态 + 创建 CTA | 无版本/无协作者空段 | 「描述你的第一个修改」 |
| error | 错误卡 + 重试 | 错误卡 + 重试 | 内联错误 + 重试 |
| 无权限 | 403 页 | 403 页（不泄露存在性） | 不显示入口 |
| 权限不足动作 | — | 控件隐藏/禁用 + tooltip | 只读模式（role=viewer） |
| 冲突 | — | — | 黄色冲突卡：「base v3 已变为 v4，请重新生成提案」 |
| 提案生成失败 | — | — | 错误消息 +「重新生成」 |
| 版本回滚失败 | — | 错误 Toast + request_id | — |
| 分享过期/失效 | — | 行内「已过期」徽标 | — |

所有 5xx/404（接口未就绪）→ DEV Banner + mock 数据，操作本地模拟；401 跳登录；403 不降级。

---

## 6. data-testid 清单（QA）

| 区域 | testid |
|---|---|
| 列表 | `apps-page`、`app-card`、`app-open`、`app-detail-link`、`apps-empty`、`apps-error` |
| 详情 | `app-detail`、`app-role-badge`、`app-state`、`app-open`、`app-collab-open` |
| 权限 | `permission-panel`、`member-row`、`member-role`（select）、`member-remove`、`member-add`、`member-add-form`、`member-submit` |
| 分享 | `share-panel`、`share-audience`（radio）、`share-role`、`share-expiry`、`share-save`、`share-copy`、`share-row`、`share-remove` |
| 协同 | `collab-drawer`、`collab-message`、`collab-input`、`collab-send`、`collab-proposal`、`collab-diff-open`、`collab-approve`、`collab-reject`、`collab-conflict`、`collab-close` |
| diff | `diff-modal`、`diff-file`、`diff-line-add`、`diff-line-del`、`diff-approve`、`diff-reject` |
| 版本 | `version-list`、`version-row`、`version-rollback`、`version-confirm` |
| 其他 | `audit-link`、`toast`、`demo-banner`、`empty-state`、`error-state`、`skeleton` |

---

## 7. 无障碍与响应式

- 抽屉/弹窗：`role=dialog` + `aria-modal` + `aria-labelledby`，Esc 关闭，焦点陷阱，关闭后焦点回归触发按钮（复用 models 抽屉方案）。
- 角色矩阵表格有 caption；角色 Select 有 `aria-label`；状态不只靠颜色（文本 + 徽标）。
- 对比度沿用 DESIGN-SYSTEM §2.3；键盘可达全部操作。
- ≥1024 双栏；<1024 单栏（右栏折叠到主内容下方）；<768 抽屉全屏 Sheet；表格转卡片。

---

## 8. 待对齐 / 开放问题

| # | 事项 | 当前假设 | Owner |
|---|---|---|---|
| 1 | API 路径与字段 | 见 §4 提案 | platform-backend |
| 2 | 协作者来源：user 搜索接口 | `GET /orgs/{orgId}/members?q=`（已有） | platform-backend |
| 3 | 团队列表 | `GET /orgs/{orgId}/teams?q=`（未定义） | platform-backend |
| 4 | 分享 scope=team 是否独立 | 先用 `scope=users` + `subject_type=team` | platform-backend |
| 5 | 协同实时推送 | 本期轮询/本地状态；后续 SSE | platform-backend |
| 6 | 批准后是否自动构建/部署 | MVP 仅生成新版本，构建按钮独立 | platform-backend/capability |
| 7 | 权限矩阵来源 | 前端常量 + 服务端 actions 校验 | platform-backend |
