# G3 产品设计 评审记录

- 日期：2026-11-04
- 主持（Owner）：`web-console`
- 评审人：`pm-research`、`architect`、`qa-reviewer`（汇总/判定）
- 被评交付物：`docs/03-design/`：IA.md（63KB，v1.1）、DESIGN-SYSTEM.md（33.5KB）、SCREENS.md（119.7KB，18 屏 + 全局页）、prototype/index.html（27KB 可点击原型）
- 前置门禁：G1 = PASS-WITH-ACTIONS（已签署）；G2 = PASS-WITH-ACTIONS（已签署，G4 条件项待关）
- 结论：**PASS-WITH-ACTIONS**
  - G3 六项检查：5/6 满足；"与 API 契约一致"为有条件满足（6 处枚举/路径/参数名不一致）；
  - **无 P0**：pm 把"点击预算冲突"标 P0，qa 复核后定 **P1**（理由见 G3-01；若 lead 坚持 P0，则本记录应改 REJECT 直至修订）；
  - P1 × 10、P2 × 11、P3 × 4；P1 必须在 G4 前端联调前关闭。

---

## 1. 检查项结论（REVIEW-GATES §4 G3 六项）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 信息架构覆盖全部中心与角色 | ✅ | IA §2 站点地图（Mermaid）+ §2.2 路由清单（155）+ §1 六类控制台角色/功能矩阵（42-93）+ §4 五角色视角（286-320）；四大中心 + 工作区/模型/用量/审计全覆盖 |
| 2 | 关键流程可点击走通（登录→拉起→使用→发布→分享） | ✅（附 G3-01/02/03/05 修正） | IA §5 F1–F10（326-508）+ prototype/index.html（登录→拉起→工作区→详情→分享面板可点击）；S4 明确 new-tab 主路径 + P1 容器边界 B1–B9 |
| 3 | 空态/加载/错误/无权限/配额超限齐全 | ✅ | IA §6.1 状态矩阵（511）+ §6.2 全站状态枚举（529）+ 12 类异常态规范；SCREENS 每屏含异常表；S18 门户 403/404/休眠/唤醒/5xx/会话过期 6 态 |
| 4 | 设计系统 tokens/组件/明暗/响应式完整 | ✅ | DESIGN-SYSTEM §1 token 三层、§2 色板+对比度校验、§8 30 组件状态、§9 六档响应式、§11 中英双语；**注意 G3-10 嵌入承诺需删** |
| 5 | 无障碍 WCAG 2.1 AA 检查项 | ✅（附 G3-11 口径） | DESIGN-SYSTEM §10 逐条映射（396-415）+ §10.5 CI gate（`@axe-core/playwright`，critical/serious=0）；键盘映射、焦点、ARIA 策略 |
| 6 | 与 API 契约一致（字段/状态/错误码） | ⚠️ 有条件满足 | SCREENS §21 自检声称"主体一致"，但 architect 核对发现 6 处 P1：`/providers` vs `/model-providers`、`status` vs `state`、`/wake` vs `/start`、skill installation 路径、share `private` 枚举、2 个未定义端点；另 MCP health 枚举 `unavailable` vs `down`（P2） |

> 判定：1/2/3/4/5 满足；第 6 项 6 处 P1 属可直接改文档的对齐项，不构成 REJECT。

---

## 2. 问题清单（合并 architect 14 + pm 16 + qa 独立）

> `G3-xx` 为合并编号；原始 ID 列保留。级别按 qa 复核后定；`P0→P1` 项已注明理由。

