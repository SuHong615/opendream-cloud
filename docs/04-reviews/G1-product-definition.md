# G1 产品定义 评审记录

- 日期：2026-11-04
- 主持（Owner）：`pm-research`
- 评审人：`architect`（技术可行性）、`web-console`（旅程可落地/IA/体验）、`platform-backend`（E1–E3 抽样）、`capability-centers`（E4–E7 抽样）、`qa-reviewer`（汇总/可测性/门禁判定）
- 被评交付物：`docs/01-research/COMPETITORS.md`（v1.1）、`JOURNEYS.md`（v1.2）、`PRD.md`（v1.2）
- 证据位置：本记录 `文件:行` 引用；评审人原始意见见 §4（均只读评审，未改 `docs/01-research/`）
- 前置门禁：G0 = PASS（待 lead 签署）
- 结论：**PASS-WITH-ACTIONS**
  - 6/6 检查项满足（第 4 项为"有条件满足"，见 §1）；
  - 无开放 P0：capability-centers 提的 2 个 P0（stdio 凭证矛盾、E4 签名/索引适配）已在 PRD v1.2 修正/经 qa+architect 复核降级，见 §2.1；
  - 15 项 P1 行动项必须在 **G2 结论开始前**关闭并经 qa 复核；P2/P3 转 G2 行动项；
  - 未关闭 P1 前，本记录不解锁 G2 **结论**（G2 文档撰写可继续）。

---

## 1. 检查项结论（REVIEW-GATES §4 G1，6 项）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 竞品 ≥12 个，含 GitHub 链接、定位、架构、定价/许可、可借鉴点 | ✅ | COMPETITORS §1 共 18 行（16 个产品 + Skill 规范/MCP Registry）；8 个开源项目有 GitHub 链接（Coder/Gitpod/Daytona/DevPod/OpenHands/Dify/Coze/FastGPT），闭源产品给官网/文档链接（合理）；§2 逐产品含定位/架构/定价/可借鉴，未核实项显式标注（§5.1 精确 7 条目） |
| 2 | 结论有来源与日期；事实/推断分离 | ✅ | COMPETITORS 头注访问日期 2026-11-04；S1–S18 来源表（:289-310）；全文 `【事实】/【推断】/【未核实】/【事实·站点声明】` 标注；C7 已降为【事实+推断】（:28）；**行动**：7 条未核实补证（P2） |
| 3 | 5 类角色画像 + 端到端旅程（含失败/异常路径） | ✅ | JOURNEYS §1 P1–P5 画像（:37-90）；J1–J9 共 9 条，每角色有主角旅程（J1/J2、J3、J4、J5、J9）；每旅程含异常路径表 + 错误码（§0 13 码） |
| 4 | PRD 覆盖 E1–E10，优先级（RICE/P0-P2）合理 | ✅（v1.3 已修） | PRD §3 共 **68** 条（P0 28 / P1 35 / P2 5；E6-03/E6-05 拆 a/b 后 +2、新增 E6-09 +1，§5.1/§9 已同步）；P0 依赖 P1 的 3 处已标"依赖例外"；RICE Top10 |
| 5 | 与 opencode 现有能力差距分析一致（对照 BASELINE） | ✅（附条件） | PRD §4 逐项对照 BASELINE §2/§3（:249-259）；BASELINE §5 八项已由 architect 全部关闭并给 `文件:行`（ARCHITECTURE 附录 A）；3 项转化为验收前提（E3-04⑥/E4-03⑥/E2-05⑤，PRD:141/155/131）；**行动**：按 architect 结论改写为已关闭形态（G1-05/07/09，P1） |
| 6 | 指标（北极星/漏斗）可度量 | ✅ | WSS 定义 + 指标树 + 7 级漏斗 + 埋点事件名（PRD §1.2–1.4）；**行动**：WSS 口径需排除拉起失败（G1-20 附带，P2） |

> 判定：检查项 1/2/3/5/6 满足；第 4 项有 P1 级缺陷但可通过行动项关闭，不构成 REJECT。

---

## 2. 问题清单

> 编号规则：`G1-xx` 为 qa 汇总后的唯一编号；"原始 ID"保留各评审人编号便于回溯。
> 状态：`open`（须行动项关闭）/ `closed`（评审前已由 pm 修订，qa 复核）/ `→G2`（转 G2 承担，不阻塞 G1）。

### 2.1 原 P0 争议项（复核后无开放 P0）

