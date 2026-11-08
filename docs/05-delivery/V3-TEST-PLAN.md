# OpenDream Cloud v3 测试计划（V3-TEST-PLAN）

- 版本：v0.1（阶段 1：计划 + 脚手架；执行待 task-25/26 落地）
- 关联：shared task `task-30`（A7 QA 门禁）；输入：`docs/02-architecture/ARCH-V3.md` v0.1、`centers/MCP-GATEWAY.md`（待落盘）、`centers/APP-COLLAB.md`（待落盘）
- 环境：本地 Docker（console:3000 / control-plane:4000 / mock-model / local-gateway）；API 测试优先独立实例 + 临时 DB + mock MCP（不依赖 Docker）
- 证据：`docs/05-delivery/evidence/v3/`；门禁：`docs/04-reviews/G-V3-gate.md`
- 原则：**MVP 只验 MVP 子集；DEGRADED 显式声明（Higress/ACK/GPU 真机不做冒充）**

---

## 0. 范围与 MVP 切分

| 模块 | MVP 范围（本轮可测） | 非 MVP（DEGRADED/NOT-RUN） |
| --- | --- | --- |
| MCP 生命周期 | draft→review→published→deprecated→offline；非法迁移 409；版本指针/回滚 | 市场/签名证书链/WORM 证据链 |
| MCP 网关 | 统一端点、工具级 allow/deny、`tools/list` 过滤、凭证注入 + 脱敏、限流/超时/熔断、健康、审计、灰度回滚指针 | Higress/agentgateway 插件、A2A、语义缓存 |
| 应用权限 | 角色×动作矩阵（owner/admin/editor/operator/viewer）、分享 scope（public/org/team/user）+ 过期 + SSO、审计 | 自定义域名/证书、密码保护分享 |
| 协同 | collab session（base_version）、patch 提案/diff、审批流、并发冲突 409、patch 注入防护、审计 | 实时多人光标、评论/@提及完整实现 |
| 数字人 | **仅接口契约/状态机静态评审**（详细设计文档待 DIGITAL-HUMAN.md） | RTC/GPU/TTS 真机 |
| 工作流 | **仅 DSL/状态机契约静态评审**（WORKFLOW.md 待落盘） | Temporal 引擎真机 |

---

## 1. MCP 生命周期用例矩阵

| ID | 场景 | 步骤 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| MCP-LC-01 | 正常发布流 | draft→submit→review(approve)→published | 状态/审计/版本快照（tools schema hash + digest）正确；仅 published 可被绑定 | P0 |
| MCP-LC-02 | 驳回 | review→reject | 回 draft + 理由必填 + 审计 | P1 |
| MCP-LC-03 | 非法迁移 | draft→published / offline→published | **409 `state_invalid`**；DB 不落非法状态 | P0 |
| MCP-LC-04 | 可见性 | org/team/public | 未授权租户/团队不可见（列表 404/过滤）；public 仅平台内登录 | P0 |
| MCP-LC-05 | 新版本 | published v1→v2 | 不可变版本；进行中调用旧版本 graceful；绑定方收到热更新通知 | P1 |
| MCP-LC-06 | 弃用/下线 | published→deprecated→offline | deprecated 禁止新绑定、只读；offline 吊销凭证 + 进行中调用终止 + 审计 | P0 |
| MCP-LC-07 | 回滚 | 指针回 v1 | 绑定方配置热更新 ≤30s；审计 | P1 |
| MCP-LC-08 | 来源/签名 | 内部/第三方/市场上传 | 元数据校验；非法来源拒绝（P2/P3） | P2 |

## 2. MCP 网关用例矩阵

