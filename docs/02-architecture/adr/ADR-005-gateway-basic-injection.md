# ADR-005：网关向上游注入 Basic（而非签发上游 Session Cookie / 用户自持密码）

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect
- 关联：`ARCHITECTURE.md §7.3`、`SECURITY.md §5.1`、PLAN R3.4/风险 4

## 背景

上游 `opencode serve` 的鉴权（已核实，`server/src/auth.ts` + `middleware/authorization.ts`）支持三种：
1. `Authorization: Basic base64("opencode:<password>")`
2. `?auth_token=<base64("opencode:<password>")>`
3. HMAC 会话 Cookie：`opencode_session` = `<expires>.<HMAC(HMAC(password,"opencode-session-v1"), expires)>`，**TTL 固定 30 天**，知道密码即可为任意用户签发。

平台需要让浏览器用户"无感"进入工作区，且不能把密码暴露给用户。

## 决策

**workspace-gateway 在 SSO 会话 + access-ticket 校验通过后，向上游注入 `Authorization: Basic`；浏览器永不接触服务密码，也不使用上游 Cookie。**

- 服务密码：控制面生成（32B 随机）→ K8s Secret → Pod env `OPENCODE_SERVER_PASSWORD` → gateway 从 Secret 读取（或由 Agent 上报到安全缓存）。
- 浏览器侧只持有：平台 SSO 会话 + `oc_ws_<id>` 绑定 Cookie（opaque，网关自签）。
- access-ticket（ed25519 JWT，60s，一次性）只用于"首次兑换"，随后 302 去掉 ticket。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. 控制面签发上游 Session Cookie** | 技术上完全可行（HMAC 密钥可由密码派生，控制面知道密码即可自行计算 token），省掉每次注入。**但**：① TTL 固定 30 天，无法缩短，泄露即长期有效；② Cookie 是 bearer token，一旦被 XSS/日志/截图获取，可长期直连工作区；③ 密码轮换才能吊销全部会话；④ 仍需把 Cookie 塞进浏览器（跨子域共享问题） | **否决为主线**；保留为"gateway 故障时的应急降级"（默认关闭，需审计） |
| **B. 用户自持密码（显示给用户）** | 用户可能泄露/复用；体验差；轮换困难 | 否决 |
| **C. `?auth_token=` 查询参数** | 令牌进 URL → 日志/Referer/浏览器历史泄露 | 否决（网关还须**剥离**客户端传入的该参数） |
| **D. 关闭上游鉴权（密码为空）** | 上游无密码即**完全不鉴权**；Pod IP 虽在集群内，但任何集群内组件/SSRF 都能直连 | 严令禁止 |
| **E. 自研 sidecar 反向代理注入** | 与 gateway 职责重叠；每 Pod 多一个组件；gateway 集中更易审计与限流 | 否决（gateway 已集中） |

## 后果

**正面**
- 用户零感知，密码不出服务端。
- 鉴权逻辑集中在一个可审计组件，便于统一限流/审计/剥离危险参数。
- 上游无需改造。
- 密码可随时轮换（轮换 = 更新 Secret + 滚动重启 Pod + gateway 缓存失效）。

**负面 / 代价**
- gateway 内存中持有所有工作区密码 → 必须最小化部署（只读根、无 shell、最小镜像）、限制访问、独立 namespace、审计所有管理操作。
- 每次请求多一跳（gateway），需保证 SSE/WS 透传（关闭 buffering、长超时）。
- 密码轮换需要重启 opencode 进程（会中断会话），因此按 90 天 + 事件驱动。

## 实现要点

```
浏览器 → 控制面 auth-edge（唯一 RP，建立会话）→ workspace-gateway
  gateway:
    1. 校验 Host 对应 workspace（路由表，Redis 缓存）
    0. 取 `?__ticket=`（双下划线前缀，避免与上游 opencode 自身 `?ticket=` 冲突）
    2. 校验 oc_ws_<id> Cookie（网关自签 opaque，绑定 user+workspace）
    3. 取 Secret 中密码 → 注入 Authorization: Basic
    4. 剥离客户端 auth_token / X-Forwarded-User 等伪造头
    5. 阻断 POST /api/pair（防 30 天会话签发）
    6. 透传 Upgrade / SSE / query（含 ticket）
    7. 追加 frame-ancestors / Referrer-Policy
```

- 首次进入：`POST /workspaces/{id}/access-ticket` → `{url, ticket}` → gateway 验签（JWKS，`aud=workspace:<id>`、`jti` 一次性）→ Set-Cookie → 302 `/`。
- **DB 故障不阻断**：JWKS 本地缓存 + ticket 自包含声明；Redis 不可用时降级为"仅验签"（安全期 ≤60s）。

## 验证

- 浏览器 DevTools/日志中无服务密码、无 `Authorization: Basic`（除 gateway→上游内部链路）。
- 直接访问 `w-xxx` 无 ticket → 302 SSO；有 ticket 二次使用 → 403。
- `POST /api/pair` 经网关 → 404。
- `?auth_token=` 注入 → 被剥离后 401（不能借此绕过）。
- 密码轮换：更新 Secret → Pod 滚动 → gateway 缓存刷新 → 用户重新进入正常。
