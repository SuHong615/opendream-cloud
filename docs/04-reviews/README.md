# 门禁评审记录索引（docs/04-reviews/）

- 维护者：`qa-reviewer`（门禁记录**唯一写入者**，依据 `ROLES.md` §3.8 / `REVIEW-GATES.md` §1）
- 更新：2026-11-04
- 权威来源：`docs/00-program/REVIEW-GATES.md`（规则、清单、模板）、`PLAN.md` §7（里程碑与主持/评审人）、`STATUS.md`（实时状态）
- 本目录规则：**一次门禁一个文件**；无逐项证据 = 不通过；结论由 `lead` 签署后才解锁下一阶段。

---

## 1. 索引（总览）

| 门禁 | 主题 | 主持（Owner） | 评审人 | 记录文件 | 状态 | 结论 | 日期 | 签署 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G0 | 需求基线 | lead | pm-research、architect、qa-reviewer | [`G0-requirements.md`](G0-requirements.md) | 已签署 | **PASS** | 2026-11-04 | qa + lead |
| G1 | 产品定义 | pm-research | architect、web-console、platform-backend、capability-centers、qa-reviewer | [`G1-product-definition.md`](G1-product-definition.md) | 已签署（行动项 A1–A12 跟踪中） | **PASS-WITH-ACTIONS** | 2026-11-04 | qa + lead |
| G2 | 架构 | architect | infra-devops、platform-backend、capability-centers、web-console、qa-reviewer | [`G2-architecture.md`](G2-architecture.md) | 已签署（硬门槛 9/9 closed；契约已冻结；P2/P3 台账跟踪） | **PASS-WITH-ACTIONS** | 2026-11-04 | qa + lead |
| G3 | 设计 | web-console | pm-research、architect、qa-reviewer | [`G3-design.md`](G3-design.md) | 已签署（A-G3-2…5 已关；剩余转 G4/G5 台账） | **PASS-WITH-ACTIONS** | 2026-11-04 | qa + lead |
| G4 | 平台核心 | platform-backend | architect、infra-devops、qa-reviewer | [`G4-platform-core.md`](G4-platform-core.md) | 已签署（A-G4-1…7 跟踪中） | **PASS-WITH-ACTIONS** | 2026-11-04 | qa + lead |
| G5 | 能力中心 | capability-centers | architect、platform-backend、qa-reviewer | [`G5-capability-centers.md`](G5-capability-centers.md) | 已签署（A-G5-1…6 跟踪中） | **PASS-WITH-ACTIONS** | 2026-11-04 | qa + lead |
| G6 | 质量与安全 | qa-reviewer | 全体 | [`G6-quality-security.md`](G6-quality-security.md) | 已签署 | PASS-WITH-ACTIONS | 2026-11-04 | qa + lead |
| G7 | 部署验收 | infra-devops | architect、qa-reviewer、lead | [`G7-deployment-acceptance.md`](G7-deployment-acceptance.md) | 已签署 | PASS-WITH-ACTIONS | 2026-11-04 | qa + lead |

状态取值：`未开始` / `意见收集中` / `已汇总待签署` / `已签署` / `打回重做`。
结论取值：`PASS` / `PASS-WITH-ACTIONS` / `REJECT`（含义见 §4）。

---

## 2. 文件命名与登记规则

- 命名：`docs/04-reviews/G<号>-<主题>.md`，例 `G2-architecture.md`。
- 一次门禁一个文件；同一门禁多轮评审时，**在原文件追加"评审轮次"章节**，不新建文件、不覆盖历史结论。
- 与 WBS 的对应关系（避免命名漂移）：
| G6 | 质量与安全 | qa-reviewer | 全体 | [`G6-quality-security.md`](G6-quality-security.md) | 已签署 | PASS-WITH-ACTIONS | 2026-11-04 | qa + lead |
- 登记要求：文件创建或结论变化后，**必须同步更新 §1 索引**与 `docs/00-program/STATUS.md`（STATUS 由 lead 维护，qa 通过消息通知）。
- 签署栏缺失、日期缺失、评审人未逐项给证据 → 该记录视为**无效记录**，不得用于解锁任务。

---

## 3. 流程（摘自 REVIEW-GATES.md §3）

```
Owner 完成交付物
  → 自检（对照本门禁 Checklist，逐项给证据）
  → 发消息给 qa-reviewer + 各评审人：路径、范围、自检结论、已知风险
  → 评审人独立阅读（只读），给出：问题清单（ID/位置/级别/建议）+ 结论建议
  → qa-reviewer 汇总，写 docs/04-reviews/Gx-<topic>.md
  → lead 签署；更新 STATUS 与任务板
  → PASS / PASS-WITH-ACTIONS 关闭后，依赖任务才可开工
```

**独立性规则**（REVIEW-GATES §1）：
1. 评审人不得评审自己主写的章节；
2. 门禁主持不能给自己 PASS；
3. `lead` 不参与具体章节撰写时可签署；
4. `qa-reviewer` 不评审自己主写的交付物（如 TEST-PLAN 的 G6 自评需由 architect/infra 复核）；
5. 评审意见必须逐项对应 Checklist 条目，禁止只写"同意/没问题"（反模式，直接判 REJECT/重做）。