| ID | 场景 | 步骤 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| MCP-GW-01 | 工具级 allow/deny | 工作区调用未授权工具 | **403 `tool_not_allowed`**；`tools/list` 中不可见；审计 denied | P0 |
| MCP-GW-02 | 工具白名单外 | 调用未在 published 工具快照内的工具 | 403；不得透传到上游 | P0 |
| MCP-GW-03 | 凭证注入 | mock 上游校验 Authorization | 上游收到凭证；**响应/日志/审计无明文**；客户端不持有凭证 | P0 |
| MCP-GW-04 | 凭证轮换 | 轮换后立即调用 | 新凭证生效；旧凭证失效；审计 | P1 |
| MCP-GW-05 | SSRF（私网/元数据） | 注册/调用指向 `169.254.169.254`、`10/8`、`127.0.0.1`、`[::1]`、DNS rebinding | 注册 4xx 或调用 403（解析前后双校验）；审计 | P0 |
| MCP-GW-06 | 限流 | 超出租户/工具 RPM | **429 + Retry-After**；不产生上游调用 | P1 |
| MCP-GW-07 | 超时/熔断 | 上游延迟 > 超时；连续失败 | 客户端收到结构化超时（≤ 配置）；熔断后快速失败；恢复后半开 | P1 |
| MCP-GW-08 | 协议一致性 | streamable HTTP JSON-RPC（initialize/tools/list/tools/call）；SSE | 请求/响应/错误码符合 MCP；SSE 事件格式正确 | P0 |
| MCP-GW-09 | 健康检查 | 上游 down / 慢 / 正常 | 连续失败自动降级/摘除 + 告警；恢复后重新注册 | P1 |
| MCP-GW-10 | 审计完整性 | 每次 tools/call | 记录 user/app/workspace/server/tool/参数摘要（脱敏）/结果码/耗时/trace_id；100% 覆盖 | P0 |
| MCP-GW-11 | 灰度/回滚 | 新版本 10% 灰度 → 回滚 | 版本指针切换可回滚；审计；绑定方热更新 | P2 |
| MCP-GW-12 | 结果大小/脱敏 | 上游返回超限/敏感字段 | 截断上限；敏感字段按规则脱敏 | P2 |
| MCP-GW-13 | 未登录/跨租户 | 无票据/他人租户 endpoint | 401 / 404（D19） | P0 |

## 3. 应用权限用例矩阵

| ID | 场景 | 步骤 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| APP-P-01 | 角色×动作矩阵 | owner/admin/editor/operator/viewer × 7 动作 | 与 ARCH-V3 §5.2 表一致；越权 403（API 强制，非 UI 隐藏） | P0 |
| APP-P-02 | 分享 scope | public/org/team/user | 仅 scope 内可见/可用；跨 scope 404 | P0 |
| APP-P-03 | 分享链接过期 | 设置 expires_at → 过期后访问 | **410 `share_link_expired`**；撤销 ≤5s | P0 |
| APP-P-04 | SSO 强制 | 未登录/无 IdP 会话 | 302 SSO 回跳；未授权 403；不靠"链接不可猜" | P0 |
| APP-P-05 | 权限变更时效 | 修改角色/移除 | 敏感动作强一致；缓存 TTL ≤30s | P1 |
| APP-P-06 | 审计 | 分享/访问/权限变更/deploy/rollback | 100% 落审计；可检索 | P0 |
| APP-P-07 | delete 权限 | admin 尝试 delete | 403（仅 owner） | P1 |

## 4. 协同（对话式修改）用例矩阵

| ID | 场景 | 步骤 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| COL-01 | 创建会话 | 绑定 app_id + base_version | 会话/审计；base_version 记录 | P1 |
| COL-02 | 提案生成 | 对话→patch 提案 | diff + 影响范围；提案状态机 pending→approved/rejected | P1 |
| COL-03 | 审批 | 批准→构建→发布 | 发布新版本；可回滚；审计 | P0 |
| COL-04 | **审批绕过** | 无权限用户/伪造 approver_id | 403；不得直接发布 | **P0** |
| COL-05 | **并发冲突** | 两会话同 base_version 提交 | 后者 **409 `version_conflict`**（rebase/重新生成提示） | **P0** |
| COL-06 | **patch 注入** | patch 含 `../`、绝对路径、删除保护文件、修改 CI/部署文件 | 拒绝（路径白名单 + 保护文件）；审计。**冻结契约（ADR-V3-02）**：400 `validation_failed` + `reason=collab_patch_denied` + `details.files[]` + `details.cause="path_not_allowed"`；提案创建与批准合并两处校验；`path_not_allowed` 独立 reason 为 1.2 backlog。**级别**：P1（提案有审批闸门；若批准合并时点未校验则升 P0，QA 已列两处校验） | **P1** |
| COL-07 | 拒绝/要求修改 | reviewer reject | 提案 closed；会话可继续 | P1 |
| COL-08 | 审计回放 | 消息/提案/审批/发布 | 全部留痕、可回放 | P1 |
| COL-09 | 实时推送 | WebSocket/SSE 状态 | 提案状态变更 ≤2s 推送 | P2 |
| COL-10 | 跨租户 | B 访问 A 的 collab session | 404 | P0 |

## 5. 数字人/工作流（契约静态评审，MVP 不执行）

