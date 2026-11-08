# G2 架构 评审记录

- 日期：2026-11-04
- 主持（Owner）：`architect`
- 评审人：`infra-devops`、`platform-backend`、`capability-centers`、`web-console`（NOT-RUN，见 §6）、`qa-reviewer`（汇总/判定）
- 被评交付物：`docs/02-architecture/`：ARCHITECTURE.md（874 行）、DATA-MODEL.md（703）、openapi.yaml（2752 行 / 73 paths / 106 ops / 233 schemas）、SECURITY.md（499）、adr/（15 条）、services/BACKEND.md（983）、centers/{SKILL-CENTER,EVAL-CENTER,APP-CENTER,MCP-HUB,CENTERS}.md、deploy/DEPLOYMENT.md（1745）
- 前置门禁：G0 = PASS（已签署）；G1 = PASS-WITH-ACTIONS（已签署，A1–A12 已关闭并复核）
- 结论：**PASS-WITH-ACTIONS**
  - G2 十项检查 10/10 满足（含 8/8 上游待核实关闭证据）；**无 P0**（4 位评审人一致）；
  - 18 项 P1 为**跨文档契约口径不一致**（非架构重做），必须在 G4 实现前关闭；
  - **G4 可启动条件**：G2-01/02/03/04/06/07/08/09 关闭（owner+期限见 §4），其余 P1 同步关闭；P2/P3 进 G4 台账。

---

## 1. 检查项结论（REVIEW-GATES §4 G2 十项）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | C4 上下文/容器/组件/部署四视图齐全 | ✅ | ARCHITECTURE §2:45（L1）、§3:88（L2）、§4:193（L3）、§5:267（L4 含 ACK 节点池） |
| 2 | 关键数据流 6 条（登录/拉起/模型/Skill/应用/MCP） | ✅ | ARCHITECTURE §6.1–6.6:345-565，Mermaid 时序图 + 失败分支；infra/centers 双向核对一致 |
| 3 | 每用户 4C8G 隔离可证明（资源/网络/存储/身份） | ✅ | SECURITY §3.1–3.5:143-231（四个维度每行带"机制/证据/验证"列）；ADR-014 12 条硬控制；DEPLOYMENT §3.4 隔离矩阵；**注意 G2-18 NetworkPolicy 示例需补 egress-proxy** |
| 4 | 退出不销毁 + 显式销毁状态机与回收策略 | ✅（附 G2-01/02 口径修正） | ARCHITECTURE §7.2:581-609（唯一权威 `workspaces.state` 9 态；退出只到 idle；显式销毁二次确认+冷却+快照两段式）；BACKEND §5.6 7 步；ADR-012；D17=5min/PVC24h/快照30d |
| 5 | 数据模型多租户（每表租户键/RLS） | ✅（附 G2-04/07 修正） | DATA-MODEL §1.2 请求上下文、§3 每表🏷租户键、§4.1 FORCE RLS 模板:575-605、§4.2 覆盖矩阵 27 表:607-621、§4.3 防绕过:623-629；backend 机械校验 27 表均含 org_id+RLS |
| 6 | API 可生成 SDK（错误码/幂等/分页/版本化） | ✅（附 G2-06 端点补齐） | openapi 3.1.0；**当前 qa 实测 95–96 paths / 131 ops / 98 schemas**（architect 报 96/131，计数口径差 1）；两层错误模型（16 ErrorCode + 23 ErrorReason，`EVAL_GATE_FAILED/GATE_BLOCKED→gate_blocked`）；`Idempotency-Key`（workspace create/app deploy/eval）；cursor 分页；`$ref` 全解、operationId 唯一（backend/architect 脚本校验） |
| 7 | 安全：STRIDE/密钥/SSRF/越权/沙箱逃逸 | ✅（附 G2-09/16/17） | SECURITY §2 STRIDE 全表:40-137；§4 密钥 11 项:237-267；§6.1 SSRF 校验链:302-317；§6.2 IDOR:319-325；§6.4 沙箱:339-353（gVisor/Kata 抽象）；ADR-014 信任边界；DEGRADED 语义见 G2-11 |
| 8 | 部署拓扑与容量模型（1000 工作区）可推导 | ✅ | ARCHITECTURE §9:668-735（32C128G×160、7/节点、PVC/带宽/服务容量算式、成本 ¥72–83 万量级标 `[推断]`）；ADR-015 三档 100→300→1000；infra 核对假设透明可复算；**成本单价为假设 → DEGRADED/lead 豁免** |
| 9 | ≥8 条 ADR，含备选方案与否决理由 | ✅ | `adr/` 15 条（ADR-001…015）；逐条含"备选方案/否决理由"（qa 逐文件核：15/15） |
| 10 | 失败模式与降级（网关/K8s/DB 等） | ✅（附 P2：AZ 单列） | ARCHITECTURE §10 F-01–F-13:738-756（含 MTTR/SLO）；DEPLOYMENT §14 F1–F15:1907-1921 交叉覆盖；F-04 DB 故障 gateway 不查 DB 与 D15/D19 一致 |

