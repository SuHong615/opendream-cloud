# OpenDream Cloud Console（M-02 控制台）

Next.js 15 + React 19 + Tailwind 的控制台，按 `docs/03-design/` 的 tokens/IA/SCREENS 实现。

## 本地运行

```bash
# 从仓库根目录安装依赖
bun install

# 启动控制面（另一个终端，默认 4000）
bun run dev   # 或单独启动 apps/control-plane

# 启动控制台（:3000）
cd apps/console && bun run dev
```

> **必须用 `http://localhost:3000` 打开控制台**（不要用 `127.0.0.1`）：控制面会话 Cookie 为
> `__Host-oc_session` + `Secure`，只有 localhost / HTTPS 才会被浏览器回传；用 127.0.0.1 可能出现
> "登录成功但列表 401"。反向代理目标仍是 `http://127.0.0.1:4000`（服务端到服务端，不受此限）。

默认把 `/api/v1/*` 反向代理到 **`http://127.0.0.1:4000`**（本地 Docker 控制面；同源 Cookie，无 CORS）。需要改目标时设置：

```bash
API_PROXY_TARGET=http://127.0.0.1:4000 bun run dev
```

## 页面

- `/login`：dev-login（生产接 OIDC）；失败显示 `error.reason` + `request_id`。
- `/workspaces`：列表/创建/拉起进度（阶段式，无百分比）、示例数据降级（控制面不可达时）。
- `/workspaces/[id]`：状态详情、打开（access-ticket → 新标签页）、唤醒（`/start`）、销毁二次确认（输入工作区名 + 知悉数据影响 + 系统先快照、个人不可删 PVC）。
- `/models`：**模型供应商管理（CC Switch 风格）**——预设/CRUD/测试连通/设为默认/配置预览；强调 opencode 不自带模型，模型全部由平台下发。接口未就绪时使用内置预设与示例供应商（DEV）。
- `/apps`：**应用中心**——应用列表（真实 API，app-center 不可用时展示示例数据）、状态/我的角色/打开与详情入口。
- `/apps/[id]`：应用详情——**协作者与权限**（owner/admin/editor/operator/viewer × view/use/edit/share/deploy/rollback/delete）、**分享设置**（public/org/team/user + 角色 + 有效期 + SSO 提示）、**版本与回滚**、**审计入口**、**对话式修改抽屉**（对话 → patch 提案 → diff → 批准/拒绝 → 新版本）。
- `/skills`：Skill 中心——分页卡片网格；「新增 Skill」右侧上传抽屉（SKILL.md/.zip 拖入读取文本）；宽抽屉详情页签：内容/代码/审查/调试/版本/启用；提交审查、批准/拒绝、发布、撤回、回滚、调试、启停、安装/卸载、删除（抽屉内联二次确认，无 modal）。
- `/prompts`：Prompt 库——系统/自定义 Prompt 列表、搜索+标签过滤、创建/编辑、详情预览、删除（系统只读）。
- `/usage`：用量与配额——24h/7d summary（requests/tokens/cost）、Token 拆分；无明细时如实说明，不伪造趋势。
- `/mcp`：MCP 中心——服务列表、版本审核/发布/撤回、stable/canary 渠道指针、工具目录（风险/只读/破坏性）；无真实服务时可手动载入示例数据。
- `/workflows`：工作流中心——模板/定义列表、创建（模板自动发布 1.0.0）、发布、运行列表/详情（节点时间线/产物/错误/补偿）、发起运行、取消/重放、人工任务收件箱（approve/reject + SLA）。
- `/employees`：数字员工——员工卡（姓名/岗位/角色/技能/MCP/记忆范围/自治级别/状态）、创建、详情/启停；详情含 **Guardrails 治理策略**（允许工具/禁止动作/最大自治/需审批动作）与 **版本快照/回滚**。
- `/squads`：专家小队——小队卡（mission/lead/members/orchestration/人工门禁/SLA/应用绑定）、发起运行（goal）、任务委派/成员消息/产物/人工审批；下方 **定时排班**（创建/启停/立即运行/删除）。
- `/digital-human`：legacy RTC 页面已下线，redirect 到 `/employees`。
- `/eval`：评测中心——数据集/评估器/运行列表、创建评测、报告/对比、评估器管理。
- `/experiments`：实验中心——实验卡（数据集/评估器/状态/变体/winner）、创建（2-8 变体）、启动、结果对比（accuracy/latency/cost/samples，winner 高亮）、删除。
- `/memory`：记忆与经验——Memory 列表/搜索/新增/删除评分、Experience 列表/搜索。
- `/observability`：可观测——工作区/Token/成本/错误率/MCP/评测总览卡片、24h SVG 趋势、服务健康。
- `/org`：组织与配额——组织信息、配额使用率、成员角色/邀请/移除。
- `/audit`：审计列表（403 无权限态 / 空态 / 错误态 / 示例降级）。

