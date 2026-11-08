# ADR-003：每工作区子域名，而非 `/w/{id}/` 子路径反代

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect
- 关联：`ARCHITECTURE.md §7.3`、`OPENCODE-BASELINE.md §5#2`

## 背景

用户需要"浏览器内直接使用"上游 Web GUI。上游 `serve` **同时**服务 API 与 Web GUI（`cli/src/services/web-ui.ts`）：
- 路径 `/api`、`/api/*`、`/auth/*`、`/openapi.json` → API；**其他所有路径** → 静态资源，找不到则回退 `index.html`。
- 静态资源键为 `_assets/*`、`icons/*`，Vite `assetsDir: "_assets"` 且未设 base → HTML 中引用 **`/_assets/...` 根绝对路径**。
- 会话 Cookie 名 `opencode_session`（无端口时），`path=/`。

两条路：`https://platform/w-<id>/` 子路径，或 `https://w-<id>.ws.domain/` 子域名。

## 决策

**子域名**：`https://w-<short>.<ws-domain>/`，通配符证书 `*.<ws-domain>`；每个工作区一个 Ingress + 一个 gateway 路由。

- `short` 为随机 base32（不含语义信息，防枚举）。
- 不用子路径；不做 HTML/JS 重写。

## 备选方案

| 方案 | 否决理由（证据） |
| --- | --- |
| **A. 子路径 `/w/{id}/` + Ingress rewrite 剥前缀** | ① 静态资源是 `/_assets/...` 绝对路径，必须对**所有**请求重写前缀（HTML、JS、CSS、API、SSE、WS），任何一条漏掉即白屏；② 上游 SPA 自己生成的链接/重定向（`/`、`/settings` 等）是根相对，会跳出子路径；③ `opencode_session` cookie `path=/` 在平台域名下**跨工作区互相覆盖**（同一浏览器开两个工作区即串会话）；④ `?auth_token=`/`?ticket=` 进 Referer 风险更高；⑤ `Location` 头需重写；⑥ 上游无 base path 配置项，无法从根上解决。**结论：可行但脆弱，运维成本与故障面远超收益** |
| **B. 子域名但 DNS 用 wildcard 泛解析 + 每工作区证书** | 证书管理量大（1000 张）、续期风险；用 wildcard 一张即可 |
| **C. 只提供 API，不做 Web GUI（用户用 TUI/CLI）** | 违背 PRD「浏览器内直接使用」；且上游 GUI 是核心体验 |
| **D. 自研前端 + 只调上游 API** | 重写整个 Web GUI 不现实；P3 只做控制台，工作区仍用上游 GUI |

## 后果

**正面**
- 上游零改造：资源路径、SPA 路由、SSE/WS 全部原生工作。
- Cookie 天然隔离（不同 host）。
- 每工作区可独立限流/审计/证书策略。
- 便于后续支持自定义域名（P2）。

**负面 / 代价**
- 需要通配符证书 + DNS 权限（cert-manager DNS01）。
- 1000 个 Ingress 对象（可用一个 wildcard Ingress + gateway 按 Host 路由收敛）。
- 需要 wildcard DNS 解析（`*.ws` → SLB）。
- 域名泄露风险降低但仍需 ticket（域名不含租户信息，且无 ticket 一律 302 SSO）。

## 实现要点

- Ingress：`w-<short>.ws.<domain>` → `workspace-gateway` Service；gateway 按 Host 查路由表（Redis 缓存），转发到 Pod IP:4096。
- gateway 必做：`Authorization: Basic` 注入、剥离客户端 `auth_token`、阻断 `POST /api/pair`、SSE/WS 透传（`proxy-buffering off`、3600s 超时、保留 `Upgrade`）。
- 追加安全头：`frame-ancestors`（防点击劫持）、`X-Content-Type-Options`、`Referrer-Policy: same-origin`。
- 未登录：302 到 IdP，`redirect_uri` 回到原 URL。

## 验证

- 资产加载：浏览器 Network 面板全部 200，无 404 HTML 回落。
- SSE：30min 长连接不断（R3.4）。
- WS PTY：`connect-token` → `connect?ticket=` 成功，ticket 二次使用 403。
- 双工作区并行：两个 tab 各自独立会话，互不覆盖。
