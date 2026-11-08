# 第三方开源组件声明（Third-Party Notices）

OpenDream Cloud 自研代码以 **Apache License 2.0** 发布（见 `LICENSE`）。
本项目使用、集成或依赖的第三方组件仍遵循其各自许可证，本仓库不会改变这些许可证。

> 说明：以下为直接依赖/关键集成的代表性清单；完整传递依赖版本见 `bun.lock` 与各 `package.json`。
> 完整许可证文本见 `LICENSES/`（Apache-2.0、MIT、opencode-MIT）。在发布前建议执行
> `bunx license-checker --summary` 或 `bun pm ls` 做一次完整许可证审计。

## 1. 核心运行时与框架

| 组件 | 用途 | 许可证 | 上游 |
| --- | --- | --- | --- |
| OpenCode | 工作区 AI 编码引擎 | MIT | https://github.com/anomalyco/opencode |
| Bun | JavaScript/TypeScript 运行时、包管理 | MIT | https://github.com/oven-sh/bun |
| Node.js | 运行时（部分工具） | MIT | https://github.com/nodejs/node |
| Fastify | HTTP 服务框架 | MIT | https://github.com/fastify/fastify |
| Next.js | 控制台 Web 框架 | MIT | https://github.com/vercel/next.js |
| React / React DOM | 控制台 UI | MIT | https://github.com/facebook/react |
| TypeScript | 类型系统/编译器 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| Zod | 运行时 Schema 校验 | MIT | https://github.com/colinhacks/zod |
| Drizzle ORM | 数据库 ORM | Apache-2.0 | https://github.com/drizzle-team/drizzle-orm |
| SQLite | 本地控制面存储 | Public Domain | https://sqlite.org |
| @kubernetes/client-node | K8s 客户端（生产部署） | Apache-2.0 | https://github.com/kubernetes-client/javascript |
| @playwright/test | E2E 测试 | Apache-2.0 | https://github.com/microsoft/playwright |

## 2. 平台组件（生产/可选）

| 组件 | 用途 | 许可证 | 上游 |
| --- | --- | --- | --- |
| PostgreSQL | 生产数据库（规划） | PostgreSQL License | https://www.postgresql.org |
| Temporal | 生产工作流引擎（规划） | MIT | https://github.com/temporalio/temporal |
| Higress | AI 网关（生产默认，规划） | Apache-2.0 | https://github.com/alibaba/higress |
| agentgateway | AI 网关（可选） | Apache-2.0 | https://github.com/agentgateway/agentgateway |
| Prometheus / OpenTelemetry | 可观测（规划） | Apache-2.0 | https://prometheus.io / https://opentelemetry.io |
| Kubernetes / ACK | 容器编排 | Apache-2.0 | https://kubernetes.io |

## 3. 模型与协议

| 组件 | 用途 | 许可证 | 上游 |
| --- | --- | --- | --- |
| Model Context Protocol (MCP) | 工具协议 | MIT | https://github.com/modelcontextprotocol |
| 各模型供应商 API/SDK | 模型调用 | 各自服务条款/许可证 | 以供应商文档为准 |

## 4. Docker 基础镜像

本地/生产 Dockerfile 使用的基础镜像（如 `oven/bun`、`postgres`、`nginx` 等）遵循其各自镜像许可证；分发镜像时请保留相应许可证与来源说明。

## 5. 合规建议

1. 发布 GitHub 前运行 `bunx license-checker --summary`，确认无 GPL/AGPL 等与 Apache-2.0 不兼容的传递依赖；
2. 若引入新的第三方代码/模型/字体/图片，在本文件登记来源与许可证；
3. 不要移除上游 `LICENSE`/`NOTICE` 文件，不要将第三方代码重新声明为 Apache-2.0；
4. 本项目名称/Logo 与 OpenCode 上游无隶属关系，避免暗示官方背书。

如发现遗漏或许可证冲突，请提交 Issue（标签 `license`）。
