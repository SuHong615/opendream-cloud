# G6 质量与安全 评审记录

- 日期：2026-11-04
- 主持（Owner）：`qa-reviewer`
- 评审人：全体（`architect`、`platform-backend`、`infra-devops`、`capability-centers`、`web-console`、`pm-research`）
- 被评交付物：`apps/control-plane/`、`apps/console/`、`services/*`（四中心 + operator）、`deploy/`、`tests/`
- 证据：`docs/05-delivery/evidence/g6/*`（coverage×5、sast-secret-grep、security-probe、perf-api、chaos-process-restart）、`docs/05-delivery/G4-EVIDENCE.md`、`G5-capability-centers.md`
- 前置门禁：G4 = PASS-WITH-ACTIONS（签署）；G5 = PASS-WITH-ACTIONS（签署）
- 结论：**PASS-WITH-ACTIONS**
  - 覆盖率：control-plane 86.99%/88.82%，四中心 76.45%–83.52%（函数）/88.12%–90.23%（行），**全部 ≥70%**；
  - SAST 手审（无 trivy/semgrep）：无硬编码密钥、无 child_process/eval、无 SQL 拼接、无 `:latest`；XSS 面仅静态 themeScript（P3）；
  - 越权：authz 矩阵 9/9；安全探测 **14/15**（1 个 P2 auth-order）；
  - 性能：本地 mock p95 1.9–3.3ms（**DEGRADED：非 staging/k6**）；
  - 故障：进程 kill→重启恢复 74ms（**K8s Pod/DB 切换 DEGRADED**）；
  - **P0 = 0 / P1 = 0**；P2 = 1（G6-02 csrf 契约缺口；G6-01 经复核为**探针脚本 bug**，已撤回、复测 15/15）；P3 = 2。

---

## 1. 检查项结论（REVIEW-GATES §4 G6 五项）

| # | 检查项 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 单元/契约/E2E 覆盖率达标（核心模块 ≥70%） | ✅ | control-plane 43 测试，函数 86.99%/行 88.82%（`coverage.log`）；四中心：skill 83.52/90.23、eval 76.45/89.77、app 77.91/88.12、mcp 80.44/90.20（`evidence/g6/coverage-*.log`）；E2E/契约见 G4/G5 记录 |
| 2 | 安全扫描无 P0/P1（SAST/DAST/镜像/依赖） | ⚠️ 部分（DEGRADED） | SAST 替代：grep 手审无密钥/exec/SQL 拼接（`sast-secret-grep.log`）；DAST 替代：API 安全探测 14/15（`security-probe.log`）+ 越权 9/9；**trivy/semgrep/gitleaks/ZAP 不可用 → 镜像/SBOM/依赖 advisory 为 DEGRADED** |
| 3 | 性能压测达标（NFR） | ⚠️ 部分（DEGRADED） | 本地 mock：healthz p95 2.3ms、/models 3.3ms、/workspaces 1.9ms（0 fail）；**k6/staging 不可用 → 不作 SLO 达标证据** |
| 4 | 故障演练（Pod 杀死/DB 切换/网关超时） | ⚠️ 部分（DEGRADED） | 进程级：kill→restart 恢复 **74ms**（`chaos-process-restart.log`）；**K8s Pod kill/DB failover/网关超时注入 DEGRADED** |
| 5 | 成本模型与预算告警可用 | ⚠️ 部分（DEGRADED） | 静态审查 `DEPLOYMENT §9.7` 单位经济模型（¥651/工作区·月等）+ 配额/告警规则；**真实账单/告警通道 DEGRADED** |

---

## 2. 安全测试结果（TEST-PLAN §6 子集）