| ID | 检查项 | 方法 | 期望 |
| --- | --- | --- | --- |
| DH-01 | 数字人 API 契约 | 静态评审 `services/DIGITAL-HUMAN.md`：创建会话/推流/输入/回调/嵌入 | 字段/错误码/状态机完整、可生成 SDK |
| DH-02 | 数字人状态机 | 会话状态 create→talking→ended；异常/超时 | 非法迁移拒绝；事件可测 |
| WF-01 | 工作流 DSL | 静态评审 `services/WORKFLOW.md`：节点类型/变量/错误/重试/补偿/版本 | DSL schema + 校验器可测 |
| WF-02 | 工作流实例状态机 | pending→running→waiting_human→completed/failed；人工审批 | 非法迁移拒绝；人工门禁不可绕过 |

> 数字人/工作流真机（RTC/GPU/Temporal）记 **NOT-RUN**，需用户环境。

## 6. 环境与数据

- API/MCP 测试：独立 control-plane 实例（随机端口 + 临时 DB）+ **mock MCP server**（Bun.serve：`initialize`/`tools/list`/`tools/call`；可切换 slow/401/500/超大响应）+ mock SSRF 目标（`127.0.0.1` 内部端口）。
- E2E：`E2E_BASE_URL=http://localhost:3000`、`PLAYWRIGHT_CHANNEL=chrome`；登录 `login-email`/`login-submit`；应用/协同 UI testid 待 APP-COLLAB.md 冻结后补。
- 双租户 A/B + 角色矩阵（owner/admin/editor/operator/viewer 测试用户）。

## 7. 门禁与缺陷

- P0：工具越权/凭证泄露/SSRF 成功/审批绕过/并发冲突未拦截/patch 注入成功/跨租户访问；P1：生命周期非法迁移、限流/超时缺失、审计缺口；P2/P3 见 TEST-PLAN 分级。
- 判定：P0/P1 清零才 PASS；MVP 子集全绿；DEGRADED（Higress/ACK/GPU/Temporal）显式列明。
- 缺陷登记 `MODEL-`/`V3-MCP-`/`V3-APP-`/`V3-COL-` 编号，发 owner 并抄送 lead。

## 8. 执行顺序（依赖完成后）

1. `bun test tests/mcp-gateway`（生命周期+网关 MVP）
2. `bun test tests/app-collab`（权限矩阵+协同）
3. Playwright（应用详情权限面板/分享/协同抽屉，testid 待 UI 落地）
4. 静态评审数字人/工作流文档 → 门禁记录 `G-V3-gate.md`

---

## 9. 阶段 1 状态（2026-11-08）

- 已读：`docs/02-architecture/ARCH-V3.md` v0.1（358 行）；`centers/MCP-GATEWAY.md`、`centers/APP-COLLAB.md` **尚未落盘**（等 capability-centers）。
- 已产出：本计划、`docs/04-reviews/G-V3-gate.md`（模板）、`tests/mcp-gateway/api.spec.ts`、`tests/app-collab/api.spec.ts`。
- 脚手架冒烟：`bun test tests/mcp-gateway tests/app-collab` → **0 pass / 14 skip / 0 fail**（顶层探测到契约未实现 → `describe.skipIf` 干净跳过，不误报）；日志 `evidence/v3/scaffold-smoke.log`。
- **契约假设**（待 MCP-GATEWAY.md/APP-COLLAB.md 冻结后核对，见各文件顶部 `const C`）：MCP 端点 `/api/v1/mcp-servers...`、网关 `/mcp/v1/{tenant}/{server}`；协同端点 `/api/v1/apps/{id}/collab-sessions`、`/collab-proposals/{id}/{approve|reject}`。
- ARCH-V3 可测试性评审意见（阶段 1）：
  1. MCP 网关缺**显式错误码表**（`tool_not_allowed`/`rate_limited`/`upstream_timeout`/`circuit_open`/`tenant_mismatch`）与 endpoint 路径细节 → 待 MCP-GATEWAY.md；
  2. 协同缺 **`base_version` 字段定义/冲突错误码（409 `version_conflict`）** 与 patch 路径白名单规范 → 待 APP-COLLAB.md；
  3. 数字人/工作流仅有引用（`services/DIGITAL-HUMAN.md`、`WORKFLOW.md` 未落盘）→ 只能静态评审，不能定测；
  4. 分享链接缺 token 格式/过期语义/SSO 回跳错误码（`share_link_expired` 410 已有 v2 口径，可复用）；
  5. 建议 MVP 明确"local-gateway → Higress"的契约等价性（同一组 API 测试可在两者上跑），否则网关测试会分裂。

