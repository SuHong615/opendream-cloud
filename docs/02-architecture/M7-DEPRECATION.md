# M7：旧路由/旧服务下线（迁移收口）

> 状态：**未执行删除**。原因：M2b/M4b ownership 切换未完成，删除旧实现会造成双源/数据丢失。
> 本文定义下线条件、顺序与回滚；M7a 先做弃用标记，M7b 才删除。

## 1. 旧对象清单

| 旧对象 | 归属 | 新入口 | 下线条件 |
| --- | --- | --- | --- |
| `/api/v1/roles` | agent-workforce | `/api/v1/orchestration/roles` | M4b 独立 orchestration 通过 |
| `/api/v1/legions` | agent-workforce | `/api/v1/orchestration/legions` | 同上 |
| `/api/v1/requirements` | agent-workforce | `/api/v1/orchestration/requirements` | 同上 |
| `/api/v1/approvals` | agent-workforce | `/api/v1/orchestration/approvals` | 审批单一源验证 |
| `/api/v1/legion-runs` | agent-workforce | `/api/v1/orchestration/legion-runs` | 同上 |
| `/api/v1/agent-runs` | agent-workforce | AgentCore `/api/v1/runtime/runs` | M2b 灰度完成 |
| `/api/v1/workflows` | workflow-engine | LoopForge `/api/v1/orchestration/sops` | M4b SOP 迁移 |
| `/legions` `/requirements` `/approvals` 页面 | console | `/orchestration/loopforge` | 导航/深链验证 |
| `/workflows/loopforge` | console | `/orchestration/loopforge` | 已重定向，保留 |

## 2. 下线顺序

```text
M7a 弃用标记
  1) 旧路由响应 Deprecation/Sunset 头
  2) 文档标注 deprecated
  3) 监控旧路由调用量
  4) 客户端切新命名空间（已切 LoopForge UI）
M7b 删除
  5) 调用量 0 + 数据迁移校验
  6) 停旧写入口
  7) 删除旧表/旧服务
  8) 回滚演练通过
```

## 3. 当前进展

- LoopForge API client 已切 `/api/v1/orchestration/*`；
- `/workflows/loopforge` 重定向完成；
- 旧页面保留深链，未删除；
- **M7b 未执行**：因为 M4b/M2b ownership 尚未完成。

## 4. 验收

- 旧路由调用量连续 7 天为 0；
- 新路径 E2E 通过；
- 数据迁移对账为 0 差异；
- 回滚脚本可恢复旧服务；
- 无跨租户/审批双源。

> 结论：M7 是**收口步骤**，不能在没有 M4b/M2b 的情况下提前删除。当前只完成 M7a 的客户端迁移与重定向，删除保留到 ownership 切换后。
