# ADR-006：LiteLLM 作为统一模型网关

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect
- 关联：`ARCHITECTURE.md §6.3`、`SECURITY.md §4`、PLAN E2/D5

## 背景

需求（E2）：统一模型配置、密钥托管（平台 Key 与 BYOK）、按用户/工作区计量、配额限流、故障切换、OpenAI 兼容。上游 opencode 通过 `providers` 配置任意 OpenAI 兼容端点。

## 决策

**LiteLLM Proxy 作为唯一模型出口（内部域名），每工作区一个虚拟 Key；opencode 的 `providers.litellm.options.baseURL` 指向它，`apiKey` 为虚拟 Key。**

- LiteLLM 负责：路由（alias → 供应商）、重试/fallback、RPM/TPM、预算、spend log、Key 生命周期。
- 平台负责：模型目录/策略（DB）、按用户授权、把虚拟 Key 注入工作区、用量聚合与对账。
- 真实供应商 Key 只在 LiteLLM（KMS 解密到内存）。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 自研模型网关** | 路由/重试/预算/多供应商适配/流式/成本计算 = 数月工作量与持续维护；LiteLLM 已覆盖 |
| **B. opencode 直连供应商（每用户配真 Key）** | 真 Key 下发到 1000 个工作区 = 不可接受的泄露面；无统一预算/限流/审计；无法 BYOK 与平台 Key 混合管理 |
| **C. 云厂商 AI 网关（如阿里云百炼网关）** | 供应商锁定；对非阿里模型支持有限；LiteLLM 可自托管、可迁移 |
| **D. 控制面代理转发模型请求** | 控制面在流式大流量路径上会成为瓶颈与故障点；LiteLLM 专为此设计 |
| **E. 每用户一个 LiteLLM 实例** | 资源浪费、Key 管理复杂；共享 LiteLLM + 虚拟 Key 已能隔离预算与权限 |

## 后果

**正面**
- 统一出口：一处做预算、限流、审计、故障切换。
- 虚拟 Key 可撤销/轮换而不影响用户（Key 不等于供应商 Key）。
- 上游零改造（OpenAI 兼容）。
- spend log 直接给出 `{key, user, model, tokens, cost}`，是**计量权威源**（ADR-013）。

**负面 / 代价**
- LiteLLM 是关键路径：需 3 副本 + HPA + Redis（共享限流/预算）+ 健康检查；故障时模型不可用（工作区其他功能仍可用，见架构 F-01）。
- 虚拟 Key 需要下发到工作区配置（Secret/ConfigMap）→ 仍需 Pod 隔离保护。
- LiteLLM 升级需兼容性测试（配置格式、DB schema）。
- 成本：LiteLLM 需要自己的 PG（spend log）+ Redis。

## 实现要点

- Key 生成：`POST /key/generate`，`metadata={org_id,user_id,workspace_id}`，`models` 为策略允许集合，`max_budget`/`rpm_limit`/`tpm_limit`。
- Key 存储：控制面只存指纹（`key_hash`/`key_name`），明文写入工作区 Secret（`OPENCODE_LITELLM_KEY`）由 agent 注入配置。
- 策略双执行点：opencode 侧 `model`/`policies`（不可见即不可选）+ LiteLLM 侧 `models` 白名单（不可调即 403）——**双重保险**。
- 计量：每 5min 拉 `/spend/logs` → `usage_records`（`request_id` 幂等）；每日对账 `session/stats`。
- BYOK（P2）：用户 Key 存 KMS，仅在 LiteLLM 侧使用，工作区仍只见虚拟 Key。

## 验证

- 未授权模型：`/v1/chat/completions` 返回 403；控制台不显示该模型。
- 预算耗尽：429 `quota_exceeded`，工作区仍可访问。
- 供应商故障：LiteLLM fallback 生效，用户看到降级提示。
- 计量对账：LiteLLM spend 与 `usage_records` 差异 <2%。
