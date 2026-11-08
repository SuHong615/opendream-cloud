# ADR-V3-01：MCP 网关选型 —— Higress 做接入 + 自研 MCP Gateway 做工具级数据面

- 状态：**Accepted / 已签署（architect @ 2026-11-08）**；Lead 已知会，v3 架构评审 M1 一并确认
- 契约影响：v3 增量走 `openapi.yaml 1.1.0`；**v2 FROZEN 契约不改**（见 ADR-V3-05）
- 日期：2026-11-08
- 决策者：architect（ADR-GW-01 的展开与定稿）
- 关联：`ARCH-V3.md §4/§6`、`adr/ADR-V3-04-workflow-engine.md`、`services/MCP-GATEWAY.md`（capability-centers）、`deploy/AI-GATEWAY.md`（infra-devops）
- 上游事实依据：opencode v2.2.5 `mcp.servers` 配置与 `/api/experimental/mcp/*`（见 v2 `ARCHITECTURE.md` 附录 A）

## 背景

v3 把 MCP 作为"能力总线"：所有企业系统（CRM/订单/知识库/工单/SaaS）以 MCP 暴露，opencode 工作区、应用、数字人、工作流都是消费者。要求：

1. 互联网流量统一入口（TLS/WAF/租户路由/灰度/限流）；
2. MCP 的**工具级**授权、凭证注入、审计、脱敏、限流、缓存、Trace；
3. 多协议：streamable HTTP / SSE / stdio（sidecar 转 HTTP）/ REST→MCP；
4. 7×24、多租户、默认拒绝、可审计；
5. 不绑定单一网关实现（Gateway API 抽象）。

可选：Higress（CNCF/阿里云 SOFA 实践，AI 插件 + MCP 代理 + REST-to-MCP）、agentgateway（Solo 开源，MCP/A2A 原生）、纯自研。

## 决策

**两层分工，而不是"一个网关全包"：**

| 层 | 组件 | 职责 |
| --- | --- | --- |
| 接入层（L0） | **Higress on ACK**（默认；Gateway API） | TLS/WAF、域名/证书、租户路由（`mcp.*`/`w-*.ws`/`app-*.apps`/`api.*`）、全局限流、灰度、access log、external auth 回调 |
| MCP 数据面（L2） | **自研 `mcp-gateway`（Go）** | MCP 协议会话、`tools/list` 过滤、**工具级 PEP**（allow/deny/schema 校验）、凭证注入（KMS/Secret）、超时/重试/熔断/缓存、脱敏/大小上限、审计与 Trace、按租户/工具限流 |

- **agentgateway** 作为**可选数据面**：仅用于 A2A / 多 Agent 互调场景（或客户要求多云异构时），通过 Gateway API/标准 MCP 端点对接，不进入默认路径。
- **本地 Docker 双模**：`local-gateway` 只做最小路由 + ticket 校验；MCP Gateway 以单容器运行，保证本地与 ACK 的**行为契约一致**（同一份策略配置 schema）。

**关键边界**：Higress **不做**工具级策略与凭证注入（插件模型不适合复杂 PEP、且凭证不应散布在通用网关上）；MCP Gateway **不做** TLS/WAF/全局路由（复用成熟网关，避免自研边缘）。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. 纯 Higress（MCP 插件全包）** | 省一个组件；但工具级 PEP、凭证注入、响应脱敏/截断、审计证据链、per-tool 限流都要写进 Wasm 插件，调试/性能/可测试性差；策略变更需重载插件，风险高；且凭证进入通用网关扩大攻击面 | 否决 |
| **B. 纯自研（含 TLS/WAF/路由）** | 边缘能力（证书、WAF、灰度、HTTP/2/3、连接复用）重复造轮子，安全责任过大 | 否决 |
| **C. 纯 agentgateway** | MCP/A2A 原生、多云端好；但阿里云 ACK 上的 WAF/可观测/SLB 集成、企业实践与团队熟悉度弱于 Higress；A2A 需求当前不明确 | 否决为默认；保留 A2A 可选 |
| **D. Envoy AI Gateway / Kong AI** | 能力强但 MCP 工具级语义仍需二次开发；与现有 ACK 实践一致性不如 Higress | 否决（可作为替换候选） |
| **E. 两层分工（采纳）** | 各司其职，策略集中在可测试的数据面，边缘复用成熟网关；Gateway API 抽象保证可替换 | **采纳** |

## 后果

**正面**
- 工具级策略集中在一个可单测/可灰度的 Go 服务；PEP 决策本地缓存（见 §实现），P99 开销可控。
- 凭证只在 MCP Gateway 内存中解密注入，通用网关/WAF 不接触上游凭证。
- Higress 承担边缘职责，安全补丁/证书/灰度由社区与云厂商维护。
- 审计链在数据面统一产出，格式一致，便于证据链与回放。