> 附加（G0-16）：**上游 `OPENCODE-BASELINE.md` §5 八项 8/8 关闭**，证据见 ARCHITECTURE 附录 A:796-809，逐项 `文件:行`（端口漂移 `server/src/process.ts:150-160`、`/api/info`、子路径 `web-ui.ts`、skill `index.json`、managed policy `config/discovery.ts`、PTY ticket、SQLite PRAGMA、usage 权威、autoupdate），另附录 A.9 补 10 项（空密码无鉴权 `auth.ts:required`、cookie 可伪造、`/api/pair`、SSE volatile、iframe、配置注入替代通道等）。**满足 G0-16 证据格式要求**。

---

## 2. 问题清单（合并后，原始 ID 保留）

> 编号 `G2-xx`；状态：`open`（须关闭）/`→G4`（实现期）/`待证`。
> 严重度：P0 无；P1=18；P2=11；P3=5（去重后）。

### 2.1 P1（阻塞 G4 启动或实现返工）

| ID | 位置 | 问题 | 建议 | 原始 ID | 状态 |
| --- | --- | --- | --- | --- | --- |
| G2-01 | DEPLOYMENT:23/644/693/787、BACKEND §5.6:690 | 销毁冷却期口径残留：DEPLOYMENT 部分写 24h、BACKEND 写默认 24h，与 D17（5min 可配 5–1440）及 ARCH 冲突；:787 仍保留"待解决"结论 | 全量统一 D17：默认 5min、可配 0–168h；PVC 24h 快速恢复 + 快照 30d 两段式；删过期"冲突"表述 | infra P1-4、BK-01 | open |
| G2-02 | ARCH:393、DEPLOYMENT:788；openapi ErrorReason | 非枚举 reason：`provision_timeout`（应为 `ws_launch_timeout`）、`snapshot_failed`（不在 23 枚举） | 全库 grep 清理；`snapshot_failed` 改 `internal_error + details.phase=snapshot`（或正式入枚举走 openapi 变更） | BK-02、BK-14 | open |
| G2-03 | BACKEND:565（每 org `ws-<orgId>`）vs ARCH §5:288/292、SECURITY:159（单 `workspaces` ns）vs DEPLOYMENT §2.5（per-org） | **namespace 契约未定**：NetworkPolicy/Quota/RBAC 无法落地；单 ns 下 1000 工作区隔离与配额需证明 | 定 canonical：业务工作区 `ws-<orgId>` + 平台 ns 按 DEPLOYMENT §2.5；同步 ARCH 图/SECURITY NP 示例 | infra P1-3、BK-03 | open |
| G2-04 | DATA-MODEL:525 `quota_limits` | **DDL 非法**：表级 `UNIQUE(..., COALESCE(scope_id,'0'), ...)` 表达式不允许；uuid 与 `'0'` 类型不匹配 → 建表直接失败 | 改 `CREATE UNIQUE INDEX ... (org_id, scope, COALESCE(scope_id,'00000000-…'::uuid), resource, period)` | BK-04 | open |
| G2-05 | ADR-009:19 vs ARCH §7.4（约束"baseURL/apiKey 仅 L1，L2 不写凭证"）vs BACKEND §6.3 | **配置层级矛盾**：ADR-009 L2 列 `providers.litellm.options`（baseURL/apiKey），与"凭证只 L1"冲突，且上游 v2 键为 `providers.*.settings`；安全后果：用户可写 L2 可改 baseURL 指向自有端点（虚拟 Key 外泄面） | L2 只写 `model`/`providers.litellm.models`/`skills[]`/`mcp.servers`；baseURL/apiKey 仅 L1（`settings`）；同步 ADR-009/BACKEND/ARCH §7.4 | BK-08、qa QA-01 | open |
| G2-06 | centers/MCP-HUB:432-451、EVAL-CENTER:319-320、SKILL/APP-CENTER 多处 | **四中心 API 路径与 openapi 不匹配**：MCP 17/17、Eval 13/13 端点缺失（`/api/v1/mcp/servers` vs `/mcp-servers`；`/eval/datasets` vs `/eval-datasets`）；Skill/App 端点缺（审核/block/source-url/builds/certificates/access-tickets）；另缺 submit/review/yank、dataset 版本、eval spec/compare、app builds/preflight/domains | 以 openapi 为唯一源，centers 全量改路径；内部端点标 `/internal`；缺的公开端点先补契约再实现 | BK-09/10/11、B-03/B-12 | open |
| G2-07 | openapi:2923-3000、DATA-MODEL:374/386/400/413 | **应用/评测状态机与拆分未落契约**：`AppDeploymentStatus` 仍 8 态且 `app_deployments` 含 build 字段；`apps.state` 含 building/deploying；`EvalRunStatus` 6 态缺 preparing/collecting/grading/completed/timed_out；`EvalResult.case_index` 与已定 `case_id` 不符；`sandbox.runtime_class=gvisor` 写死 | 按已确认口径：`apps.state`=draft/ready/failed/stopped/deleted + 新增 `app_builds`；app_deployments 6 态；Eval 9 态 + `case_id:string` + `isolation:strong/degraded` | B-01、B-02、B-11 | open |
| G2-08 | DATA-MODEL:156-557、:607-621 | **centers 表覆盖不全**：缺 `mcp_call_logs`、`skill_source_tokens`、`eval_dataset_versions`、`eval_specs`、`eval_baselines`、`eval_ci_links`、`app_builds`、`app_domains`、`app_secrets`；RLS 矩阵对四中心不完整 | 补表 + 纳入 RLS 矩阵；`skill_source_tokens` 存 HMAC+expires_at+installation_id 以支持吊销 | B-05、B-06 | open |
| G2-09 | SECURITY:370-377、ARCH F6:535-565 | **G1-15/16 未闭环于架构层**：`view/use/edit` 无方法级判定规则；分享链接未定义不可枚举（128-bit `share_id`）；F6 无独立 MCP 调用日志（args_hash/脱敏/延迟/租户）与限流分支 | SECURITY/ARCH 定规则并给测试：GET/HEAD=view、非 GET=use 或 `use_paths`；`share_id` 128-bit；新增 `mcp_call_logs`（分区，90d 在线+冷存）或明确审计分区；F6 加限流 429 | B-05、B-08 | open |
| G2-10 | services/BACKEND:1038 vs ADR-010:55 | Skill 源令牌 TTL 冲突：BACKEND"≤1h" vs ADR-010"15min + agent 5min 续签"；按 ≤1h 不续签会随机 401 | BACKEND 改 ≤15min + 续签，引用 ADR-010；补"连续续签失败 3 次保留旧 token 停止刷新" | B-09 | open |
| G2-11 | DATA-MODEL:374、ARCH:743、DEPLOYMENT:1137-1242 | **DEGRADED 语义未进根文档**：DEPLOYMENT 已有 sandbox-runtime 抽象，但 eval_runs 写死 gvisor，根文档无"无强隔离 → DEGRADED，不得宣称 G5 PASS"字段/验收 | 加 `isolation:strong|degraded` 到 run/gate；写明 DEGRADED 下 gate 返回 `passed_with_actions`、G5 不得 PASS（lead 豁免除外） | B-11 | open |
| G2-12 | ARCH F5:509/521、ADR-011:14/54 | 构建契约与 ACR tag 不一致：F5 写 `apps/<app_id>:<git_sha>-<build_no>`，与已确认 `<acr>/oc/<env>/apps/<org_slug>/<app_slug>`、tag `rev-<uuid>`、部署只认 digest 不同；ADR-011 仍把产物记到 app_deployments | 统一 ACR 命名/tag；产物落 `app_builds`/`app_revisions`；部署只引用 revision digest | B-13 | open |
| G2-13 | ARCH §5:279、APP-CENTER:264/301 vs ADR-004:3 | OIDC RP 口径残留：架构部署图仍 `oauth2-proxy ×3`、应用中心流程仍写 oauth2-proxy+authz，与 D15"控制面唯一 RP"冲突 | ARCH 图改 `auth-edge`；APP-CENTER 改 auth-edge + access-ticket + app-gateway | infra P1-1 | open |
| G2-14 | ARCH:617 `?ticket=` vs BACKEND:673 `?__ticket=`（ADR-004:42 `?ticket=`） | ticket 参数名不一致，gateway/控制面按不同名实现会 401 | 统一 `?__ticket=`（ADR/openapi 语义），三处改齐 | infra P1-2 | open |
| G2-15 | BACKEND §5.2:566 | "spec 唯一写者=控制面"仅文字约定；CRD 无字段不可变/准入约束 → 手工改 spec（retainPolicy/image/host）可绕过审计 | 加 ValidatingAdmissionPolicy/OPA：spec 仅控制面/operator SA 可写；retainPolicy 白名单；审计 `workspace.spec_write_denied` | infra P1-5 | open |
| G2-16 | ADR-007:17/48（`sandbox-runtime`）vs EVAL-CENTER:117/239（`gvisor`） | 沙箱 RuntimeClass 契约名三处不一致，gVisor 不可用时无法平滑降级 Kata | 统一 `sandbox-runtime`（handler=gvisor/kata）；centers 渲染模板改名；缺失记 DEGRADED | infra P1-6 | open |
| G2-17 | SECURITY §6.6:372 vs APP-CENTER:301（oauth2-proxy+authz）vs DEPLOYMENT §8（app-gateway） | 应用分享 ACL 入口不一致，直连 Service 可绕过 ACL | 统一 Ingress→app-gateway→Service；app-gateway 做 ticket→cookie+ACL（≤5s） | infra P1-7 | open |
| G2-18 | SECURITY §3.2:155-191 NetworkPolicy 示例 | 示例 egress 仅 litellm/mcp-hub/skill/DNS，无 egress-proxy/NAT 白名单放行；与 §3.2 表格"出站唯一出口 NAT 白名单（git/npm/pypi）"、DEPLOYMENT §13.7 出网白名单策略不一致 → 按示例实施工作区无法 git/npm，与 E3-05 工具链冲突 | 示例补 egress-proxy（platform-system:port）+ 白名单域名策略；与 DEPLOYMENT 出网设计同源 | qa QA-02 | open |