| ID | 级别 | 位置 | 问题 | 复核结论 | 状态 |
| --- | --- | --- | --- | --- | --- |
| G1-P0-1 | P0→closed | PRD E7-01/E7-03（:188/:190）、JOURNEYS J7（:319-336）、PLAN R7.3（:154） | stdio MCP 支持与"凭证不出网关"矛盾（stdio 凭证只能经 `environment` 注入工作区，上游 `packages/schema/src/mcp.ts:26-32` 已核实 `LocalConfig.environment`） | pm 已按 lead 裁决修订：远程 MCP 走 Hub、凭证不出 Hub；stdio 仅"无凭证白名单"；凭证型 stdio 阻断并降 M5.2；E7-03⑤ 与 E7-01③ 一致，J7 增两条异常。**closed by scope change**（capability-centers 复核确认） | closed |
| G1-P0-2 | P0→P1 | PRD E4-03③⑥（:155）、E4-01（:153） | 评审人认为"平台签名 URL + 索引适配层"不成立：上游 `SkillDiscovery.pull` 固定 `GET {url}/index.json`、同 origin 逐文件 GET、query 签名被 URL 解析丢弃（`packages/core/src/skill/discovery.ts:92-145` 已核实）；索引 schema 锁死 `{skills:[{name,version?,files[]}]}`，`files` 必须含 `SKILL.md` 或 `<name>.md`；跨 origin 直接丢弃 | 上游只要求"同 origin + 固定 index.json 格式"，**平台自建源站并签发路径令牌即可满足**（`/s/{org}/{skill}/{version}/{token}/`），非不可实现；但 PRD 必须写死"路径令牌 + 15min TTL + agent 5min 双 token 续签 + 固定 index 格式"，否则实现会踩坑。**降为 P1**（G1-07），归属 G2 ADR-010 | 转 G1-07 |
| G1-P0-3 | P0→P1 | PRD E4-01②（:153） | 评审人补充证据：平台扩展字段若写进 `SKILL.md` frontmatter 会被上游静默丢弃（`skill-file.ts:8-13` 仅 4 键；`parse()` 42-74 行只读这 4 键），导致"声明即生效"无法证明，审核/评测权限数据与运行不一致 | 证据成立，必须修；但属"规范位置歧义"（双文件即可解决），不构成能力不可交付。**定级 P1**（G1-08）；若 G2 前未关闭，则 G2 方案无法证明 Skill 权限闭环——升为 G2 阻塞项 | 转 G1-08 |

### 2.2 合并后的问题清单