**负面 / 代价**
- 多一个高可用服务（MCP Gateway ≥3 副本 + PDB + HPA），需自建可观测与容量模型。
- 两层都有超时/重试，必须明确"只在一层重试"（见下），否则放大故障。
- 本地 `local-gateway` 与 Higress 行为差异需用**契约测试**（路由/ticket/状态码）兜住，避免"本地过、ACK 挂"。
- Higress 版本升级与 MCP 协议演进（`2025-11-25`/`2026-07-28`）需回归矩阵。

## 实现要点

```yaml
# MCP Gateway 关键配置（示意）
listen: :8443            # 仅集群内 + mTLS
upstreams:               # 来自 MCP Registry（published 版本快照）
  - id: crm
    transport: streamable_http | sse | stdio_proxy
    url: https://crm.internal/mcp
    credential_ref: kms://prod/mcp/crm
    tools_snapshot_hash: sha256:...   # 与 registry 签名版本绑定
policy:
  default: deny
  rules:                 # tenant/org/team/user/app/workspace/server/tool/version
    - allow: [crm.contact.get, crm.order.list]
      subjects: {tenant: acme, role: [member, admin]}
      limits: {rpm: 600, burst: 60, max_bytes: 1048576}
timeouts: {connect: 2s, per_call: 30s, stream_idle: 60s}
retry: {max: 1, on: [connect_error, 503]}   # 仅连接层；工具调用不自动重试（非幂等）
audit: {sample: 1.0, redact: [authorization, api_key, phone, id_card]}
```

- **PEP 性能**：策略编译为本地决策表 + 每请求 O(1) 匹配；策略版本号与 registry 版本绑定，变更走"双缓冲热切换"（旧版本保留 60s）。
- **凭证**：KMS 信封加密；只在调用期间解密到内存，不落盘/不进日志；支持 API Key / OAuth2 client credentials / mTLS / 自定义 header。
- **重试与幂等**：连接失败可重试 ≤1；**工具调用默认不重试**（可能非幂等），除非工具在 registry 声明 `idempotent: true`；超时返回结构化错误。
- **SSRF/egress**：出站代理 + 域名白名单；默认阻断私网/元数据段（企业 MCP 需显式登记内网 CIDR）。
- **工具可见性**：`tools/list` 在网关侧按 binding 过滤（opencode 不可见未授权工具），避免"看到但调不动"的体验与探测风险。
- **协议版本**：registry 记录 server 支持的 MCP 版本；Gateway 协商 `initialize` 时固定版本白名单（`2025-11-25` 起步，`2026-07-28` 灰度）。
- **MVP 实现映射（重要）**：逻辑角色 `mcp-gateway` 在**本轮 MVP 由 `services/mcp-hub`（TS，监听 **:4104**，lead 冻结端口）承担**（与 local-gateway 同栈），生产可替换为独立 Go 服务；**契约不变、部署形态可变**，实现方不要误以为必须先起 Go 服务。
- **数据面 endpoint canonical**：`POST/GET /v1/{orgSlug}/{serverSlug}`（streamable HTTP）、`GET /v1/{orgSlug}/{serverSlug}/sse`；**`/v1/{orgSlug}/{serverSlug}/mcp` 与 `/rest/{toolName}` 为兼容别名**，必须与 canonical 行为一致（同一中间件栈、同一契约测试）；SDK 只生成 canonical。
- **高风险工具默认 deny**：`tool_manifest.tools[].destructive: boolean`（写/删/支付/外发）；策略字段 `require_explicit_allow: boolean`（默认 true）——destructive 工具**必须显式 allow 且经审批**才可绑定；未标注按 destructive 处理（fail-safe）。

## 验证

- 契约测试：本地 `local-gateway` 与 ACK Higress 对同一组路由/ticket/错误码行为一致（diff = 0）。
- 策略测试：跨租户/越权工具调用 100% 拒绝；未授权工具不出现在 `tools/list`。
- 性能：PeP 额外延迟 P95 ≤10ms（策略缓存命中）、≤30ms（冷）；网关 3 副本支撑 ≥3,000 QPS（见容量模型）。
- 故障：MCP Gateway 全挂时 opencode 工具列表降级为空但会话可用；单副本故障无 5xx（PDB/就绪探针）。
- 安全：凭证不出网关（日志/响应扫描 0 命中）；SSRF 测试集全拦截。
- 可替换性：切换到 agentgateway/Kong 仅改 Gateway API 资源与 MCP 端点配置，策略与审计代码不变。
