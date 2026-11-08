# G4 实施计划：本地可运行纵向切片（Vertical Slice）

- 版本：v0.1
- Owner：lead（编排）；实施：platform-backend / web-console / infra-devops / capability-centers / qa-reviewer
- 前置：G2 架构 + G3 设计 PASS（task-9 / task-10 签署）
- 目标：在**无 Docker / 无 K8s 集群**的本机环境，交付"可运行 + 可测试 + 可部署"的第一版平台骨架

---

## 1. 为什么要"纵向切片"

全量平台体量大。G4 先打通一条端到端链路，证明架构可落地，再横向扩展能力中心（G5）：

```
浏览器登录 → 控制台 → 确保工作区（Mock Provisioner）→ 状态 ready → 打开访问票据
                                   ↘ 模型列表/策略 → 虚拟 Key（Mock LiteLLM）
                                   ↘ 审计事件 / 用量记录
```

同时交付 K8s 制品（Operator + manifests + Helm），无集群时以 `go build` + `kubectl kustomize`/YAML 校验作为证据，门禁标注 `DEGRADED`。

## 2. 技术决策（MVP）

| 层 | 选型 | 理由 / 与文档差异 |
| --- | --- | --- |
| 包管理 | **Bun workspaces**（bun 1.4.3 本机可用；pnpm 缺失） | 与 opencode 一致；无需额外安装 |
| 控制面 | TypeScript + **Fastify 5** + Zod | 文档写 NestJS/Fastify，MVP 取 Fastify（ADR-016 记录） |
| ORM/DB | Drizzle ORM + **bun:sqlite**（本地）/ Postgres（生产 DDL 同构） | 本机无 Postgres；SQLite 做本地跑通，生产走 PG + RLS |
| 会话 | HttpOnly `oc_sess`（HMAC 签名，dev） | 生产用 `__Host-` + 控制面 OIDC |
| 访问票据 | HMAC-SHA256 JWT（dev）→ ed25519（生产） | 60s 一次性 ticket |
| 控制台 | **Next.js 15** + React 19 + Tailwind | 与 SCREENS/设计系统一致 |
| Operator | **Go + controller-runtime**（本机有 Go） | 标准 K8s 实现 |
| 工作区运行时 | Dockerfile（debian + Bun + opencode 锁定版本） | 本机无 Docker，只能静态校验 |
| 部署 | Kustomize（kind）+ Helm chart 骨架 | 无 kubectl/helm 时做 YAML/schema 校验 |

> ADR-016「MVP 用 Fastify 而非 NestJS」需在 G4 启动时由 architect 确认；如反对，改用 NestJS（工作量 +1 天）。

## 3. 仓库结构（G4 产物）

```
package.json                    # bun workspaces: apps/* services/* packages/*
tsconfig.base.json
apps/
  control-plane/
    src/
      server.ts                 # Fastify 装配
      env.ts
      db/                       # drizzle schema + migrate + seed
      modules/
        auth/                   # dev-login, session, api-key guard
        models/                 # providers/models/policies + mock LiteLLM
        workspaces/             # state machine, provisioner, access ticket
        audit/                  # 审计写入
        usage/                  # 用量记录
      provisioner/
        types.ts                # Provisioner 接口
        mock.ts                 # 本机内存/文件实现
        k8s.ts                  # @kubernetes/client-node 实现（编译通过即可）
    test/                       # bun:test 集成测试
    package.json
  console/
    app/                        # Next.js App Router
      (auth)/login
      (dashboard)/workspaces
      (dashboard)/models
      (dashboard)/skills
      (dashboard)/apps
      (dashboard)/mcp
      (dashboard)/audit
    lib/api.ts
    package.json
packages/
  shared/                       # 共享类型/Zod schema/错误码
services/
  workspace-operator/           # Go operator：CRD + reconcile
    api/v1alpha1/opencodeworkspace_types.go
    internal/controller/
    cmd/main.go
    Dockerfile
  workspace-agent/              # 占位：G5 实现配置同步
deploy/
  docker/workspace/Dockerfile
  kind/                         # namespace/CRD/operator/control-plane/pg/redis/ingress
  helm/opendream-cloud/          # Chart.yaml/values/templates
tests/
  e2e/api-flow.test.ts          # 登录→建工作区→ready→ticket→销毁
scripts/
  dev.ts                        # 一键启动控制面 + 控制台
```

## 4. 任务与验收

| ID | 任务 | Owner | 验收 |
| --- | --- | --- | --- |
| T4.1 | Monorepo 脚手架 + 根配置 + `bun run dev/test/build` | infra-devops | `bun install` 成功；根脚本可跑 |
| T4.2 | 控制面：dev 登录/会话/API Key/RBAC 基础 | platform-backend | 未登录 401；登录后 200；API Key 可鉴权；越权 403/404 |
| T4.3 | 模型中心：providers/models/policies + 虚拟 Key mock | platform-backend | 创建模型→策略→工作区拿到 model 列表；未授权不可见 |
| T4.4 | 工作区：ensure/get/start/stop/destroy/cancel + 状态机 + ticket | platform-backend | 状态迁移合法；非法迁移 409；ticket 60s 且一次性（mock 校验） |
| T4.5 | Mock Provisioner + K8s Provisioner 接口 | platform-backend | 单测覆盖状态机；K8s 实现 `tsc` 通过 |
| T4.6 | Operator（Go）：CRD + reconcile（Deployment/PVC/Service） | infra-devops | `go build ./...` 通过；单测 reconcile 关键路径 |
| T4.7 | 运行时镜像 + workspace-agent 占位 + 配置模板 | infra-devops | Dockerfile 静态检查；配置模板含 provider/skills/mcp 占位 |
| T4.8 | 控制台：登录/工作区/模型/四中心占位页 | web-console | `next build` 通过；页面可调用 API |
| T4.9 | kind manifests + Helm 骨架 | infra-devops | YAML 可解析；资源含 4C8G 限额/NetworkPolicy/CRD |
| T4.10 | 契约/E2E 测试 + 准出清单 | qa-reviewer | `bun test` 全绿；E2E 覆盖登录→工作区→销毁 |

## 5. 本机验收命令（G4 DoD）

```bash
bun install
bun run test            # 单测 + API 集成
bun run build           # shared + control-plane + console
bun run dev             # 控制面 :4000 + 控制台 :3000
curl -s localhost:4000/healthz
go -C services/workspace-operator build ./...
node scripts/validate-manifests.mjs   # YAML 解析 + 关键字段断言
```

## 6. 明确不在 G4（转 G5/G7）

- 真实 K8s 调度、真实 opencode Pod 拉起（需要 kind/ACK 与镜像仓库）
- 真实 OIDC、LiteLLM、Skill 源站、评测沙箱、应用构建
- 四中心完整业务（G5 实现，G4 只留页面与接口骨架）

## 7. 风险

| 风险 | 应对 |
| --- | --- |
| 本机无 Docker/kubectl/helm | 交付代码 + 制品；门禁记 DEGRADED；用户提供环境后补真机验证 |
| Fastify vs NestJS 偏离文档 | ADR-016 记录；接口契约不变 |
| SQLite 与 PG 行为差异 | 仅本地；生产迁移脚本用 PG DDL，CI 用 Testcontainers（待环境） |
| Next.js 安装/构建耗时 | 允许 `next build` 单独执行；失败不阻塞控制面验收 |
| 依赖下载受限 | 锁定版本；失败时降级为最小依赖实现 |