| ID | 级别 | 位置 | 问题 | 建议 | 原始 ID | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| G1-01 | P1 | PRD E3-02②（:139）vs E3-05④（:142） | 启动时效冲突：无预热 P95≤180s vs 冷启动≤90s；"预热池"未定义（architect 明确不做常驻预热 Pod：4C8G×50=200 vCPU 白烧） | 三档定义：C0 无缓存无预热≤180s；C1 镜像缓存/预热≤90s；C2 预热 Pod≤30s；E3-05 限 C1/C2；删"常驻预热 Pod"，改 pause 占位 Pod+抢占 | qa、G1-A01、G1-B14 | open |
| G1-02 | P1 | PRD E3-06①（:143）、E3-06②、JOURNEYS J2（:143） | 状态机 5 态 vs openapi `WorkspaceState` 9 态；②写"WebSocket 推送"但契约是 SSE `/api/v1/events`；J2"恢复中"无状态映射 | 直接引用 openapi 9 态（provisioning/starting/ready/idle/stopping/stopped/error/deleting/deleted）；推送改 SSE（Last-Event-ID 续传，轮询 ETag 兜底）；"恢复中"=starting+reason=restore | qa、G1-A02/A10、G1-B03、G1-WC-04 | open |
| G1-03 | P1 | JOURNEYS §0（:18-33）、PRD E5-05（:168）、E4-02 | 错误码三套并存：JOURNEYS 大写产品码（且 `EVAL_GATE_FAILED`/`APP_BUILD_FAILED` 标 HTTP 200）、openapi 通用小写码、centers 设计 `GATE_BLOCKED`；同一门禁错误 409/200 分歧 | 采纳 architect 两层模型：`error.code`=16 类通用码；`error.reason`=产品码 lower_snake（`EVAL_GATE_FAILED/GATE_BLOCKED→gate_blocked`）；发布端点 409 `precondition_failed`+reason，评测运行资源 200+`status=failed`；JOURNEYS §0 改为 reason 词表 | qa、G1-A04、G1-WC-03、G1-B13、centers E5-03 | open |
| G1-04 | P1 | PRD E8-02③（:200） | "嵌入式会话/终端（不新开窗口）"与 architect ADR 决策（MVP 新标签页、iframe Q2）冲突；这是对 P0 的降级，须 lead 确认 | 改"MVP 一键进入=新标签页直达；内嵌（iframe）Q2 交付，附容器边界 B1–B9 验收"；lead 签署确认降级 | G1-WC-02、G1-A03 | open（需 lead 确认） |
| G1-05 | P1 | PRD E3-04①⑥（:141）、E3-04③ | BASELINE §5-2 已关闭（不支持子路径：`web-ui.ts` 根路径 + `/_assets/*` 绝对路径 + `opencode_session` cookie 冲突）；PRD ①仍写"独立域名/路径"，⑥仍列待验证 | ①改"独立子域名 `w-<id>.ws.<domain>` + wildcard 证书"；⑥标"已关闭（architect，附录 A#2）"；"/w/{id}/ 子路径"写入 Out of Scope | G1-A05 | open |
| G1-06 | P1 | PRD E3-04③（:141） | "SSE 长连接稳定 ≥30min"与 BASELINE 附录 A-10（上游 `/api/event` 为 volatile SSE：慢消费者断流、断线丢事件）冲突，不能承诺零断开 | 改为"可见连续性：允许自动重连≤2s，会话/消息不丢（上游持久化），SSE 断开不计失败；30min 指标只约束 WS/PTY" | G1-B08 | open |
| G1-07 | P1 | PRD E4-03③⑥（:155） | BASELINE §5-3 已关闭：索引格式 `index.json` + 同 origin 相对文件；**签名令牌必须放路径**（query 被 URL 解析丢弃）；静态 URL 需续签否则随机 401 | ③改为"`skills[]` 注入路径令牌 URL；agent 每 5min 双令牌重叠续签（15min TTL）"；②≤2min 标依赖续签；⑥标已关闭（附录 A#3）；约束写入 ADR-010 | centers E4-02、G1-A06 | open |
| G1-08 | P1 | PRD E4-01②（:153） | 平台扩展字段 `version/permissions/compat/eval_baseline` 与 `SKILL.md` frontmatter 混写；上游 frontmatter Schema 只解析 `name/description/metadata/disable-model-invocation`，未知键被静默丢弃（`packages/core/src/config/plugin/skill-file.ts:8-13` 已核实） | 拆两文件：`SKILL.md`（原生 4 键）+ 平台清单（semver/permissions/compat/eval_baseline，如 `skill.yaml`）；校验器同时校验；明确"写入 frontmatter 的扩展字段不生效" | centers E4-01 | open |
| G1-09 | P1 | PRD E2-05④⑤（:131） | ④"与网关账单偏差≤1%"语义不成立（平台汇总的就是网关数据，同源）；⑤仍写"usage 事件可校验"，但 §5-7 已关闭（上游无通用 usage API，仅 `/experimental/usage/limits` 预算透传） | ④改"平台 `usage_records` vs LiteLLM spend log：`request_id` 幂等后 100% 一致；上游 session/stats 对账偏差≤2% 告警"；⑤标已关闭；权威=LiteLLM（ADR-013） | G1-A07、G1-B11 | open |
| G1-10 | P1 | PRD E3-03①③④（:140） | ①"Pod 仍 Running（或可重建）"二选一不可断言；③"5min 冷却撤销"与 ARCHITECTURE"默认 24h 可取消"冲突；④"PVC 保留 24h"与"pre_delete 快照保留 30 天"冲突且未区分 PVC/快照 | ①拆两条：24h 内无自动销毁动作/审计 + 若重建则数据 hash 一致；③统一"默认 24h 可配 5min–7d，期间工作区仍可用"；④拆"PVC 按 retainPolicy（默认快照后删）/快照保留 30 天可恢复/个人不可直接删 PVC" | qa、G1-B01、G1-B02 | open |
| G1-11 | P1 | PRD E3-04⑤（:141）、E3-01④（:138）、E7-02③（:189） | 跨租户越权写 403，但 DATA-MODEL 要求跨租户一律 404（防存在性探测）；E3-01"403/404"二义；MCP 列表/详情 404/403 二选一 | 统一策略：跨租户=404（不泄露存在性），同租户无权限=403；MCP 未授权资源一律 404；同步 openapi 描述 | G1-B04、centers E7-05、qa | open |
| G1-12 | P1 | PRD E2-06②③④（:132） | ②"≤30s 生效"未按变更类型拆分（provider/baseURL/托管策略需 ConfigMap 滚动 ≤2min）；④"拒绝或覆盖"二义 | 拆分：模型策略≤30s（观测点=`configAppliedRevision`/LiteLLM Key）；托管配置≤2min（滚动不销毁）；④改"托管文件只读+防篡改校验+漂移告警" | G1-B05 | open |
| G1-13 | P1 | PRD E2-02①③⑤（:128） | "组织/角色/用户三层取交集"无法表达显式 allow 例外；解析语义（deny 优先/精确 subject 优先）未定义；③"1k/10k 在线工作区≤30s"无 fan-out 观测点；⑤影响预览无精度 | 定义解析算法：deny 优先 → subject 精确 > role > org → priority；绑定观测点与 fan-out 规模假设；预览=只读计算、受影响用户数误差 0、响应≤2s | G1-B06、qa | open |
| G1-14 | P1 | PRD E1-01（:117） | 缺登出/全局登出验收（PLAN R1.1 要求）；④"立即失效"未定义时限与其他设备；③"默认 8h"未区分 idle/absolute | 补：登出 204+IdP 登出；全局登出≤5s；滑动续期+绝对上限可配；④改"该用户全部会话≤5s 失效" | G1-B07 | open |
| G1-15 | P1 | PRD E6-04②（:178） | `view/use/edit` 对通用 Web 应用无判定规则（"use=可调用能力"未定义哪些请求算调用） | 方法级规则：GET/HEAD=view，非 GET=use（或应用声明 `use_paths`）；403 语义与审计字段固定 | centers E6-01 | open |
| G1-16 | P1 | PRD E6-04⑥（:178）、E8-05 | 分享链接只写"可设过期"，缺防遍历/不可枚举/短期票据（PLAN R6.4 要求） | 补：分享 ID 128-bit 随机；列表接口不接受客户端 ID；统一 404；资源请求 ≤5min 票据绑 user+app；撤销≤5s | centers E6-02 | open |
| G1-17 | P1 | PRD E5-02③（:165） | "默认禁网+白名单域名≤20"未覆盖 SSRF：白名单域名可解析到私网/metadata，域名列表不防 DNS rebinding/十进制 IP | 补验收：拒绝 10/8、127/8、169.254.169.254、::1、fc00::/7 及"解析后私网"；连接前后双重校验 | centers E5-01 | open |
| G1-18 | P1 | JOURNEYS J1:111、J6:278、J2:143、J5:247、J7:319、J8:353、J6:282 | 旅程与契约/角色/上游能力不一致：①J1 步骤4 只写"网关注入 Basic/短期票据"，缺浏览器侧换票（openapi `/access-ticket` 60s 一次性）；②J6"在工作区点发布为应用"入口不可落地（上游只读）；③J2 混用工作区 GUI/控制台 surface，`idle/stopping/stopped` 语义缺失；④J5"平台公开"易误解为互联网公开；⑤J7 注册角色与 ROLES/IA 不一致；⑥J8"工作区顶栏用量条"需注入上游 GUI，不可行 | ①补"控制台 POST access-ticket → 新标签页 `?ticket=` → 网关验签→302 去 ticket；Basic 仅 gateway→上游内部"；②MVP 入口=控制台「应用中心→创建（选工作区）」，工作区入口列 P1；③每步标 surface+状态语义表；④改"平台内公开（跨租户，需登录）"；⑤统一角色（注册=author/org_admin，审批=team_owner/org_admin）；⑥改控制台配额 Banner+工作区详情配额卡+429 透传 | G1-WC-01/02/04/05/06/08/09、G1-A02 | open |
| G1-19 | P1 | PRD §8 风险表（:339-351） | 缺架构级风险，仅 R-01…R-10 | 至少补 6 条：①1000 并发首登冷启动风暴（thundering herd）；②通配符证书/DNS 单点；③LiteLLM/Redis 单点；④PVC 单 AZ + VolumeAttachment 阻塞；⑤上游升级破坏配置/技能格式；⑥审计/用量表膨胀（分区+归档） | G1-A08 | open |
| G1-20 | P1 | PRD NFR（:289-319）、§1.2 WSS（:33） | "就绪 P95≤90s / 1000 并发"未绑定场景与活跃率假设；WSS 把"拉起超时"计入会话错误（拉起失败发生在会话之前） | NFR 与 G1-01 三档绑定；补"1000 并发=10,000 用户×10% 并发率"；WSS 只统计会话内错误，拉起失败单独作漏斗 S2 指标 | G1-A09、G1-A12 | open |
| G1-21 | P1 | PRD §5.1（:255-257）、E5-05（:168）、E6-03（:177）、E6-05（:179）、E10-02（:237） | P0 需求依赖 P1 需求：E5-05←E5-02、E6-05←E6-04、E10-02←E10-01；E6-03/E6-05 双优先级（P0 配额/SSO + P1 运行时），§5.1 却计入 P0 | 拆 ID：E6-03a（配额与 1C2G 强制=P0）/E6-03b（资源状态=P1）；E6-05a（SSO 拦截=P0）/E6-05b（回跳体验=P1）；显式标注"P0 门禁能力可在 G5 交付，但验收前置需求升 P0 或标注依赖例外" | qa、G1-A14 | open |
| G1-22 | P2 | PRD / JOURNEYS 全文 | 追溯断链：JOURNEYS"对应 PRD"用 PLAN 的 R-ID（R3.9/R3.10/R6.8），PRD 用 `PRD-E` 编号；J9 出现 `R6-04` 混合格式；无 R-ID↔PRD-E-ID 映射表 | 增加追溯矩阵（PLAN R-ID → PRD-E-ID）；JOURNEYS 统一双编号或仅 PRD-E；禁止第三种格式 | qa | open |
| G1-23 | P2 | JOURNEYS 成功指标（:158/:261/:300/:336 等） | 旅程级指标未落 PRD 验收：J2 回访≤5s、J5 提交→上架≤30min、J6 创建→可访问≤10min、J7 注册→可调用≤2min、J9 ≤3s/审批≤4h | PRD 增"旅程级指标"表或在对应需求验收吸收，避免 G6 无验收依据 | qa | open |
| G1-24 | P2 | PRD §2.3 B3/B4（:101-102） | B3"应用与工作区解耦"、B4"应用不可升配"无验收条目（B2 有 E3-03、B7 有 E10-03） | 加验收：销毁工作区后应用仍可访问；E6-03 增"不可升配"断言 | qa | open |
| G1-25 | P2 | PRD E10-01④（:236） | "与云账单抽样偏差≤5%"依赖真实云账号，PLAN A5 允许无凭证（DEGRADED） | 增降级口径：无账单时用节点/Pod 资源清单+单价模型估算，标 DEGRADED + lead 豁免 | qa | open |
| G1-26 | P2 | JOURNEYS J1:121、J2:152、J6:295 | 异常路径用"`AUTH_SESSION_EXPIRED` 风格""`WS_LAUNCH_TIMEOUT` 变体"等模糊表述，契约不可实现 | 每个异常给唯一 reason 码或 `unknown` 兜底；禁止"风格/变体" | qa | open |
| G1-27 | P2 | PRD E4-04②（:156）、E4-06①（:158）、E4-02⑤（:154）、E4-05①（:157） | ①"用户授权范围"未定义且运行期无法强制 Skill 权限（Skill 是提示词非进程）；②技能调用次数无数据源（上游无逐次技能计量）；③下架 deprecate 与紧急 yank 未区分；④签名校验方未定义 | ①改"安装前展示+高危人工审批+`policies`/NetworkPolicy 兜底"，不宣称运行期沙箱；②拆"安装/启用/激活（近似）"与"精确调用 P2"；③区分 deprecate（已装可用）/yank（≤2min 移除+告警）；④补三处校验（上传/发布/agent 下载）+篡改必失败 | centers E4-03/04/06/05 | open |
| G1-28 | P2 | PRD E7-01④（:188）、E7-05④（:192）、E7-06④（:193） | ①OAuth 类 server 未授权前无法 10s 探活；②MCP 调用日志 180 天与设计 90 天在线+1 年冷存需明确分层；③"工具重名"概念混淆（真正冲突是 server 名） | ①拆分：none/api_key/header ≤10s；oauth2=`needs_auth` 授权后计时；②明确"管理审计 180 天在线；调用日志 90 天在线+冷存 1 年"或统一 180 天并计入成本；③改"同名 server 冲突可指定别名；工具重名不限制" | centers E7-02/03/04 | open |
| G1-29 | P2 | 四中心需求依赖列（:151-193） | 隐含依赖未写全：E4 缺 E2-06+E3；E5 缺 E2 配额+E3 快照；E6 缺 E1 SSO+域名基础设施；E7 缺 E1-04 审计+E10-02 配额 | 依赖列补齐，避免 G4 排期才发现跨模块阻塞 | centers X-01 | open |
| G1-30 | P2 | PRD E8.1 点击预算（:213-219） | 计数与路径不符：建 Key 计 3 实际 4；装 Skill 计 2 但需详情确认权限；未覆盖"分享给指定同事"（IA 为 4 次） | 由 G3 定稿点击预算表并回写 PRD；明确禁止"列表直装绕过权限确认"（建议计 3 次） | G1-WC-10 | →G3 |
| G1-31 | P2 | PRD E8-04（:202） | 只要求四中心五态；工作区/模型/用量/审计同样需要空/加载/错误/无权限/配额态 | 扩为"全部 P0 页面五态"，引用 G3 状态矩阵 | G1-WC-11 | →G3 |
| G1-32 | P2 | JOURNEYS 全文 | 缺 3 条旅程：API Key 创建+CLI（E1-03）、快照/恢复（E3-07）、自定义域名/证书（E6-06）；J9 未覆盖所有权转移 | 补 J10/J11/J12（可短旅程） | G1-WC-12 | open |
| G1-33 | P2 | JOURNEYS J4:215 | 声称审计导出 ≥180 天，但 qa 在 openapi `audit-logs` 未发现 90 天跨度限制（90 天限制见 usage 聚合 :1705）；"待证" | 请 web-console 给 `文件:行` 证据或撤回；若确有 90 天限制则旅程补分段/异步导出 | G1-WC-07 | open（待证） |
| G1-34 | P2 | PRD E1-03（:119）、E2-04③（:130）、E1-04（:120）、E3-09②（:146）、E1-05（:121） | ①API Key 哈希算法未指定（sha256/HMAC vs Argon2id 分歧）；②429 混用预算耗尽与限流；③"Key 每次使用落审计"与审计量存在采样/聚合定义缺口；④idle 阈值 30min vs 架构 15min；⑤SCIM 依赖外部条件 | ①指定 `HMAC-SHA256+pepper`（G2 定稿）；②拆 `model_budget_exceeded`/`rate_limited`；③安全事件 100%、认证成功/Key 使用按 1min 聚合可追溯；④统一配置项默认值；⑤SCIM 拆为独立需求 | G1-B09/10/12/15/16 | open |
| G1-35 | P2 | COMPETITORS §5.1（:314-330） | 7 个未核实条目无补证 owner/截止；6 个开源许可未读 LICENSE（Coder/Daytona/DevPod/Dify/Coze/FastGPT），涉及选型复用风险 | pm 在 G2 前补 7 条一手证据；architect 在 ADR 关闭 6 个许可核验（含许可证结论） | qa | open |
| G1-36 | P2 | JOURNEYS J4（:198-228） | J4 假设真实 ACK `terraform apply`，无 kind 降级路径；与 PLAN A5（可能无凭证）不一致 | 补"无凭证降级旅程"（kind + plan 验证 + DEGRADED 标注） | qa | open |
| G1-37 | P3 | COMPETITORS T-03（:283） | T-03"竞争激烈且易被商品化"由 Daytona 单一事实推出，未标【推断】 | 标【推断】或补第二条证据 | qa | open |
| G1-38 | P3 | JOURNEYS J1:126 | 成功指标"进度页离开率≤10%"与 R3.9"允许离开"冲突，可能诱导阻塞 UI | 改为观测指标（非门禁） | G1-WC-13 | open |
| G1-39 | P3 | PRD E2-06④（:132） | managed policy 防篡改"拒绝或覆盖"二选一（已并入 G1-12） | — | qa | closed（并入 G1-12） |
| G1-40 | P3 | PRD E5-03 复现口径 | 评审前已存在"偏差≤2% 无样本量"问题；pm 已改为 N=3/一致率≥95%/极差≤5% | 无需再改 | centers E5-02 | closed |

