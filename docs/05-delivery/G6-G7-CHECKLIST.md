# G6 / G7 门禁准备清单（静态审计 + 可运行证据）

- 状态：**准备稿（G6/G7 尚未开始）**
- Owner：`qa-reviewer`（G6 主持）；G7 主持 `infra-devops`、qa 评审
- 依据：`REVIEW-GATES.md` §4 G6/G7、`TEST-PLAN.md` §6/§7/§8/§9.1、`G4-EVIDENCE.md`、`G5-capability-centers.md`
- 原则：**静态审计 + 可运行证据；DEGRADED 必须显式声明，不伪装真机**。

## 0. 工具可用性（本机实测 2026-11-04）

| 工具 | 状态 | 影响 |
| --- | --- | --- |
| bun / node / go / curl / system Chrome + Playwright 1.60 | ✅ 可用 | 单测/脚本/浏览器 E2E 可跑 |
| trivy / semgrep / gitleaks / ZAP | ❌ 不可用 | 镜像/依赖/SAST/DAST 需替代或 DEGRADED |
| k6 | ❌ | 性能压测需替代脚本（Node/Bun）或 DEGRADED |
| docker / kind / kubectl | ❌ | 真实 K8s/沙箱逃逸/混沌 需 DEGRADED 或由环境方提供 |
| terraform / helm | ❌ | G7 plan/部署需 DEGRADED（静态校验 + 文档证据），或由环境方执行 |

---

## 1. G6 质量与安全（qa 主持，全体评审）

### 1.1 检查项（REVIEW-GATES G6 五项）与证据方法

| # | 检查项 | 证据方法 | 可用性 |
| --- | --- | --- | --- |
| G6-1 | 单元/契约/E2E 覆盖率达标（核心模块 ≥70%） | control-plane：43 单测、覆盖 86.99%/88.82%（已测）；四中心：`bun test --coverage`（待跑）；E2E：核心 10 条状态表 | ✅ 可执行 |
| G6-2 | 安全扫描无 P0/P1（SAST/DAST/镜像/依赖） | SAST 替代：危险模式 grep（eval/exec/SQL 拼接/明文 secret/`child_process`）+ 手审；依赖：`bun.lock` 审查 + 离线 advisory 清单；镜像：**DEGRADED（无 Trivy）**；DAST：HTTP 层认证/越权/SSRF 探测（curl+Playwright）；SBOM/签名：DEGRADED | ⚠️ 部分 |
| G6-3 | 性能压测达标（NFR） | API p95：Bun/Node 压测脚本（读/写/并发）；LCP：Playwright/Chrome CDP；工作区就绪 p95：mock→**DEGRADED**；SSE/WS 30min：需网关→**DEGRADED** | ⚠️ 部分 |
| G6-4 | 故障演练（Pod 杀死/DB 切换/网关超时） | 进程级替代：kill/restart control-plane、sqlite 锁/WAL 故障、上游 5xx/超时注入、console 断网；K8s 级（Pod/DB 切换）：**DEGRADED** | ⚠️ 部分 |
| G6-5 | 成本模型与预算告警可用 | 静态审查 `DEPLOYMENT §9.7` 单位经济模型 + 告警规则；真实账单：DEGRADED | ⚠️ 部分 |

### 1.2 安全用例（TEST-PLAN §6 子集）

| 套件 | 方法 | 状态 |
| --- | --- | --- |
| SEC-AUTHZ（越权/IDOR） | 已跑 API 矩阵 9/9；扩展到全部 MVP 资源 × 角色 × 方法（生成器脚本） | 🔄 待扩展 |
| SEC-SSRF | 静态审查 URL 校验 + 单元级恶意 URL 集（无真实外网依赖） | 🔄 待执行 |
| SEC-SBX（沙箱逃逸） | **DEGRADED**：无 K8s/gVisor；静态审查 RuntimeClass/NetworkPolicy/权限配置 | ⚠️ DEGRADED |
| SEC-SECRET（密钥泄露） | grep 全仓（日志/前端 bundle/响应）+ `/me` 等响应脱敏断言 | 🔄 待执行 |
| SEC-SHARE（分享越权） | app-center 测试 + ACL 变更 ≤5s（逻辑级）+ 防枚举（share_id 随机） | 🔄 待执行 |
| SEC-BYPASS（直连绕过） | **DEGRADED**：无 K8s 网络策略；静态审查网关/NetworkPolicy/鉴权链 | ⚠️ DEGRADED |

### 1.3 G6 准出判定（TEST-PLAN §9.1）
- 无 open P0/P1；扫描（可用项）无 High/Critical；覆盖 ≥70%；性能（可测项）达标；DEGRADED 逐条 lead 豁免；**真实 K8s 逃逸/隔离未补验不得宣称 PASS**（最多 PASS-WITH-ACTIONS）。

---

## 2. G7 部署验收（infra 主持，qa 评审）

| # | 检查项 | 证据方法 | 可用性 |
| --- | --- | --- | --- |
| G7-1 | Terraform plan 可复现 | terraform 不存在 → 静态审查 `deploy/terraform` + 变量/资源清单 + README 执行说明；**DEGRADED（plan 未真跑）** | ⚠️ DEGRADED |
| G7-2 | Helm 一键部署成功 | helm 不存在 → 静态校验 Chart（YAML 解析/values 完整性/render 断言可脚本化）+ kind 无 → **DEGRADED** | ⚠️ DEGRADED |
| G7-3 | 灰度与回滚 ≤5min | 进程级回滚演练（版本切换/回滚脚本）+ 文档审查；K8s 金丝雀：DEGRADED | ⚠️ 部分 |
| G7-4 | 备份恢复演练通过 | **sqlite `.backup`/VACUUM INTO 实测**（RPO/RTO 记录）；PVC 快照：DEGRADED | ⚠️ 部分 |
| G7-5 | Runbook/告警/值班交接 | 静态审查 `RUNBOOK`（若未落盘则记 missing）、告警规则、值班表 | 🔄 待审 |
| G7-6 | 验收报告 + 遗留风险清单签署 | `ACCEPTANCE.md`（qa+lead） | 🔄 待写 |

---

## 3. 需要 lead/环境方决策

1. **工具**：是否允许安装 trivy/k6/kind/terraform/helm（网络可能受限）；若不允许，按 DEGRADED 记录并由 lead 豁免。
2. **真实 K8s 来源**：kind 本地 / 用户 ACK / 其他；G6 沙箱逃逸与 G7 部署验收均依赖。
3. **G6 评审人分工**：architect（安全模型/RLS）、platform-backend（认证/密钥）、capability-centers（沙箱/审计）、web-console（前端密钥泄露/无障碍）、infra（网络策略/供应链）。
4. **G6 时间盒**：静态审计可立即开始（不依赖环境），真机项等环境。

---

## 4. 证据目录约定

- `docs/05-delivery/evidence/g6/<YYYYMMDD>-<runid>/`：coverage、sast-grep、secret-scan、authz-matrix、http-probes、perf-API、chaos-process
- `docs/05-delivery/evidence/g7/<YYYYMMDD>-<runid>/`：terraform-static、helm-render、backup-restore、rollback、runbook-review
- 每个门禁记录引用原始输出；DEGRADED 项在 `G6-quality-security.md`/`G7-deployment-acceptance.md` 逐条列明并 lead 豁免。
