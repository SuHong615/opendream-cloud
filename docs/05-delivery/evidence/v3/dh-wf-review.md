# v3 DH/WF 静态评审证据（task-30 / 阶段 1）

- 日期：2026-11-08
- 评审人：qa-reviewer
- 被评：`docs/02-architecture/services/DIGITAL-HUMAN.md` v0.4、`WORKFLOW.md` v0.4
- 结论：**DH 5/5 closed；WF 5/6 closed（WF-QA-01 Schema 文件缺失）**；1 项跨域待 architect

## 1. DH（v0.4 复核）

| ID | 结论 | 证据 |
| --- | --- | --- |
| DH-QA-01 幂等键语义 | ✅ closed | `DIGITAL-HUMAN.md:372`：同键同 body→200 原 session；同键异 body→409 `idempotency_conflict`；无键重复→409 `dh_session_active` |
| DH-QA-02 RTC 重连/原因 | ✅ closed | `DIGITAL-HUMAN.md:238-251`：`reconnecting` 状态、≤2s×3 次、reason 枚举 + stage/retryable |
| DH-QA-03 错误映射 HTTP 列/reason | ✅ closed（附跨域） | `:424-443`：409/412/429/502/503 + `dh_*` 清单；跨域项 V3-DH-001（并入 openapi 1.1.0） |
| DH-QA-04 延迟测量口径 | ✅ closed | `:214-219`：ASR final→客户端 RTC 首帧、同区域/720p、≥3 轮/1000 样本；P50 1.2s/P95 1.8s 与 ADR-V3-03 一致；真机 NOT-RUN |
| DH-QA-05 Webhook 签名 | ✅ closed | `:403-405`：`"{timestamp}.{raw_body}"`、`X-DH-Signature: t=,v1=`、300s 窗/常量时间/event_id 去重 |

## 2. WF（v0.4 复核）

| ID | 结论 | 证据 |
| --- | --- | --- |
| WF-QA-01 DSL Schema | ⚠️ **部分** | `:379-430` 已给路径 `packages/schema/schemas/workflow-v1.json` + 10 条校验规则 + 节点必填表；**文件不存在（Test-Path=False）** → V3-WF-001 |
| WF-QA-02 Runtime Port 错误语义 | ✅ closed | `:453-470` 12 行（start 幂等/signal 404/409/400/human 404/409/412/cancel/replay 409/query 404） |
| WF-QA-03 状态机 | ✅ closed | `:497-517` 拆 `waiting_webhook`；`compensating` 失败→事件+`human_tasks(dead_letter)`，不新增状态 |
| WF-QA-04 human_tasks SLA | ✅ closed | `:762-800` `overdue/escalated`+`escalation_level`+`signal_id`、SLA 状态机/触发/事件、重复决策 409 `wf_task_already_decided` |
| WF-QA-05 隔离/公平 | ✅ closed | `:564-572` 跨租户隔离、加权轮询/maxTenantShare 50%、默认排队 10min、溢出 429 `wf_concurrency_exceeded` |
| WF-QA-06 版本兼容 | ✅ closed | `:314-330` 5 行兼容矩阵 + 校验器 5 步（`wf_dsl_incompatible`） |

## 3. 待办

| ID | 级别 | 事项 | Owner |
| --- | --- | --- | --- |
| V3-WF-001 | P1 | 补 `packages/schema/schemas/workflow-v1.json`（或明确替代路径/生成方式），否则 WF-DSL-01 无法执行 | architect/platform |
| V3-DH-001 | P2 | 10 个 `dh_*` reason 并入 openapi 1.1.0 ErrorReason | architect |

## 4. 真机 NOT-RUN（用户环境）

DH：RTC/GPU/TTS/lip-sync 延迟与 SLO；WF：Temporal 引擎/长流程/补偿；均要求真实环境（无 GPU/Temporal 时不冒充）。
