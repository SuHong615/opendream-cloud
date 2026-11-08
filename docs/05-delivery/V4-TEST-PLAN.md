# V4 测试计划（MCP 管理 / App 协同 worker / Workflow / 数字人 L1）

- 版本：v0.1（阶段 1：计划 + 脚手架；实现回执后执行）
- 关联：task-44（QA）；契约 `openapi 1.1.0 frozen`（DH 9 ops + WF 15 ops）、`MCP-GATEWAY v0.5`、`DIGITAL-HUMAN v0.6`、`WORKFLOW v0.5`、`ADR-V3-02/04`
- 环境：本地 Docker（console:3000 / control-plane:4000 / app-center:4103 / mcp-hub:4104 / local-gateway:8080）；workflow-engine 与 dh-control 端口待实现回执确认
- 证据：`docs/05-delivery/evidence/v4/`；门禁：`docs/04-reviews/G-V4-gate.md`
- 运行门控：`V4_RUN=1`（未就绪时 suite 干净 skip，不误报）

---

## 1. MCP 管理端点（V4 补全，openapi 1.1.0）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| MCP-ADM-01 | 版本列表/详情 | GET `/mcp-servers/{id}/versions`、`/mcp-versions/{versionId}` 200；version:int + tools[] + semver | P0 |
| MCP-ADM-02 | 版本 review/publish/yank | 状态机合法迁移；非法 409；publish 后 stable_version 更新；yank 不影响已绑定（或按契约） | P0 |
| MCP-ADM-03 | channels | GET/PUT channels（stable/canary）；MVP 仅 stable，canary 拒绝或 400 | P1 |
| MCP-ADM-04 | tools 目录 | GET tools 与网关 `tools/list` 过滤后一致（控制面目录 ≠ 数据面可见集） | P1 |
| MCP-ADM-05 | 权限 | member 写 → 403；跨 org → 404；未登录 → 401 | P0 |
| MCP-ADM-06 | 生命周期 UI | `/mcp` 页面：列表/详情/版本/工具/策略/健康；data-testid 待 UI 落地 | P1 |

## 2. App 协同 worker 全链路

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| COL-W-01 | 消息触发 worker | 用户消息 → worker 生成 proposal（轮询 messages/proposals ≤90s）；proposal 含 summary/hash/files/diff | P0 |
| COL-W-02 | 提案 diff 预览 | GET proposal 返回 files/diff；UI `collab-proposal`/`diff-modal` 可见 | P1 |
| COL-W-03 | 批准 → 版本 | approve（expected_base_version）→ 新版本 v+1；diff 应用；审计 | P0 |
| COL-W-04 | 拒绝/要求修改 | reject → proposal closed；可继续会话 | P1 |
| COL-W-05 | 并发/过期 base | 过期 → 409 `version_conflict` + rebase 提示 | P0 |
| COL-W-06 | worker 不可用 | 超时/失败 → 消息仍落库、proposal 不生成、UI 提示"稍后查看"（不 5xx、不白屏） | P1 |
| COL-W-07 | 安全 | patch 白名单（ADR-V3-02 两处校验）；跨租户 404；viewer 403 | P0 |