---

## 4. 结论定义与判定规则

| 结论 | 含义 | 后续动作 |
| --- | --- | --- |
| `PASS` | 全部检查项满足，无阻塞问题 | 解锁下一阶段；归档 |
| `PASS-WITH-ACTIONS` | 主体验收通过，但有必须关闭的行动项 | 行动项进任务板；关闭后 qa 复核再解锁 |
| `REJECT` | 存在范围/正确性/安全/可行性硬伤 | 打回重做；重新提交评审 |

判定细则（与 `docs/05-delivery/TEST-PLAN.md` §9.4 一致，测试类门禁同规则）：

1. 任一 open **P0**、核心 E2E 失败、越权/沙箱逃逸成功、扫描有未豁免 Critical/High、覆盖率未达标 → **REJECT**。
2. 无 P0/P1 且必需项全绿 → **PASS**。
3. 无 P0，存在有 owner + 截止 + 验证方式的 P1/P2 行动项，且不阻塞主链路 → **PASS-WITH-ACTIONS**。
4. 证据不可复现（缺命令/日志/环境）或评审无逐项证据 → **不通过**（视同 REJECT）。
5. `NOT-RUN` 项无 `lead` 书面豁免 → **不通过**。
6. 同一门禁最多 2 轮 PASS-WITH-ACTIONS；第 3 轮必须 PASS 或 REJECT。
7. 安全/隔离类 P0：`qa-reviewer` 一票否决。
8. 门禁记录签署后修订，必须在文件内新增"修订记录"并注明原因，禁止静默改结论。

---

## 5. 记录模板（标准）

> 复制到 `docs/04-reviews/Gx-<topic>.md` 后填写；所有表不得留空，无证据写 `NOT-RUN` + 原因。

```markdown
# G<x> <主题> 评审记录

- 日期：YYYY-MM-DD
- 主持（Owner）：<owner>
- 评审人：<a>, <b>, <c>（注明每人评审的章节）
- 被评交付物：<路径列表>
- 证据位置：`docs/05-delivery/evidence/G<x>/<runid>/`
- 前置门禁：<Gx-1 结论 / 无>
- 结论：PASS | PASS-WITH-ACTIONS | REJECT

## 1. 检查项结论

| # | 检查项（来自 REVIEW-GATES Checklist） | 结论 | 证据/备注 |
|---|--------------------------------------|------|-----------|
| 1 | ... | ✅/⚠️/❌/NOT-RUN | 文件:行 / 命令输出 / 评审意见 ID |

## 2. 问题清单

| ID | 级别 | 位置 | 问题 | 建议 | 状态 |
|----|------|------|------|------|------|
| Gx-01 | P0/P1/P2/P3 | 文件:行 | ... | ... | open/closed |

## 3. 行动项（PASS-WITH-ACTIONS 时必填）

| ID | 行动 | Owner | 截止 | 验证方式（可复现） | 状态 |
|----|------|-------|------|--------------------|------|
| A1 | ... | ... | YYYY-MM-DD | 命令/测试 ID/证据路径 | open |

## 4. 评审人意见摘要（逐人，不得合并成"同意"）

| 评审人 | 覆盖章节 | 意见（问题 ID） | 结论建议 |
|--------|----------|-----------------|----------|
| ... | ... | Gx-01, Gx-03 | PASS-WITH-ACTIONS |

## 5. 豁免与 NOT-RUN（如有）

| 项 | 原因 | 补偿控制 | 批准人 | 日期 |
|----|------|----------|--------|------|

## 6. 签署

- qa-reviewer（汇总/判定）：____（日期）
- lead（放行）：____（日期）

## 7. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
|------|------|----------|--------|
```

---

## 6. 各门禁 Checklist（摘自 REVIEW-GATES.md §4，评审时逐条勾）

### G0 需求基线（lead 主持）
- [ ] 范围 In/Out 明确，无"待定"核心项
- [ ] 每条需求有可验收标准（可测）
- [ ] WBS 任务有 owner、依赖、写作用域
- [ ] 风险与假设已列出，且有对策
- [ ] 团队角色与门禁规则可执行

> qa 补充建议（已提交 G0 问题）：+ 上游能力基线一致性（OPENCODE-BASELINE §5 待核实项关闭计划）；+ NFR 有测量口径（负载/采样/观测点）。

### G1 产品定义（pm-research 主持）
- [ ] 竞品 ≥12 个，含 GitHub 链接、定位、架构、定价/许可、可借鉴点
- [ ] 结论有来源与日期；事实/推断分离
- [ ] 5 类角色画像 + 端到端旅程（含失败/异常路径）
- [ ] PRD 覆盖 E1–E10，优先级（RICE/P0-P2）合理
- [ ] 与 opencode 现有能力的差距分析一致（对照 `OPENCODE-BASELINE.md`）
- [ ] 指标（北极星/漏斗）可度量