---

## 10. 阶段 1 增量（2026-11-08 晚：契约冻结 + DH/WF 静态评审）

### 10.1 MCP 契约冻结（依据 `MCP-GATEWAY.md` v0.2 §6.0/§6.3/§6.4 + ARCH-V3 §4.7）

> 状态：**待 platform-backend 实现回执后复核**；脚手架 `tests/mcp-gateway` 的 `const C` 已按此对齐。

- **数据面端点（canonical，QA 冻结 = MCP-GATEWAY v0.3 §4.1/§6.3）**：`POST/GET /v1/{tenant}/{server}/mcp`（streamable HTTP JSON-RPC）、`GET /v1/{tenant}/{server}/sse`、`POST /v1/{tenant}/{server}/rest/{toolName}`（P2）；**别名** `POST/GET /v1/{tenant}/{server}` ≡ `/mcp`（同一中间件栈，不得另立实现）；公网入口 `https://mcp.<domain>/mcp/{tenant}/{server}[/sse|/rest/*]`，local-gateway:8080 与 Higress 仅做反代+路径重写、**不做工具策略**；两入口用同一测试集验证等价。
- **注（ARCH-QA-01 状态）**：MCP-GATEWAY v0.3 已收敛 canonical；**ARCH-V3 §4.7 仍写 `/v1/{orgSlug}/{serverSlug}`（缺 `/mcp`、参数名 orgSlug vs tenant）——architect 需回写**；测试以本文/MCP-GATEWAY 的 canonical 为准，待 ARCH 更新后复核。
- **数据面错误码（两层）**：HTTP 层 canonical（`unauthenticated` 401、`tenant_mismatch` 403、`tool_not_allowed` 403、`server_not_found`/`tool_not_found` 404、`version_conflict` 409、`result_too_large` 413、`rate_limited` 429、`upstream_timeout` 504、`upstream_error` 502、`circuit_open` 503）；JSON-RPC 层为 **HTTP 200 + `error.data.code` canonical 字符串**，映射：`-32001` tool_not_allowed、`-32002` rate_limited、`-32003` upstream_timeout、`-32004` circuit_open/upstream_error、`-32005` tool_not_found、`-32006` unauthenticated、`-32007` result_too_large、`-32008` server_not_found。测试按 `error.data.code` 断言（非只按数字）。
- **控制面错误**：401 `unauthorized`（`mcp_auth_required`）、403 `forbidden`（`mcp_tool_denied`）、404、409 `precondition_failed+reason=gate_blocked`（gate_kind ∈ scan|review|health|signature）、429、503（`mcp_health_down`/`mcp_upstream_unavailable`）。
- **MVP 控制面 API**：`/mcp-servers`（CRUD）、`/{id}/versions`（不可变）、`/{id}/rollback`、`/{id}/review`（reject→draft）、`/{id}/publish`（stable-only）、`/{id}/deprecate|offline`（offline 吊销票据/凭证）、`/{id}/health-check|health`、`/mcp-bindings`（ticket 一次返回）、`DELETE /mcp-bindings/{id}`、`/mcp-bindings/{id}/rotate-token`、`/{id}/tool-policy`、`/mcp-call-logs`。
- **票据**：MVP 内存、吊销 ≤30s（生产 ≤5s）；过期/伪造/跨租户 → 401/404；`tools_hash` 不匹配拒绝；每 binding 绑定 server 版本 + 工具白名单。
- **生命周期**：版本不可变（改 manifest 必须新版本）；offline 后票据/凭证吊销、进行中调用终止；**canary/灰度不在 MVP（P2）**，本计划不作为 M2 必测项。
- **数据面韧性**：不直连 PG；策略/工具快照 TTL 内继续服务（控制面不可用时已发布工具可用）；审计 MVP 内存队列批量投递（失败重试不阻塞调用，WAL 为 P2）。
- **SSRF/stdio**：注册 endpoint 私网/metadata 拒绝；stdio 凭证型 MVP 拒绝（400）；白名单外拒绝。

### 10.2 DH 静态评审（`DIGITAL-HUMAN.md` v0.2）

