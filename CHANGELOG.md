# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/)。当前处于 **Alpha**，接口与数据模型可能变化。

## v0.1.0-alpha — 2026-11-08

首个开源 Alpha 版本。

### Added

- 云端 opencode 工作区（4C8G、持久化、显式销毁/冷却撤销）。
- 模型中心：供应商 CRUD、API Key 加密、连通测试、opencode 配置下发；无 Key 本地模型支持。
- MCP 中心：生命周期、版本/渠道、工具目录、EdDSA/JWKS Ticket、工具级 PEP。
- Skill 中心：上传式新增（SKILL.md/代码/zip）、卡片分页、六页签（内容/代码/审查/调试/版本/启用）、全部右侧抽屉。
- Prompt 库：系统预置 + 组织自定义。
- 应用中心：权限/分享、对话式协同、diff 审批、版本回滚。
- 工作流引擎：DSL、11 模板、运行、人工任务、Saga 补偿。
- 数字员工/专家小队：岗位/技能/MCP/记忆/自治、Guardrails、版本快照、定时排班、人工门禁、embed token。
- 评测中心、实验中心、Memory/Experience、可观测、组织配额、审计、用量。

### Fixed

- 工作区销毁按名称下拉自动选择；MCP 详情返回与 channels 崩溃；模型无 Key 保存与分页；`POST /api/v1/workflow-runs` 404。
- Skill/Usage 占位页替换为真实 API；旧 RTC 数字人导航下线（legacy）。

### Known Limitations

- 多数服务内存存储；生产需 PostgreSQL/Temporal。
- dev-login；企业 SSO/OIDC/SCIM 未接。
- 模型/Agent 为 Mock 或演示执行；生产需真实模型网关与沙箱。
- 无高可用、备份、KMS、合规认证；**不可直接生产使用**。
