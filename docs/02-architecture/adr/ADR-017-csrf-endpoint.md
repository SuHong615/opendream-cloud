# ADR-017：将 `GET /api/v1/auth/csrf` 纳入契约（minor 1.1.0）

- 状态：Accepted
- 日期：2026-11-04
- 决策人：lead（G6-02 关闭）；实现：platform-backend；契约：architect
- 关联：G6-02（P2 契约缺口）、G4 KNOWN_GAPS、控制台 `lib/api.ts`

## 背景

控制台使用浏览器会话（`__Host-oc_session` + `oc_csrf` 双提交）调用写接口，需要读取 CSRF Token。
G4 实现已提供 `GET /api/v1/auth/csrf`，但冻结契约（1.0.0）未收录，只能作为 allowlist 存在，导致：
1. `implemented-not-in-openapi` diff 非 0；
2. SDK 生成缺端点；
3. G6-02 一直作为 P2 未关闭。

## 决策

按冻结契约变更通道（ADR → minor → changelog → 通知）：
1. OpenAPI 增加 `GET /api/v1/auth/csrf`（`getCsrfToken`），返回 `{csrf_token}`，未登录 401；
2. 版本 `1.0.0 → 1.1.0`（仅加法，向后兼容）；
3. 控制面契约测试移除该路径的 allowlist；
4. 控制台/文档引用该端点。

## 备选方案

- **从 `/api/v1/me` 响应头返回**：可行但隐式，SDK/测试不便；否决。
- **改成纯 Bearer 无 CSRF**：降低浏览器安全（双重提交是必要防护）；否决。
- **保持 allowlist**：会在 SDK/G5 生成中持续缺失；否决。

## 后果

- 契约 `1.1.0`，实现 diff 归零；G6-02 可关闭。
- 仍保留 CSRF 双重提交校验，不降低安全性。
- 后续契约变更继续走 ADR + minor 通道。