### 2.2 P2（G4 台账）

| ID | 位置 | 问题 | 原始 ID |
| --- | --- | --- | --- |
| G2-19 | DATA-MODEL §4.1:584/587 | `app.is_platform_admin` GUC 可被应用角色 SET，存在提权到平台管理员视图面 | infra P2-1 |
| G2-20 | SECURITY:205/ADR-014#7 | `ReadWriteOncePod` 在目标 K8s 1.28 是否默认开启需确认；否则用 RWO+Recreate | infra P2-2 |
| G2-21 | ARCH §5:328/§9 | 应用池容量缺口：200 应用 1C2G 需 ~29 节点，§9 未推导 | infra P2-3 |
| G2-22 | ARCH §7.2:585 vs BACKEND §5.4:638 | ready 语义：ARCH"skill 可用才算 ready" vs BACKEND"skill 降级不阻断 ready" | infra P2-4 |
| G2-23 | SECURITY:346/DEPLOYMENT/ADR-014#1 | uid 不统一：workspace=1000 vs sandbox/app=65532 | infra P2-5 |
| G2-24 | openapi | 无 CI 校验门禁（"可生成 SDK"缺自动证据） | infra P2-6 |
| G2-25 | ARCH §10:740-754 | 缺 AZ 故障/节点池耗尽/ESSD 库存单列（可交叉 DEPLOYMENT F2/F12） | infra P2-7 |
| G2-26 | openapi 金额字段 | 币种未定（内部成本 RMB vs 对外计价） | infra P2-8 |
| G2-27 | ARCH:533/SECURITY:375/ADR-004:49 | 分享 ACL 缓存口径：60s 缓存 vs"变更 ≤5s 生效"；需失效通道失败时降级短 TTL | B-07 |
| G2-28 | openapi publish/EVAL-CENTER:431 | `gate_blocked` 表达与 HTTP 码：应以 `code=precondition_failed + reason=gate_blocked + details.gate_kind`；backend 称 openapi 为 412、PRD 为 409，需逐端点核对统一（待证） | BK-15、B-10、待证 |
| G2-29 | openapi:535/1786 | access-ticket 端点带 `Idempotency-Key`：若幂等缓存会重放同一 60s ticket，与"一次性 jti"冲突 | BK-12 |