## 3. Workflow Engine（DSL/发布/运行/人工/补偿）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| WF-DSL-01 | DSL 校验 | 合法（cs-ticket）创建成功；非法（未知节点/环/缺 needs）→ 400 `wf_dsl_invalid` | P0 |
| WF-DSL-02 | 版本不可变 | workflow_versions.dsl UPDATE 拒绝/仅新版本；发布后不可变 | P0 |
| WF-PUB-01 | 发布/版本 | 定义→版本→发布；旧版本实例继续；新实例用新版 | P1 |
| WF-RUN-01 | 启动/幂等 | POST instances（idempotency_key）；重复→同一 run；状态 pending→running | P0 |
| WF-RUN-02 | 状态机 | running→waiting_human/waiting_timer→succeeded/failed/canceled/compensating；非法迁移拒绝 | P0 |
| WF-HUM-01 | 人工任务 | listHumanTasks/completeHumanTask；重复决策 409 `wf_task_already_decided`；SLA overdue/escalated | P0 |
| WF-HUM-02 | 审批门禁不可绕过 | 无权限/错误 assignee → 403；跳过人工节点不可达 | P0 |
| WF-CMP-01 | 补偿 | 节点失败→compensating→补偿成功→failed/canceled；补偿失败→事件+dead_letter | P1 |
| WF-EVT-01 | 事件/回放 | `workflow_events` 唯一 (instance_id,seq)；replay 只读 events | P1 |
| WF-SEC-01 | 越权/注入 | 跨租户 404；DSL 表达式注入（模板注入/命令注入）拒绝；script 节点 network:none | P0 |
| WF-API-01 | Runtime Port 契约 | 启动幂等、signal 重复不重复生效、cancel 级联、超时、重复决策拒绝、replay 一致 | P0 |

## 4. 数字人 L1（会话/消息/SSE/错误/Webhook）

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| DH-SES-01 | 创建会话 | POST `/dh/sessions`（mode realtime/rtmp/offline）；返回 session_id/rtc tokens/expires_at/limits；幂等同键同 body→200 原 session | P0 |
| DH-SES-02 | 输入/打断/结束 | input text；interrupt；end 幂等；ended 后 input → 409/410 | P0 |
| DH-SSE-01 | SSE 事件 | GET events：`session.state`/`reply.text.delta`/`error`/`usage`；Last-Event-ID 续传；无权限 401/403 | P0 |
| DH-SSE-02 | SSE 越权 | 他人会话 event stream → 404/403；embed token 仅换 RTC token（不可直调 API） | P0 |
| DH-ERR-01 | 错误映射 | quota 429 `dh_*` reason；avatar unavailable 409；embed token invalid 401 | P1 |
| DH-WH-01 | Webhook | `X-DH-Signature: t=,v1=`（`{timestamp}.{raw_body}`）；错签 401；event_id 去重；重试/死信 | P0 |
| DH-TK-01 | Token 语义 | embed token ≤10min 仅换 RTC；RTC token 一 room、TTL≤5min、绑 session+user | P1 |
| DH-L1-01 | L1 文本/语音 MVP | 无 GPU 降级：audio_only；延迟 P50≤1.2s/P95≤1.8s 真机 NOT-RUN | P2 |

## 5. Control-plane 代理

| ID | 场景 | 期望 | 级别 |
| --- | --- | --- | --- |
| CP-PX-01 | 代理转发 | `/api/v1/workflows*`、`/api/v1/dh/*` 代理到对应服务；方法/路径/权限头正确 | P0 |
| CP-PX-02 | 错误透传 | 下游 5xx/超时 → 502/504（不 500 崩溃）；错误两层模型 | P1 |
| CP-PX-03 | 鉴权 | 未登录 401；跨 org 404（D19）；CSRF 写操作 403 | P0 |

## 6. UI E2E

| ID | 场景 | 期望（testid） |
| --- | --- | --- |
| UI-WF-01 | `/workflows` 列表/详情 | definitions 列表、实例状态、human task 审批按钮 |
| UI-WF-02 | 运行实例 | 启动→状态轮询→人工任务批准→完成 |
| UI-DH-01 | `/digital-human` 会话 | 创建会话、消息输入、SSE 消息流、结束 |
| UI-MCP-01 | `/mcp` 管理 | 版本/工具/策略/健康；发布/下线 |
| UI-APP-01 | App 协同 | 消息→proposal→diff→approve（worker 就绪） |

## 7. 安全矩阵（P0 重点）

- Workflow：节点越权（跨租户/无权限触发）、DSL 注入（表达式/命令/script 网络）、人工审批绕过、事件伪造。
- DH：会话越权（他人 session/SSE）、embed token 提权、Webhook 伪造（HMAC）、RTC token 重放。
- MCP 管理：member 写 403、跨 org 404、未发布版本不可绑定、yank 后新绑定拒绝。

