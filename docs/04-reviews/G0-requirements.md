# G0 需求基线 评审记录

- 日期：2026-11-04
- 主持（Owner）：`lead`
- 评审人：`pm-research`（范围/优先级）、`architect`（技术可行性/边界）、`qa-reviewer`（可测性/门禁可执行性）
- 被评交付物：`README.md`、`docs/00-program/{PLAN,ROLES,REVIEW-GATES,OPENCODE-BASELINE,STATUS}.md`、`docs/00-program/G0-SELF-CHECK.md`
- 证据位置：本记录 §1/§2 的 `文件:行` 引用（G0 属需求基线，证据为文档级）
- 前置门禁：无
- 结论：**PASS**（qa 已判定；待 lead 签署）
  - qa 提出 15 项（9×P1、6×P2）→ 全部由 lead 关闭并经 qa 读源复核；
  - pm-research 提出 10 项（8×P1、2×P2）→ 全部由 lead 关闭并复核；
  - architect 反馈：**无 P0/P1，同意 PASS**（附 1 条 P2 建议，转 G2 检查项）；
  - 无开放 P0/P1；签署后 G0 解锁 M0 完成态。

---

## 1. 检查项结论

> 清单来源：`REVIEW-GATES.md` §4 G0（lead 已增补 2 项，共 7 项）。

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 范围 In/Out 明确，无"待定"核心项 | ✅ | PLAN §3.1 In 10 Epic；§3.2 Out 5 项；§10 开放问题标注"不阻塞 P1/P2" |
| 2 | 每条需求有可验收标准（可测，含测量口径） | ✅ | PLAN §4 R1.1–R10.5；R3.2 双档 90s/180s、R3.3 可验证化、R9.5 量化 RPO/RTO、R10.4/R10.5 量化；§5 引用 TEST-PLAN §2 Q-01..Q-09（PLAN:195）。残余可测性问题转 G1（A-G0-01，已由 G1 四类抽查覆盖） |
| 3 | 与上游 opencode 能力基线一致 | ✅ | OPENCODE-BASELINE v2.2.5 / `4f271bc`；PLAN A4/风险 8；REVIEW-GATES G2 增"§5 八项 8/8 关闭"（:67）；architect 已 8/8 关闭并给 `文件:行` 证据（ARCHITECTURE 附录 A） |
| 4 | NFR 可度量，且引用测试口径 | ✅ | PLAN:195；TEST-PLAN §2 Q-01..Q-12 |
| 5 | WBS 任务有 owner、依赖、写作用域 | ✅ | PLAN §8 T0.1–T7.4 + T6.0；T6.1 依赖"G2 契约冻结"；T6.2 文件名 `G6-quality-security.md`；P1 串行依赖已解除 |
| 6 | 风险与假设已列出且有对策 | ✅ | PLAN §3.3 A1–A5（A5 `DEGRADED`+lead 豁免）；§9 风险 1–9（新增 9 服务密码=根凭证） |
| 7 | 团队角色与门禁规则可执行 | ✅ | ROLES §1/§2/§4（安全基线 architect 撰写、qa 独立审计，:25）；REVIEW-GATES P0–P3、命名/模板/反模式；task-1..10 |

---

## 2. 问题清单

### 2.1 qa-reviewer 提出（G0-01…G0-15，全部 closed）

| ID | 级别 | 位置 | 问题 | 建议 | 状态 |
| --- | --- | --- | --- | --- | --- |
| G0-01 | P1 | PLAN §5、R3.2/R2.6/R6.4 | 时效指标缺测量口径 | 引用 TEST-PLAN §2 | closed（PLAN:195） |
| G0-02 | P1 | REVIEW-GATES G2 清单 | 未要求关闭上游 8 项待核实 | 增 8/8 前置 | closed（:67） |
| G0-03 | P1 | ROLES §2 | 安全基线职责与写作用域冲突 | architect 撰写、qa 审计 | closed（ROLES:25） |
| G0-04 | P1 | REVIEW-GATES §2 | 缺陷级别缺 P3 | 补 P3+映射 | closed（:25） |
| G0-05 | P1 | STATUS vs PLAN §7 | G1/G2/G3 并行与顺序矛盾 | 明确并行边界+一致性复核 | closed（STATUS §5） |
| G0-06 | P1 | PLAN §5 vs R10.3 | 审计留存与删除边界 | 审计留存不随删除、脱敏 | closed（PLAN:187） |
| G0-07 | P1 | R3.3 | 24h 持久不可 CI 验证/idle 未定义 | 可验证表述+LMT-3 | closed（PLAN:103） |
| G0-08 | P1 | R9.5 | 备份无 RPO/RTO | 量化 | closed（PLAN:178） |
| G0-09 | P1 | A5/风险1 | 无凭证时证据等级缺失 | `DEGRADED`+豁免 | closed（PLAN:71） |
| G0-10 | P2 | T6.1/T6.2 | 依赖与文件名不符 | 依赖改 G2；统一命名 | closed（PLAN:314-315） |
| G0-11 | P2 | 风险 4/BASELINE §2.1 | 服务密码=根凭证未单列 | 单列风险+G2 专章 | closed（PLAN:341） |
| G0-12 | P2 | DoD | 证据目录未规定 | 引用 evidence/Gx/<runid>/ | closed（PLAN:362） |
| G0-13 | P2 | P6 | 缺测试环境任务 | 新增 T6.0 | closed（PLAN:313） |
| G0-14 | P2 | G0 清单 | 缺基线/NFR 两项 | 补两项 | closed（:44-52） |
| G0-15 | P2 | E10 | R10.4/R10.5 偏定性 | 量化为 6 类操作/5 篇教程 | closed（PLAN:188-189） |