### 2.3 P3（排期）

| ID | 位置 | 问题 | 原始 ID |
| --- | --- | --- | --- |
| G2-30 | DATA-MODEL:156 标题"23 张" vs 正文 27 张 | 标题与内容不一致 | BK-06 |
| G2-31 | openapi 8 个资源写操作缺 404 | 与 D19 不完全一致（跨租户探测差异），低风险 | BK-13 |
| G2-32 | DATA-MODEL:215 | `api_keys.prefix` "前 12 字符" vs `ock_`+kid=14 | BK-05 |
| G2-33 | ARCH:740-754 vs DEPLOYMENT:1907-1921 | 失败模式编号 F-01…F-13 vs F1–F15，混沌用例映射需对齐 | qa QA-06 |
| G2-34 | ARCH §7.3:627 | 文字"Cookie 名带 workspace id"与 `__Host-oc_ws` 不符（子域隔离下可行，文字需改） | qa QA-05 |

---

## 3. 行动项（PASS-WITH-ACTIONS）

> 关闭方式：修订人改文档 → 消息附 `文件:行` → qa 复核 → 置 closed。截止：G4 实现任务开工前（task-11 释放条件）。

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-G2-1 | **G2-01/02** 冷却期与 reason 枚举清理 | infra-devops + architect | G4 前 | DEPLOYMENT/BACKEND/ARCH 全文 grep `24h`/`snapshot_failed`；qa 复核 |
| A-G2-2 | **G2-03** namespace canonical 定稿 | architect + infra-devops | G4 前 | ARCH §5/SECURITY NP/BACKEND §5.2 三处一致；qa 复核 |
| A-G2-3 | **G2-04** quota_limits DDL 修正 | architect | G4 前 | DDL 可在 PG16 执行（本地 kind/pg 验证）；qa 复核 |
| A-G2-4 | **G2-05** ADR-009 L2 凭证边界 | architect + platform-backend | G4 前 | ADR-009/ARCH §7.4/BACKEND §6 三处一致；安全用例（用户改 baseURL 被拒） |
| A-G2-5 | **G2-06/07/08/09** 契约与数据模型补齐（含 app_builds/eval 9 态/centers 表/mcp_call_logs） | architect + capability-centers + platform-backend | G4 前 | openapi 重新 lint+生成 SDK；DATA-MODEL 27+ 表含 RLS；qa 复核 |
| A-G2-6 | **G2-10/11** 令牌 TTL 与 DEGRADED 语义 | capability-centers + architect | G4 前 | BACKEND/ADR-010/DATA-MODEL 一致；QA 场景（无 runsc → DEGRADED） |
| A-G2-7 | **G2-12/13/14/15/16/17** 构建/ACR、OIDC、ticket、准入、RuntimeClass、app ACL 口径 | architect + infra-devops + capability-centers | G4 前 | 逐项 `文件:行`；qa 复核 |
| A-G2-8 | **G2-18** NetworkPolicy 示例补 egress-proxy | architect + infra-devops | G4 前 | 示例可 apply 且工作区可 git/npm（kind 验证） |
| A-G2-9 | P2/P3（G2-19…34） | 各 owner | G4 台账 | 逐项登记；成本单价需 DEGRADED 豁免 |
| A-G2-10 | **web-console G2 意见补收** | web-console → qa | 2026-11-05（24h） | 原文问题清单（ID/位置/级别/证据）；qa 补入本记录 |

