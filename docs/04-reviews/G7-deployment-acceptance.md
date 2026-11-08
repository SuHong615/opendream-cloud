# G7 部署验收 评审记录

- 日期：2026-11-04
- 主持（Owner）：`infra-devops`
- 评审人：`architect`、`qa-reviewer`（汇总/判定）、`lead`（签发）
- 被评交付物：`deploy/terraform/`（11 resources / 12 variables）、`deploy/helm/opendream-cloud/`（Chart + 6 templates）、`deploy/kind/`（10 manifests）、`deploy/docker/workspace/`、`docs/05-delivery/{RUNBOOK,ACCEPTANCE,TEST-PLAN,G4-EVIDENCE,G6-G7-CHECKLIST}.md`
- 证据：`docs/05-delivery/evidence/g7/backup-restore.log`、源码静态校验（`文件:行`）、`docs/05-delivery/ACCEPTANCE.md`
- 前置门禁：G6 = PASS-WITH-ACTIONS（签署）
- 结论：**PASS-WITH-ACTIONS**
  - Terraform/Helm/kind 通过**静态校验**；**无 terraform/helm/kubectl/ACK 环境 → plan/apply/install/金丝雀回滚未真机执行（DEGRADED）**；
  - **sqlite 备份恢复实测通过**（15 表行数一致）；PVC/快照/多 AZ 为 DEGRADED；
  - RUNBOOK（8 节）与 ACCEPTANCE（门禁/交付物/验收命令/DEGRADED/上线前置/遗留风险）已齐，qa+lead 已签 ACCEPTANCE；
  - **P0 = 0 / P1 = 0**。

---

## 1. 检查项结论（REVIEW-GATES §4 G7）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | Terraform plan 可复现 | ⚠️ **DEGRADED**（静态通过） | `deploy/terraform`：11 resources / 12 variables；`required_version >= 1.6`；provider `aliyun/alicloud ~> 1.230`；**`prevent_destroy = true` ×3**（`main.tf:37/114/131`）；无硬编码 AK/SK。**本机无 terraform → `plan` 未执行**（A-G7-1 用户环境补） |
| 2 | Helm 一键部署成功 | ⚠️ **DEGRADED**（静态通过） | `Chart.yaml`：apiVersion v2 / kubeVersion ≥1.28 / version 0.1.0；6 个 templates；`existingSecret` 引用（不内联密钥）；镜像 helper 无 `:latest`；**无 helm 可执行 → `install` 未真跑**（A-G7-2） |
| 3 | 灰度与回滚演练 ≤5min | ⚠️ **DEGRADED**（部分实测） | 无 K8s/Argo → 金丝雀未执行；**进程级回滚实测：sqlite 恢复 2.4ms**；`RUNBOOK §5` 定义镜像 digest 回滚 + 5% 金丝雀流程（A-G7-2） |
| 4 | 备份恢复演练通过 | ✅（sqlite 实测；PVC/快照 DEGRADED） | 备份 244KiB / **5.2ms** → 恢复 **2.4ms** → 15 表行数 **MATCH**（`evidence/g7/backup-restore.log`）；RTO 本机局部 ≈8ms；`RUNBOOK §4` 有备份/恢复步骤；**RPO 依赖备份周期（A-G7-3 定义周期）** |
| 5 | Runbook/告警/值班交接完成 | ✅（静态审阅） | `RUNBOOK.md` 8 节：部署顺序/健康与 SLO/常见故障/备份恢复/回滚/扩缩容与成本/安全合规/值班交接（告警渠道 PagerDuty/钉钉、升级路径、事故模板）；渠道需用户环境落地 |
| 6 | 验收报告与遗留风险清单签署 | ✅ | `ACCEPTANCE.md`：门禁总览/交付物/验收命令（`bun run test` 51 pass·3 skip、43 单测、17/17 冒烟、40 中心测试、go build/test、manifest 校验）/DEGRADED/上线前置/6 条遗留风险；qa 与 lead 已签署 |

---

## 2. 关键证据

| 项 | 结果 | 证据 |
| --- | --- | --- |
| Terraform 静态 | 11 resources / 12 vars / prevent_destroy×3 / provider 版本锁定 | `deploy/terraform/main.tf:37,114,131`、`versions.tf:2,6-7` |
| Helm 静态 | Chart v2、templates 6、existingSecret、无 `:latest` | `deploy/helm/opendream-cloud/*` |
| kind 静态 | RuntimeClass `sandbox-runtime`、NetworkPolicy×3、4C8G requests=limits、1C2G values、PVC retain | `deploy/kind/15-runtimeclass.yaml`、`50-netpol-quota.yaml`、`templates/workspace-pod-template.yaml` |
| 运行时镜像 | 非 root、4096、`OPENCODE_SERVER_PASSWORD` 必填 | `deploy/docker/workspace/{Dockerfile,entrypoint.sh}` |
| 备份恢复 | 244KiB/5.2ms；恢复 2.4ms；15 表 MATCH | `evidence/g7/backup-restore.log` |
| 验收命令可复现 | ACCEPTANCE §3（bun install/test/typecheck/build/smoke/go/manifest） | `ACCEPTANCE.md:53-66` |
| Manifest 校验 | `scripts/validate-manifests.mjs` PASS（lead 修复后） | lead 复核 + ACCEPTANCE §3 |

