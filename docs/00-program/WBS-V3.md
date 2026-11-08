# OpenDream Cloud v3 WBS（MCP 为核心）

- 版本：v0.1（2026-11-08）
- 关联：[ARCH-V3.md](../02-architecture/ARCH-V3.md)、[PRODUCT-MODULE-PLAN.md](PRODUCT-MODULE-PLAN.md)
- 规则：架构优先评审（M1），设计与实现并行；QA 门禁在 MCP/App 增量后执行；所有任务写入 shared task board。

---

## 0. 里程碑

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| **M1 架构评审（现在）** | ARCH-V3 v0.1 + 主架构图 + WBS | 用户/architect 评审通过；ADR 定稿 |
| M2 MCP 网关 MVP | 生命周期/代理/工具策略/凭证/审计 + opencode 下发 | `mcp-hub` 单测 + 本地 E2E；QA API 通过 |
| M3 应用协同 MVP | 应用 ACL/分享 + 协同会话/提案/审批 + UI | 权限矩阵测试 + Playwright 协同用例 |
| M4 数字人/工作流详细设计 | DIGITAL-HUMAN.md / WORKFLOW.md 评审 | 设计评审 PASS；接口契约冻结 |
| M5 网关生产化 | Higress/agentgateway 接入模板 + 7x24 | 配置可部署；压测/故障演练 |
| M6 v3 门禁 | G-V3 gate | P0/P1=0；DEGRADED 记录 |

---

## 1. WBS 总表

| ID | 工作包 | 子任务 | Owner | 产出/验收 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| **A0** | 总体架构 | A0.1 分层/C4/部署/数据流 | architect + lead | ARCH-V3.md + PNG/SVG | — |
| | | A0.2 ADR（网关/协同/数字人/工作流） | architect | 4 条 ADR | A0.1 |
| | | A0.3 容量/失败模式/安全边界 | architect | 文档章节 | A0.1 |
| **A1** | MCP 生命周期 | A1.1 状态机/版本/审核/签名 | capability-centers | MCP-GATEWAY.md | A0 |
| | | A1.2 Registry/Policy 数据模型 + API | platform-backend | migration + routes + 单测 | A1.1 |
| | | A1.3 审核/发布/弃用/下线流程 | platform-backend | API + 审计 | A1.2 |
| | | A1.4 健康检查/自动摘除 | platform-backend | 健康任务 + 指标 | A1.2 |
| **A2** | MCP 网关 | A2.1 统一端点/协议适配（HTTP/SSE/stdio） | platform-backend | gateway proxy | A1 |
| | | A2.2 工具级 PEP/白名单/限流/熔断 | platform-backend | policy engine + 单测 | A2.1 |
| | | A2.3 凭证托管/注入/SSRF 防护 | platform-backend + infra | Secret/KMS 接入 | A2.1 |
| | | A2.4 审计/Trace/指标 | platform-backend + qa | audit + OTel span | A2.1 |
| | | A2.5 opencode `mcp.servers` 下发/热更新 | platform-backend | config 生成 + E2E | A2.2 |
| **A3** | 应用中心权限 | A3.1 角色/动作矩阵 + ACL 数据模型 | platform-backend | migration + API | A0 |
| | | A3.2 分享（public/org/team/user、有效期、SSO） | platform-backend | share token + 校验 | A3.1 |
| | | A3.3 权限 UI（协作者/分享设置/审计） | web-console | 页面 + testid | A3.1 |
| **A4** | 应用协同 | A4.1 协同会话模型（app_id/base_version） | platform-backend | API + 冲突检测 | A3.1 |
| | | A4.2 patch 提案/diff/审批/发布 | platform-backend | API + 状态机 | A4.1 |
| | | A4.3 对话式修改 UI（opencode 会话） | web-console | 抽屉 + diff + 版本 | A4.2 |
| | | A4.4 安全：目录白名单/CI 门禁/审计 | platform-backend + qa | 测试用例 | A4.2 |
| **A5** | 统一 AI 网关 | A5.1 Higress vs agentgateway 选型/ADR | infra-devops | AI-GATEWAY.md | A0 |
| | | A5.2 入口拓扑/TLS/SSO/租户路由 | infra-devops | 配置模板 | A5.1 |
| | | A5.3 MCP/模型/应用路由配置 | infra-devops | Gateway API 样例 | A5.2 |
| | | A5.4 7x24（HPA/PDB/Watchdog/备份/灰度） | infra-devops | 运行手册 | A5.2 |
| **A6** | 数字人（并行） | A6.1 产品/场景/资产模型 | pm-research | DIGITAL-HUMAN.md | A0 |
| | | A6.2 实时链路（ASR→LLM→TTS→口型→RTC） | pm-research + infra | 时序/接口 | A6.1 |
| | | A6.3 对外 API/SDK/iframe/企业集成 | pm-research | API 契约 | A6.1 |
| | | A6.4 GPU/成本/7x24/里程碑 | infra-devops | 容量与成本 | A6.2 |
| **A7** | 工作流业务层 | A7.1 DSL/节点/变量/错误补偿 | pm-research + architect | WORKFLOW.md | A0 |
| | | A7.2 SDLC 模板与门禁/产物 | pm-research | 模板 + 示例 | A7.1 |
| | | A7.3 通用模板（客服/审批/数据/运维/接待） | pm-research | 模板 | A7.1 |
| | | A7.4 引擎选型（Temporal/轻量）与 7x24 | architect + infra | ADR + 运行方案 | A7.1 |
| **A8** | QA 门禁 | A8.1 v3 测试计划 | qa-reviewer | V3-TEST-PLAN.md | A0 |
| | | A8.2 MCP 网关 API/安全用例 | qa-reviewer | tests/mcp-gateway | A1/A2 |
| | | A8.3 App 权限/协同 API/UI 用例 | qa-reviewer | tests/app-collab | A3/A4 |
| | | A8.4 G-V3 门禁记录 | qa-reviewer | PASS/ACTIONS/REJECT | A8.2/A8.3 |
| **A9** | 集成与评审 | A9.1 本地栈端到端 | lead | E2E 脚本 + 证据 | A1–A4 |
| | | A9.2 架构评审会 | lead + architect | 评审记录 | A0 |
| | | A9.3 生产化清单 | infra + lead | ACK/Higress 清单 | A5 |

