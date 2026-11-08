# OpenDream Cloud 产品定位分析

## 1. 品类

**企业 AI Native 基础设施（AI Native Infrastructure）**

4+1+1：
1. **AgentCore**：Agent Runtime；
2. **AgentLoop**：可观测/评测/实验/治理/安全/沙箱/回测；
3. **OpenCode Harness**：云端+桌面 Harness 工程；
4. **LoopForge**：流程编排层（构建在 AgentCore 上）；
5. **数字军团指挥中心**：应用层数字孪生指挥作战中心。

## 2. 定位陈述

**面向**要把 AI 变成组织能力而非单点工具的企业，
**OpenDream Cloud** 是私有化 AI Native 基础设施，
**它**以 AgentCore 提供运行时，以 AgentLoop 提供质量与治理闭环，以 OpenCode Harness 提供云边工程接入，以 LoopForge 做流程驱动角色数字人与军团编排，以数字军团指挥中心统一指挥，
**从而**承载任何业务的 AI Native 应用，
**不同于**单点编码工具、云厂商 Agent 平台或 Agent 搭建器，
**OpenDream Cloud** 强调 **4+1+1 平面基建、流程驱动角色、军团作战、数字孪生指挥、私有化与云边一体**。

## 3. 目标客户

- 大型企业 AI 平台部门/数字化中心；
- 软件交付/研发效能中心；
- 客户运营/共享服务中心；
- 财务/供应链等流程密集型部门；
- 系统集成商/行业伙伴。

## 4. 竞争差异

| 类型 | 代表 | 强项 | 缺口 | 我们的差异 |
| --- | --- | --- | --- | --- |
| 编码 Agent | LoopForge、Codex、Claude Code | 代码交付 | 企业多域/指挥/质量闭环弱 | 以编码为楔子，扩展平面基建 |
| 云 Agent 平台 | AgentCore/AgentLoop 类 | 托管/评测/生态 | 私有化/流程/军团弱 | 私有化 + LoopForge + 指挥中心 |
| 应用搭建器 | Dify/Coze | 上手快 | 运行时/质量/治理弱 | 平面完整、可私有化 |
| RPA/低代码 | UiPath | 确定性流程 | 非结构化/Agent 弱 | AI 原生 + 人工门禁 |
| 自研框架 | LangGraph 等 | 灵活 | 无产品化/治理 | 开箱即用底座 |

## 5. 差异化支柱

1. **AgentCore Runtime**：统一 Session/Run/Tool/Sandbox。
2. **AgentLoop 质量闭环**：可观测/评测/实验/安全/沙箱/回测。
3. **OpenCode Harness 云边一致**：opencode + MCP。
4. **LoopForge 流程驱动**：流程识别角色数字人，编成军团。
5. **数字孪生指挥中心**：指挥、干预、复盘。
6. **私有化/开源**：可替换基础设施。

## 6. 楔子与扩张

```text
软件交付
  → 客户运营
  → 财务/供应链
  → 全业务域 AI Native 底座
```

## 7. 商业模式

- 社区版：开源；
- 企业版：SSO/审计/配额/支持；
- 行业包：角色包/SOP 包/连接器；
- 服务：试点/流程梳理/集成/培训；
- 生态：MCP/角色/SOP 市场分成。

## 8. 定位禁区

- 不做通用聊天；
- 不做单一编码工具；
- 不做封闭 SaaS；
- 不做“全自动无人”；
- 不以 Agent 数量为卖点；
- 不把数字人理解为虚拟主播。

## 9. 成功判据

1. 30 分钟构建首个可分享应用；
2. 4 周验证一条角色→军团→指挥闭环；
3. 角色/SOP 复用率 ≥ 40%；
4. AgentLoop 覆盖发布门禁；
5. 通过企业安全评审；
6. 可从 Docker 到 K8s。

> 相关：[总纲](../00-program/AI-NATIVE-OS.md) · [产品定义](PRODUCT-DEFINITION.md) · [SP/BP](../00-program/SP-BP.md)
