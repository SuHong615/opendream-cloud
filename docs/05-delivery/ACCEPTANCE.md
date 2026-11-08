# OpenDream Cloud · 验收报告（Acceptance）

- 日期：2026-11-04
- 版本：v0.1（MVP / G0–G7）
- 验收人：lead；质量签署：qa-reviewer；各域负责人见 ROLES.md
- 结论：**G0–G7 全部走完；G4/G5/G6/G7 为 PASS-WITH-ACTIONS + DEGRADED**（无云凭证/无 Docker/K8s 环境）
- 生产就绪度：**本地可运行 + 制品可部署**；ACK 真机上线需用户提供集群后补验（见 §5）

---

## 1. 门禁总览

| 门禁 | 结论 | 关键证据 |
| --- | --- | --- |
| G0 需求基线 | PASS | PLAN/ROLES/REVIEW-GATES/BASELINE + 25 项意见关闭 |
| G1 产品定义 | PASS-WITH-ACTIONS | 18 竞品 / 9 旅程 / PRD 68 条；A1–A12 关闭 |
| G2 架构 | PASS-WITH-ACTIONS | C4 四视图 / 27→36 表 / OpenAPI 96 paths·131 ops·98 schemas / 16 ADR；硬门槛 9/9 |
| G3 产品设计 | PASS-WITH-ACTIONS | IA / 设计系统 / 18 屏 / 可点击原型；P0=0 |
| G4 平台核心 | PASS-WITH-ACTIONS | 43 单测 / 86.99% 行覆盖 / smoke 17/17 / 浏览器 13/13 / 越权 9/9 |
| G5 能力中心 | PASS-WITH-ACTIONS | Skill 13 / Eval 8 / App 10 / MCP 9 = 40 测试绿；契约 diff 0 |
| G6 质量与安全 | PASS-WITH-ACTIONS | 覆盖率 76–87%（全部 ≥70%）；SAST 手审无硬编码密钥/无 SQL 拼接；DAST 探测 14/15 + 越权 9/9；P0/P1=0；G6-01 复测 401 |
| G7 部署验收 | PASS-WITH-ACTIONS | Terraform/Helm/kind 静态校验通过（prevent_destroy×3）；sqlite 备份恢复 15 表 MATCH、RTO≈8ms；ACK 真机 DEGRADED |

记录文件：`docs/04-reviews/G0..G7-*.md`；索引 `docs/04-reviews/README.md`。

## 2. 交付物清单

### 2.1 产品与设计
- 竞品调研（18）、用户旅程（9）、PRD（68 条）、IA、设计系统、18 屏规格、单文件原型。

### 2.2 架构
- C4 四视图、数据模型（36 表）、OpenAPI 冻结契约、STRIDE 安全模型、16 条 ADR、后端/四中心/部署子设计。

### 2.3 代码（本地可运行）
| 模块 | 路径 | 验证 |
| --- | --- | --- |
| 共享契约 | `packages/shared` | 11 测试 |
| 控制面 | `apps/control-plane` | 43 测试、17/17 冒烟、86.99% 覆盖 |
| 控制台 | `apps/console` | `next build` 12 路由、真实浏览器 13/13 |
| Skill 中心 | `services/skill-center` | 13 测试 |
| 评测中心 | `services/eval-center` | 8 测试 |
| 应用中心 | `services/app-center` | 10 测试 |
| MCP 中心 | `services/mcp-hub` | 9 测试 |
| Operator | `services/workspace-operator` | `go build`/`go test` 通过 |
| 运行时镜像 | `deploy/docker/workspace` | 非 root / 4096 / 密码必填 |

### 2.4 部署制品
- `deploy/kind/`（11 个 manifest：命名空间/CRD/operator/数据面/四中心/入口/网络策略/RuntimeClass/样例）
- `deploy/helm/opendream-cloud/`（Chart + values + 7 模板，含四中心 Deployment/Service）
- `deploy/terraform/`（VPC/ACK/3 节点池/ACR/RDS/Redis/OSS）
- `docs/05-delivery/RUNBOOK.md`、`TEST-PLAN.md`、`G4-EVIDENCE.md`、`G6-G7-CHECKLIST.md`

## 3. 验收命令（可复现）