### 2.2 pm-research 提出（pm-G0-01…10，全部 closed）

| ID | 级别 | 位置 | 问题 | lead 处置 / 复核 |
| --- | --- | --- | --- | --- |
| pm-G0-01 | P1 | R3.2/R3.9 | 时效双档未定义、进度展示与就绪冲突 | 已关闭：R3.2 双档、R3.9 可测化 |
| pm-G0-02 | P1 | R6.4 | 缺撤销/过期验收 | 已关闭：撤销≤5s + 410 |
| pm-G0-03 | P1 | R3.3 | 冷却期不可测 | 已关闭：5min 撤销 + PVC 24h |
| pm-G0-04 | P1 | R1.3/§7 | Key 应急吊销缺失 | 已关闭：新增 R1.5 |
| pm-G0-05 | P1 | NFR vs 风险2 | 并发与常驻成本冲突 | 已关闭：并发=同时活跃；容量模型归 G2 |
| pm-G0-06 | P1 | WBS P1 | 串行依赖不合理 | 已关闭：去串行 |
| pm-G0-07 | P1 | R4.2/R5.5 | 双门禁顺序/SLA 未定义 | 已关闭：评测→审核 + SLA≤30min |
| pm-G0-08 | P1 | A2/Q2 | 企微/钉钉非 OIDC | 已关闭：OIDC 优先 + G2 适配 ADR |
| pm-G0-09 | P2 | G1 评审人 | 缺 backend/capability | 已关闭：评审人扩容（本轮已召集） |
| pm-G0-10 | P2 | G0 清单 | 缺差异化市场依据 | 已关闭 |

### 2.3 architect 提出（已闭合，1 条转 G2）

| ID | 级别 | 位置 | 问题 | 处置 |
| --- | --- | --- | --- | --- |
| G0-16 | P2 | REVIEW-GATES G2 清单 | "BASELINE 8/8 关闭"需规定证据格式（`文件:行`），否则易形式化通过 | 转 G2 检查项（qa 在 G2 记录中要求逐项 `文件:行` 证据；architect 已在 ARCHITECTURE 附录 A 按此格式给出 8/8） |

---

## 3. 行动项台账

| ID | 行动 | Owner | 截止 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- | --- |
| G0-01…G0-15 | 见 §2.1（15 项） | lead | 2026-11-04 | 对应 `PLAN/ROLES/REVIEW-GATES/STATUS` 位置，qa 已逐条读源复核 | closed |
| pm-G0-01…10 | 见 §2.2（10 项） | lead | 2026-11-04 | 同上（G1 评审时已确认 R1.5/R3.9/R3.10/R4.2 SLA/R6.8 等新增条目存在） | closed |
| G0-16 | G2 检查项增加证据格式要求 | qa-reviewer | G2 评审前 | G2 记录 §1 要求"8/8 关闭 + `文件:行`" | closed（已转入 G2 清单） |
| A-G0-01 | G1 阶段逐条验证 PRD 可测性 | pm-research（qa 复核） | G1 | G1 记录已做四类抽查（无数字/无观测点/无错误码/依赖未定）并产出 G1 问题清单 | closed（见 G1 记录） |

---

## 4. 评审人意见摘要（逐人）

| 评审人 | 覆盖章节 | 意见（问题 ID） | 结论建议 |
| --- | --- | --- | --- |
| qa-reviewer | PLAN 全文、ROLES、REVIEW-GATES、BASELINE、STATUS | G0-01…15 + G0-16 | PASS（全部行动项已关闭并经复核） |
| pm-research | PLAN §4/§5/§7/§8 | pm-G0-01…10 | PASS（全部已由 lead 关闭；另补正 7 个【未核实】条目口径） |
| architect | PLAN §3/§4/§5/§7/§9、REVIEW-GATES | **无 P0/P1**；1 条 P2 = G0-16 | **同意 PASS** |

---

## 5. 豁免与 NOT-RUN

| 项 | 原因 | 补偿控制 | 批准人 | 日期 |
| --- | --- | --- | --- | --- |
| 无 | — | — | — | — |

> 后续门禁（G4–G7）的环境降级规则见 TEST-PLAN §1.4 与 PLAN A5。

---

## 6. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS**：3 位评审人意见全部并入；无开放 P0/P1；19+15 项问题全部关闭并经复核；G0-16 转入 G2 检查项。
- lead（放行）：`lead` 2026-11-04 —— **签署通过（PASS）**：qa 汇总与 architect/pm 意见已并入，无开放 P0/P1。

---

## 7. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 建立记录：7 项检查项、qa 15 项、A-G0-01 转 G1、暂记 PASS-WITH-ACTIONS | qa-reviewer |
| v0.2 | 2026-11-04 | 并入 pm-G0-01…10 原文与关闭证据；补 7 个【未核实】口径 | qa-reviewer |
| v0.3 | 2026-11-04 | 并入 architect"无 P0/P1 同意 PASS"+G0-16（转 G2）；A-G0-01 由 G1 关闭；结论升级为 PASS，待 lead 签署 | qa-reviewer |