### G2 架构（architect 主持）
- [ ] C4 上下文/容器/组件/部署四视图齐全
- [ ] 关键数据流覆盖：登录、拉起工作区、模型调用、技能安装、应用发布、MCP 调用
- [ ] 每用户 4C8G 隔离方案可证明（资源/网络/存储/身份）
- [ ] 工作区"退出不销毁、显式销毁"的状态机与回收策略明确
- [ ] 数据模型满足多租户（每表租户键/RLS 策略）
- [ ] API 契约可生成 SDK，错误码/幂等/分页/版本化规范
- [ ] 安全：STRIDE 威胁模型、密钥管理、SSRF/越权/沙箱逃逸对策
- [ ] 部署拓扑与容量模型（1,000 工作区）可推导
- [ ] ≥8 条 ADR，含备选方案与否决理由
- [ ] 失败模式与降级（模型网关故障、K8s API 故障、DB 故障）

> qa 补充建议：+ `OPENCODE-BASELINE.md` §5 八项待核实项全部关闭且有证据；+ 上游服务密码"知道即可签发会话"的风险有对策（BASELINE §2.1）。

### G3 设计（web-console 主持）
- [ ] 信息架构覆盖全部中心与角色
- [ ] 关键流程可点击走通（登录→拉起→使用→发布→分享）
- [ ] 空态/加载/错误/无权限/配额超限状态齐全
- [ ] 设计系统 tokens/组件/暗色亮色/响应式规范完整
- [ ] 无障碍 WCAG 2.1 AA 检查项
- [ ] 与 API 契约一致（字段/状态/错误码）

### G4 平台核心（platform-backend 主持）
- [ ] SSO 登录、会话、登出、越权测试通过
- [ ] API Key 生命周期与审计通过
- [ ] 模型策略下发 ≤30s 生效，未授权模型不可调用
- [ ] 工作区创建/就绪/销毁 E2E 通过，隔离测试通过
- [ ] 用量采集准确率 ≥99%（抽样对账）
- [ ] 控制台 MVP 主流程可用

### G5 能力中心（capability-centers 主持）
- [ ] Skill 发布→审核→安装→opencode 可用闭环
- [ ] 评测沙箱逃逸测试全部拦截；结果可复现
- [ ] 应用创建→构建→1C2G 部署→分享→SSO 访问闭环
- [ ] MCP 注册→绑定→调用→审计闭环；失效降级
- [ ] 四中心权限模型与租户隔离测试通过

### G6 质量与安全（qa-reviewer 主持）
- [ ] 单元/契约/E2E 覆盖率达标（核心模块 ≥70%）
- [ ] 安全扫描（SAST/DAST/镜像/依赖）无 P0/P1
- [ ] 性能压测达标（NFR 指标）
- [ ] 故障演练（Pod 杀死、DB 切换、网关超时）通过
- [ ] 成本模型与预算告警可用

### G7 部署验收（infra-devops 主持）
- [ ] Terraform plan 可复现；Helm 一键部署成功
- [ ] 灰度与回滚演练 ≤5min
- [ ] 备份恢复演练通过
- [ ] Runbook/告警/值班交接完成
- [ ] 验收报告与遗留风险清单签署

---

## 7. 行动项总台账（跨门禁跟踪）

> 只登记 PASS-WITH-ACTIONS 产生的行动项；关闭需复测证据，不得由 owner 自证。

| 行动 ID | 来源门禁 | 行动 | Owner | 截止 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| （待 G0 汇总后登记） | | | | | | |

---

## 8. 反模式（出现即判 REJECT / 记录无效）

- 用"后续完善"掩盖核心缺失（无隔离方案、无销毁策略、无安全模型）。
- 验收标准写成"体验良好""性能优秀"等不可测描述。
- 架构图无数据流/无失败模式；API 无错误码；数据模型无租户键。
- 评审只写"同意/没问题"而无逐项证据。
- 先写代码再补设计，倒逼门禁。
- 引用竞品/数据无来源。
- 把上游 opencode 的 README 当成本项目设计。
- 无 `lead` 豁免的 `NOT-RUN` 被记为 PASS。
- 门禁文件结论与索引/STATUS 不一致。

---

## 9. 本目录文件清单（随评审推进更新）

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `README.md` | 已建立 | 本索引与模板（task-7 交付） |
| `G0-requirements.md` | 待建立 | 三家意见齐后由 qa 落盘并请 lead 签署 |
| `G1-product-definition.md` | 待建立 | task-8 |
| `G2-architecture.md` | 待建立 | task-9 |
| `G3-design.md` | 待建立 | task-10 |
| G7 | 部署验收 | infra-devops | architect、qa-reviewer、lead | [`G7-deployment-acceptance.md`](G7-deployment-acceptance.md) | 已签署 | PASS-WITH-ACTIONS | 2026-11-04 | qa + lead |

---

## 10. 变更记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 建立门禁索引、文件命名规则、模板、判定规则、Checklist 摘录、反模式 | qa-reviewer |
