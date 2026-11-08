# ADR-013：计量的权威源是 LiteLLM spend log，而非上游 session/stats

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / platform-backend / qa-reviewer
- 关联：`ARCHITECTURE.md §6.3`、`DATA-MODEL.md usage_records`、PLAN R2.5/R10.1、BASELINE §5#7

## 背景

需求：按用户/工作区/模型统计 token 与成本，5 分钟内可查，可导出，可对账（R2.5/R10.1）。需要确定"哪个数据源算钱"。

上游可提供的（已核实）：
- `GET /api/experimental/session/stats?from&to&tools=` → `SessionStats.Info`：tokens 分项、`cost`、按模型聚合、工具使用。**会话级聚合**，受会话删除/编辑影响。
- `GET /api/experimental/usage/limits` → **官方 OpenCode Console 预算透传**（需其 integration 凭证；403 返回空），与平台无关。
- 事件流有 session 事件，但无逐请求 token/cost 的稳定契约。

LiteLLM 提供：`/spend/logs`（逐请求：key、user、model、tokens、cost、request_id、latency、status）。

## 决策

**权威计量源 = LiteLLM spend log**，同步到平台 `usage_records`（`request_id` 幂等），聚合到 `usage_hourly`；**上游 `session/stats` 每 15 分钟拉取用于对账**，偏差 >2% 告警。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 用上游 session/stats 作为权威** | ① 会话级聚合，非逐请求，无法做精确账单与实时限额；② 用户删除会话会改变统计；③ 无法覆盖 Git/重试等多次调用的细粒度成本；④ 跨工作区聚合需要 1000 次调用（拉取成本高）；⑤ 6 位小数成本估算可能与供应商账单不一致。**只能做对账** |
| **B. 供应商账单 API（月结）** | 滞后（T+1 天到 T+1 月），无法实时配额；且供应商账单里没有"我们的用户/工作区"维度 |
| **C. 自研代理计费（在 gateway 解析所有请求）** | 需要解析流式响应计算 token（易错）；与 LiteLLM 重复；且会漏掉非流式/工具调用 |
| **D. 只记录请求数不记 token** | 不满足 R2.5 与成本可见 |
| **E. 每工作区本地统计 + 定期上报** | 上报不可靠（Pod 可能被删）、可被用户篡改、聚合复杂 |

## 后果

**正面**
- 逐请求粒度 → 可做精确配额、实时看板、账单。
- `request_id` 天然幂等，重放安全。
- 与供应商成本口径一致（LiteLLM 计算同样基于价格表）。
- 上游零改造，不需解析响应。

**负面 / 代价**
- 依赖 LiteLLM 可用性（异步同步，失败可重试；不影响用户使用）。
- 需要在 LiteLLM 配置稳定价格表（`models.dev` + 平台价格同步）；价格变更需重算历史（仅影响展示，账单按当时价格）。
- spend log 表会增长（LiteLLM 自己的 PG）→ 需要其保留策略与归档。
- 同步延迟（5min 级）→ 看板显示"截至 X 分钟前"；实时限额在 LiteLLM 侧执行（不依赖平台同步）。

## 实现要点

- 同步器：每 5min 拉 `/spend/logs?start_date=...`，按 `request_id` upsert（`ON CONFLICT DO NOTHING`），从虚拟 Key metadata 反解 `org_id/user_id/workspace_id`（缺失则拒收 + 告警，防漏记）。
- 聚合：每小时聚合到 `usage_hourly`（3 年保留），明细 180 天。
- 对账：每日拉取各工作区 `session/stats`，与 `usage_records` 汇总比对；差异 >2% 或负数 → 告警并生成对账报告。
- 价格：`models` 表维护 input/output 单价；与 LiteLLM price map 同步；变更留审计。
- 导出：CSV（R8.6）由 `usage_hourly` 生成；导出行为审计。

## 验证

- 记账准确性：抽样 100 次调用，LiteLLM 与平台记录 token/cost 完全一致（>99.5%）。
- 幂等：重复拉取不产生重复行。
- 对账：人为制造 5% 偏差 → 告警触发。
- 缺失租户：Key metadata 缺 `org_id` → 拒收 + 告警（不能静默计入"未知"）。
- 延迟：调用发生后 ≤5min 可查。