| 套件 | 结果 | 说明 |
| --- | --- | --- |
| SEC-AUTHZ（越权/IDOR） | ✅ 9/9 | 跨租户 404、未认证 401、B 列表/审计不泄露 A（`authz-matrix.log`） |
| SEC-AUTHN（未认证/CSRF） | ✅ **15/15** | 7 个受保护读端点均 401；写操作缺 CSRF → 403；未认证 DELETE api-key → **401**（G6-01 撤回归因探针 bug，见 §3） |
| SEC-SECRET（密钥泄露） | ✅ | 全仓 grep 无 `sk-*`/AK/私钥/明文 password；`/me` 响应无密钥；前端 bundle 无密钥 |
| SEC-SAST（注入/执行） | ✅ | 无 `child_process`/`execSync`/`eval`/`new Function`；SQL 全部参数化（无模板拼接） |
| SEC-XSS | ✅（P3 备注） | 仅 `layout.tsx` 静态 `themeScript`（常量、无用户输入，Next.js 标准模式） |
| SEC-SSRF | ⚠️ 静态审查 | URL 入口有校验设计（centers 契约/测试）；**无外网环境做实测 → 记 DEGRADED** |
| SEC-SBX（沙箱逃逸） | ❌ DEGRADED | 无 K8s/gVisor；**mock 不得冒充逃逸拦截**，G7/用户环境补 |

---

## 3. 问题清单

| ID | 级别 | 位置 | 问题 | 建议 | 状态 |
| --- | --- | --- | --- | --- | --- |
| G6-01 | P2→**closed（撤回）** | `tests/g6/security-probe.ts` | 原报"未认证 DELETE api-key 返回 400"：经复核为**探测脚本 bug**（DELETE 无 body 却带 `content-type: application/json` → Fastify 400）；直连 `curl -X DELETE` 实测 **401**，修正脚本后探测 **15/15 PASS** | 已在探针中修正；无需改产品代码 | closed |
| G6-02 | P2 | 契约 `/api/v1/auth/csrf` | 冻结契约未收录（控制台需要） | 补 openapi 或明确替代（G4 KNOWN_GAPS 已记） | open（owner: architect+backend） |
| G6-03 | P3 | `apps/console/app/layout.tsx` | `dangerouslySetInnerHTML` 注入静态 themeScript（常量，无用户输入） | 无安全影响；可在注释标注"仅静态常量" | accepted |
| G6-04 | P3 | `apps/control-plane` | Fastify `disableRequestLogging` 弃用告警（升级注意事项，非安全） | 记录，G7 前可选升级 | accepted |

**P0 open = 0 / P1 open = 0。**

---

## 4. DEGRADED 声明（工具/环境不可用；不得宣称真机）

| 项 | 原因 | 必须补验的时点 |
| --- | --- | --- |
| 镜像/依赖扫描（Trivy）、SBOM/签名 | 工具不可用（网络/未安装） | G7 前由用户环境或 CI 补 |
| SAST 专业工具（Semgrep）、secret 扫描（gitleaks） | 同上 | 同上（当前用 grep 手审替代） |
| DAST（ZAP） | 同上 | G7 前或安全专项 |
| 性能压测（k6/staging） | 无 staging/负载环境 | G7 前（staging） |
| K8s 沙箱逃逸/网络隔离 | 无 kind/ACK/gVisor | G7/用户环境 |
| 混沌（Pod kill/DB failover/网关超时） | 无 K8s | G7 前 |
| 成本/账单真实告警 | 无计费环境 | G7 前 |

> lead 规则：G6 以"静态审计 + 可运行证据"为准，DEGRADED 不得声明为 PASS；真实 K8s/工具由用户环境后补。

---

## 5. 覆盖率明细（All files）

| 模块 | 函数 % | 行 % | 门槛 | 结论 |
| --- | --- | --- | --- | --- |
| control-plane | 86.99 | 88.82 | ≥70/≥85（关键域） | ✅ |
| skill-center | 83.52 | 90.23 | ≥70 | ✅ |
| eval-center | 76.45 | 89.77 | ≥70 | ✅ |
| app-center | 77.91 | 88.12 | ≥70 | ✅ |
| mcp-hub | 80.44 | 90.20 | ≥70 | ✅ |

---

## 6. G7 可做项预结果（供 G7 记录引用）