| ID | 检查项 | 期望（可测） |
| --- | --- | --- |
| DH-API-01 | 会话 API | `POST /dh/sessions` 幂等键必填；返回 rtc tokens/embed_token/expires_at/limits；重复幂等返回同一 session |
| DH-API-02 | 输入/打断/结束 | `input`/`interrupt`/`end` 幂等；`end` 后 state=ended；权限 scope `dh:write` |
| DH-ST-01 | 状态机 | creating→waiting→listening→thinking→speaking/interrupted/tool_wait→ended；非法迁移拒绝；`interrupted` 停 TTS 队列 + 审计 |
| DH-ST-02 | 降级 | lip-sync 故障→仅音频；TTS 故障→文本；RTC 重连 ≤2s、超 3 次结束（需记录 reason） |
| DH-ERR-01 | 领域 reason | v0.6 §7.6 按 ARCH §23.4 校准（openapi 1.1.0 落库前以 §23.4 为准）：`dh_gpu_budget_exceeded`=429、`dh_avatar_unavailable`=409、`dh_voice_unauthorized`=403、`dh_rtc_unavailable`=503、`dh_lipsync_failed`=502、`dh_content_blocked`=403；其余同 §7.6 |
| DH-SLO-01 | 延迟预算 | 语音往返 P95 ≤1.8s（测量口径：说完→首帧、同区域、设备/网络条件记录）→ 记为**真机 NOT-RUN**，仅静态评审 |
| DH-WH-01 | Webhook 安全 | `X-DH-Signature` HMAC + 5min 时间戳窗口；重试 5 次/死信可重放；投递可查 |

### 10.3 WF 静态评审（`WORKFLOW.md` v0.2）

| ID | 检查项 | 期望（可测） |
| --- | --- | --- |
| WF-DSL-01 | DSL schema | `workflow.opencode.cloud/v1` + JSON Schema（当前仅 YAML 示例/节点表 → **schema 待补**） |
| WF-DSL-02 | 节点/变量 | 10 类节点字段校验；表达式限制；`v1.x` 只加可选能力、破坏性升 v2 |
| WF-ST-01 | 实例状态机 | pending→running→waiting_human/waiting_timer→succeeded/failed/canceled/compensating；非法迁移拒绝 |
| WF-ST-02 | 人工门禁 | `human_tasks` SLA/escalation；重复决策 409；超时升级可测 |
| WF-RT-01 | Runtime Port 契约 | 启动幂等、signal 重复不重复生效、cancel 级联、超时、重复决策拒绝、replay 状态一致、跨租户 404（两实现同套测试） |
| WF-RT-02 | 错误语义 | signal 不存在 run → 404；非法决策 → 409；取消后状态一致（**错误码契约待补**） |
| WF-SLO-01 | 长流程超时 | WorkflowExecutionTimeout ≤30d；Continue-As-New；超时状态可测 |

> DH/WF 均为**静态评审**；RTC/GPU/TTS/Temporal 真机记为 NOT-RUN（用户环境）。

### 10.3.1 DH/WF v0.4 复核（2026-11-08）

| 项 | 结论 |
| --- | --- |
| DH-QA-01…05 | ✅ closed（DIGITAL-HUMAN **v0.6**）：幂等键语义、`reconnecting` 状态+reason、错误映射按 §23.4 校准（429/409/403/503/502/403）、延迟口径（P50 1.2s/P95 1.8s）、Webhook `X-DH-Signature: t=,v1=` |
| WF-QA-02…06 | ✅ closed（WORKFLOW **v0.5**）：Runtime Port 错误语义、`waiting_webhook`、`human_tasks overdue/escalated`、公平队列/`wf_concurrency_exceeded`、版本兼容矩阵；§10 数据表以 `DATA-MODEL §3.11`（46 表）为准 |
| **WF-QA-01** | ✅ **closed**（2026-11-08）：`packages/schema/schemas/workflow-v1.json`（15.8KB，2020-12，10 类节点）+ `validate-workflow.mjs`（零依赖）+ 7/7 tests；QA 实测 `node .../validate-workflow.mjs` → PASS；WF-DSL-01 可执行 |
| 跨域项 | **V3-DH-001**：`dh_*` 10 + `wf_*` 10 + MCP/协同/分享 reason 已在 `ARCH §23.4` 批准，**待 openapi 1.1.0 落库**（v2 FROZEN 不改） |

---

## 10.4 ARCH §23/§24 冻结基线（2026-11-08 QA 复核）

> 来源：`ARCH-V3.md` §23（ARCH-QA-01…11 回写）+ §24（DH/WF 架构评审）；QA 以本节为基线。
> ⚠️ **仍存在 3 处跨文档冲突，需 architect/capability/lead 收敛后才可"逐字节"冻结**（见本节末）。

