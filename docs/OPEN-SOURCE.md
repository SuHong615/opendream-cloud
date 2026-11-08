# 开源提交说明（GitHub Publishing Guide）

> 目标：把当前 Alpha 版本以 **Apache-2.0** 开源到 GitHub，保留所有第三方组件的许可证，并明确“非生产级”的边界。

## 1. 仓库元数据

| 项 | 建议值 |
| --- | --- |
| Repository name | `opendream-cloud` |
| Description | `OpenDream Cloud — 企业 AI 工程平台（云端工作区 / MCP / 数字员工 / 工作流 / 应用协同）` |
| Topics | `opencode` `ai-agents` `mcp` `multi-agent` `workflow` `nextjs` `fastify` `bun` `apache-2.0` |
| Default branch | `main` |
| License | Apache License 2.0 |
| Author | suhong |
| Release | `v0.1.0-alpha`（明确 Alpha，非生产） |

## 2. 发布前清单

- [ ] `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md` 已提交
- [ ] 所有自研源码含 SPDX/Apache-2.0/author 头（`bun run check:license`，当前 290 个源码文件）
- [ ] 所有 `package.json` 含 `license`、`author=suhong`
- [ ] 依赖许可证审计：`bunx license-checker --summary`
- [ ] `bun run lint` 通过
- [ ] `bun run test` 通过
- [ ] `docker compose config`（`deploy/local`）通过
- [ ] 仓库无 `.env`、私钥、真实 API Key、`.data/`、`test-results/`、`upstream/`
- [ ] README 含“非生产级”声明、截图、快速开始、许可证
- [ ] `docs/PRODUCT-GUIDE.md` 与 `docs/OPEN-SOURCE.md` 已链接
- [ ] 截图不含真实客户数据（当前演示数据均为 Mock）
- [ ] Git 历史中无密钥（如曾提交，使用 `git filter-repo` 清理后重新提交）

## 3. 一键检查

```bash
bun install
bun run check:license
bun run lint
bun run test
cd deploy/local && docker compose config -q
```

## 4. 目录审视结论

已完成的清理/修正：

- 删除空目录 `apps/docs`；
- 统一 workspace 包名 `@opendream-cloud/*`，全部 `package.json` 加 `license=Apache-2.0`、`author=suhong`；
- 288 个自研源码文件加入 SPDX/author 头（保留 `"use client"` 指令在首位）；
- 移除根目录临时文件（`.tmp-*`、`test-results/` 等已忽略）；
- `apps/console`、`apps/control-plane`、`services/*`、`packages/*` 结构清晰；`upstream/` 为只读参考且已 gitignore，不随仓库发布；
- `services/digital-human` 保留为 legacy 参考，导航已切换为 `agent-workforce`（数字员工/专家小队）。

## 5. 保留的第三方许可证

| 组件 | 许可证 |
| --- | --- |
| OpenCode 上游 | MIT |
| Bun / Node.js / Fastify / Next.js / React / Zod | MIT |
| TypeScript / Playwright / Drizzle / Higress / Kubernetes client | Apache-2.0 |
| SQLite | Public Domain |
| PostgreSQL | PostgreSQL License |
| Temporal | MIT |

完整列表与链接见 `THIRD_PARTY_NOTICES.md`。不要删除上游 LICENSE/NOTICE，不要把第三方代码重新标记为 Apache-2.0。

## 6. 建议的 GitHub 设置

- **Actions**：启用 `.github/workflows/ci.yml`（typecheck/test/build）；
- **Security**：开启 Dependabot alerts、Secret scanning；
- **Issues**：启用 bug/feature 模板；
- **Discussions**：可开启；
- **Releases**：附 `v0.1.0-alpha` 说明与 Docker 快速开始；
- **License 检测**：GitHub 应识别为 Apache-2.0。

## 7. 发布文案要点

1. 这是 **Alpha**，适合学习、二次开发与方案验证，不建议生产直接使用；
2. 明确“数字人”指 **数字员工/专家小队**，不是虚拟形象/RTC；
3. 说明依赖 OpenCode（MIT）并致谢上游；
4. 说明本地 Mock 模型/内存存储的演示边界；
5. 欢迎 Issue/PR，遵循 `CONTRIBUTING.md` 与 `CODE_OF_CONDUCT.md`。
