# 核心 E2E 骨架（tests/e2e）

- Owner：`qa-reviewer`（task-15 / WBS T6.1）
- 来源：`docs/05-delivery/TEST-PLAN.md` §5 核心 E2E 清单
- 状态：**骨架（全部 `test.skip`）**；task-12/14 提供可运行版本后逐步启用
- 纪律：未置位 `E2E_READY=1` 时**不得**移除 skip；启用一条用例需在 G4 记录中附证据路径

## 1. 覆盖的 10 条核心场景（G4 准出）

| # | 场景 | TEST-PLAN ID | G4 必过 | 当前状态 |
| --- | --- | --- | --- | --- |
| 1 | SSO 登录/登出/续期 | E2E-AUTH-01 | ✅ | skip（等 task-12） |
| 2 | API Key 生命周期 | E2E-AUTH-03 | — | skip |
| 3 | 工作区主旅程（登录→拉起→使用→退出→回归→销毁） | E2E-WS-01 | ✅ | skip（等 task-12/14） |
| 4 | 4C8G 资源强制 + OOM 可观测 | E2E-WS-03 | ✅ | skip（等 task-12） |
| 5 | 域名 + access-ticket + SSE/WS 长连接 | E2E-WS-09 | — | skip（等 task-14） |
| 6 | 双租户隔离（跨租户 404 / Pod 间不可达） | E2E-ISO-01 + E2E-WS-10 | ✅ | skip |
| 7 | 模型策略下发 ≤30s + 未授权模型拒绝 | E2E-MODEL-01/02 | ✅ | skip（等 task-12/13） |
| 8 | Skill 发布→评测门禁→安装 ≤2min | E2E-SKILL-01/02 | — | skip（等 task-14） |
| 9 | 应用创建→构建→1C2G→分享→SSO | E2E-APP-01/04 | — | skip（等 task-14） |
| 10 | MCP 注册→绑定→调用→审计 | E2E-MCP-01/04 | — | skip（等 task-14） |

## 2. 运行方式

```powershell
# 依赖：根 task-11 完成后安装 @playwright/test@1.60.0
$env:E2E_BASE_URL = "http://localhost:3000"   # 控制台/控制面地址
$env:E2E_KUBECONFIG = "kind"                  # kind 或 staging kubeconfig
$env:E2E_READY = "1"                          # 未置位时全部 skip
npx playwright test -c tests/e2e
```

证据产物：`docs/05-delivery/evidence/e2e-report/`（HTML + trace/video/screenshot，保留 90 天，TEST-PLAN §11.2）。

## 3. 测试数据与环境

- **双租户**：每次运行生成 `t-e2e-<runid>-a/-b` 两个组织（隔离用例必备），结束清理（`tests/helpers/cleanup.ts`，task-15 实现）。
- 环境矩阵：ENV-1 kind（隔离/4C8G/API）、ENV-2 staging（性能/长连接/域名）；kind 数字不作为性能证据（TEST-PLAN §4.2）。
- 模型：默认 fake OpenAI-compatible provider；真模型仅 staging 小预算冒烟。

## 4. 断言纪律（不可妥协）

1. 禁止 `waitForTimeout` 作为断言；用条件等待 + 明确超时。
2. 关键场景必须同时断言 **UI + 资源层**（kubectl 读 Pod/PVC/NetworkPolicy/Quota）。
3. 失败自动收集：截图、trace、控制面日志、工作区日志、K8s events。
4. 门禁用例不得 flaky（7 天内 flaky 率 >2% 即不通过，TEST-PLAN §3.5/§9.1）。