---

## 3. 问题清单

| ID | 级别 | 位置 | 问题 | 建议 | 状态 |
| --- | --- | --- | --- | --- | --- |
| G7-01 | P2→closed | `deploy/terraform/main.tf` | E9 要求"不自动删除既有资源"，原骨架缺 `prevent_destroy` | 已补 `prevent_destroy=true`×3（RDS/Redis/OSS）；qa 已核 | **closed** |
| G7-02 | P2 | `ACCEPTANCE §4` / 环境 | terraform/helm/kubectl/ACK 不可用 → plan/apply/install/金丝雀/真机回滚未执行 | 用户环境补验（A-G7-1/2）；DEGRADED 已声明，不冒充 | open（DEGRADED 台账） |
| G7-03 | P2 | `RUNBOOK §4` | **RPO 未量化**：备份周期/保留期未写死（当前实测仅本机局部 RTO） | 定义备份周期（如每日全量 + WAL 归档）与保留期，写入 RUNBOOK/Helm CronJob | open（owner: infra） |
| G7-04 | P3 | `ACCEPTANCE §6` | 单副本 SQLite（MVP）HA 不足（已知风险 #5，ADR-016 要求 G5 后迁 PG） | 保留为遗留风险并在 PG 迁移后关闭 | accepted |

**P0 open = 0 / P1 open = 0。**

---

## 4. DEGRADED 声明（无云凭证/工具；不得冒充真机）

| 项 | 原因 | 补验方式 |
| --- | --- | --- |
| Terraform plan/apply | 本机无 terraform 与云凭证 | 用户环境 `terraform plan` 审阅后 apply |
| Helm install/upgrade | 本机无 helm | 用户 ACK 集群执行（含 canary values） |
| 金丝雀/回滚 ≤5min | 无 K8s/Argo | staging/ACK 演练并计时 |
| PVC 快照/多 AZ 恢复 | 无 K8s/云盘 | VolumeSnapshot + 跨 AZ 演练 |
| 真实 OIDC/SSO、LiteLLM、Builder | 无 IdP/模型密钥/ACR | 用户环境补 |

---

## 5. 行动项

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-G7-1 | 用户环境 `terraform plan` 复现 + apply（含 prevent_destroy 验证） | infra + 用户 | 环境可用后 | plan 输出存档；无 drift |
| A-G7-2 | Helm install/upgrade + 5% 金丝雀 + 回滚计时（≤5min） | infra | 环境可用后 | `helm history` + 计时证据 |
| A-G7-3 | 定义备份周期/保留期（RPO）+ 定时备份任务 | infra | G7 尾项 | RUNBOOK/Helm CronJob + 恢复演练报告 |
| A-G7-4 | 真实 ACK 上验证 4C8G Pod/PVC/NetworkPolicy/沙箱（G6 A-G6-3 汇合） | infra + qa | 环境可用后 | K8s 证据 |
| A-G7-5 | 真机 SSO/LiteLLM/Builder 全链路验收 | infra + backend + capability | 环境可用后 | E2E 报告 |

---

## 6. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：Terraform/Helm/kind 静态校验通过（含 prevent_destroy×3）；sqlite 备份恢复实测 RTO≈8ms/15 表 MATCH；RUNBOOK/ACCEPTANCE 齐备且已签；P0/P1=0；**无 terraform/helm/kubectl/ACK → plan/apply/install/金丝雀回滚 DEGRADED（A-G7-1…5）**；RPO 需量化（G7-03）。
- lead（放行）：**已签署**（见文末「lead 签署（补录）」）—— 确认：① G7 DEGRADED 范围；② A-G7-1…5；③ 以"静态校验 + 备份恢复实测 + ACCEPTANCE"进入最终验收（真机项由用户环境补验）。

---

## 7. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：六项检查、Terraform/Helm/kind 静态证据、备份恢复实测、G7-01…04、DEGRADED 声明、A-G7-1…5、qa 判定 PASS-WITH-ACTIONS | qa-reviewer |

---

## 8. lead 签署（补录）

- lead：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。
  - 确认 G7 DEGRADED 范围：无 terraform/helm/kubectl/ACK → plan/apply/install/金丝雀/回滚/真机 4C8G 均未真机执行；**不得宣称已上线 ACK**。
  - 确认静态校验通过（Terraform 11 resources / prevent_destroy×3；Helm Chart；kind RuntimeClass/NetworkPolicy/4C8G/1C2G）。
  - 确认 sqlite 备份恢复实测（RTO≈8ms 本机、15 表 MATCH）；RPO 需真实备份周期量化（A-G7-3）。
  - 确认 A-G7-1…5 台账，由用户环境补验；允许签发 ACCEPTANCE。