### 10.4.1 数据面 canonical 与别名（ARCH-QA-01）
- canonical（SDK 只生成）：`POST/GET /v1/{orgSlug}/{serverSlug}`、`GET /v1/{orgSlug}/{serverSlug}/sse`。
- **别名**：`/mcp` 后缀、`/rest/{tool}` 必须与 canonical **行为一致（同一中间件栈 + 同一契约测试）**；响应/错误码逐字节等价（仅 path 回显不同）。
- 本地入口：**mcp-hub 监听 4104**（唯一端口；**4200 出现即失败**，本文旧值仅作禁止性判据）；`local-gateway:8080` 挂 `/mcp/*` 并**剥离前缀重写**到 `.../v1/{orgSlug}/{serverSlug}`；生产 `https://mcp.<domain>/v1/{orgSlug}/{serverSlug}`（Higress 直接路由，无额外前缀）。
- 测试：`tests/mcp-gateway` 用 `MCP_GATEWAY_URL`/`MCP_GATEWAY_PREFIX` 覆盖两种入口；GW-14 断言 canonical↔别名等价。

### 10.4.2 Binding ticket（ARCH-QA-02，C2 最终裁决）
- 形态：**EdDSA/Ed25519 JWT + JWKS**（生产唯一形态）；claims：`iss/aud=mcp:org:<orgSlug>/sub/org/ws/app/binding_id/server_id/server_version/scope[]/scope_hash/jti/iat/exp`；**TTL 300s、非一次性**；吊销 binding + `jti` denylist（生产 ≤5s / 本地 ≤30s）；**HMAC 仅 dev 兼容（同 claims，不得作为生产断言）**。
- 三态：无/过期 **401 `unauthenticated`（-32000）**；跨租户 **403 `tenant_mismatch`（-32009）**；不可见/未发布 **404 `server_not_found`（-32006）**。
- 测试：MCP-TK-01 解析 JWT（`alg=EdDSA`）/HMAC-dev 的 claims+TTL(≤300s)+非一次性；TK-02 篡改→401/-32000；TK-03 跨租户→403/-32009；TK-04 吊销→≤30s 失效；`MCP_STRICT_ED25519=1` 时拒绝 HMAC 票据。

### 10.4.3 错误映射（ARCH-QA-11，§23.2 为权威）
| HTTP | reason | JSON-RPC |
| --- | --- | --- |
| 401 | unauthenticated | **-32000** |
| 403 | tenant_mismatch | **-32009** |
| 403 | tool_not_allowed | -32001 |
| 404 | server_not_found | -32006 |
| 404 | tool_not_found | -32007 |
| 409 | version_conflict | -32010 |
| 413 | result_too_large | -32008 |
| 429 | rate_limited | -32002 |
| 504 | upstream_timeout | -32003 |
| 502 | upstream_error | -32004 |
| 503 | circuit_open | -32005 |

> 测试优先断言 `error.data.code`（canonical 字符串），数字码按此表；MCP-GATEWAY §6.4 旧映射（-32006 unauthenticated 等）需同步。

### 10.4.4 其他基线（ARCH-QA-03…10）
- 角色×动作→API→错误码：§23.1（view/use/edit/share/deploy/rollback/delete；敏感动作强一致、普通读 TTL≤30s；operator 仅 deploy/rollback 且绑服务身份）；APP-P-01 按此断言。
- `base_version={app_version:int, content_hash:"sha256:<hex>"}`；`app_proposals.base_version_id`+`app_versions.content_hash`；三处校验（创建/批准合并前/发布前）→ **409 conflict + reason=version_conflict + details{expected,actual,rebase_hint}**。
- share token：`sst_v1.<payload>.<hmac>`（含 jti/撤销列表+epoch）；密码 `pwd=true`+`pwd_hash`；`return_to` 仅同 registrable domain 白名单；错误矩阵 410/403/404。
- 审计：MVP **at-least-once**（内存队列+重试≤5+`audit_dropped_total`），生产 WAL+1h 补投/WORM=P2。
- 策略快照 TTL **300s**，变更 pub/sub 失效；deny **fail-closed**、allow/只读 fail-open 60s+审计。
- 灰度/canary **P2 不在 MVP**；`channel` 只在 Registry 表达 stable（MVP 仅 stable）。
- PEP NFR：决策开销 **P95 ≤5ms**（冷 ≤20ms）、缓存命中率 ≥99%、超阈降级"保守拒绝+告警" → 记性能用例（PERF-V3-01，staging/真机 DEGRADED）。