| ID | 级别 | 位置 | 问题 | 建议 | 原始 ID | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| G3-01 | P1（原 P0，已关闭） | IA §8.1:777 vs PRD E8-01:204 | 点击预算"分享给指定同事=4 次"与 PRD P0"≤3 次"冲突；**lead 裁决：PRD 改为"核心任务 ≤3 次、分享 ≤4 次（含权限预览）"** | pm 已于 PRD v1.4 落盘：PRD:207（E8-01 改口径）、PRD:215-217（§E8.1 例外行 + 口径说明）、PRD:392（变更记录）；**IA §8.1 的 4 次保留，无需 web 再改** | G3-PM-01（P0） | **closed（lead 裁决；qa 已复核 PRD:207/215-217）** |
| G3-02 | P1 | IA F2:394 vs F10:502、PRD E3-03③/D17 | 销毁冷却期内部矛盾：F2 写"24h 可撤销"，F10 写"5 分钟可撤销"；D17/PRD=5min 可配 | 统一"默认 5min（可配 5–1440），期间可撤销 + 倒计时" | G3-PM-02 | open |
| G3-03 | P1 | IA F10:500 | "勾选『保留快照（推荐）』"暗示用户可放弃快照直接删 PVC；与 PRD E3-03④"默认先快照后删、个人不可直接删 PVC"冲突 | 改只读说明 + 默认勾选不可取消；删 PVC 仅管理员/合规路径 | G3-PM-03 | open |
| G3-04 | P1 | SCREENS S2:198-205 | 拉起失败分诊码与契约不一致：`resource_exhausted`/`timeout`/`image_pull_failed`/`quota_exceeded` 不在词表；"timeout=5 分钟"与 PRD 180s 冲突；quota 标 429 而 PRD 为 409 | 统一 wire reason（`ws_launch_timeout`/`ws_image_pull_failed`/`ws_quota_exceeded`/`orchestrator_unavailable`/`unknown`）+ 180s + HTTP 码 | G3-PM-04 | open |
| G3-05 | P1 | SCREENS S2:191 | "ready 后 2s 自动进入（可取消）"与"新标签页默认"冲突，自动 `window.open` 会被弹窗拦截 | 改"ready 后显示『进入工作区』主 CTA，用户点击开新标签页；仅同页兜底可自动" | G3-PM-05 | open |
| G3-06 | P2（转 G2 台账） | SCREENS S2:165/214 | 进度条用确定百分比 68% + 预计剩余，但 PRD 只承诺 4 阶段、openapi 无 `progress.pct` | 改阶段式不确定进度条 + 已用时（MVP 更稳）；或 openapi 补 pct 并定义缺失容忍。**owner=architect + web-console，进 G2 台账** | G3-PM-06 | open（G2 台账） |
| G3-07 | P1 | IA F6:444 | 应用来源含"模板/Git 仓库"，PRD E6-01 只定义"从工作区创建"——设计承诺了 PRD 没有的能力 | 删或标 P2（建议删/标 P2，本期范围紧） | G3-PM-07 | open |
| G3-08 | P1 | IA §9 A7:822 | 审批范围"MVP 仅 Skill 上架审批；配额/域名 P1"与 PRD E10-02（P0 申请提升→审批）不一致；域名绑定无审批定义 | 配额提升审批=P0；域名绑定=管理员直接操作 + 审计（不需审批）；同步 A7 | G3-PM-08 | open |
| G3-09 | P1 | IA §6.2:544 vs PRD E4-02 | Skill 版本状态两套：IA `draft/scanning/scan_failed/evaluating/in_review/published/rejected/deprecated` vs PRD `draft→validating→eval_pending→…` | 以 openapi 状态枚举为唯一源；IA 的 scanning/scan_failed 作为子态映射或补 PRD 映射说明 | G3-PM-09 | open |
| G3-10 | P1 | DESIGN-SYSTEM §9:384-385 | "lg 1024–1279 工作区嵌入可用""xl 嵌入最佳"与 PRD E8-02③（iframe=P2）、IA A3（new-tab MVP）冲突 | 改"嵌入为 P2 实验特性，默认关闭"；删除"嵌入可用"承诺 | G3-PM-10 | open |
| G3-11 | P1 | IA:546/555、SCREENS:669/682 | 分享范围 `private` 与"API 无 private 枚举"自相矛盾；App 可见性（private/org/public）与 share scope（public/org/users）混为一个枚举 | 定稿：App.visibility=private/org/public；share.scope=public/org/users；"仅自己"=无 share 记录；`VisibilityBadge` 改名 | G3-A01 | open |
| G3-12 | P1 | SCREENS:614、IA:168 | 端点 `/api/v1/providers` vs 契约 `/api/v1/model-providers`；BYOK `/provider-keys` 已降 P2，MVP 入口应隐藏 | 改 `/api/v1/model-providers`；MVP 隐藏 BYOK 入口 | G3-A02 | open |
| G3-13 | P1 | SCREENS:301 | 工作区列表参数 `status=` vs 契约 `state=`（9 态枚举） | 改 `state=`；筛选与 SSOT 对齐 | G3-A03 | open |
| G3-14 | P1 | SCREENS:399/436、IA:391 | `/workspaces/{id}/wake` 契约不存在（只有幂等 `/start`） | 统一 `POST /workspaces/{id}/start`（stopped→启动，ready/idle→no-op）；文案"唤醒"保留 | G3-A04 | open |
| G3-15 | P1 | SCREENS:702/1602、技能安装节 | Skill 安装路径 `/skills/{id}/installations` vs 契约 `/skills/{id}/install` + `/skill-installations/{id}` | 用 `POST /skills/{skillId}/install` + `PATCH/DELETE /skill-installations/{id}`；uuid 为 ID | G3-A05 | open |
| G3-16 | P1 | SCREENS:1147/1148 | `GET /apps/slug-available`、`GET /app-templates` 契约未定义 | MVP 改前端本地校验 + 创建 409 兜底，隐藏模板入口；或补契约 | G3-A10 | open |
| G3-17 | P2 | SCREENS:622/1372/1375、IA:545 | MCP 健康枚举 `unknown/healthy/degraded/unavailable` vs 契约 `healthy/degraded/down/unknown` | 统一 `down`；"不可用"是文案不是枚举值 | G3-A06 | open |
| G3-18 | P2 | SCREENS:333/383 | access-ticket 响应漏 `base_url`（降级/新标签页）与 `fallback_url`（换票失败重试） | 补两字段；UI 明确 ticket 只出现一次、网关 302 移除 | G3-A07 | open |
| G3-19 | P2 | IA:391、SCREENS:291 | idle 阈值写 ≥15min，PRD/契约是 30min | 改"默认 30min（可配）" | G3-A08 | open |
| G3-20 | P2 | IA:394 | 销毁未提快照 30 天与"删除后 30 天可恢复" | 补"PVC 24h 快速恢复 → 快照 30 天内恢复"；恢复入口=工作区详情 | G3-A09 | open |
| G3-21 | P2 | SCREENS:436、应用详情 | `GET /apps/{id}/health`、`/metrics`、`/deployments/{d}/logs`、`/suspend` 部分未定义 | health/metrics 用 apps 内嵌字段 + 现有 logs（deployment_id 过滤）；不新增 metrics 端点 | G3-A11 | open |
| G3-22 | P2 | SCREENS 技能/评测/审计 | 13 个端点契约未定义（skill reports/reviews/rollback/access-requests、eval report/exports/shares、audit 详情/actions、me/preferences、workspace files、snapshot restore、mcp probe/tools） | 下轮补 6 个 MVP 必需（版本回滚、eval report、audit 详情+actions、snapshot restore、mcp tools）；`/workspaces/{id}/files` 不做控制面端点（网关直通上游 `/api/fs/*`）；其余标 P2 | G3-A12 | open |
| G3-23 | P2 | IA:391/394、SCREENS 流程 | 未体现"换票失败 → fallback_url 重试"与"工作区 error 态 retry（不重复扣配额）" | 补两处异常路径 + `POST /workspaces/{id}/retry` | G3-A14 | open |
| G3-24 | P2（已关闭） | DESIGN-SYSTEM §10.5:451 vs PRD E8-07 | CI 要求 axe critical/serious=0，PRD 只写"0 critical" | **lead 裁决：采纳 serious=0 进 PRD**（更严）；pm 落盘 PRD E8-07 后 qa 验证 | G3-PM-11 | closed（lead 裁决 2026-11-04） |
| G3-25 | P2 | IA F6:447 | 默认应用域名 `*.apps.example.com` 未在 PRD 定义（E6-06 只写自定义域名+ICP） | PRD 增"默认应用域名模版+通配符证书"验收，或 E6-06 补默认域 | G3-PM-12 | open |
| G3-26 | P2 | IA F4:421 | "回滚需重新过准入或标记豁免（见 openapi 待对齐）"；openapi 已落盘，未引用具体端点；PRD 回滚≤2min 未说明是否重跑评测 | 明确：回滚到已过评测历史版本=免评测；回滚到未过版本=拒绝；引用 openapi 端点 | G3-PM-13 | open |
| G3-27 | P2 | IA F8:473 | 用量查询"最长跨度 90 天"在 PRD 无对应约束（90 天仅在 E1-04 审计） | PRD E2-05 补"单次查询跨度 ≤90 天，导出支持分段"或 IA 标性能限制 | G3-PM-14 | open |
| G3-28 | P2 | IA §8.1:781 vs PRD §E8.1 | 新建 API Key 计数"2 次（第 3 次确认）"vs PRD"3 次"，确认是否计入口径不同 | 统一"确认点击计入预算"并注明 | G3-PM-15 | open |
| G3-29 | P3 | IA:7 | "openapi 即将落盘"已过期 | 改"已落盘（73 paths/106 ops/233 schemas）" | G3-A13 | open |
| G3-30 | P3 | prototype/index.html | 原型未附可访问性/键盘可达说明；G3 要求主流程可点击走通与 AA | G3 记录标注原型=视觉/流程验证；a11y 由 G6 axe/键盘脚本覆盖；原型补"仅鼠标路径"说明 | G3-PM-16 | open |