### 3.1 P1 逐项 Owner / 期限 / 验证方式 / G4 硬门槛

> lead 裁决：**G4 硬门槛 = G2-01/02/03/04/05/06/08**（task-12/13/14 启动前必须关闭）；其余 P1 可并行，但 task-15 验收前必须关闭。
> 期限：硬门槛 2026-11-04 18:00；其余 2026-11-05 18:00。

| ID | 级别 | Owner | 期限 | 验证方式（可复现） | G4 硬门槛 |
| --- | --- | --- | --- | --- | --- |
| G2-01 | P1 | infra-devops + architect | 11-04 18:00 | 全文 grep `24h`/`冷却`；DEPLOYMENT/BACKEND/ARCH 一致 D17 | ✅ 是 |
| G2-02 | P1 | architect | 11-04 18:00 | 全库 grep 非枚举 reason；ErrorReason 23 枚举 + openapi 校验 | ✅ 是 |
| G2-03 | P1 | architect + infra-devops | 11-04 18:00 | ARCH §5/SECURITY NP/BACKEND §5.2/DEPLOYMENT §2.5 四口一致；kind NP apply 通过 | ✅ 是 |
| G2-04 | P1 | architect | 11-04 18:00 | DDL 在 PG16 本地执行成功（quota_limits 唯一索引） | ✅ 是 |
| G2-05 | P1 | architect + platform-backend | 11-04 18:00 | ADR-009/ARCH §7.4/BACKEND §6 一致；安全用例：用户改 baseURL 被拒 | ✅ 是 |
| G2-06 | P1 | architect + capability-centers + platform-backend | 11-04 18:00 | openapi 为源：centers 端点全部可映射；lint+SDK 生成通过 | ✅ 是 |
| G2-07 | P1 | architect | 11-04 18:00 | openapi/DATA-MODEL 状态枚举与 6 态/9 态口径一致；SDK 生成通过 | ✅ 是（lead 增补） |
| G2-08 | P1 | architect + capability-centers | 11-04 18:00 | 补表进 DATA-MODEL + RLS 矩阵；openapi 对应 schema | ✅ 是 |
| G2-09 | P1 | architect + capability-centers | 11-04 18:00 | SECURITY/ARCH 规则成文 + 用例（share_id 128-bit、方法级 ACL、mcp_call_logs） | ✅ 是（lead 增补） |
| G2-10 | P1 | capability-centers | 11-05 18:00 | BACKEND/ADR-010 均 15min+5min 续签 | 否 |
| G2-11 | P1 | architect | 11-05 18:00 | DATA-MODEL/openapi 有 isolation 字段；DEGRADED 验收成文 | 否 |
| G2-12 | P1 | architect + infra-devops | 11-05 18:00 | F5/ADR-011/ACR 规范一致；部署只认 digest | 否 |
| G2-13 | P1 | architect + infra-devops | 11-05 18:00 | ARCH §5/APP-CENTER/DEPLOYMENT 统一 auth-edge | 否 |
| G2-14 | P1 | architect | 11-05 18:00 | 三处均 `?__ticket=`；grep 无 `?ticket=` | 否 |
| G2-15 | P1 | architect + infra-devops | 11-05 18:00 | CRD 准入策略 YAML + RBAC 设计成文 | 否 |
| G2-16 | P1 | infra-devops + capability-centers | 11-05 18:00 | 统一 `sandbox-runtime`；centers 模板改名 | 否 |
| G2-17 | P1 | infra-devops + capability-centers | 11-05 18:00 | Ingress→app-gateway→Service 链路成文 + 绕过用例 | 否 |
| G2-18 | P1 | architect + infra-devops | 11-05 18:00 | NP 示例 apply + 工作区可 git/npm 冒烟 | 否 |