## 约定

- 错误两层模型：`error.code` 通用处理，`error.reason` 决定可操作文案；`request_id` 展示给用户。
- 所有关键元素带 `data-testid`（`login-*`、`workspace-*`、`destroy-*`、`model-*`、`provider-*`、`app-*`、`member-*`、`share-*`、`collab-*`、`version-*`、`diff-*`、`audit-row`）。
- 控制面不可达（网络/代理/真正 5xx）时使用 `lib/mock.ts` / `lib/app-collab-mock.ts` 示例数据并显示 DEV Banner；**绝不掩盖 401/403**。
- 写操作（ensure/start/ticket/destroy）自动带 `x-csrf-token`（从 `oc_csrf` Cookie 读取；`Secure` Cookie 需 localhost 打开）。
- 明暗主题持久化在 `localStorage.oc.theme`；跟随系统首次默认。
- 无外部字体/图标依赖，构建不依赖网络。

## 验收

```bash
cd apps/console && bun run build   # next build（已通过，12 路由）
```

### 真实控制面联调（:3101 → :4000）

```bash
# 控制面已在 4000；另开终端
cd apps/console && bun x next dev -p 3101
# 浏览器打开 http://localhost:3101（不要用 127.0.0.1）
# 或跑真实链路冒烟：
bun run smoke:real
```

`scripts/smoke-real.mjs` 用 Chrome CDP 验证真实控制面：dev-login → 工作区列表（真实数据、无 DEMO Banner）→ 详情 → access-ticket 打开新标签页 → 销毁二次确认（冷却期）→ 撤销销毁。截图写入 `scripts/evidence/`。可用 `CONSOLE_URL`、`CHROME_PATH`、`CDP_PORT`、`EVIDENCE_DIR` 覆盖。

> 2026-11-04 实测：**13/13 PASS**（控制面 4001；作品见 `scripts/evidence/01-login.png` … `06-after-cancel.png`）。当前本地 Docker 控制面为 `:4000`，命令中的端口按环境调整。

### 应用协同 UI 冒烟

```bash
cd apps/console && bun run build && bun x next start -p 3204
CONSOLE_URL=http://localhost:3204 bun run smoke:app-collab
```

`scripts/smoke-app-collab.mjs` 覆盖：登录 → /apps 列表 → 详情 → 添加/改角色/移除协作者 → 团队分享 → 协同抽屉发消息 → 生成提案 → diff → 批准生成新版本 → 回滚确认；截图写入 `scripts/evidence-app-collab/`。app-center 未启动时自动使用示例数据（DEV Banner）。

> 2026-11-08 实测：**13/13 PASS**（Next.js production build；app-center 暂不可用，示例数据路径）。

### 模型中心 UI 冒烟

```bash
cd apps/console && bun x next dev -p 3201   # API_PROXY_TARGET 指向模型中心后端
bun run smoke:models
````scripts/smoke-models.mjs` 覆盖：登录 → /models 卡片 → 添加抽屉（预设/字段）→ 保存 → 设为默认（active 高亮）→ 编辑 → 删除确认；截图写入 `scripts/evidence-models/`。2026-11-07 实测 **12/12 PASS**（针对最新控制面源码实例）。