## 8. 环境与门禁

- 本地：workflow-engine/dh-control 端口待回执；mock 外部依赖（Temporal/GPU/RTC NOT-RUN）。
- 判定：P0/P1=0 → PASS；否则 PASS-WITH-ACTIONS/REJECT；DEGRADED：无 GPU/RTC/Temporal 真机、worker AI 真调用（可用 mock proposal 降级）。
- 证据：`evidence/v4/{mcp-admin,workflow,dh,collab-worker,e2e,regression}.log`。

---

## 9. G-V4 契约验收口径（architect `G-V4-CONTRACT.md` §7，QA 直接引用）

| # | 检查 | 方法/期望 |
| --- | --- | --- |
| 1 | 契约未变 | `git diff docs/02-architecture/openapi.yaml` 无改动（1.1.0 frozen） |
| 2 | canonical 路由覆盖 | `extract-routes.py` + `check-routes-vs-openapi.py --known-gaps G-V3-known-gaps.json`；missing 仅剩台账 open 项 |
| 3 | 别名等价 | `/workflows`↔`/workflow-definitions`；`/workflow-runs`↔`/workflow-instances`；DH `messages`↔`/input`；`end`↔`DELETE`；同中间件栈逐字节等价 |
| 4 | 门面行为 | 未登录 401 / 无 CSRF 写 403 / 跨租户 404 / 上游停 **502 `upstream_error`** |
| 5 | 错误层 | `code`∈16 通用、`reason`∈58（§23.4）、含 `request_id`（抽样 10 写操作） |
| 6 | 审计 | 写操作 100% 有 `audit_logs`（proxy action） |
| 7 | SSE | `Last-Event-ID` 续传不丢不重 |
| 8 | 安全 | `/advance`、`/dh/webhooks` 不公网裸奔（网关白名单/鉴权）；上游仅内网 |

**known-gaps 政策**：56 项台账（in_progress/open）由 architect 用 `tools/known-gaps-status.py` 回填；**P0/P1 端点不得入台账**。G-V4 预期：上游落盘满足 §7 → **PASS-WITH-ACTIONS**（MVP extensions/M2-backlog 非阻塞）。

---

## 11. 执行结果（2026-11-08，task-44）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| Workflow API | ✅ 6/6（DSL/不可变/幂等/人工/CSRF 403/注入 400/跨租户 404） | `evidence/v4/api-final.log` |
| 数字人 L1 API | ✅ 6/6（会话/输入/SSE 越权/webhook/错误层/embed） | 同上 |
| MCP 管理 API | ✅ 6/6（版本/review+publish+yank/channels/tools/权限） | 同上 |
| App 协同（含 worker） | ✅ 7/7（COL-W-01 自动提案） | `evidence/v4/app-collab-worker.log` |
| UI E2E | ✅ 2/2（workflows / digital-human） | `evidence/v4/e2e.log`、`01-workflows.png`、`02-digital-human.png` |
| 路由 diff（strict） | ✅ implemented 241 / missing 26（全 known-gaps）/ unexpected 0 / PASS | `evidence/v4/routes-final.log`、`G-V4-CONTRACT-CLOSURE.md` |
| known-gaps | ✅ closed 30 / open 26（M2 1 + M3 1 + M2-backlog 24；P0/P1 未入台账） | `G-V3-known-gaps.json` |
| MVP extensions | ✅ 38 extensions + 2 blocked 登记（`G-V4-mvp-extensions.json`，1.2 收编） | `G-V4-CONTRACT-CLOSURE.md` |
| **门禁结论** | ✅ **PASS**（P0/P1=0；A-V4-1/2/3 closed） | `docs/04-reviews/G-V4-gate.md` v0.3 |

**DEGRADED**：DH 真实 RTC/GPU/TTS/SLO、Temporal 生产引擎、worker mock LLM、Higress/ACK、审计故障注入。