### 2.3 评审前已由 pm 修复、qa 复核确认（不重复开行动项）

| 问题 | 复核证据 |
| --- | --- |
| 优先级计数 27/33/5 与 PRD 不一致 | PRD:361 已为 28/32/5，与逐条清点一致 |
| 条件性验收标注缺失 | PRD:141（E3-04⑥）、:155（E4-03⑥）、:131（E2-05⑤）已含"待验证前提+责任人+G2 关闭点" |
| BASELINE 三项依赖无降级形态 | 同上 + PRD:259 §4 段已说明 |
| E8-01 点击预算依赖"待 G3 输出" | PRD 已加 §E8.1 点击预算表（G3 定稿） |
| E9-03 SLO 不可统计 | PRD:227 改为"失败到恢复绿灯 P90≤30min（近 30 天 CI）" |
| E5-03 可复现口径 | PRD:166 改为三层（L1 100%/L2 N=3/偏差≤5%） |
| 7 个【未核实】口径（原"6 个"） | COMPETITORS §5.1 逐条列出并声明"未被 PRD 用作事实依据" |
| E7 stdio 凭证矛盾（P0） | 见 §2.1 G1-P0-1 |
| E4 签名/索引（P0） | 见 §2.1 G1-P0-2（降 P1，G1-07） |