---

### 2.5 G3 行动项关闭复核（web-console 2026-11-04 提交，qa 抽核）

| 行动项 | 状态 | 复核证据（qa 抽核，当前文件） |
| --- | --- | --- |
| A-G3-2 销毁 5min + 快照不可取消 | ✅ closed | IA:395/503（冷却 5min 可配 5–1440、先快照后删、个人不可删 PVC）；SCREENS:499/517（`keep_snapshot` 强制 true、`delete_pvc` 个人不可设） |
| A-G3-3 拉起页 reason/180s/new-tab | ✅ closed | SCREENS:189（阶段式、无 pct）、190（>90s 慢、>180s `ws_launch_timeout`）、191（主 CTA 用户点击开新标签页，不自动）、193/203（quota 409、reason 分诊卡） |
| A-G3-4 范围/状态/嵌入 | ✅ closed | IA:822（iframe P2 默认关）、SCREENS:38/329/360/369/378（嵌入改 P2）、SCREENS:544（Skill 枚举以 openapi 为源）、IA:444（模板/Git P2）、IA:826（审批范围定稿） |
| A-G3-5 契约 6 处 P1 | ✅ closed | `state=`（SCREENS:301 等）、`/start`（291/399/436）、`/model-providers`（619）、`/skills/{skillId}/install`（705/796）、share 无 private（IA:553-558、SCREENS:1246-1248）、slug-available/templates 移除依赖（1138/1149-1151） |
| G3-17/18/19（P2） | ✅ closed | idle 30min（IA:537/821）；ticket 补 `base_url`/`fallback_url`（SCREENS:333/434/437）；MCP `down`（1378/1399） |
| G3-26/28/29/30（P2/P3） | ✅ closed | 回滚引用 publish + 已过评测免评测（IA:421）；API Key 3 次计数（IA:783/787）；过期文案（IA:7/820）；原型范围说明（SCREENS:1663） |
| G3-20/21/22/23/25/27 | open（pm/architect） | 默认域名、health/metrics、端点缺口、fallback/retry、用量跨度——待 pm PRD / architect openapi（G4/G5 台账） |

