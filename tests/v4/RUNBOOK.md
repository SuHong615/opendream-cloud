# V4 本地运行手册（task-44）

> 状态：workflow-engine / digital-human **骨架已落盘，但 `src/server.ts` 入口缺失** → 当前不可运行。
> 入口落盘后按本手册启动并运行 `V4_RUN=1` 全套。

## 1. 服务与端口

| 服务 | 端口 | 启动 | 健康 |
| --- | --- | --- | --- |
| control-plane | 4000 | docker compose / `bun apps/control-plane/src/server.ts` | `/healthz` |
| workflow-engine | **4105** | `bun run --cwd services/workflow-engine start` | `/healthz` |
| digital-human | **4106** | `bun run --cwd services/digital-human start` | `/healthz` |
| console | 3000 | docker compose / `next dev` | `/login` |
| app-center / mcp-hub / local-gateway | 4103 / 4104 / 8080 | compose | `/healthz` |

- control-plane env：`WORKFLOW_URL`（默认 `http://workflow-engine:4105`）、`DIGITAL_HUMAN_URL`（默认 `http://digital-human:4106`）；本地直跑改 `127.0.0.1`。
- 启动前检查：`curl 127.0.0.1:4105/healthz`、`4106/healthz` 均 200。

## 2. 门面路径（control-plane 代理）

- workflow：`/api/v1/workflows*`、`/workflow-runs*`、`/workflow-templates*`、`/human-tasks*`，canonical `/workflow-definitions*`、`/workflow-instances*`、`/workflow-versions*`；健康 `/api/v1/workflow-service/health`。
- DH：`/api/v1/dh*`；健康 `/api/v1/digital-human/health`。
- 门面：session 必填；写操作 CSRF；`x-oc-*` 透传；上游停 **502 `upstream_error`**；审计 best-effort。

## 3. 运行命令

```powershell
# 1) 起服务（入口落盘后）
$env:PORT='4105'; bun run --cwd services/workflow-engine start   # 另一个终端
$env:PORT='4106'; bun run --cwd services/digital-human start

# 2) QA 套件
$env:V4_RUN='1'; $env:CONTROL_PLANE_URL='http://127.0.0.1:4000'
bun test tests/workflow tests/digital-human tests/mcp-admin tests/app-collab

# 3) UI E2E（console 3000 + 服务就绪）
$env:E2E_READY='1'; $env:E2E_BASE_URL='http://localhost:3000'; $env:PLAYWRIGHT_CHANNEL='chrome'
bunx playwright test -c tests/e2e --grep "V4"
```

## 4. console testid（已落盘）

- `/workflows`：`workflows-page`、`workflow-create`、`workflow-create-submit`、`workflow-card`、`workflow-publish`、`workflow-start`、`workflow-start-submit`、`workflow-run`、`workflow-run-detail`、`workflow-cancel`、`workflow-retry`、`workflow-node`、`human-task`、`human-approve`、`human-reject`、`human-decision-dialog`、`workflow-status`。
- `/digital-human`：`dh-page`、`dh-create`、`dh-session`、`dh-input`、`dh-send`、`dh-end`、`dh-message`、`dh-avatar`、`dh-voice`、`dh-status`。

## 5. 门禁口径

- 契约：openapi 1.1.0 无改动；路由覆盖 missing=known-gaps open；别名等价（workflows/workflow-runs/DH messages/end）。
- 门面：401 / 403(CSRF) / 404(跨租户) / 502(upstream_error)；code16+reason58+request_id；写审计 100%；SSE Last-Event-ID 不丢不重；`/advance`、`/dh/webhooks` 不裸奔。
- known-gaps 56 项（P0/P1 不得入台账）；预期 PASS-WITH-ACTIONS，P0/P1=0 才 PASS。