### 2.4 lead 裁决作为关闭依据（D15–D20 + 指定需求行）

> 来源：`docs/00-program/STATUS.md` §3 决策记录（lead 裁决）。以下裁决作为对应 G1 问题的权威结论；pm 按此改 PRD/JOURNEYS，qa 按此复核，不再重新讨论方案。

| 裁决 | 内容 | 对应 G1 问题 | 关闭效果 |
| --- | --- | --- | --- |
| D15 | 单一 OIDC RP = 控制面；MVP 移除 oauth2-proxy；工作区/应用网关用控制面签发短期 access ticket 换票 | G1-18（J1 换票）、会话/登出链路 | 方案定稿；pm 按此改 J1/PRD E3-04 |
| D16 | API Key 存储 = HMAC-SHA256(server pepper)，不做 Argon2id | G1-34① | 哈希算法争议关闭；仅需 PRD 写明 |
| D17 | 销毁冷却期默认 5min（可配 5–1440）+ PVC 24h + 快照 30d | G1-10③④ | 数值口径关闭（覆盖 ARCHITECTURE"24h 冷却"旧口径）；pm 改 PRD 并同步 ARCHITECTURE |
| D18 | SSE 只承诺"可重连的可见连续性"，不承诺零丢事件 | G1-06 | 冲突关闭；PRD E3-04③ 改写 |
| D19 | 跨租户访问返回 404（防枚举）；同租户越权 403 | G1-11 | 口径关闭；PRD/openapi 同步 |
| D20 | MVP 平台统一模型 Key；BYOK 为 P2，需管理员审批 | G1-09（计量/Key）、PRD 开放 Q4 | 范围关闭；PRD 标注 BYOK=P2 |
| 需求行 R3.3 | 生命周期（退出不销毁/显式销毁）——按 D17 与 PLAN R3.3 | G1-10 | 以 PLAN R3.3+D17 为准 |
| 需求行 R3.4 | 工作区访问——按 D15/D18（ticket + 可见连续性） | G1-06/G1-18 | 以 D15/D18 为准 |
| 需求行 R1.3 | API Key——按 D16（哈希）+ PLAN R1.5（应急吊销≤5s） | G1-14/G1-34 | 以 D16/R1.5 为准 |
| 需求行 R2.3 | 密钥托管——按 D20（MVP 平台 Key）+ PLAN R2.3 | G1-09 | 以 D20 为准 |
| 需求行 E8-02③ | 嵌入形态——lead 已纳入裁决组；执行口径以 architect B4 裁定（MVP 新标签页、iframe Q2）为准 | G1-04 | P0 降级由 lead 确认后关闭；若 lead 裁决不同，qa 按 lead 原文修正本记录 |