> 结论：web-console 已完成 **A-G3-2…5 + 8 项 P2/P3**；G3 剩余 open 项均为 pm/architect 侧，不阻塞 G4 前端联调。

---

## 3. 行动项（PASS-WITH-ACTIONS）

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-G3-1 | ~~**G3-01** 点击预算冲突定稿~~ | web-console + pm-research | 已裁决 | **lead 裁决：PRD 核心任务 ≤3 / 分享 ≤4**；pm 落盘 PRD §E8.1，IA §8.1 加同口径注释；qa 复核后 closed |
| A-G3-2 | **G3-02/03** 销毁口径（5min、快照不可取消） | web-console | ✅ closed（2026-11-04） | 证据见 §2.5（IA:395/503、SCREENS:499/517） |
| A-G3-3 | **G3-04/05/06** 拉起页错误码/CTA/进度条 | web-console | ✅ closed（06 转 G2 台账） | 证据见 §2.5（SCREENS:189/190/191/193/203） |
| A-G3-4 | **G3-07/08/09/10** 范围与状态对齐 | web-console + pm-research | ✅ closed | 证据见 §2.5（IA:822/444/826、SCREENS:38/329/544） |
| A-G3-5 | **G3-11…16** 契约命名 6 处 | web-console | ✅ closed | 证据见 §2.5（SCREENS:301/291/619/705/1138、IA:553-558） |
| A-G3-6 | **G3-17…23** 枚举/字段/异常路径（P2 组） | web-console + architect | ✅ 部分（17/18/19/26/28/29/30 closed；20/21/22/23/25/27 转 G4/G5 台账） | §2.5；转出项 owner=pm/architect |
| A-G3-7 | **G3-24…28** PRD↔设计口径 | pm-research + web-console | 部分（24 已裁决、28/29 closed；25/27 待 pm） | PRD/IA 同步；转 G4 台账 |
| A-G3-8 | **G3-29/30** 过期文案与原型说明（P3） | web-console | ✅ closed | IA:7/820、SCREENS:1663 |

