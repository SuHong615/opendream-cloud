# M4：LoopForge 编排平面迁移

> 状态：M4a 已实现（过渡命名空间）；M4b 独立 orchestration 服务/ownership 迁移未开始。
> 契约：[PLANE-CONTRACT](../PLANE-CONTRACT.md)

## 1. 目标

把现有 `agent-workforce` 中的 Role / Legion / Requirement / Approval 收敛到 `orchestration` 平面：

- 唯一写入口：LoopForge；
- Approval 唯一事实源；
- API 命名空间 `/api/v1/orchestration/*`；
- 旧 `/api/v1/roles|legions|requirements|approvals` 兼容。

## 2. M4a（已实现）

控制面 BFF 增加过渡命名空间：

```text
/api/v1/orchestration/roles        → /api/v1/roles
/api/v1/orchestration/legions      → /api/v1/legions
/api/v1/orchestration/legion-runs  → /api/v1/legion-runs
/api/v1/orchestration/requirements → /api/v1/requirements
/api/v1/orchestration/approvals    → /api/v1/approvals
```

特点：
- 透传 session/CSRF/租户/幂等键；
- 写操作审计；
- **不改变 ownership**：当前仍由 `agent-workforce` 持有；
- 用于客户端迁移与契约测试，不是最终架构。

## 3. M4b（待执行）

1. 新建 `services/orchestration`，拥有 Role/Legion/Requirement/Approval 表；
2. 从 `agent-workforce` 拆分业务逻辑；
3. 双读/灰度：先读新库，写旧库只读校验；
4. 切换写入口，停旧路由；
5. 删除过渡命名空间映射。

**禁止**：新旧同时写同一审批（重复权威）。

## 4. 验收

- M4a：`/api/v1/orchestration/*` 与旧路径响应一致；审计/幂等通过；
- M4b：审批只有 `orchestration` 写；旧 `agent-workforce` 只读/下线。

## 5. 风险

- 过渡命名空间可能被误认为最终 ownership → 文档/代码注释已标明；
- 双读期间审批一致性 → 以 `approval_id` 对账；
- UI 仍走旧路径 → 下一步切换 `apps/console` 到 `orchestration`。