---

## 3. 行动项（PASS-WITH-ACTIONS）

> 关闭规则：pm-research 修订 → 消息附"修订位置（文件:行）+ 断言" → qa 复核 → 记录置 closed。
> **lead 裁决 D15–D20 已给出方案（§2.4），因此 A1–A12 主要是"文档对齐"工作，不需要重新讨论方案。**
> 截止：全部 P1 在 **G2 结论开始前**关闭；P2 可进 G2 台账；P3 排期。

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A1 | 修 G1-01/02（时效三档 + 9 态 + SSE） | pm-research + architect 复核 | G2 结论前 | PRD E3-02/E3-05/E3-06 行 + 引用 openapi 枚举；qa 复核 |
| A2 | 修 G1-03（错误码两层模型落地到 PRD/JOURNEYS） | pm-research | G2 结论前 | JOURNEYS §0 改 reason 词表；发布 409+reason、运行 200+status；qa 复核 |
| A3 | 修 G1-04/05/06（new-tab、子域名、SSE 连续性）+ lead 确认 P0 降级 | pm-research + architect + lead | G2 结论前 | PRD E8-02③/E3-04；lead 回复确认；qa 复核 |
| A4 | 修 G1-07/08（路径令牌+续签；SKILL.md 与平台清单分离） | pm-research + capability-centers | G2 结论前 | PRD E4-01/E4-03；ADR-010 引用；qa 复核 |
| A5 | 修 G1-09（计量权威与对账口径） | pm-research | G2 结论前 | PRD E2-05；ADR-013 引用；qa 复核 |
| A6 | 修 G1-10/11（销毁口径、跨租户 404） | pm-research + platform-backend 复核 | G2 结论前 | PRD E3-03/E3-04⑤/E3-01、E7-02；openapi 403/404 描述；qa 复核 |
| A7 | 修 G1-12/13（配置下发分类型、策略解析算法+观测点） | pm-research + platform-backend | G2 结论前 | PRD E2-02/E2-06；qa 复核 |
| A8 | 修 G1-14（登出/全局登出/会话时限） | pm-research | G2 结论前 | PRD E1-01；qa 复核 |
| A9 | 修 G1-15/16/17（use/edit 规则、分享防枚举、SSRF） | pm-research + capability-centers | G2 结论前 | PRD E6-04/E5-02；qa 复核 |
| A10 | 修 G1-18（7 处旅程 surface/角色/入口/术语） | pm-research | G2 结论前 | JOURNEYS 对应行；qa 复核 |
| A11 | 修 G1-19/20（补 6 条架构风险；NFR 场景+WSS 口径） | pm-research + architect | G2 结论前 | PRD §8/§1.2/NFR；qa 复核 |
| A12 | 修 G1-21（双优先级拆 ID；P0 依赖例外标注） | pm-research | G2 结论前 | PRD §5.1/E6-03/E6-05/E10-02；逐条计数校验=65；qa 复核 |
| A13 | G1-22/23/24/25/26/27/28/29/32/34/36（P2 组） | pm-research（部分转 G2/G3） | G2 台账或 G3 前 | 逐项在 PRD/JOURNEYS 修订或转 G2 台账；qa 复核 |
| A14 | G1-30/31 转 G3；G1-33 待证；G1-35 补证；G1-37/38 P3 | web-console / pm-research | G3 前 / G2 前 | G3 记录或 COMPETITORS v1.2 |
| A15 | G2 记录要求：BASELINE 8/8 关闭证据须含 `文件:行`（G0-16） | architect + qa | G2 记录 | G2 记录 §1 逐项证据格式 |