---

## 4. 评审人意见摘要（逐人）

| 评审人 | 覆盖 | 结论建议 | 关键意见 |
| --- | --- | --- | --- |
| infra-devops | 全部（10 项逐项证据 + 7 P1/8 P2） | PASS-WITH-ACTIONS（P0=0） | oauth2-proxy 残留、ticket 参数名、namespace、冷却期、CR 准入、RuntimeClass、app ACL；**8/8 上游关闭证据 PASS**；成本单价建议 DEGRADED |
| platform-backend | 全部（机械校验 + 18 项） | PASS-WITH-ACTIONS（P0=0） | 6 个 P1：冷却期 stale、snapshot_failed、namespace、quota DDL 非法、ADR-009 L2 凭证、MCP/Eval 路径断裂；另 12 项 P2/P3 |
| capability-centers | 全部（10 项 + B-01…B-16） | PASS-WITH-ACTIONS（P0=0） | app/eval 状态机、centers 表缺失、MCP 日志/限流、ACL 规则、DEGRADED、域名/构建契约 |
| qa-reviewer | 全文抽查 + 独立证据链 | PASS-WITH-ACTIONS（P0=0） | 独立发现 G2-18（NetworkPolicy egress 与出网策略冲突）、G2-33/34；复核 `skill-file.ts`/`discovery.ts`/`mcp.ts`/openapi 关键断言 |
| web-console | 14 项（经 lead 转述，原文未收） | 未提交结论 | **NOT-RUN**：以 lead 转述计入行动项 A-G2-10，不改变本记录结论（G2 十项已有 4 位评审人证据） |

---

## 4.2 A-G2 硬门槛关闭进度（qa 逐项复核，2026-11-04 11:0x）

> 复核方法：按 architect/owner 声明的 `文件:行` 直接读源文件核对（非采信消息）。G4 硬门槛 = G2-01…09。

