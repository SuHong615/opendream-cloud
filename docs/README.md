# OpenDream Cloud 文档地图

> 建议阅读顺序：**价值 → 定位 → 定义 → 旅程 → 产品设计 → UX → 架构 → 测试 → 重构**。
> 本目录区分“研究/设计/架构/评审/交付”，避免文档散落。

## 0. 总览

- [README](../README.md)：项目介绍、快速开始、模块地图
- [STATUS](00-program/STATUS.md)：当前完成度
- [完成度审计](04-reviews/COMPLETION-AUDIT.md)：能力清单与缺口
- [产品指引](PRODUCT-GUIDE.md)：功能使用说明
- [企业价值](ENTERPRISE-VALUE.md)：场景与 ROI
- [开源指南](OPEN-SOURCE.md)：许可、贡献、合规

## 1. 研究（为什么）

- [AI Native OS 总纲](00-program/AI-NATIVE-OS.md)
- [架构研究合并与审视](02-architecture/research/SYNTHESIS.md)
- [平面契约 v1](02-architecture/PLANE-CONTRACT.md)
- [P1-1 文件级迁移矩阵](02-architecture/MIGRATION-MATRIX.md)
- [M2 AgentCore Runtime](02-architecture/M2-AGENTCORE.md)
- [M2b Legacy Run 迁移](02-architecture/M2B-MIGRATION.md)
- [M3 OpenCode Harness](02-architecture/M3-HARNESS.md)
- [M4 Orchestration 迁移](02-architecture/M4-ORCHESTRATION.md)
- [M5 AgentLoop](02-architecture/M5-AGENTLOOP.md)
- [M6 Command Center](02-architecture/M6-COMMAND-CENTER.md)
- [M7 旧路由下线](02-architecture/M7-DEPRECATION.md)
- [ADR-018 平面模型](02-architecture/adr/ADR-018-ai-native-planes.md)
- [独立架构评审](04-reviews/AI-NATIVE-ARCH-REVIEW.md) · [闭环记录](04-reviews/AI-NATIVE-ARCH-REVIEW-RESOLUTION.md)
- [AgentCore/AgentLoop 研究](02-architecture/research/AGENTCORE-AGENTLOOP.md)
- [OpenCode/LoopForge 研究](02-architecture/research/OPENCODE-LOOPFORGE.md)
- [企业指挥中心研究](02-architecture/research/ENTERPRISE-COMMAND.md)
- [SP/BP 战略与商业计划](00-program/SP-BP.md)
- [5 看 3 定 / SWOT / 机会](01-research/OPPORTUNITY-5-3-SWOT.md)
- [价值分析](01-research/VALUE-ANALYSIS.md)
- [用户旅程](01-research/USER-JOURNEY.md)
- [产品定位](01-research/PRODUCT-POSITIONING.md)
- [产品定义](01-research/PRODUCT-DEFINITION.md)

## 2. 架构（怎么建）

- [ARCH-V3](02-architecture/ARCH-V3.md)：现状架构
- [ARCH-V4 私有化/HA](02-architecture/ARCH-V4-ONPREM.md)：部署与高可用
- [ARCH-V5 目标架构](02-architecture/ARCH-V5.md)：目标域边界与迁移
- [LoopForge 编排整合](02-architecture/LOOPFORGE-INTEGRATION.md)：编排域设计
- [双引擎](02-architecture/DUAL-ENGINE.md)：云端 + 桌面端
- [Postgres 迁移](02-architecture/POSTGRES-MIGRATION.md)
- [可观测](03-design/OBSERVABILITY.md)
- [HA 演练](03-design/HA-DRILL.md)

## 3. 产品与体验设计（怎么用）

- [产品设计](03-design/PRODUCT-DESIGN.md)：信息架构、页面、对象
- [UX 设计](03-design/UX-DESIGN.md)：原则、组件、状态、可访问性
- [设计系统](03-design/DESIGN-SYSTEM.md)
- [信息架构](03-design/IA.md)

## 4. 评审与交付（怎么验证）

- [测试方案](04-reviews/TEST-PLAN.md)
- [重构方案](04-reviews/REFACTOR-PLAN.md)
- [完成度审计](04-reviews/COMPLETION-AUDIT.md)
- [交付证据](05-delivery)

## 5. 关键结论

1. **产品主线**：需求 → 编排 → 执行 → 审批 → 交付 → 洞察。
2. **核心对象**：Role / SOP / Legion / Requirement / LegionRun / Approval。
3. **模块边界**：编排、能力、交付、治理、洞察。
4. **当前最大问题**：模块与概念重叠、执行是模拟、持久化分裂。
5. **重构策略**：先收口 IA 与领域模型，再接真实执行与 HA。

> 文档变更请同步 README 与相关架构图，避免“代码已改、文档未改”。