> 解锁判定：A1–A12 全部 closed + qa 复核 → G1 视为关闭 → G2 **结论**可开始（G2 文档继续撰写不受限）。

---

## 4. 评审人意见摘要（逐人，均只读评审）

| 评审人 | 覆盖范围 | 独立意见（原始 ID） | 结论建议 |
| --- | --- | --- | --- |
| architect | E3/E6/E7 可行性与 BASELINE 判定 + 四个契约矛盾裁定 | G1-A01…A15（3×P1 时效/状态/嵌入、P1 错误码×1、子域名/签名/计量×3、风险/NFR×2、P2×5、P3×1）；BASELINE §5-2/5-3/5-7 已关闭（`文件:行`，附录 A），不阻塞 G1 | PASS-WITH-ACTIONS |
| web-console | JOURNEYS 全文 + PRD E8/错误码 + 与 openapi/IA 一致性 | G1-WC-01…13（9×P1：换票/Basic、嵌入冲突、错误码映射、surface/状态、J6 入口、share 语义、审计跨度、MCP 角色、GUI 注入；2×P2；1×P3） | PASS-WITH-ACTIONS |
| platform-backend | E1/E2/E3 抽样 + NFR/开放问题（对照 ARCHITECTURE/DATA-MODEL/openapi） | G1-B01…B16（8×P1：销毁/快照、9 态、404、配置下发分类型、策略解析、登出、SSE volatile；6×P2：Key 哈希、429 拆分、审计采样、idle 阈值、SCIM、错误码风格；2×P3） | PASS-WITH-ACTIONS |
| capability-centers | E4–E7 抽样 + 上游源码证据 | 2×P0（stdio 凭证、签名/索引）+ 6×P1（SKILL frontmatter、权限不可强制、调用数据源、SSRF、use/edit 规则、分享防枚举）+ P2/P3；E7 stdio 已由 pm 按 lead 裁决修复 | PASS-WITH-ACTIONS |
| qa-reviewer | 三文档全文 + 65 条四类抽查（无数字/无观测点/无错误码/依赖未定）+ 跨文档一致性 | 独立发现：G1-01/02/10/11/13/21/22/23/24/25/26/30/31/32/33/34/36/37/38；并复核评审人关键证据（skill-file.ts、discovery.ts、mcp.ts、openapi 9 态/access-ticket） | PASS-WITH-ACTIONS |