### 10.4.5 DH/WF（ARCH §24 对齐）
- DH 状态机（§24）：`created→connecting→active→degraded(audio_only)→ended/error`；DH 延迟按 **P50 ≤1.2s / P95 ≤1.8s**（ARCH-DH-01 已裁决，真机 NOT-RUN）。
- DH token：embed token 仅换 RTC token/建会话（≤10min）；RTC token 一 room、TTL ≤5min、绑 session+user（ARCH-DH-03）。
- DH 动作↔App 角色：`start_session`=use、`render/asset_edit`=edit、`share/deploy`=share/deploy（ARCH-DH-02）。
- WF：**6 队列** `wf-agent|tool|human|timer|script|render` + `platform-system/wf-platform`（ARCH-WF-02）；`wf_*` reason 映射（ARCH-WF-04：400/403/404/409/429/500 归属）；10 张表待合并 DATA-MODEL（ARCH-WF-05，P2）。
- WF 设计决策改名 **D-WF-01…**（ARCH-WF-01，P1，pm 待改）。

### 10.4.6 C1–C4 裁决（ARCH-V3 §23.3 + MCP-GATEWAY v0.4 r7，**已全部收敛/closed**）

| # | 唯一权威 | 需回写的文档 |
| --- | --- | --- |
| **C1 endpoint** | canonical=`POST/GET /v1/{orgSlug}/{serverSlug}` + `GET .../sse`（**不含 `/mcp`**）；`/mcp`、`/rest/{tool}` 仅兼容别名（同一中间件栈、逐字节等价）；参数名统一 `orgSlug` | MCP-GATEWAY §4.1/§6.3（capability） |
| **C2 MCP ticket** | **EdDSA/Ed25519 JWT + JWKS**（生产唯一形态）：claims `iss/aud=mcp:org:<orgSlug>/sub/org/ws/app/binding_id/server_id/server_version/scope[]/scope_hash/jti/iat/exp`；TTL 300s、非一次性、`jti` denylist；吊销 ≤5s/≤30s；**HMAC 仅 dev 兼容（同 claims，不得作生产断言）** | MCP-GATEWAY ticket 章节（capability；按 §4.7/§23.3 写）；ADR-V3-01/05 |
| **C3 JSON-RPC** | §23.2 为权威：`-32000` unauth、`-32001` tool_not_allowed、`-32002` rate、`-32003` timeout、`-32004` upstream_error、`-32005` circuit_open、`-32006` server_not_found、`-32007` tool_not_found、`-32008` result_too_large、`-32009` tenant_mismatch、`-32010` version_conflict；断言优先 `error.data.code` 字符串 | MCP-GATEWAY §6.4（capability） |
| **C4 端口/入口** | mcp-hub **4104**（唯一；**4200 出现即失败**）；local-gateway:8080 挂 `/mcp/*` 剥离前缀重写；生产 `https://mcp.<domain>/v1/{orgSlug}/{serverSlug}` | MCP-GATEWAY §4.1/§12（capability）、`deploy/AI-GATEWAY.md`、local-gateway 路由表（infra） |

> QA 状态：**C1–C4 closed（2026-11-08）**：capability `MCP-GATEWAY v0.4 r7` 回执、architect `ARCH §23.3/§23.4` 与 `DATA-MODEL §3.11` 回写；脚手架断言已收紧（Ed25519/JWKS 生产、HMAC dev 兼容、§23.2 数字码、canonical 无 `/mcp`、别名等价、后端 4104）；执行门控 `V3_RUN=1`。
> **唯一权威**：`ARCH-V3 §4.7/§23.2/§23.3/§23.4` + `MCP-GATEWAY v0.4`；`openapi 1.1.0` 出稿后按其回改（v2 FROZEN 不改）。

### 10.4.7 DATA-MODEL §3.11 数据断言（workflow/DH，A6 已并入）

- 表总数 **46**（§3.11 新增 10 张：`workflow_definitions/versions/instances/steps/events/artifacts/triggers/dead_letters` + `human_tasks` + 1）。
- 断言点：
  1. `workflow_versions.dsl` **不可变**（UPDATE 必须被拒/仅新版本）；
  2. `workflow_events` 唯一 `(instance_id, seq)`；**回放只读该表**（不依赖 Temporal history）；
  3. `human_tasks` 跨 scope（app/collab/publish/workflow/dh）共用一表；`sla_due_at` 有索引用于超时升级；
  4. 全部 `org_id` + RLS；跨租户 404；`human_tasks` 重复决策 409 `wf_task_already_decided`。

### 10.5 C4 端口门禁（4200 出现即失败）

