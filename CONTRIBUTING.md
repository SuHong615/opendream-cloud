# Contributing to OpenDream Cloud

感谢参与！本项目以 Apache-2.0 开源，当前为 Alpha，欢迎 Issue/PR。

## 开发环境

- Bun >= 1.4
- Node.js >= 22（部分工具）
- Docker（本地完整栈）

```bash
bun install
bun run lint
bun run test
bun run --cwd apps/console build
```

## 提交规范

- 使用 Conventional Commits：`feat:` / `fix:` / `docs:` / `test:` / `chore:`；
- 新增源码文件必须包含：
  ```ts
  // SPDX-License-Identifier: Apache-2.0
  // Copyright 2026 suhong
  // Author: suhong
  ```
  可运行 `bun run scripts/apply-license-headers.mjs`；
- 新增 `package.json` 必须含 `"license": "Apache-2.0"`、`"author": "suhong"`；
- 不提交 `.env`、真实密钥、客户数据、`node_modules`、`.data`、`test-results`。

## PR 要求

1. 关联 Issue（如有）；
2. 说明变更、影响范围、测试方式；
3. 通过 CI（typecheck/test/build）；
4. UI 变更附截图；
5. 新增第三方依赖需在 `THIRD_PARTY_NOTICES.md` 登记许可证。

## 许可与 DCO

本项目采用 Apache License 2.0。提交 PR 即表示你同意：

1. 你的贡献以 **Apache-2.0** 授权给本项目及下游使用者；
2. 你有权提交该代码，且不包含前雇主/第三方的专有或未授权代码；
3. 你同意 Developer Certificate of Origin（DCO）1.1：每笔提交使用 `git commit -s` 签署
   `Signed-off-by: Your Name <email>`。

如代表公司贡献，请确保已获得公司授权。

## 安全

请勿在公开 Issue 中披露漏洞，见 `SECURITY.md`。