| 项 | 归属 | qa 复核证据 | 状态 |
| --- | --- | --- | --- |
| G2-01 | architect + infra + backend | ARCH §7.2 / ADR-012 / openapi destroy description / DEPLOYMENT:23/793 / BACKEND:29 均 5min（可配 5–1440）+ PVC 24h + 快照 30d；DEPLOYMENT 剩余 "24h" 为合法语义（agent token 轮换、观察期、SLO 窗口） | ✅ closed |
| G2-02 | architect + infra | `ws_launch_timeout`；`snapshot_failed`→`internal_error+details.phase`；DEPLOYMENT/BACKEND 无 snapshot_failed；ErrorReason=23；**P2 残余已修**：`WorkspaceError.code` 改为 `$ref: ErrorReason`（openapi:2520），CR 细分原因放 `details.cr_reason` | ✅ closed |
| G2-03 | architect + infra | ARCH:340 canonical；SECURITY NP 改 `ws-<orgId>`；DEPLOYMENT:209/202/221/229/247/278/294/518 全替换，无 `opencode-workspaces` 生效规则 | ✅ closed |
| G2-04 | architect | DATA-MODEL:525 表达式唯一索引 `uq_quota_scope`；app_shares 同类修正；全库仅 2 处 COALESCE | ✅ closed |
| G2-05 | architect | ADR-009:18-19（L1 `settings` 唯一；L2 禁 baseURL/apiKey）、:58 上游 v2 键名；验证改为 schema 白名单拒绝 | ✅ closed |
| G2-06 | architect + capability-centers | 契约侧 openapi 为源；centers 侧：**29 公开端点对齐 + 29 internal + 23 排期（其中 20 已补入 openapi，G5 前再补 3 个 P2）**；参数名全部资源化；裸 `{id}` 为 0。当前契约 **95–96 paths / 131 ops / 98 schemas** | ✅ closed（3 个 P2 端点转 G5 台账） |
| G2-07 | architect + capability-centers | **qa 实测已修**：`AppState`=draft/ready/failed/stopped/deleted（:2976）；`AppDeploymentStatus`=pending/deploying/running/sleeping/failed/stopped（:3025）；新增 `AppBuildStatus` 5 态/`AppDomainStatus` 4 态；`AppBuild` schema + `GET/POST /apps/{appId}/builds`、`GET /builds/{buildId}`、`POST /builds/{buildId}/retry`、`POST /deployments/{deploymentId}/rollback`（:1503/1545/1563/1591）；`AppDeployment.build_no`→`build_id`、`scan_status` 移除；EvalRunStatus 9 态（:2879） | ✅ **closed**（原"G4 豁免"不再需要） |
| G2-08 | architect | DATA-MODEL §3.10 新增 9 表；总数 36（:579） | ✅ closed |
| G2-09 | architect | SECURITY §6.6（app-gateway/≤5s/无 ticket 302）；app_shares scope；`mcp_call_logs` 180 天脱敏 | ✅ closed |
| BK-12 | architect | access-ticket 无 `Idempotency-Key`；200 描述"每次新 jti、不缓存" | ✅ closed |
| BK-13 | architect | `destroyWorkspace` 含 404；另 7 个资源操作补 404 | ✅ closed |
| ADR-016 | architect | `ADR-016-fastify-over-nestjs.md`；ADR 16 条 | ✅ closed |

**结论**：G2-01…09 **9/9 全部 closed**（G2-07 三处已由 architect 修完并经 qa 实测：枚举/AppBuild 端点/`build_id`；lead 原"G4 豁免"不再需要）。→ **G4 task-11/12/13/14 释放条件满足**（task-15 依赖 12/14 可运行版本）。遗留非阻塞：23 个 centers 公开端点由 architect 在 **G5 契约冻结前**补入 openapi（owner=architect，G5 台账）。

---

### 4.3 web-console G2 意见（2026-11-04 补收，NOT-RUN 解除）

> 原文见 web-console 消息；qa 抽核 2 处（`SkillStatus` 5 态、`Workspace` 资源字段）。G4 影响已标注。

| ID | 级别 | 位置 | 问题 | 建议 | G4 影响 |
| --- | --- | --- | --- | --- | --- |
| G2-WC-01 | P1 | openapi `SkillStatus`/`SkillVersion` | UI 需"扫描中/评测中/驳回/评测未过"，契约仅 5 态（draft/in_review/published/deprecated/blocked，qa 已核） | 增 `validation_status`/`evaluation_status` 或扩枚举；`blocked` 带 reason | G5（Skill 中心） |
| G2-WC-02 | P1 | openapi `Skill`/`SkillVersion` | 无评测准入结果字段（仅 `eval_gate_run_id`），S8 无法显示"已过/未过准入" | 增 `gate_status`/`gate_result` | G5 |
| G2-WC-03 | P1 | openapi `Workspace`/`WorkspaceEvent` | 缺 `last_active_at`/`last_session_title`/`skill_count`/`mcp_count`/`pvc_size`/provisioning stage；S3 卡片与 S2 阶段需 N+1 | 增 summary DTO 或 `GET /workspaces/{id}/summary`；事件补 `stage` | **G4（控制台列表/进度）**：task-14 先按现有字段降级，platform-backend 在 G4 内补 summary（or console 端聚合） |
| G2-WC-04 | P1 | openapi paths | S8/S10/S13/S14/S17 所需端点缺（eval report/export/share、app metrics/domains、snapshot delete、skill reviews/access-requests/rollback、audit 详情+actions、me preferences、teams 搜索） | 补 6 个 MVP 必需；其余标 P2 | G5 为主 |
| G2-WC-05 | P2 | `AuditLog` | 无 actor_name/resource_name；`outcome` vs 设计 `result` 命名不一致 | 增展示字段或前端 enrichment；统一命名 | G4（审计页占位） |
| G2-WC-06 | P2 | `POST /workspaces` responses | 配额超限返回 429，但 PRD E3-10 期望 409 `ws_quota_exceeded`；UI S2 用 409 | 明确 409（配额）/429（限流）分工 | **G4**：platform-backend 在 G4 内对齐 |
| G2-WC-07 | P2 | `McpServerStatus` | 生命周期枚举与健康枚举需分开（health=healthy/degraded/down/unknown + lifecycle=draft/pending_review/published/disabled） | 契约补 health 字段/枚举；UI 已按此改 | G5 |
| G2-WC-08 | P3 | `AppShare` | 逐条 ACL 无批量保存端点（S14 保存 N 次请求）；无团队搜索端点（`subject_type=team` 无法选人） | 接受 diff 提交；补 `GET /orgs/{id}/teams?q=` | G5 |

