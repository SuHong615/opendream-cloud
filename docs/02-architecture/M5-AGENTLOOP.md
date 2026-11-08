# M5：AgentLoop 质量与治理平面

> 状态：M5a 已实现（Trace/Eval/Backtest/Gate + 控制台入口）；真实 Agent-as-Judge/实验/安全策略为后续。
> 契约：[PLANE-CONTRACT](../PLANE-CONTRACT.md)

## 1. 范围

`services/agentloop`（`:4112`）提供：

- Trace 上报/查询；
- EvalRun：按 Trace 状态与 span 状态计算通过率；
- Backtest：数据集回测（复用 EvalRun 逻辑）；
- QualityGate：阈值门禁；
- Summary：Trace/Eval/Gate 统计；
- SQLite 持久化、幂等、租户隔离。

**不做**：
- 不执行 Agent；
- 不写 Run/Approval；
- 不替代 LoopForge 审批（只输出 verdict）。

## 2. API

```http
POST /api/v1/quality/traces
GET  /api/v1/quality/traces/{trace_id}
POST /api/v1/quality/eval-runs
GET  /api/v1/quality/eval-runs
POST /api/v1/quality/backtests
POST /api/v1/quality/gates
GET  /api/v1/quality/gates
GET  /api/v1/quality/summary
```

## 3. 治理规则

- Trace 由 AgentCore/Harness 产生，AgentLoop 只读消费；
- EvalRun 结果用于发布门禁；
- Gate 只给 `min_score` 与 verdict，不写审批；
- 跨租户不可见；PII 脱敏与保留策略后续（M5b）。

## 4. 验收

| 检查 | 结果 |
| --- | --- |
| AgentLoop 测试 | 3/3 pass |
| BFF 链路 | trace 201 → eval passed 201 → gate 201 → summary 200 |
| 失败 trace | eval failed |
| 幂等/租户 | 通过 |
| 控制台 | 指挥中心显示质量统计 |

## 5. 控制台

新增 `/quality` 页面：

- Trace / EvalRun / QualityGate 统计；
- 最近 EvalRun、Gate、Trace 列表；
- 用于质量平面可视化与发布前检查。

## 6. 后续

1. Agent-as-Judge、RAG/Tool/Trace 评测器；
2. A/B 实验与显著性；
3. Replay（确定性）与 Backtest（数据集快照）分家；
4. 安全策略/PII/保留/SLO；
5. 发布门禁接入 LoopForge。