| 项 | 结果 | 证据 |
| --- | --- | --- |
| sqlite 备份/恢复实测 | 备份 244KiB/5.2ms，恢复 2.4ms，15 表行数 **MATCH**；RTO（本机局部）≈8ms；真实 RPO 依赖备份周期（K8s/PVC 快照 DEGRADED） | `evidence/g7/backup-restore.log` |
| Terraform 静态 | 11 resources / 12 variables，`required_version >= 1.6`，provider `aliyun/alicloud ~>1.230`；**未发现 `prevent_destroy`（G7 行动项）**；无硬编码 AK/SK | `deploy/terraform/*.tf` |
| Helm 静态 | Chart apiVersion v2、kubeVersion ≥1.28、`existingSecret` 引用、镜像 helper 无 `:latest` | `deploy/helm/opendream-cloud/*` |
| kind manifests 静态 | RuntimeClass `sandbox-runtime`、NetworkPolicy×3、4C8G requests=limits、1C2G values | `deploy/kind/*` |
| RUNBOOK / ACCEPTANCE | RUNBOOK 8 节（部署/健康/SLO/故障/备份/回滚/扩缩容/安全/值班）；ACCEPTANCE 含门禁总览/交付物/验收命令/DEGRADED | `docs/05-delivery/RUNBOOK.md`、`ACCEPTANCE.md` |

> Terraform/Helm/kubectl 均不可执行 → G7 结论为静态校验 + DEGRADED（由用户环境补 `plan/apply/helm install`）。

---

## 7. 行动项

| ID | 行动 | Owner | 截止 | 验证方式 |
| --- | --- | --- | --- | --- |
| A-G6-1 | ~~修 G6-01 鉴权顺序~~ **closed（撤回）**：实测直连 401，原报告为探针脚本 bug；修正后 15/15 | qa-reviewer | 已完成 2026-11-04 | `security-probe-recheck.log` 15/15 |
| A-G6-2 | `/auth/csrf` 契约决策（补 openapi 或替代） | architect + backend | G7 前 | openapi diff + KNOWN_GAPS 清零 |
| A-G6-3 | 真实 K8s：沙箱逃逸 ≥10 条 + 网络/PVC 隔离 | infra + qa | 用户环境可用后 | 逃逸套件输出；未补前不得宣称 G6 真机 PASS |
| A-G6-4 | staging 性能（k6 或替代）+ 30min 长连接 | qa + infra | G7 前 | k6 summary/soak 日志 |
| A-G6-5 | 镜像/SBOM/依赖扫描（Trivy 等）与 DAST（ZAP） | infra + qa | G7 前或安全专项 | 扫描报告 |
| A-G6-6 | 成本/账单与告警真实校验 | infra | G7 前 | 成本看板/告警截图 |

---

## 8. 签署

- qa-reviewer（汇总/判定）：`qa-reviewer` 2026-11-04 —— **判定 PASS-WITH-ACTIONS**：覆盖率全部达标；P0/P1 = 0；P2 = 2（G6-01 鉴权顺序、G6-02 csrf 契约）；安全/性能/混沌的**工具与真机项 DEGRADED 已逐条声明**（不冒充）；G7 可做项已产出预结果。
- lead（放行）：**已签署**（见文末「lead 签署（补录）」）—— 确认：① G6 DEGRADED 范围（镜像/SBOM/DAST/k6/K8s 混沌）；② A-G6-1…6；③ 允许以"静态审计 + 可运行证据"结论进入 G7（真机项由用户环境补验）。

---

## 9. 修订记录

| 版本 | 日期 | 修订内容 | 修订人 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 首版：五项检查、覆盖率明细、SAST/DAST/越权/性能/混沌证据、G6-01…04、DEGRADED 声明、A-G6-1…6、G7 预结果 | qa-reviewer |
| v0.2 | 2026-11-04 | 签署后复核：**G6-01 撤回**（探针脚本 bug：DELETE 无 body 带 content-type → 400）；直连 curl 与修正后探针均 **401 / 15-15 PASS**；P2 降为 1（仅 csrf 契约）；A-G6-1 closed | qa-reviewer |

---

## 8. lead 签署（补录）

- lead：`lead` 2026-11-04 —— **签署通过（PASS-WITH-ACTIONS）**。
  - 确认 P0=0 / P1=0；覆盖率全部 ≥70%；SAST/DAST 为"静态审计 + API 探测"替代，非完整工具链。
  - 确认 DEGRADED：Trivy/Semgrep/gitleaks/ZAP/k6/kind/kubectl 不可用 → 镜像/SBOM/DAST/真机性能/K8s 混沌/成本账单不冒充，转 G7 或用户环境（A-G6-3…6）。
  - 确认 A-G6-1…6 台账；G6-01（P2 鉴权顺序）lead 复测：未认证 DELETE（非法/合法 uuid）均返回 401，判定当前不可复现，转 qa 复验 security-probe 15/15。
