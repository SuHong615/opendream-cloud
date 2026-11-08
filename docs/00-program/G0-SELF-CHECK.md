# G0 自检：需求基线

- 日期：2026-11-04
- 主持：lead
- 被评交付物：`README.md`、`docs/00-program/{PLAN,ROLES,REVIEW-GATES,STATUS,OPENCODE-BASELINE}.md`
- 评审人：pm-research、architect、qa-reviewer
- 状态：待评审

## 1. 检查项自检

| # | 检查项 | 自检 | 证据 |
| --- | --- | --- | --- |
| 1 | 范围 In/Out 明确 | ✅ | PLAN §3.1/§3.2，In 10 个 Epic，Out 5 项 |
| 2 | 每条需求可验收 | ✅（待审） | PLAN §4，R1.1–R10.5 均有验收标准；E10 部分偏弱，待补 |
| 3 | WBS 有 owner/依赖/写作用域 | ✅ | PLAN §8，T0.1–T7.4 |
| 4 | 风险与假设有对策 | ✅ | PLAN §3.3、§9、§10 |
| 5 | 角色与门禁可执行 | ✅ | ROLES.md、REVIEW-GATES.md、任务板 task-1..10 |
| 6 | 与上游能力一致 | ✅ | OPENCODE-BASELINE.md（commit 4f271bc，v2.2.5） |

## 2. 已知缺口（需评审确认）

1. **E10 治理/运营**的验收标准偏定性（如 R10.4 运营后台），需在 PRD 中细化。
2. **成本模型**未量化（4C8G 常驻 × 1000 的月度成本），由 infra-devops 在部署架构中补齐。
3. **真实 ACK 凭证缺失**：M7 只能交付 Terraform plan + Helm + 本地 kind 验证；真实部署需用户提供集群。
4. **SSO 提供方未定**：设计按通用 OIDC 抽象，落地时替换 IdP 配置。
5. **每用户工作区数量**未定：默认 1 个，R3.8 列为 P2。

## 3. 请评审人重点看

- pm-research：范围是否有遗漏（尤其应用分享、MCP 治理、计费）？优先级是否合理？
- architect：E3/E6/E7 的技术可行性与边界是否清晰？有无被低估的集成风险？
- qa-reviewer：哪些验收标准不可测？门禁是否可执行？

## 4. 结论

待三位评审人反馈后，由 qa-reviewer 汇总写入 `docs/04-reviews/G0-requirements.md`，lead 签署。