```bash
bun install
bun run typecheck                  # 0 error
bun run test                       # 51 pass / 3 skip / 0 fail
cd apps/control-plane && bun test --coverage   # 43 pass；86.99% lines
bun scripts/smoke-api.ts http://127.0.0.1:4001 # 17/17（需先启动控制面）
bun run --cwd apps/console build   # 12 routes
bun test services/skill-center services/eval-center services/app-center services/mcp-hub # 40 pass
bun run scripts/verify/all-services.mjs        # 四中心并行启动 + 两层错误 PASS
E2E_READY=1 PLAYWRIGHT_CHANNEL=chrome E2E_BASE_URL=http://localhost:3101 \
  bunx playwright test -c tests/e2e/playwright.config.ts tests/e2e/g4-console.spec.ts  # 2/2
GOROOT=D:\Go go -C services/workspace-operator build ./...
GOROOT=D:\Go go -C services/workspace-operator test ./...
bun run scripts/validate-manifests.mjs         # PASS
```

## 4. DEGRADED（未真机验证，必须由用户环境补验）

| 项 | 原因 | 补验方式 |
| --- | --- | --- |
| 4C8G Pod requests=limits / OOMKilled | 无 Docker/kind（ACK 已验证 requests=limits/QoS；OOM/PVC 未验证） | `kubectl jsonpath` + OOM 事件；见 `REAL-ACK-DEPLOYMENT.md` |
| gVisor/Kata 沙箱逃逸 | ACK 无 RuntimeClass 真机 | 逃逸测试套件 + RuntimeClass 校验 |
| LiteLLM 真实网关 / 用量对账 | 无模型供应商密钥 | 真实 Key + spend log 对账 |
| BuildKit/ACR/Ingress 应用发布链路 | 无镜像仓库/域名 | E2E-APP-01/04 |
| Terraform plan/apply、Helm install | 无 terraform/helm/云凭证 | 用户环境执行 |
| SSE/WS 30min 长连接 | 无 workspace-gateway | soak 测试 |
| 真实 OIDC SSO | 未接企业 IdP | 替换 dev-login，接入 OIDC |
| G6 工具类（Trivy/SBOM/DAST/k6/成本账单） | 工具不可用 | 见 `G6-quality-security.md` §4；用户环境补 Trivy/ZAP/k6 扫描 |

## 5. 生产上线前置（用户提供）

1. 阿里云账号 + ACK 集群 + ACR + RDS/Redis/OSS（`deploy/terraform`）；
2. OIDC/SSO 提供方（Keycloak / 阿里云 IDaaS / 企业微信等）与回调域名；
3. 主域名 + 通配符证书 + ICP 备案（应用自定义域名需要）；
4. 模型供应商密钥（LiteLLM）/ 私有化模型地址；
5. 计费与配额策略、审计留存期限；
6. 工作区数量与常驻/休眠策略（成本 ≈¥72 万/月/1000 常驻）。

## 6. 遗留风险

| # | 风险 | 影响 | 行动 |
| --- | --- | --- | --- |
| 1 | 成本高（4C8G 常驻） | 商业不可持续 | 默认常驻 + 可选休眠；分批 100→300→1000；单位经济模型复核 |
| 2 | 工作区 runc 半可信（共享内核） | 内核 0day 逃逸 | 独立节点池 + 补丁 SLA + ≤90s 重建；高安全租户加 gVisor 开关 |
| 3 | Terraform 未 plan/apply | 首次部署可能字段不匹配 | 用户环境先 `plan` 审阅 |
| 4 | opencode 上游升级 | 集成回归 | 镜像 digest 锁定 + 金丝雀 + 回归门禁 |
| 5 | 单副本 SQLite（MVP） | 控制面 HA 不足 | G5 后迁 PG + RLS（ADR-016 硬门槛） |
| 6 | dev-login 后门 | 生产误开 | `ALLOW_DEV_LOGIN` 默认生产禁用 + 启动校验 |
| 7 | ~~`/auth/csrf` 未入冻结契约（G6-02，P2）~~ | ~~SDK/文档缺口~~ | **已关闭**：ADR-017 → 契约 1.1.0（`getCsrfToken`），allowlist 移除、diff 归零 |
| 8 | Terraform 未执行 plan/apply | 首次部署字段可能不匹配 | 用户环境先 `terraform plan` 审阅 + provider 版本校验 |

## 7. 签署

- qa-reviewer（质量）：`qa-reviewer` 2026-11-04 —— G0–G7 记录与证据已复核；DEGRADED 项均已声明，不以 mock 冒充真机。
- lead（验收）：`lead` 2026-11-04 —— **PASS-WITH-ACTIONS + DEGRADED**，同意在用户提供 ACK/SSO/模型凭证后进入真机补验（G7 尾项）。