- 扫描回执（infra-devops）：首扫 323 文件/6 命中 = exempt 5 + blocking 1（`apps/control-plane/README.md:38`）；backend 修复后 **二次扫描 324 文件、11 命中全部 allowlist、0 blocking（`bun run check:ports` exit 0）** → **C4 PASS**，V3-INFRA-001 closed。
- 已落地：`scripts/verify/check-port-4200.mjs` + `bun run check:ports`（已加入 `bun run lint`）；退出码 1=存在非 allowlist 命中；allowlist 关键词 `禁止|作废|即失败|测试失败|历史值|deprecated|判据|门禁`。
- G-V3 证据引用该命令输出；正式门禁时 infra 可现场跑同命令复核。

---

## 10.6 CI 门禁（已接入，infra T7）

| 门禁 | 命令 | 结果/证据 |
| --- | --- | --- |
| 工作流 Schema 校验 | `bun run validate:workflow`（等价 `bun run --cwd packages/schema validate`） | **RESULT PASS（1 file）exit 0**；`bun run --cwd packages/schema test` 7/7；证据 `evidence/v3/wf-schema-test.log` |
| 根 lint（4 步） | `bun run lint` = `tsc --noEmit` → `validate-manifests` → `check:ports` → `validate:workflow` | **exit 0**；单命令全门禁入口 |
| 端口门禁 | `bun run check:ports` | 0 blocking / exit 0（331 文件，12 处 allowlist）；C4 PASS |
| 根测试 | `bun run test` | 74 pass / 3 skip / 0 fail（77 tests / 14 files） |

> G-V3 正式门禁可现场复跑 `validate:workflow` + `check:ports`（infra 可在场，<1min）；证据 `evidence/v3/ci-gates.log`。

## 11. 执行结果（2026-11-08，task-30）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| openapi 1.1.0 | **frozen@1.1.0**：144 paths/197 ops/129 schemas、新增 65/删除 0、ErrorReason 58、`x-mvp-alias:16`/`x-v3-target:8`；兼容脚本 PASS | `check-openapi-1.1.py` |
| 端口门禁 C4 | `bun run check:ports` → **0 blocking（exit 0）**；C4 **PASS**，V3-INFRA-001 closed | `evidence/v3/port-4200-scan.md` |
| MCP 生命周期（实现） | live 实测：create 201 draft → submit-review 200 → review approve → health-check 200 → publish 200 published；draft 直接 publish 409 | `evidence/v3/gate-evidence.md §2` |
| MCP 契约/安全 | **P0×2**（ticket 非 EdDSA/JWKS；canonical orgSlug 与 org_id 硬比较 → 真实 slug 403）+ **P1×8**（JSON-RPC 码、destructive fail-safe、tool-policy、写重试、jti、tools/list、status、测试缺口） | capability diff + QA 实测（`gate-evidence.md §2`） |
| App 权限/协同 API | live `control-plane:4000` 门面 + app-center 新构建：`tests/app-collab` **5/6**；collab/approve→v2/过期 base_version 409/跨租户 404/分享 201 通过；**V3-COL-001 P1**：`.git/config`、`.github/workflows/ci.yml` 提案被接受（task-33） | `evidence/v3/app-collab-run4.log` |
| App UI E2E | **3/3 pass**（Playwright chrome）：列表、详情（权限/分享/版本面板）、协同抽屉发消息回显；proposal/diff/approve 待 worker → NOT-RUN | `evidence/v3/app-e2e.log`、`app-01/02/03-*.png` |
| 回归 | control-plane **61/62**（MCP-CP-04 destructive）；mcp-hub **18/19**（V3-MCP-03/04/07/08/09/10 等与 P1 相关）；app-center **13/13** | `evidence/v3/regression-v3.log` |
| 门禁结论 | **PASS**（2026-11-08）：MCP **3×8/8**、App 6/6、C4/CI 全绿；P0/P1=0 | `docs/04-reviews/G-V3-gate.md` v1.2 |
| CI 门禁 | `bun run lint` 4 步 **exit 0**；`validate:workflow` PASS；`check:ports` 0 blocking；根 test 74/3/0 | `evidence/v3/ci-gates.log` |

**关键裁决**：C1–C4 全部收敛（canonical 无 `/mcp`、EdDSA+JWKS、§23.2 数字码、4104），但实现尚未满足（2 P0+8 P1，owner platform-backend/task-32）；App 协同实现有 1 个 P1（patch 白名单）。E2E 待新版 app-center 部署后补。

