# 契约测试（tests/contract）

- Owner：`qa-reviewer`（task-15 / WBS T6.1）
- 契约源：`docs/02-architecture/openapi.yaml`（**`x-contract-status: frozen`**，96 paths / 131 ops / 98 schemas，sha256 记录于 G4 证据）
- 状态：**骨架**；task-12 提供可运行控制面后启用
- 关联：`docs/05-delivery/G4-EVIDENCE.md` §1/§7、architect `docs/02-architecture/G4-CONTRACT-REVIEW.md`

## 1. 测什么

1. **路由一致性**：控制面实际暴露的 method+path vs 冻结 openapi 的 **G4 MVP 子集**（约 30 端点/15 表，见 task-12 描述）。
2. **两层错误模型**：错误响应必须是 `{error:{code,message,details,request_id}}`；`code` ∈ 16 个通用枚举；`reason` ∈ 23 个领域枚举；禁止自造 code。
3. **幂等/分页/ticket 语义**：写操作 `Idempotency-Key`；列表 `cursor`；`access-ticket` **无** Idempotency-Key、一次性 60s、每次新 jti。
4. **D19 租户语义**：跨租户 404、同租户无权限 403（抽查 8 个资源写操作）。
5. **KNOWN_GAPS 合法性**：只允许 `missing|blocked`；**P0 端点不得标 gap**（缺一个即 G4 不通过）。

## 2. 如何取"实际路由"

优先级：
1. 控制面暴露 `GET /openapi.json`（推荐，backend 在 task-12 加一行静态路由）——测试直接 diff；
2. 否则由 backend 在 `apps/control-plane/scripts/route-manifest.ts` 导出 `{method,path,operationId}[]`，测试 import；
3. 都不可用时本测试 **skip 并在 G4-EVIDENCE 记 `blocked`**（不得伪造通过）。

## 3. 运行

```powershell
$env:E2E_BASE_URL = "http://localhost:4000"   # 控制面
$env:CONTRACT_READY = "1"
bun test tests/contract
```

## 4. 规则

- 契约冻结后，实现与 openapi 不一致 → **实现改**；确需变更 → ADR → minor `1.1.0` → changelog → 通知 qa/backend/capability。
- 本测试失败 = G4 不通过（契约破坏项按 P1 起，P0 端点缺失按 P0）。
- 证据输出：`docs/05-delivery/evidence/g4/<runid>/contract.log` + diff 结果。
