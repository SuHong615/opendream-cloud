# ADR-004：控制面作为唯一 OIDC RP（Relying Party）

- 状态：**Accepted（2026-11-04 由 Lead 裁决修订：单一 RP = 控制面；oauth2-proxy 降为可选，仅用于非平台第三方 UI）**
- 日期：2026-11-04
- 决策者：architect（原案） / **lead（裁决）**
- 关联：`ARCHITECTURE.md §3/§6.1/§7.3`、`SECURITY.md §5`、PLAN R1.1、A2、ADR-005

## 背景

需要：企业 SSO（IdP 未知：Keycloak / 阿里云 IDaaS / 企业微信 / 钉钉 / 飞书）、控制台与应用都有 SSO、工作区入口也要 SSO，且"应用侧零改造"。

原方案（architect 初稿）用 `oauth2-proxy` 作为浏览器侧唯一 RP。**Lead 裁决改为：控制面自身作为唯一 RP**，理由见下（架构评审关注点）：

- 平台本来就必须实现 OIDC client（CLI/SDK、设备码、刷新、会话、登出、组织映射、审计），再引入 oauth2-proxy 会形成**双 RP 双会话**：登录态、登出、踢出、MFA step-up、审计主体都要跨两套组件对齐，故障与安全边界反而更复杂。
- 控制台需要"登录后立刻建个人 org / 解析 membership / 返回 entitlements"等业务逻辑，oauth2-proxy 只能透传身份头，这些逻辑仍要回控制面，等于多一跳而无收益。
- 工作区/应用入口的正确解法不是"再认证一次"，而是**控制面签发的一次性 access ticket**（ed25519，60s，`aud=workspace:<id>`，绑定 user+workspace）+ 网关 host-only cookie 换票；这样工作区/应用网关**完全不需要 SSO 会话**，也天然满足"控制面 DB 故障时已登录用户仍能进工作区"。

## 决策

**控制面是浏览器侧唯一的 OIDC Relying Party。**

### 1) 登录（唯一入口）

```
浏览器 → https://console.<domain>/auth/login?next=/workspaces
  控制面: 生成 code_verifier/code_challenge(S256) + state + nonce
        → 302 IdP /authorize（client_id=console, redirect_uri=.../auth/callback）
浏览器 → IdP 登录/MFA → 302 回 /auth/callback?code&state
  控制面: 校验 state → POST /token（code + code_verifier）→ 校验 id_token
        （签名 JWKS + iss/aud/exp/nonce/azp；拒绝 alg=none/HS256）
        → upsert users(idp_issuer,idp_subject) + 解析 membership
        → 建立服务端会话（Redis，sid）+ 设置 __Host-oc_session
        （HttpOnly; Secure; SameSite=Lax; Path=/; **无 Domain**）
        → 302 回 next
```

### 2) 工作区 / 应用入口（不再走 SSO，走 ticket）

```
控制台 → POST /api/v1/workspaces/{id}/access-ticket
      → 控制面校验会话 + 归属，签发 ed25519 ticket（60s，jti 一次性，aud=workspace:<id>，sub=userId）
浏览器 → https://w-<id>.ws.<domain>/?ticket=...
     → workspace-gateway: 验签（JWKS 本地缓存，**不查 DB/Redis**）→ 校验 aud/jti/exp
     → Set-Cookie: __Host-oc_ws=<opaque，HMAC(gateway key)>
     → 302 到 /（去掉 ticket，避免 Referer 泄露）
后续请求 → 校验 __Host-oc_ws → 注入 Authorization: Basic（服务密码存 K8s Secret）→ 转发 :4096
```

应用入口同构：`/api/v1/apps/{id}/access-ticket` → `app-gateway` 验票 + host-only `__Host-oc_app` cookie + ACL 缓存（≤5s 失效）。

### 3) 会话与登出

- 会话：Redis（`sid`）+ `__Host-oc_session`（host-only，控制台域）；绝对 8h / 空闲 30min（可配）；登录成功轮换 sid（防会话固定）。
- 工作区/应用 cookie：`__Host-oc_ws`/`__Host-oc_app`，**各自域名、无 Domain**，与 SSO 会话解耦；SSO 登出不强制立刻踢掉已开工作区（工作区访问是 ticket+cookie 的短链路），但"踢出/封禁"走 Redis 吊销 + gateway 本地吊销表（TTL 60s）。
- 登出：删除 Redis 会话 + 清 `__Host-oc_session`；可选"登出所有设备"。
- CLI/SDK：`/auth/device`（设备码）或本地回环 PKCE，**与控制面共用同一会话存储和用户主键**。

### 4) oauth2-proxy 的去留

