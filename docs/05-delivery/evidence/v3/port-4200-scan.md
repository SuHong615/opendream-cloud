# C4 端口 4200 扫描证据（infra-devops 回执摘要）

- 日期：2026-11-08
- 来源：infra-devops → qa-reviewer / lead / architect
- 范围：`docs/ deploy/ services/ scripts/ apps/` + 根配置；排除 node_modules/.git/upstream/dist/.next/coverage/*.tsbuildinfo/lockfiles
- 规模：**323 文件**
- 命中：**6 处**
  - **exempt（禁止性说明/测试判据）5 处**：`docs/02-architecture/ARCH-V3.md:765/:767`、`docs/02-architecture/centers/MCP-GATEWAY.md:822`、`docs/05-delivery/V3-TEST-PLAN.md:190/:238`
  - **blocking 1 处**：`apps/control-plane/README.md:38` → `MCP_HUB_URL` 默认写 `http://127.0.0.1:4200`，与 `apps/control-plane/src/env.ts:23` 的 **4104** 不一致（代码正确、文档笔误）
- 4104 一致性：control-plane env 默认、local compose（4104:4104/PORT/MCP_HUB_URL/healthcheck/gateway env）、ACK centers（PORT/containerPort/service）、文档（AI-GATEWAY/DH/WORKFLOW/MCP-GATEWAY/LOCAL-DEPLOYMENT/REAL-ACK）全部 4104 + `/v1/{orgSlug}/{serverSlug}`，无混用 → **4104 一致 ✅**
- **C4 结论：PASS-WITH-ACTIONS**（1 处文档待 platform-backend 修；修后 0 blocking）
- 后续：infra 可提供 `scripts/verify/check-port-4200.mjs`（allowlist 禁止性上下文）作为 CI 门禁；backend 修 README 后 infra 给二次只读扫描确认。

> 本文件为 QA 依据 infra 回执整理的证据摘要；原始扫描输出以 infra 交付为准。