---

## 5. 豁免与 NOT-RUN

| 项 | 说明 | 处理 |
| --- | --- | --- |
| 抽样覆盖 | platform-backend 仅抽样 E1–E3，capability-centers 仅 E4–E7；**E8 由 web-console、E9/E10 无独立领域评审人**（qa 已自审并列出 G1-25/34 等） | 不记为 NOT-RUN（有 qa 独立覆盖），但 G2 由 infra-devops 复核 E9、architect 复核 E10 计量/审计（写入 G2 记录） |
| 竞品未核实 | 7 条定价/SSO 未取得一手证据（非 PRD 验收依据） | G1-35 行动项，不阻塞 |
| BASELINE 待核实 | 8/8 已由 architect 关闭（`文件:行`） | 无豁免；三项转化为 G1-05/07/09 验收前提 |

---

## 6. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：4 位评审人意见全部并入；3 个 P0/P0 级争议项均已复核（1 个 scope-change 关闭、2 个降为 P1 并附上游 `文件:行` 证据）；无开放 P0；A1–A12（P1）须关闭后解锁 G2 结论；A13–A15 转 G2/G3 台账；lead 裁决 D15–D20 作为关闭依据（§2.4）。
- lead（放行）：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。确认：① E8-02③ 降级为 MVP 新标签页、iframe 列 Q2/P2；② 2 个 P0 降 P1（G1-07/G1-08），**必须在 G2 结论前关闭，否则升 G2 阻塞**；③ A1–A12（P1）全部在 G2 结论前关闭。G2 结论前若 A 项未关，不得给 PASS。

---

## 7. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：6 项检查项、2 个原 P0 复核、40 项合并问题、A1–A15 行动项、5 位评审人意见摘要 | qa-reviewer |
| v0.2 | 2026-11-04 | 并入 capability-centers 补充证据（E4-01 frontmatter 升为 P0-3 并定 P1、E4 签名/索引 P0 降 P1）；并入 lead 裁决 D15–D20+指定需求行作为关闭依据（§2.4）；签署说明更新 | qa-reviewer |
