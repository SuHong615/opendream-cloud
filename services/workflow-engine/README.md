# workflow-engine（M3-1）

Bun + Fastify 工作流引擎 MVP，端口 **4105**，内存 store。

## 契约

- 唯一权威：`openapi 1.1.0`（workflow 7 paths / 15 ops）+ `ARCH-V3 §4.7/§23.4` + `G-V4-CONTRACT §3`。
- **canonical**：`/api/v1/workflow-definitions`、`/workflow-definitions/{id}`、`/workflow-definitions/{id}/versions`、`/workflow-versions/{id}`、`/workflow-instances`、`/workflow-instances/{id}`、`/{id}/cancel`、`/{id}/signal`、`/{id}/events`、`/human-tasks`、`/human-tasks/{id}/decision`。
- **MVP alias（1.2 `x-mvp-alias`）**：`/api/v1/workflows`、`/workflow-runs`、`/workflow-templates`；`POST /workflows/{id}/publish` = 创建不可变版本并置 latest。
- **内部**：`POST /internal/workflow-runs/{id}/advance`（不公开）。
- 错误两层：`{error:{code,reason,message,details,request_id}}`；`reason` 使用 `wf_*`（`wf_dsl_invalid` 400、`wf_run_not_found` 404、`wf_version_immutable` 409、`wf_human_task_expired` 409…）。
- `publish` 语义：创建不可变 `WorkflowVersion`（`immutable=true`、`dsl_hash`、`published_at`），并更新 `latest_version_id`；无独立公开 publish 契约端点。

## 运行/测试

```bash
cd services/workflow-engine
bun test
PORT=4105 bun src/server.ts
```

## 节点

DSL 10 类节点均通过 `packages/schema` 校验；执行语义覆盖 `agent/mcp_tool/human_approval/condition/parallel/timer/webhook`（MVP 合成执行），`script/subworkflow/render` 合成占位；`compensate` 按逆序 Saga 补偿。

## UI 契约（web-console）

- 模板目录：`GET /api/v1/workflow-templates`（11 个：SDLC 6 + 客服/审批/数据/运维/数字人 5）→ `{items:[{id,category,name,display_name,description,dsl}]}`。
- 定义列表：`GET /api/v1/workflows?cursor&limit` → `{items:[WorkflowDefinition],next_cursor}`；创建：`POST /api/v1/workflows {template_id|dsl, name?}`。
- 发布：`POST /api/v1/workflows/{id}/publish {dsl?}`；运行：`POST /api/v1/workflows/{id}/runs {inputs}` → `WorkflowInstance`。
- 人工任务：`GET /api/v1/human-tasks?status=pending` → `WorkflowInstance` 关联；`POST /api/v1/human-tasks/{id}/decision {decision:approve|reject|request_changes,comment?}`。
- 实例详情：`GET /api/v1/workflow-runs/{id}`（含 `status`、`started_at/finished_at`）；事件：`GET /api/v1/workflow-runs/{id}/events`。