- **MVP 不再部署 oauth2-proxy 作为平台 RP**（不作为控制台/工作区/应用的前置）。
- 保留为**可选组件**，仅用于"非平台第三方 UI"（例如客户自建看板需要 OIDC 保护、但不想接平台 API）——此时它作为独立 RP，与控制面会话**互不共享**，需要明确标注"非平台登录态"。
- 若未来出现"多 upstream 统一认证"的强烈需求，再评估以 reverse-proxy auth_request 方式接入，但**仍然只能有一个 RP 负责签发平台会话**。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. 控制面为唯一 RP（采纳）** | 少一个组件、单一会话与登出语义、登录后可直接做业务（建 personal org、entitlements、审计）；工作区/应用靠 ticket 而非再次认证 | **采纳** |
| **B. oauth2-proxy 为唯一 RP（原案）** | 成熟标准件，但形成双 RP 双会话风险：登录/登出/MFA/踢出/审计主体跨两套系统；控制台仍需回控制面做业务；多一跳 | 否决为 MVP 主线（保留为第三方 UI 可选） |
| **C. 双 RP 并存（控制台 proxy + CLI 控制面）** | 会话不一致（"控制台已登出、工作区仍可进"）、安全审计主体分裂 | **明确禁止**（这是 Lead 裁决的核心原因） |
| **D. 每个工作区各自校验 OIDC** | 1000 个 Pod 做 RP 不现实（IdP 压力、会话不同步、无法统一登出） | 否决 |
| **E. SAML / 直连企业微信钉钉 SDK** | 复杂度高、不通用；应通过 OIDC IdP（如 IDaaS 聚合）接入 | 否决 |
| **F. 自建用户名密码** | 口令/MFA/重置负担；企业要求 SSO | 否决（仅保留内网 break-glass，见下） |

## 后果

**正面**
- 单一登录态与登出语义，安全审计主体唯一（`users.id`）。
- 工作区/应用网关无需 SSO 会话 → **控制面 DB/Redis 故障时已登录用户仍能进入已运行工作区**（ticket 本地验签）。
- 少一个边缘组件（oauth2-proxy），部署/证书/配置面收敛。
- 登录后可立即完成 org 解析、entitlements、审计落库，减少一跳与状态同步问题。

**负面 / 代价**
- 控制面必须自己实现标准 OIDC RP 细节：PKCE、state/nonce、id_token 校验、refresh 轮换、登出、多 IdP 兼容、CSRF、会话固定防护 → 需要成熟库（如 `openid-client`）+ 安全测试（ASVS L2）。
- 控制面 auth 组件成为登录关键路径：需多副本 + 无状态（会话在 Redis）+ 独立限流。
- 多种 IdP 的差异（claim 映射、refresh 行为、登出端点）需要适配层与集成测试矩阵。
- 工作区/应用入口多了一步"换票"，前端需处理 ticket 失效（重试/回控制台重新换票）。

## 实现要点

- 库与规范：`openid-client`（或等价）+ PKCE(S256) + `state`/`nonce` 强校验；`id_token` 校验 `iss/aud/exp/nonce/azp`，拒绝 `alg=none`/`HS256`。
- 会话：Redis key `sess:<sid>`；Cookie `__Host-oc_session`；登录成功 `sid` 轮换。
- claim 映射：`iss + sub` → `users`；email 仅展示/邀请匹配，不作主键。
- ticket：ed25519（KMS），JWKS 暴露在 `/.well-known/workspace-jwks.json`；`jti` 一次性；`aud` 区分 `workspace:<id>` / `app:<id>`。
- 网关：JWKS 本地缓存（TTL 10min，kid 失配即刷新）；DB/Redis 全挂时"仅验签"降级（安全期 ≤60s）。
- 限流：`/auth/*` 独立限流（IP + 设备指纹）+ 失败审计；登录爆破告警。
- break-glass：内网管理员应急账号（强制 MFA、全审计、默认禁用），不作为普通用户路径。

## 验证

- 登录全流程：PKCE/state/nonce 篡改全部失败；`redirect_uri` 白名单外拒绝。
- 单一会话：控制台登出后，新 ticket 申请被拒（401）；已开工作区按策略在 ≤60s 内被吊销表拦截。
- 故障演练：停掉 PG/Redis → 已登录用户拿不到新 ticket，但**已持有 ticket 的进入路径仍可用**（本地验签）；停掉 IdP → 已有会话可用、新登录失败（502 定制页）。
- 安全：Cookie 无 `Domain`、`__Host-` 前缀、`Secure`；ticket 重放 403；跨工作区 ticket 403。
- 审计：登录/登出/换票/吊销全部落审计，actor 唯一。