> 处置：G2-WC-03/06 进 **G4 台账**（owner=platform-backend，G4 联调前响应）；其余进 G5 台账（owner=architect + capability-centers）。**不改变 G2 结论**（PASS-WITH-ACTIONS，无 P0）。

---

### 4.4 契约冻结记录（G5 前置，2026-11-04）

- `openapi.yaml` 已标记 **`x-contract-status: frozen`**（范围=G5 四中心公开 API）；当前 **96 paths / 131 operations / 98 schemas**（qa 实测 95–96，计数口径差 1），yaml 解析通过、`$ref` 全解、operationId 唯一。
- capability-centers 复核：**openapi-matched 44 + 20/20 新端点命中**；`public-not-in-openapi 8` 全部为 **`x-p2-deferred`**（G5 不实现、不得发明路径）：`apps/{appId}/certificates|metrics|permissions`、`apps/by-slug/{slug}`、`mcp-servers/{serverId}/versions`、`skill-installations/{installationId}/rollback`、`skills/{skillId}/block|reviews`。
- **冻结后唯一变更通道**：ADR → minor `1.1.0` → `README §5.1` changelog → 通知 qa/backend/capability（已写入 `info.description` 与 README）。
- 对 G2/G4 影响：不改变 G4 MVP 子集（task-12 约 30 端点/15 表）；G2-07 维持 closed；G5 实现按冻结契约为准，task-16 按 `G4-CONTRACT-REVIEW.md` 审 diff。

---

## 5. 豁免与 NOT-RUN

| 项 | 说明 | 处理 |
| --- | --- | --- |
| 成本单价 | 节点/存储单价为假设值（¥4,000/¥2,000 每节点），未接价格 API | 标 `DEGRADED`，T7.1 `cost-snapshot.sh` 复核；G2 记录要求 lead 豁免 |
| gVisor 真机 | ACK runsc 真机未验证（V11） | G7 前必须关闭（DEPLOYMENT §13.7）；G5 不得以 kind 结果宣称 PASS |
| RWOP | K8s 1.28 feature gate 未确认 | P2（G2-20），G7 前确认 |
| web-console G2 意见 | 已补收（2026-11-04，G2-WC-01…08，qa 抽核 2 处） | **NOT-RUN 解除**；A-G2-10 closed；新增 G4/G5 台账见 §4.3（WC-03/06 为 G4 项） |
| 上游 8/8 | 已全部关闭（附录 A，`文件:行`） | 无豁免 |

---

## 6. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：G2 十项 10/10 满足；无 P0；18 项 P1 必须在 G4 启动前关闭（A-G2-1…8）；P2/P3 与 web 意见进台账。
- lead（放行）：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。条件：① G4 启动前关闭 18 项 P1，**硬门槛 = G2-01/02/03/04/05/06/07/08/09**（逐项 owner/期限/验证见 §3.1，A-G2-1…8）；② 成本单价 `DEGRADED` 豁免已批准（T7.1 价格 API 复核 + G7 前关闭）；③ web-console G2 意见 24h 内补收，不影响本结论；④ task-11 可立即启动，task-12/13/14 待对应硬门槛关闭，task-15 依赖 12/14。

---

## 7. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：10 项检查、18×P1/11×P2/5×P3 合并清单、A-G2-1…10、4 位评审人摘要、NOT-RUN 与豁免 | qa-reviewer |
| v0.2 | 2026-11-04 | lead 签署（PASS-WITH-ACTIONS）；补 §3.1 P1 逐项 owner/期限/验证 + 硬门槛 G2-01…09；成本 DEGRADED 豁免、web 意见 24h 补收 | qa-reviewer |
| v0.3 | 2026-11-04 | 补 §4.2 A-G2 关闭进度（逐项读源复核）：8/9 closed，仅 G2-07 残留 openapi AppState/AppDeploymentStatus 两枚举；BK-12/13、ADR-016 已核 | qa-reviewer |
| v0.4 | 2026-11-04 | G2-07 三处修复复核 closed（AppState 5 态/AppDeploymentStatus 6 态/AppBuild+端点/build_id）；硬门槛 **9/9 closed**；契约计数更新为 95–96 paths/131 ops/98 schemas；补 §4.3 web-console 意见（NOT-RUN 解除，G2-WC-01…08） | qa-reviewer |