---

## 4. 评审人意见摘要（逐人）

| 评审人 | 覆盖 | 独立意见 | 结论建议 |
| --- | --- | --- | --- |
| architect | IA/SCREENS/DS 与 openapi 一致性（14 条，含 `文件:行`） | G3-A01…A14（6×P1 枚举/路径/参数、6×P2、1×P3）；确认 9 态/cursor/两层错误/ticket 新标签页/销毁 5min+PVC24h 已对齐；指出 share `private` 契约无枚举，G2 以契约为准 | PASS-WITH-ACTIONS |
| pm-research | IA §0–2/§5 F1–F6/§6/§8/§9；SCREENS S1–S2/S12–S14/S18（未逐屏读 S3–S11/S15–S17，已声明） | G3-PM-01…16（1×P0 点击预算、10×P1、4×P2、1×P3）；指出设计未跟上已签署裁决（D17/new-tab）；G3-PM-01 愿由 pm 承担 PRD 侧修订 | PASS-WITH-ACTIONS |
| qa-reviewer | IA/DESIGN/SCREENS 结构 + §6 状态矩阵 + S4/S14/S18 抽查 + 原型 | 独立发现 G3-02（IA F2/F10 冷却期内部矛盾）、G3-08（审批范围 vs E10-02）；确认状态矩阵 12 类、AA 逐条表、S14 ACL、S18 六态质量高；将 G3-PM-01 由 P0 降为 P1（理由见 §2） | PASS-WITH-ACTIONS |

---

## 5. 豁免与 NOT-RUN

| 项 | 说明 | 处理 |
| --- | --- | --- |
| 逐屏通读 | pm 未读 S3–S11/S15–S17（时间盒，已声明）；qa 抽查 S4/S14/S18 + 状态矩阵 | 不记 NOT-RUN（有 qa 抽查补位）；剩余屏由 G4 前端联调时按 SCREENS §21 自检表复核 |
| 原型 a11y | prototype 仅鼠标路径，无键盘/屏幕阅读器验证 | a11y 由 G6 axe/键盘脚本覆盖（TEST-PLAN L3/L5）；G3 记录标注原型范围 |
| 嵌入（iframe） | MVP 不做，P2 实验 | 与 lead 裁决一致；不属 NOT-RUN |
| G3-PM-01 | **已关闭**：lead 裁决"核心 ≤3 / 分享 ≤4（权限预览不可省）"，pm 已落盘 PRD v1.4（:207/:215-217），qa 已复核 | closed |

---

## 6. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：六项检查 5/6 满足（契约一致性有条件）；无开放 P0（G3-01 经 lead 裁决"PRD ≤3 核心/≤4 分享"关闭，pm 落盘后 qa 验证）；A-G3-2…8 须在 G4 前/台账关闭。
- lead（放行）：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。确认：① **G3-01 维持 P1**，按裁决"核心任务 ≤3 次、分享 ≤4 次（权限预览不可省）"关闭（pm 已在 PRD v1.4 落盘，qa 已复核 PRD:207/215-217）；② G3-24 axe serious=0 采纳进 PRD；③ G4 前端联调条件 = A-G3-2…5 关闭（A-G3-1 已关闭）。

---

## 7. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：6 项检查、30 项合并问题（2 位评审人 + qa）、A-G3-1…8、逐人意见、NOT-RUN 与豁免 | qa-reviewer |
| v0.2 | 2026-11-04 | lead 签署；G3-01 按裁决关闭（PRD:207/215-217 已复核）；G3-24 axe serious=0 采纳；G3-06 转 G2 台账 | qa-reviewer |
| v0.3 | 2026-11-04 | 补 §2.5 行动项关闭复核：A-G3-2…5 + G3-17/18/19/26/28/29/30 closed（web-console 提交，qa 抽核）；剩余 20/21/22/23/25/27 转 G4/G5 台账；openapi 计数更新 95–96 paths/131 ops | qa-reviewer |
