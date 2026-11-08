# Eval Center（G5 服务骨架）

基于 **FROZEN** `docs/02-architecture/openapi.yaml` 与 `centers/ROUTES.md` 的评测中心骨架：12 公开 ops + 5 内部端点。

## 启动

```bash
cd services/eval-center
bun run dev      # http://127.0.0.1:4102
bun run test
bun run typecheck
```

| 环境变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `4102` | 监听 |
| `DEFAULT_ORG_ID` / `DEFAULT_USER_ID` | dev UUID | 租户模拟默认值 |
| `RUNNER_IMAGE_DIGEST` | `sha256:dev` | 报告 `env_fingerprint` 用（骨架占位） |
| `MOCK_RUN_MS` | `0` | mock 调度延迟（0=同步完成） |

租户模拟头：`x-oc-org-id` / `x-oc-user-id`（G4 就绪后换网关注入）。

## 已实现（公开 12 ops）

- Datasets：`listEvalDatasets`、`createEvalDataset`、`getEvalDataset`、`listEvalDatasetVersions`
- Runs：`listEvalRuns`、`createEvalRun`、`getEvalRun`、`listEvalResults`、`cancelEvalRun`
- Report/baseline：`getEvalRunReport`（`?compare_to=`）、`listEvalBaselines`、`createEvalBaseline`

内部（不进公开网关/SDK）：`/internal/eval/specs`、`/internal/eval/compare`、`/internal/eval/gates/skill`、`/internal/eval/runs/{runId}/reproduce`、`/internal/eval/webhooks/ci`。

## 契约要点

- `eval_runs.status` **9 态**：`queued|preparing|running|collecting|grading|completed|failed|canceled|timed_out`。
- `EvalResult.case_id` 为 **string**（数据集内 ID），分页 `?cursor&limit`。
- 报告返回 `EvalReport`（`failed_top5`/`deltas`/`env_fingerprint`）。
- 门禁：`POST /internal/eval/gates/skill` 返回 `{passed, run_id, reasons[]}`；Skill 发布侧据此返回 `409 precondition_failed + reason=gate_blocked`。
- **run 自身失败不是错误**：`200` + `status=failed`。

## 未实现（G5 集成阶段）

| 项 | 说明 |
| --- | --- |
| 真实 Job 调度 | `src/jobs.ts` 仅 `JobScheduler` 接口 + `MockJobScheduler`；K8s Job 实现待接 infra（`RuntimeClass=sandbox-runtime`、禁网、限额） |
| 数据集/产物存储 | 内存；后续 OSS（`eval_dataset_versions.archive_sha256`/`archive_key`） |
| 评分器 | 骨架按固定规则生成 `pass/fail`；规则/LLM-judge/脚本评分器与 `env_fingerprint` 实算待 M5.2 |
| 持久化/审计 | 内存 store；PG + RLS + audit/outbox 集成阶段补 |
| 报告分享/导出 | 骨架不含 share token 与 CSV 导出 |

## 契约自检

`bun run test` 的 `contract.test.ts`：公开 ROUTES ⊆ 冻结 openapi、opId 命中、P2 为 0、内部端点不进公开路由、9 态枚举、门禁 409 语义。