---

## 2. 优先级与并行策略

| 优先级 | 工作包 | 理由 |
| --- | --- | --- |
| P0 | A0/A1/A2/A5 | MCP + 网关是平台核心；架构先评审 |
| P0 | A8 计划 | 门禁前置，测试与实现并行 |
| P1 | A3/A4 | 应用分享/协同是商业化关键 |
| P1 | A6/A7 | 数字人/工作流为业务层，设计并行 |
| P2 | 生产化细节 | 等 M1 评审后细化 |

**并行分组**
- 组 1（架构）：architect + lead
- 组 2（MCP）：capability-centers（设计）+ platform-backend（实现）+ qa（测试）
- 组 3（App）：platform-backend（API）+ web-console（UI）+ qa
- 组 4（基础设施）：infra-devops（Higress/7x24）
- 组 5（业务）：pm-research（数字人/工作流）
- 协调：Lead 每日对齐接口；冲突文件按 write scope 隔离；所有产出进入 shared task board。

---

## 3. 关键接口冻结点

1. **MCP API**：`/api/v1/mcp/servers`、`/publish`、`/offline`、`/tools`、网关 `/v1/{tenant}/{server}`；
2. **App ACL API**：`/api/v1/apps/{id}/members`、`/shares`、`/collab/sessions`、`/collab/proposals/{id}/approve`；
3. **网关配置**：Higress `McpBridge`/`HTTPRoute` + `MCPServer` CRD（以实际版本为准）；
4. **数字人 API**：`/api/v1/digital-human/sessions`、`/rtc-token`、`/events`；
5. **工作流 API**：`/api/v1/workflows`、`/instances`、`/tasks/{id}/approve`。

冻结后变更需 ADR + 版本化。

---

## 4. 验收标准（里程碑）

- M1：架构图可读、ADR 有备选与结论、WBS 可执行；
- M2：MCP 服务发布→工作区可见→工具调用成功→审计可查→下线后不可调用；
- M3：viewer 不能 use、editor 不能 share、分享链接过期/越权被拒、协同提案需审批且可回滚；
- M4：数字人/工作流接口契约与成本模型完整，可进入实现；
- M5：Higress 配置可 apply，故障演练通过；
- M6：QA 门禁 P0/P1=0。

---

## 5. 风险与决策记录

- 网关选型：默认 Higress，agentgateway 可选（ADR-GW-01）；
- 工作流引擎：Temporal 优先（耐久/人工任务），MVP 轻量状态机（ADR-WF-01）；
- 协同 patch：base_version 乐观锁 + 目录白名单 + CI 门禁；
- 数字人：实时与离线分档，GPU 成本按会话计费；
- 7x24：Watchdog 先只读诊断，再逐步自动修复。
