# OpenDream Cloud · 测试计划（TEST-PLAN）

- 版本：v0.1（测试策略基线）
- 日期：2026-11-04
- 主持 / 作者：`qa-reviewer`（task-7 / T6.1）
- 状态：**已落盘，待 G0 汇总后随 gate 生效**（安全与性能章节在 G2 后按 SECURITY/ADR 复核）
- 关联：`docs/00-program/PLAN.md`（§4 需求、§5 NFR、§7 门禁、§8 WBS）、`REVIEW-GATES.md`（G4–G7 清单）、`OPENCODE-BASELINE.md`（上游能力与待核实项）
- 本轮范围：**只写测试计划与门禁模板，不写实现代码**。`tests/` 目录骨架按 §13 规划，在 G2（API 契约冻结）/G4（平台核心可运行）后分阶段落地。

---

## 0. 一页速览

| 维度 | 结论 |
| --- | --- |
| 分层 | L0 静态 → L1 单元 → L2 契约 → L3 E2E → L4 性能 → L5 安全 → L6 混沌 → L7 回归 |
| 工具（主） | Vitest、Playwright 1.60、k6、Trivy、OWASP ZAP、Semgrep、kind、Chaos Mesh |
| 环境 | 本地 docker-compose（L0）→ kind（L1）→ staging ACK（L2）→ prod 只读（L3） |
| 核心 E2E | 8 组 26 条（工作区生命周期 / 模型策略 / Skill / 评测 / 应用 / MCP / 身份 / 隔离） |
| 安全用例 | 8 类 34 条（含租户越权与 IDOR、SSRF、沙箱逃逸、密钥泄露、供应链、分享越权、直连绕过、OWASP） |
| 准出 | 核心模块行覆盖 ≥70%（control-plane 关键域 ≥80%）；无 open P0/P1；扫描无 High/Critical；SLO 达标 |
| 缺陷分级 | P0–P3（与 REVIEW-GATES 三级制映射见 §9.3；P3 缺口已作为 G0 问题提出） |
| 门禁判定 | PASS / PASS-WITH-ACTIONS / REJECT 的机械规则见 §9.4；**证据不可复现 = 不通过** |

---

## 1. 目的、范围与不可测项

### 1.1 目的

1. 把 PLAN §4 的 E1–E10 验收标准、§5 的 NFR 转成**可执行、可取证、可判定**的测试项。
2. 为 G4/G5/G6/G7 提供**同一套准出尺子**，避免"评审靠感觉"。
3. 让每个 P0/P1 缺陷都有回归用例，回归用例编号进 `tests/` 与门禁记录。

### 1.2 In Scope

- 控制面（NestJS/Fastify）：SSO/会话/RBAC/API Key/审计、模型中心、工作区编排 API、用量。
- 数据面：workspace-operator（reconcile）、workspace-agent、运行时镜像、`opencode serve` 集成、应用 1C2G 容器、评测沙箱 Job。
- 控制台（Next.js）：登录/工作区/四中心/分享/用量。
- 平台工程视角：Helm/kustomize 渲染、NetworkPolicy、资源配额、备份恢复、灰度回滚（G7 执行，G6 抽查）。

### 1.3 Out of Scope（并说明由谁覆盖）

| 项 | 原因 | 处理 |
| --- | --- | --- |
| 上游 opencode 内核功能回归 | 只读集成，不 fork | 以其 pinned commit 自带测试套件做 L7 基线（§3.8） |
| 真实计费/账单结算 | 本期仅计量 + 配额 | 只测"计量数据可对账"（E2E-GOV-02） |
| 1000 并发工作区真机压测 | 需专用负载环境 | staging 200 并发 + 容量模型外推，G7 前补真机抽测（§7.4） |
| 多地域多活 | 一期单地域双 AZ | 不测 |
| 移动端原生 | 不做 | 只测响应式 Web |

### 1.4 不可测项与限制（必须写进门禁记录）

| # | 限制 | 影响 | 降级方案 / 证据口径 |
| --- | --- | --- | --- |
| LMT-1 | 真实 ACK 集群 + 云凭证可能缺失（PLAN A5） | 无法做真实性能/网络策略验证 | 用 kind + kube-networkpolicy 单测 + Terraform plan；门禁结论标注"环境降级"，由 lead 显式签署豁免 |
| LMT-2 | kind 单节点内核通常不支持 gVisor runsc | 沙箱逃逸"真实内核"层不可证 | 以 gVisor 用户态用例 + RuntimeClass 配置断言 + staging 上真实逃逸套件；未跑项在 G5/G6 记录为 `NOT-RUN`，不得记为 PASS |
| LMT-3 | "关闭浏览器 24h 数据仍在"无法在 CI 内实等 | 持久化承诺验证周期长 | staging 定时 soak（24h/72h）+ kind 上"Pod 重建/PVC 保留"等价验证；两者证据都归档 |
| LMT-4 | 真实 IdP（阿里云 IDaaS/企业微信等）未定 | 只测通用 OIDC | 用 Keycloak 测试 realm + 1 个 staging IdP 冒烟；IdP 差异列入 G7 遗留风险 |
| LMT-5 | 真实模型供应商费用 | 不能大规模跑真模型 | 默认 fake OpenAI-compatible provider（确定性）+ LiteLLM stub；staging 真模型仅做小预算冒烟 |
| LMT-6 | 上游 opencode 自身测试 `test` 脚本拒绝从根目录运行 | 不能一键跑 | 按包运行：`bun test`（见 §3.8），由 CI matrix 逐包执行 |

---

## 2. 质量目标（与 NFR 一一对应）

| ID | 指标（来源） | 目标 | 测量点 | 证据 |
| --- | --- | --- | --- | --- |
| Q-01 | 控制台 LCP（NFR §5 / R8.2） | < 2.5s（p75，4G 网络 1.6Mbps 模拟） | Playwright + web-vitals，staging 首页与工作区页 | `lcp.json` + trace |
| Q-02 | 工作区就绪（R3.2） | p95 ≤ 90s（从控制面创建请求 → 工作区 API 可交互） | staging，50 并发创建样本 ≥100 | k6 + 控制面事件时间戳 |
| Q-03 | 控制面 API（NFR） | 读 p95 < 300ms，写 p95 < 800ms | staging，k6，200 VU | `k6-summary.json` |
| Q-04 | 登录（R1.1） | p95 ≤ 3s | 完整 OIDC code flow（含 IdP 往返） | k6 + trace |
| Q-05 | 模型策略下发（R2.6） | 策略写入 → 工作区生效 ≤ 30s | 控制面写操作时间戳 → agent ACK → 工作区 `/api/config` 反射 | 断言脚本 + 审计时间戳差 |
| Q-06 | 分享 ACL 生效（R6.4） | ≤ 5s | 修改 ACL 时间戳 → 越权请求变 403 | E2E-APP-05 |
| Q-07 | API Key 吊销（R1.3） | ≤ 5s | 吊销时间戳 → 旧 Key 请求 401 | E2E-AUTH-03 |
| Q-08 | 长连接稳定（R3.4） | ≥ 30min 不掉线（允许透明重连 ≤3 次/30min） | staging SSE/WS soak | soak 日志 + 事件计数 |
| Q-09 | 控制面可用性（NFR） | 月度 99.9% | Prometheus SLI（G6 提供 7 天窗口） | 面板截图 + 查询语句 |
| Q-10 | 租户越权 | 0 例成功越权（P0） | 全量越权矩阵 | 矩阵报告 §6 |
| Q-11 | 审计完整性（R1.4/R7.5） | 写操作 100%，MCP 调用 100% | 对照操作日志与审计表计数 | 对账脚本输出 |
| Q-12 | 计量准确率（G4 清单） | ≥ 99%（抽样对账） | 网关用量 vs 平台汇总 | 对账 CSV |

---

## 3. 测试分层与工具选型

### 3.1 分层总表

| 层 | 名称 | 范围 | 工具 | 运行时机 | 目标时长 | 证据产物 |
| --- | --- | --- | --- | --- | --- | --- |
| L0 | 静态检查 | lint / 类型 / OpenAPI 规范 / IaC 扫描 / 密钥扫描 | ESLint + `tsc --noEmit`、Spectral（或 Redocly）lint、`helm lint`、`terraform validate/plan`、gitleaks | 每次 push | ≤ 5min | CI job 日志 |
| L1 | 单元测试 | 纯函数、状态机、策略解析、ACL 判定、配置生成器 | **Vitest** + c8/v8 coverage | 每次 push | ≤ 8min | junit + coverage |
| L2 | 契约测试 | OpenAPI ↔ 实现、opencode 配置片段 ↔ 上游 schema、SDK 生成 | Vitest + `@redocly/cli` / Spectral、openapi-diff、pinned upstream `packages/schema` | 每次 push + 上游升级时 | ≤ 6min | 契约报告 |
| L3 | E2E | 用户旅程、跨服务闭环、K8s 资源断言 | **Playwright 1.60**（UI + request）+ kubectl/kind harness | 合并到 main、每日、门禁前 | 30–60min | trace / video / 资源快照 |
| L4 | 性能 | API、SSO、工作区拉起、控制台 LCP、网关限流 | **k6** + Playwright perf + Prometheus | 每日（staging）、门禁前 | 30–90min | k6 summary + 图表 |
| L5 | 安全 | 越权/IDOR、SSRF、沙箱逃逸、密钥、供应链、DAST | **ZAP**（baseline + authenticated）、**Trivy**（镜像/FS/IaC/config）、Semgrep、syft+cosign、自研越权矩阵 | 每日 + 门禁前 | 45–120min | trivy.json / zap.html / 矩阵报告 |
| L6 | 混沌 | Pod kill、DB 切换、网关超时、节点压力、网络分区 | **Chaos Mesh**（kind/staging） | 每周 + G6/G7 前 | 60–90min | 演练记录 + 恢复时间戳 |
| L7 | 回归 | 缺陷回归 + 上游基线 + 冒烟 | 全量分层重跑 + 上游 pinned 套件 | 每个门禁 / 上游升级 | 视范围 | 回归清单 |

### 3.2 工具与许可证（ROLES §5 要求新增依赖说明）

| 工具 | 用途 | 许可证 | 备注 |
| --- | --- | --- | --- |
| Vitest | L1/L2 测试运行器 | MIT | 与 Vite/TS 生态一致 |
| Playwright 1.60.0 | L3 E2E、L4 前端性能 | Apache-2.0 | **版本对齐上游**（上游 `@playwright/test` 1.60.0），减少差异 |
| k6 | L4 压测 | AGPL-3.0（CLI） | 仅作为独立 CLI 在 CI 运行，不作为库链接进产品代码；许可证结论进 ADR |
| Trivy | 镜像/文件系统/IaC/依赖扫描 | Apache-2.0 | CI + ACR 扫描双点 |
| OWASP ZAP | DAST（baseline + 认证扫描） | Apache-2.0 | 需登录脚本；禁止对生产扫描 |
| Semgrep CE | SAST | LGPL-2.1 | 与 Trivy 互补；规则集锁定版本 |
| kind | 本地 K8s（Operator/Helm/NetworkPolicy 验证） | Apache-2.0 | 与真实 ACK 差异在 §4.2 声明 |
| Chaos Mesh | L6 混沌 | Apache-2.0 | 仅 staging/kind，不在 prod |
| syft + cosign | SBOM + 镜像签名验证 | Apache-2.0 | 供应链用例 S-SC 使用 |
| gitleaks | 密钥泄漏静态扫描 | MIT | L0 每次 push |

> 结论：**不使用**未声明许可证的工具；k6 AGPL 的使用边界写入 ADR（`docs/02-architecture/adr/`），待 G2 确认。

### 3.3 L1 单元测试规范

- 覆盖对象：模型策略解析器、RBAC 判定、ACL 计算（share 角色 × 资源 × 动作）、工作区状态机转移表、`opencode.json` 生成器、URL/票据签发、审计事件构造、限流/配额判定、Skill 版本比较、MCP 工具名映射。
- 强制要求：
  - 状态机转移用**表驱动测试**，非法转移必须断言抛错（例如 `deleting → ready` 必须拒绝）。
  - 配置生成器用**黄金文件（golden file）**，且必须通过 L2 的上游 schema 校验。
  - 时间相关逻辑（冷却期、Key 过期、ACL 生效）用可注入 Clock，禁止 `sleep` 测试。
- 禁止：把外部网络/DB 放进 L1（用 mock/fake）；L1 出现 flaky 即视为缺陷（P2）。

### 3.4 L2 契约测试规范（本项目最关键的一层）

1. **OpenAPI 即契约**：`docs/02-architecture/openapi.yaml` 为唯一权威。
   - L0 用 Spectral/Redocly lint 规则集（必须含：错误码结构统一、分页参数一致、`Idempotency-Key` 定义、版本化前缀）。
   - L2 对每个 path/operation 至少一条"schema 级"用例：请求/响应经生成的校验器（如 `openapi-request-validator` 或生成的 zod）校验。
   - 变更检测：CI 跑 openapi-diff，**破坏性变更必须显式标记 `x-breaking` 并经 G2 复核**。
2. **与上游 opencode 的契约**（依据 OPENCODE-BASELINE）：
   - 用 pinned commit 的 `packages/schema` 校验我们下发的 `opencode.json` 片段字段：`model`、`providers`、`skills: string[]`、`mcp.servers`、`policies`、`config.update`。
   - 断言：未知字段不被静默丢弃（上游 schema 若是 strict，失败即阻断）。
   - 上游升级流程：新 commit → 先跑契约套件 → 失败则阻断升级（对应 PLAN 风险 #8）。
3. **SDK 可生成**（G2 清单）：CI 用 openapi-generator/typescript-fetch 生成客户端并 `tsc --noEmit`，失败即 G2 不通过。
4. **事件契约**：SSE 事件（工作区状态、用量、审计）定义 JSON Schema，L2 校验 + L3 断言顺序与幂等。

### 3.5 L3 E2E 规范

- 实现：Playwright（`tests/e2e/ui`）+ Playwright APIRequest（`tests/e2e/api`）+ K8s 断言 helper（`tests/e2e/k8s`）。
- 原则：
  - 每个用例**自带租户**（`t-e2e-<runid>-a` / `-b`），结束清理（`tests/helpers/tenant.ts`）。
  - 断言必须含**资源层**（kubectl 读 Pod/PVC/NetworkPolicy/ResourceQuota），不能只看 UI。
  - 禁用 `waitForTimeout` 作为断言手段；用条件等待 + 明确超时。
  - 失败自动收集：截图、trace、控制面日志、工作区日志、K8s event。
- 稳定策略：`@flaky` 标签 + 隔离运行（连续 2 次失败才计缺陷），但**门禁用例不得 flaky**（G6 前 7 天内 flaky 率 > 2% 即不通过）。

### 3.6 L4 性能规范

- k6 场景：`smoke`（1 VU）/ `load`（稳态）/ `stress`（超配）/ `soak`（≥1h）/ `spike`。
- 阈值即断言：`http_req_duration{p95}<300`、`http_req_failed<0.1%`、`checks>99.9%`；不达标 k6 直接非零退出。
- 性能数据必须同时记录：版本/镜像 digest、节点规格、副本数、DB 规格、是否命中缓存。
- **kind 性能数字不作为准出证据**（单节点、共享 IO），只用于趋势与回归。

### 3.7 L5/L6 规范

- 安全用例见 §6；每个用例给出"威胁 → 方法 → 期望拒绝信号 → 证据"。
- 混沌实验必须声明：稳态指标（SLI）、注入、期望恢复时间（RTO）、中止条件（safety），演练后 24h 观察。见 §8。

### 3.8 L7 回归与上游基线

- 缺陷回归：每个 P0/P1 缺陷关闭时必须新增/关联自动化用例，**无回归用例不得关闭**。
- 上游基线：对 pinned commit `4f271bc`（v2.2.5）跑其自带套件：`packages/{schema,core,protocol,server}` 等包内 `bun test`（上游根 `test` 脚本刻意拒绝从根运行；CI 按包 matrix 执行）。用途：升级时对比"上游自身是否坏"，避免误判为平台问题。
- 上游集成回归（我们的适配层）：配置生成 → 工作区生效 → 会话创建 → 工具调用 → SSE 事件的端到端冒烟，放在 staging。

---

## 4. 环境矩阵

### 4.1 环境总表

| 环境 | ID | 拓扑 | 用途 | 可作门禁证据 | 数据 |
| --- | --- | --- | --- | --- | --- |
| 本地 | ENV-0 | docker-compose：Postgres/Redis/LiteLLM(stub)/Keycloak/控制面/控制台 | L0/L1/L2 开发内环 | 仅 L1/L2 | 合成 fixture，每次重建 |
| 本地 K8s | ENV-1 | kind 单节点（或多节点 2×） + Helm/Operator + 本地 registry | L2/L3/隔离/NetworkPolicy/轻量 L6 | 是（标注 LMT-1/2） | 合成 fixture + 测试租户 |
| 预发 | ENV-2 | ACK（真实或等价托管 K8s）+ RDS/Redis + Keycloak + LiteLLM | 全量 L3/L4/L5/L6、门禁主证据 | 是（首选） | 合成 + 脱敏录制，独立 VPC/账号 |
| 生产 | ENV-3 | ACK prod | 只读冒烟、合成监控、月度恢复演练 | 仅"production 健康"类 | 不写入测试数据 |

### 4.2 kind 与 ACK 的已知差异（影响证据等级）

| 差异 | 影响用例 | 处理 |
| --- | --- | --- |
| 单节点资源与本地盘 | L4 性能、PVC 性能 | kind 数字不作准出；性能只认 ENV-2 |
| 无云 SLB/WAF/证书签发 | 域名/证书、Ingress 安全 | kind 用 cert-manager 自签或跳过；标注 |
| gVisor runsc 常不可用 | 沙箱逃逸 | 见 LMT-2 |
| 无 RDS 多 AZ 故障切换 | DB failover 混沌 | kind 用 Patroni/pg_failover 模拟；结论降级 |
| 网络策略实现细节 | 隔离 | kind 用 Calico，ACK 用 Terway；两套各跑一次 |

### 4.3 测试数据策略

| 类别 | 来源 | 使用层 | 规则 |
| --- | --- | --- | --- |
| 合成 fixture | `tests/data/fixtures`（JSON/YAML） | L1/L2/L3 | 固定随机种子，可复现；租户名带 runid 前缀 |
| 双租户隔离数据 | 每次运行生成 A/B 租户，各含同构资源（workspace/skill/app/mcp/share） | L3/L5 | **越权矩阵必备**；A/B 资源 ID 交叉引用 |
| 模型响应 | fake OpenAI-compatible provider，确定性输出（含 tool call 固定样例） | L3/L4 | staging 真模型仅冒烟，预算上限硬编码 |
| 录制回放 | 脱敏后的真实交互（仅 staging 采样） | L3 | 必须过 PII 扫描（gitleaks + 正则）；不得含真实密钥 |
| SSO 用户 | Keycloak 测试 realm：5 角色 × 2 组织 | 全部 | 固定账号，密码仅 CI secret |
| 密钥 | 环境专属临时密钥（Secrets Manager/K8s Secret） | 全部 | 测试密钥前缀 `TEST_`，禁止真实云凭证；用完即焚 |

- **禁止**：生产真实用户数据进入任何测试环境；测试数据写入 prod；在 fixture 中出现任何真实 token（L0 gitleaks 阻断）。
- **清理**：每次 L3 运行结束执行 `tests/helpers/cleanup.ts`（删租户资源 + PVC + 命名空间标签选择器删除），并断言无残留（`kubectl get all -l test-run=<id>` 为空）。
- **保留**：证据产物保留 90 天（与审计留存区分），失败用例产物保留至缺陷关闭。

---

## 5. 核心 E2E 场景清单

> 编号规则：`E2E-<域>-<序号>`；优先级：P0 每次门禁必跑，P1 每次发版必跑，P2 排期。
> 所有 P0 用例在 ENV-1 与 ENV-2 各执行一次；差异写入门禁记录。

### 5.1 E2E-WS 工作区生命周期（核心中的核心）

| ID | 场景 | 前置 | 步骤 | 关键断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| E2E-WS-01 | 登录 → 自动拉起 → 使用 → 退出 → 回归 → 显式销毁（主旅程） | 新用户 U，无工作区 | ①SSO 登录 ②进入控制台触发拉起 ③等待 ready ④打开工作区 Web/终端，创建会话并改文件 ⑤关闭浏览器（释放访问票据） ⑥重新打开（模拟次日回归） ⑦显式销毁（二次确认） | ③ 创建→可交互 p95 ≤90s 且 READY 事件 ≤2s 推送；④ `/workspace` 文件 sha256 记录；⑤ 无销毁动作，Pod/PVC 仍在，无自动删除；⑥ 会话与文件原样恢复，重连 ≤3 次且无数据丢失；⑦ 需二次确认 + 冷却期，PVC 按策略处理，审计 3 条 | R3.1–R3.3、R3.6、R3.7 | P0 |
| E2E-WS-02 | 冷启动 vs 预热池命中 | 关闭预热池 / 开启预热池 | 分别拉起，记录时间 | 预热命中时 p95 明显更低；两条路径都 ≤90s | R3.2 | P1 |
| E2E-WS-03 | 资源规格强制（4C8G） | 运行中工作区 | `kubectl get pod -o jsonpath` 断言 requests==limits==4C8G；尝试超用内存 | requests/limits 精确匹配；超限触发 OOMKilled 并可观测（事件/指标） | R3.1、NFR | P0 |
| E2E-WS-04 | 状态机与事件 | 任意工作区 | 依次触发 provisioning/starting/ready/idle/error（含人为制造镜像拉取失败） | 状态转移合法；非法转移被拒；事件 ≤2s 推送；error 态可重试 | R3.6 | P0 |
| E2E-WS-05 | Pod 重建数据不丢 | 工作区有数据 | 删除 Pod（模拟节点驱逐），等待 reconcile 重建 | 新 Pod ready；`/workspace` 与 `/home/opencode` 文件校验和一致；会话可恢复 | R3.7 | P0 |
| E2E-WS-06 | 24h 不销毁（soak） | ENV-2 定时任务 | 24h/72h 后检查 | Pod 仍存在（或按 D1 可选 scale-to-zero 但 PVC/数据保留）；无自动删除审计 | R3.3、D1 | P0（staging 定时） |
| E2E-WS-07 | 销毁冷却期与取消 | 工作区 ready | 发起销毁 → 冷却期内取消 → 再次放弃 | 冷却期内可取消且不删除；确认后不可逆；审计完整 | R3.3 | P1 |
| E2E-WS-08 | 并发拉起与幂等 | 同一用户重复点击/并发请求创建 | 并发 10 次创建请求 | 只产生 1 个工作区；重复请求幂等返回同一 ID；无孤儿 Pod/PVC | R3.2 | P0 |
| E2E-WS-09 | 域名 + SSO + SSE/WS 透传 | ready 工作区 | 未登录访问域名 → SSO；登录后打开 SSE 与终端 WS，保持 30min | 未登录 302/401 不暴露上游；SSE 事件连续；WS 30min 稳定；上游 Basic/Cookie 不出现在浏览器 | R3.4 | P0 |
| E2E-WS-10 | 用户间不可见他人工作区 | A/B 双租户 | A 用自己票据访问 B 的工作区 URL/API | 403/404（信息不泄露存在性）；审计记录拒绝 | R3.1、R1.2 | P0 |

### 5.2 E2E-MODEL 模型策略下发与治理

| ID | 场景 | 步骤 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E2E-MODEL-01 | 策略下发 ≤30s | 管理员改默认模型/可用集合 → 观察工作区 | 控制面写入时间戳→agent ACK→工作区 `/api/config` 反射，差值 ≤30s；无需重启工作区（Pod restartCount 不变） | R2.6、R2.2 | P0 |
| E2E-MODEL-02 | 未授权模型不可见/不可调用 | 用未授权模型名直接调网关 | 工作区模型列表不含该模型；直连 LiteLLM 返回 403；审计记录 | R2.2 | P0 |
| E2E-MODEL-03 | 虚拟 Key 生命周期 | 轮换/吊销用户或工作区虚拟 Key | 旧 Key 立即失效；新 Key 生效；轮换期间无中断（≤30s 过渡）；Key 不出现在工作区文件/日志 | R2.3、R2.4 | P0 |
| E2E-MODEL-04 | 网关限流与预算 | 压测触发限流/预算耗尽 | 返回 429（含 Retry-After）；预算耗尽返回明确错误；客户端可见；不泄漏内部 key | R2.4、R10.2 | P1 |
| E2E-MODEL-05 | 故障自动切换 | 注入主供应商 5xx/超时 | 自动切换备用/重试；最终成功率 ≥ 阈；错误可观测 | R2.4 | P0 |
| E2E-MODEL-06 | 用量计量与对账 | 跑固定 token 量请求 | 平台用量记录 vs 网关计数偏差 <1%；按用户/工作区/模型聚合正确；5min 内可查；CSV 可导出 | R2.5 | P0 |
| E2E-MODEL-07 | BYOK（若启用） | 用户上传自己的 Key | Key KMS 加密存储；API 不回显明文；调用走网关并可审计 | R2.3 | P1（取决于 D5/开放问题 4） |

### 5.3 E2E-SKILL Skill 发布 → 评测 → 安装

| ID | 场景 | 步骤 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E2E-SKILL-01 | 发布闭环 | 上传 Skill 包 → 校验 → 审核 → 评测准入 → 发布 | 规范校验器拒绝非法包（缺 frontmatter/越权声明）；未过评测不可发布；发布生成不可变版本；可回滚 | R4.1、R4.2、R5.5 | P0 |
| E2E-SKILL-02 | 安装到工作区 ≤2min | 发布后用户安装并在 opencode 中使用 | 安装 ≤2min；`GET /api/skill` 出现该技能；会话中可激活并产出预期输出；工作区配置 `skills` 指向签名 URL | R4.3 | P0 |
| E2E-SKILL-03 | 权限声明与超权拒绝 | Skill 声明网络/MCP/工具权限 | 安装前展示权限；超权（未声明却调 MCP）被拒并告警 | R4.4 | P0 |
| E2E-SKILL-04 | 签名与篡改检测 | 篡改版本内容 / 伪造签名 | 校验失败，安装与发布均被拒；审计 | R4.5 | P0 |
| E2E-SKILL-05 | 版本与同步 | 升级/回滚 Skill 版本 | 工作区在 ≤2min 内切换到目标版本；旧版本内容不被缓存混用 | R4.2、R4.3 | P1 |
| E2E-SKILL-06 | 统计与评分 | 安装、使用、评分 | 安装量/调用量/评分准确；按组织隔离可见 | R4.6 | P2 |

### 5.4 E2E-EVAL 评测中心与沙箱

| ID | 场景 | 步骤 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E2E-EVAL-01 | 任务定义校验 | 提交合法/非法 YAML（缺数据集、超时非法、资源超限） | 非法被拒并给字段级错误；合法接受 | R5.1 | P0 |
| E2E-EVAL-02 | 沙箱执行与隔离 | 提交评测任务 | Job 在独立命名空间 + RuntimeClass(gVisor/Kata)；默认禁网；资源限；任务结束即回收 | R5.2 | P0 |
| E2E-EVAL-03 | 结果可复现 | 同输入同配置跑两次 | 评分结果一致（规则评分器完全一致；LLM-judge 记录模型版本与温度，允许声明容差） | R5.3 | P0 |
| E2E-EVAL-04 | 报告与对比 | 生成报告、A/B 对比 | 通过率/耗时/成本/token 正确；报告可分享（受 ACL）；对比可重复 | R5.4 | P1 |
| E2E-EVAL-05 | CI 集成 | 模拟 PR 触发 | 评测结论回写 Check；失败阻断合并 | R5.6 | P1 |

### 5.5 E2E-APP 应用创建 → 分享 → SSO 访问

| ID | 场景 | 步骤 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E2E-APP-01 | 创建与构建 | 从工作区选模板创建应用 → 构建 | BuildKit rootless 构建；日志可查；失败可重试且幂等；镜像推 ACR 且有 digest | R6.1、R6.2 | P0 |
| E2E-APP-02 | 1C2G 部署 | 部署应用 | Deployment requests==limits==1C2G；超限 OOM 可观测（事件+指标+告警）；Service/Ingress 就绪 | R6.3 | P0 |
| E2E-APP-03 | 分享角色边界 | 邀请 B 为 view/use/edit 三档 | view 只读、use 可调用、edit 可改配置；越权动作 403；均落审计 | R6.4 | P0 |
| E2E-APP-04 | 分享链路 SSO | 未登录点分享链接 | 跳 SSO → 登录 → 授权通过；未授权用户即使登录也 403；直链不能绕过 | R6.5 | P0 |
| E2E-APP-05 | ACL 变更时效 | 修改/撤销分享 | ≤5s 生效；撤销后立即 403；权限变更审计 | R6.4、R6.5 | P0 |
| E2E-APP-06 | 自定义域名与证书 | 绑定域名（ENV-2） | 证书就绪 ≤10min；HTTPS 有效；HTTP 强制跳转；域名所有权校验 | R6.6 | P1 |
| E2E-APP-07 | 版本/回滚/日志 | 发布 v2 → 回滚 v1 | 回滚 ≤2min；日志可检索；指标可查 | R6.7 | P1 |
| E2E-APP-08 | 休眠策略 | 配置休眠 | 按策略缩容/唤醒；唤醒后可用；数据不丢 | R6.7 | P2 |

### 5.6 E2E-MCP 绑定 → 调用 → 审计

| ID | 场景 | 步骤 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E2E-MCP-01 | 注册与健康检查 | 注册 stdio/SSE/streamable HTTP 三种 MCP | 注册后自动探活；状态可见（UP/DOWN）；非法 URL/命令被拒 | R7.1 | P0 |
| E2E-MCP-02 | 目录与可见性 | 组织私有 + 平台公开；未授权用户查看 | 未授权不可见；搜索/分类正确；需审批的未审批不出现 | R7.2 | P0 |
| E2E-MCP-03 | 一键绑定 | 用户绑定 MCP | 工作区 `mcp.servers` 注入；工具列表出现；≤30s 生效（复用 E2E-MODEL-01 口径） | R7.6 | P0 |
| E2E-MCP-04 | 调用与审计 | 通过 opencode 调用绑定 MCP 工具 | 调用成功；审计 100% 记录（用户/工作区/MCP/工具/耗时/结果码）；敏感参数脱敏 | R7.5 | P0 |
| E2E-MCP-05 | 凭证不下发 | 检查工作区文件/进程环境/浏览器 | 凭证不出网关；工作区仅有 Hub 代理地址与短期票据；票据不出现在日志 | R7.3 | P0 |
| E2E-MCP-06 | 授权拒绝与告警 | 绑定未授权 MCP / 调未授权工具 | 拒绝并告警；错误码不泄露目录存在性 | R7.4 | P0 |
| E2E-MCP-07 | 失效降级 | 上游 MCP 宕机/超时 | 工具标记不可用；调用快速失败（≤超时配置）不阻塞会话；恢复后自愈 | R7.1、R7.4 | P1 |

### 5.7 E2E-AUTH 身份与密钥

| ID | 场景 | 步骤 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| E2E-AUTH-01 | SSO 登录/登出/续期 | code flow + PKCE；会话时长策略；强制重新认证 | 登录 p95 ≤3s；登出后旧会话失效；续期正常；强制重认证生效 | R1.1 | P0 |
| E2E-AUTH-02 | RBAC 矩阵 | owner/admin/member/viewer × 关键动作（UI+API 双通道） | 与权限矩阵一致；越权 403；**前端隐藏不算数，必须 API 拒绝** | R1.2 | P0 |
| E2E-AUTH-03 | API Key 生命周期 | 创建（只显示一次）/scope/过期/吊销/轮换 | 明文仅一次；库中仅哈希；scope 越界 403；吊销 ≤5s；过期生效 | R1.3 | P0 |
| E2E-AUTH-04 | 审计完整性 | 遍历所有写操作 | 每个写操作 100% 落审计；可按用户/资源/时间检索；审计不可篡改（追加写） | R1.4 | P0 |

### 5.8 E2E-ISO 隔离冒烟（详细越权矩阵见 §6.1）

| ID | 场景 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- |
| E2E-ISO-01 | A/B 双租户资源交叉访问（工作区/技能/应用/分享/MCP/评测报告） | 全部 403/404；无数据片段泄漏 | R3.1、R1.2、R6.4、R7.4 | P0 |
| E2E-ISO-02 | 网络隔离 | A 工作区 Pod 无法访问 B 工作区 Service/Pod IP、无法访问控制面 DB/Redis、无法访问云元数据 | NFR 隔离、R2.2 | P0 |
| E2E-ISO-03 | 存储隔离 | A 无法挂载/读取 B PVC；PVC 名称不暴露 | R3.1 | P0 |

### 5.9 E2E-GOV 治理

| ID | 场景 | 断言 | 需求 | 优先级 |
| --- | --- | --- | --- | --- |
| E2E-GOV-01 | 配额超限阻断 | 超配额时写操作被拒并给可申请提升入口；已运行资源不被强杀 | R10.2 | P1 |
| E2E-GOV-02 | 计量对账 | 资源时长 + token 可对账；导出 CSV 与账单接口字段一致 | R10.1、R8.6 | P1 |
| E2E-GOV-03 | 数据保留与删除 | 删除请求 30 天内完成；审计留存 ≥180 天不受影响（冲突见 G0 问题） | R10.3、NFR 合规 | P1 |

---

## 6. 安全测试用例

> 方法：自动化优先（矩阵生成 + 脚本断言），人工只在"必须理解语义"处补充。
> 每条必须有**期望拒绝信号**（4xx/策略不生效/连接失败），不接受"看起来没问题"。
> 证据：请求/响应脱敏日志 + 策略对象（NetworkPolicy/ACL/RBAC）+ 扫描报告。

### 6.1 租户越权与 IDOR（最高优先级）

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-AUTHZ-01 | 水平越权：A 访问 B 的资源 ID | 矩阵脚本遍历 20 类资源 × 5 方法 × 3 角色，用 A 的令牌请求 B 的 ID | 全部 403/404；响应体不含 B 名称等元数据 | P0 |
| SEC-AUTHZ-02 | IDOR 变体：UUID 猜测/枚举 | 生成顺序 id、短 id、可猜 slug；批量请求 | 无存在性泄漏（404 与 403 不区分存在性）；限流生效 | P0 |
| SEC-AUTHZ-03 | 组织层级越权 | member 尝试 org 级写操作；跨组织 admin | 403；审计记录拒绝 | P0 |
| SEC-AUTHZ-04 | 角色提升 | viewer 调 admin API；通过参数注入 role | 403；无批量赋值（mass assignment） | P0 |
| SEC-AUTHZ-05 | 批量赋值 / 字段覆盖 | 提交 `tenantId`/`ownerId`/`role` 字段 | 服务端忽略或拒绝，不能改归属 | P0 |
| SEC-AUTHZ-06 | 行级隔离（DB 直查） | 用无租户上下文的查询路径（内部 API/后台任务） | 所有查询强制租户键；漏传即报错（fail-closed） | P0 |

### 6.2 SSRF

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-SSRF-01 | 元数据服务 | Skill URL 源 / MCP 注册 URL / webhook 指向 `169.254.169.254`、`fd00:ec2::254` | 拒绝（DNS/IP 双层校验） | P0 |
| SEC-SSRF-02 | 内网地址 | `127.0.0.1`、`10.0.0.0/8`、`172.16/12`、`192.168/16`、`[::1]`、十进制/八进制/十六进制变体、DNS rebinding（自定义域名解析到内网） | 全部拒绝；rebinding 用"解析后校验 + 连接后校验"双检 | P0 |
| SEC-SSRF-03 | 集群内服务 | 服务名/ClusterIP 直连（控制面 DB、Redis、K8s API 端点） | 拒绝；NetworkPolicy 兜底 | P0 |
| SEC-SSRF-04 | 重定向绕过 | 外网 URL 302 到内网 | 每跳校验；超跳数拒绝 | P0 |
| SEC-SSRF-05 | 代理与 OAuth 回调 | MCP OAuth 回调 URL、应用回调 | 白名单校验；不允许通配 | P1 |

### 6.3 沙箱逃逸（评测中心 + 应用构建）

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-SBX-01 | 容器逃逸基础 | `--privileged` 能力探测、`/proc/self/status` CapEff、挂载尝试、`mount`/`unshare` | 权限不足；无 hostPath；禁止 privilege escalation | P0 |
| SEC-SBX-02 | 宿主机路径 | 尝试访问 `/var/run/docker.sock`、`/host`、`/proc/1/root` | 不存在或拒绝 | P0 |
| SEC-SBX-03 | 元数据与云凭证 | 沙箱内访问云元数据/服务账号 token | 拒绝（禁网 + 白名单） | P0 |
| SEC-SBX-04 | 内核攻击冒烟 | 已知内核 exploit 样本（仅作最小验证，非武器化）、`dirty pipe` 类 PoC 检查 | gVisor/Kata 拦截；记录 NOT-RUN 项（LMT-2） | P0 |
| SEC-SBX-05 | 资源耗尽 DoS | fork bomb、磁盘写满、内存炸弹、无限网络连接 | cgroup/配额限制生效；任务被杀；节点不受影响 | P0 |
| SEC-SBX-06 | 网络默认拒绝 | 沙箱内 `curl` 任意外网/内网 | 默认 deny；白名单域名可通且有审计 | P0 |
| SEC-SBX-07 | 构建沙箱 | 构建脚本尝试逃逸/读取构建机凭证/访问内网 | rootless BuildKit + 无凭证挂载 + 网络限制 | P0 |
| SEC-SBX-08 | 上游进程隔离 | 工作区内的 opencode 子进程尝试访问其他工作区/控制面 | NetworkPolicy + 文件系统隔离；拒绝 | P0 |

### 6.4 密钥泄露

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-SECRET-01 | 日志泄露 | 触发全部错误路径（网关 401/429/超时、配置错误） | 日志无 Key/密码/票据；错误体统一脱敏 | P0 |
| SEC-SECRET-02 | 前端 bundle 扫描 | 扫描 console 构建产物 | 无 `ock_`/模型 key/内部地址 | P0 |
| SEC-SECRET-03 | 响应体/调试端点 | debug/health/version 等端点、`?debug=1` | 不回显配置与密钥；无 pprof/actuator 暴露 | P0 |
| SEC-SECRET-04 | 上游口令风险（BASELINE §2.1） | 检查工作区服务密码是否出现在：浏览器、工作区文件、配置、事件、错误 | 仅存 K8s Secret；用户不可见；知道密码即可签发会话的特性**不可被外部利用** | P0 |
| SEC-SECRET-05 | `auth_token` 查询参数 | 检查 URL/Referer/访问日志 | 平台链路不产生含 token 的 URL；上游该能力被网关禁止 | P1 |
| SEC-SECRET-06 | 环境变量与进程可见性 | 工作区内读 env、`/proc/*/environ`、进程参数 | 其它租户与平台密钥不可见；只注入最小必要 | P0 |
| SEC-SECRET-07 | 泄露应急 | 在测试环境植入假 Key（canary）并扫描全套日志/对象存储 | 能在 15min 内发现并告警；吊销流程可用 | P1 |

### 6.5 供应链

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-SC-01 | 镜像漏洞 | Trivy image（控制面/工作区/应用基础镜像） | 无 Critical/High（例外需审批记录） | P0 |
| SEC-SC-02 | 依赖漏洞 | Trivy fs + `pnpm audit`/OSV | 无 High/Critical；有则列出修复计划 | P0 |
| SEC-SC-03 | SBOM 与签名 | syft 生成 SBOM；cosign verify 镜像签名 | 全部镜像有 SBOM + 签名；未签名不可部署（准入） | P0 |
| SEC-SC-04 | 镜像 tag 纪律 | 扫描 Helm/Deployment | 生产路径无 `latest`/浮动 tag；全部 digest 或不可变 tag | P0 |
| SEC-SC-05 | 基础镜像与许可证 | 依赖许可证清单 | 无高风险许可证；新增依赖有 ADR/PR 说明 | P1 |
| SEC-SC-06 | 构建链污染 | 构建缓存投毒、依赖混淆（typosquatting）检查 | 私有 registry scope 锁定；构建可复现 | P1 |
| SEC-SC-07 | upstream 完整性 | 校验 pinned commit/镜像 digest 与 BASELINE 一致 | 一致；变更需升级流程 | P1 |

### 6.6 分享链接越权

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-SHARE-01 | 无令牌访问 | 去掉/伪造分享 token | 401/403；不泄露应用信息 | P0 |
| SEC-SHARE-02 | 令牌熵与不可枚举 | 分析分享 token 格式、批量请求 | 高熵、不可枚举、可撤销、可设过期 | P0 |
| SEC-SHARE-03 | 角色边界 | view 尝试写/执行；use 尝试改配置 | 403 | P0 |
| SEC-SHARE-04 | 撤销即时性 | 撤销后立即访问 | ≤5s 变 403；缓存不残留（CDN/网关缓存策略） | P0 |
| SEC-SHARE-05 | 组织边界 | 组织私有分享被外部用户打开 | 拒绝；不泄露组织存在性 | P0 |
| SEC-SHARE-06 | 公开分享滥用 | 公开链接被匿名访问 | 按设计允许；但有速率限制/滥用告警；可一键关闭 | P1 |

### 6.7 工作区直连绕过

| ID | 用例 | 方法 | 期望 | 级别 |
| --- | --- | --- | --- | --- |
| SEC-BYPASS-01 | 绕过 Ingress | 从集群内/外直接访问 Pod IP、Service ClusterIP、NodePort | 不可达（NetworkPolicy 默认拒绝 + 仅 Ingress 可达） | P0 |
| SEC-BYPASS-02 | 跳过 SSO 直连上游端口 | 直接请求 4096 端口（Pod IP） | 拒绝；上游 Basic 仅网关持有 | P0 |
| SEC-BYPASS-03 | 伪造网关注入头 | 自带 `X-User-Id`/`X-Workspace-Id` 头 | 网关剥离/覆盖；伪造无效 | P0 |
| SEC-BYPASS-04 | 票据重放/跨用户使用 | 用 A 的访问票据请求 B 的工作区 | 拒绝；票据绑定用户+工作区+短 TTL | P0 |
| SEC-BYPASS-05 | 子路径反代绕过 | 尝试 `/w/{other}/`、路径穿越 `../`、编码变体 | 规范化后校验归属；拒绝 | P1 |
| SEC-BYPASS-06 | CORS 滥用 | 用恶意源发起跨域请求 | CORS 白名单；不允许通配 + credentials | P1 |

### 6.8 OWASP / 通用基线

| ID | 用例 | 工具/方法 | 级别 |
| --- | --- | --- | --- |
| SEC-OWASP-01 | ZAP baseline（未认证） | ZAP spider + passive + baseline | P0（无 High） |
| SEC-OWASP-02 | ZAP authenticated 扫描（控制台 + API） | 登录脚本 + active scan | P0（无 High） |
| SEC-OWASP-03 | XSS/CSRF/CSP | 存储型/反射型；CSP 头；SameSite | P0 |
| SEC-OWASP-04 | 注入（SQL/命令/模板） | 参数化查询断言 + 恶意输入矩阵 | P0 |
| SEC-OWASP-05 | 认证/会话（ASVS V2/V3） | 会话固定、cookie 属性、登出失效、CSRF token | P0 |
| SEC-OWASP-06 | 安全头与 TLS | HSTS/CSP/X-Frame-Options；TLS 1.2+；无弱套件 | P1 |
| SEC-OWASP-07 | 速率限制/暴力破解 | 登录、API Key 校验、分享访问 | P1 |
| SEC-OWASP-08 | 错误处理信息泄露 | 触发 5xx/异常 | 统一错误码，无堆栈/内部路径 | P1 |

### 6.9 安全用例执行矩阵

| 门禁 | 必跑 | 说明 |
| --- | --- | --- |
| G4（平台核心） | SEC-AUTHZ-01/03/04/05、SEC-SECRET-01/02/04、SEC-BYPASS-01/02/03、SEC-OWASP-01 | 越权与直连是硬门槛，任一失败即 REJECT |
| G5（能力中心） | SEC-SBX-01~08、SEC-SSRF-01~04、SEC-SHARE-01~05、SEC-SC-01/02 | 沙箱逃逸失败 = P0，直接阻断 |
| G6（质量与安全） | 全部 34 条 + ZAP 认证扫描 + Trivy 全镜像 + 混沌 | `NOT-RUN` 项必须逐条列出原因并由 lead 签署豁免 |
| G7（部署验收） | SEC-SC-03/04/07、SEC-BYPASS-01、SEC-SECRET-07 + 镜像准入 | 生产准入证明 |

---

## 7. 性能与容量测试

### 7.1 场景（k6）

| ID | 场景 | 负载模型 | 阈值 | 环境 |
| --- | --- | --- | --- | --- |
| PERF-01 | 控制面 API 读 | 200 VU 稳态 10min | p95 <300ms，错误 <0.1% | ENV-2 |
| PERF-02 | 控制面 API 写 | 50 VU | p95 <800ms | ENV-2 |
| PERF-03 | SSO 登录 | 20 次/秒，60s | p95 ≤3s | ENV-2 |
| PERF-04 | 工作区拉起 | 50 并发创建，重复 3 轮 | p95 ≤90s；失败率 0 | ENV-2 |
| PERF-05 | 控制台 LCP | Lighthouse/Playwright，首页+工作区+四中心 | LCP p75 <2.5s | ENV-2 |
| PERF-06 | 长连接 | 200 条 SSE 保持 30min | 断线率 <1%，重连 ≤3 次 | ENV-2 |
| PERF-07 | 模型网关 | 稳态 50 RPS，含限流分支 | p95 <2s 首字节；429 行为正确 | ENV-2 |
| PERF-08 | 应用访问 | 100 RPS | p95 <500ms；1C2G 不 OOM | ENV-2 |
| PERF-09 | 评测沙箱并发 | 20 个 Job 并发 | 调度 ≤60s；无互相影响 | ENV-2 |
| PERF-10 | soak | 1h 稳态全链路 | 内存无持续增长（<10%）；无连接泄漏 | ENV-2 |

### 7.2 容量模型验证

- 目标：1,000 并发工作区 / 10,000 用户（NFR）。
- 方法：ENV-2 压到 200 工作区，采集"每工作区资源（CPU/内存/连接/PVC IO）/控制面实例数/DB 连接数"，按 infra-devops 容量模型外推；外推公式与假设写入 G6 记录。
- 通过条件：外推 1,000 工作区时，节点数/DB 规格/带宽结论与 `docs/02-architecture/deploy/DEPLOYMENT.md` 容量估算偏差 ≤ 20%，否则退回架构修订。
- 真机 1,000 并发：仅 G7 前在专用负载环境抽测；未执行则标注遗留风险。

### 7.3 性能证据要求

- k6 summary JSON + 关键指标截图 + 环境描述（节点/副本/DB/版本 digest）。
- 必须"同一构建"对比基线：每次门禁记录引用上一基线，回归 >10% 视为性能缺陷（P1）。

---

## 8. 混沌与故障演练（L6）

| ID | 注入 | 稳态 SLI | 期望行为 | 恢复判据（RTO） |
| --- | --- | --- | --- | --- |
| CHAOS-01 | 杀掉工作区 Pod | 工作区可用率 | 自动重建；PVC 保留；数据校验和一致 | ready ≤ 90s |
| CHAOS-02 | 杀掉 operator Pod | 工作区调和延迟 | 重启后继续 reconcile；无孤儿/重复 Pod | 5min 内补齐 |
| CHAOS-03 | K8s API 延迟/中断 60s | 控制面错误率 | 退避重试；不丢请求；操作最终一致 | API 恢复后 5min 内一致 |
| CHAOS-04 | 删除测试租户 PVC（模拟误删） | 数据完整性 | 仅该租户受影响；告警；备份可恢复（演练） | 恢复演练 ≤ RTO（待 G2 定，建议 4h） |
| CHAOS-05 | RDS 主备切换 | 控制面可用性 | 连接池重连；无数据丢失；错误率短时上升后恢复 | 2min 内恢复 |
| CHAOS-06 | Redis 清空/宕机 | 会话与限流 | 会话按设计降级（重登或续期）；限流不失效到危险级别 | 5min 内恢复 |
| CHAOS-07 | LiteLLM 超时/5xx | 模型调用成功率 | 重试/切换；429/5xx 明确；无密钥泄漏 | 1min 内降级生效 |
| CHAOS-08 | 节点压力（CPU/内存/磁盘） | 工作区 SLO | 驱逐策略正确；数据不丢；新 Pod 正常调度 | 10min 内恢复 |
| CHAOS-09 | 网络策略失效检测 | 隔离 | 可通过策略对象断言 + 主动探测；失效即 P0 | 立即告警 |
| CHAOS-10 | cert-manager 故障 | 应用 HTTPS | 证书到期前告警；到期前有冗余窗口 | 告警 ≤ 到期前 7 天 |

- 每个实验必须：声明稳态指标 → 注入 → 观察 → 记录恢复时间 → 24h 后复查；中止条件预先写明（如错误率 >5% 或数据风险即回滚）。
- 禁止在生产注入破坏性实验（CHAOS-04 只在测试租户 + staging）。

---

## 9. 准出标准、覆盖率与缺陷分级

### 9.1 准出标准（Definition of Exit，按门禁）

| 门禁 | 准出项 | 硬门槛（任一不满足即不通过） |
| --- | --- | --- |
| G4 平台核心 | E2E-AUTH-01~04、E2E-WS-01/03/04/05/08/09/10、E2E-MODEL-01/02/03/06、E2E-ISO-01/03 | 0 越权成功；工作区生命周期 E2E 全绿；核心模块覆盖 ≥70%；无 open P0/P1 |
| G5 能力中心 | E2E-SKILL-01~04、E2E-EVAL-01~03、E2E-APP-01~05、E2E-MCP-01~06 | 沙箱逃逸用例 100% 拦截；四中心闭环全绿；0 P0/P1 |
| G6 质量与安全 | 全部分层 + 全部安全用例 + 性能 + 混沌 | 扫描 0 Critical/High；SLO 达标；覆盖率达标；1h soak 无泄漏；成本看板可用 |
| G7 部署验收 | Helm 部署、灰度回滚、备份恢复、Runbook | 回滚 ≤5min；恢复演练通过；无 `latest`；验收报告签署 |

### 9.2 覆盖率目标

| 模块 | 行覆盖 | 分支覆盖 | 说明 |
| --- | --- | --- | --- |
| control-plane：auth/RBAC/API Key | ≥ 85% | ≥ 80% | 安全关键，最高要求 |
| control-plane：workspace 状态机/编排 | ≥ 85% | ≥ 80% | 状态转移表全部覆盖 |
| control-plane：model policy/计量 | ≥ 80% | ≥ 75% | |
| workspace-operator（reconcile） | ≥ 70% | ≥ 65% | 用 envtest/fake client |
| workspace-agent（配置同步） | ≥ 70% | ≥ 65% | |
| 四中心服务（skill/eval/app/mcp） | ≥ 70% | ≥ 60% | 沙箱相关逻辑另加集成测试 |
| console（lib/hooks/关键组件） | ≥ 60% | ≥ 50% | 视觉层用 E2E 覆盖 |
| 基础设施（Helm/Terraform/脚本） | 不计行覆盖率 | — | 用 lint/plan/渲染断言/冒烟覆盖 |

补充规则：
- `docs/00-program/REVIEW-GATES.md` G6 要求"核心模块 ≥70%"，本表对安全关键域提高到 80–85%，取**更严**者。
- 覆盖率不是唯一标准：**核心路径 E2E 覆盖率 100%**（§5 的 P0 场景）优先于行覆盖率。
- 新增代码覆盖率不得低于模块均值 5 个百分点（CI diff coverage 检查）。
- 豁免：生成的 SDK/类型、Mock、纯样式文件不计入；豁免清单放 `tests/coverage-ignore.md`。

### 9.3 缺陷分级（P0–P3）

| 级别 | 定义 | 示例 | 响应/修复时限 | 门禁影响 |
| --- | --- | --- | --- | --- |
| **P0 阻断** | 安全/数据/可用性硬伤，或核心流程完全不可用 | 跨租户越权成功；沙箱逃逸成功；工作区数据丢失；密钥泄露到客户端/日志；无法登录；生产路径 `latest` | 立即停线修复，24h 内 | 门禁直接 REJECT；已 PASS 的需回滚结论 |
| **P1 严重** | 核心功能受损但有绕行，或 SLO 显著不达标，或安全 High | 模型策略生效超 30s；分享撤销 >5s；评测结果不可复现；镜像 High 漏洞；SSO p95 超 3s | 本轮（当前门禁周期）修复 | 门禁 PASS-WITH-ACTIONS 或 REJECT（若影响核心链路） |
| **P2 一般** | 非核心功能缺陷、可绕行、UI/体验问题 | 统计数字偏差；空态缺失；非关键页面报错 | 排期（迭代内） | 不阻断，进行动项 |
| **P3 轻微** | 文案、样式、建议优化 | 文案错别字；对齐像素差 | 排期（backlog） | 不阻断，记录即可 |

与 `REVIEW-GATES.md` §2 的映射：`P0→P0`、`P1→P1`、`P2/P3→P2`。**缺口**：REVIEW-GATES 只定义三级，未含 P3 → 已作为 G0 问题提交（见消息 G0-09），建议同步修订，避免"轻微问题被迫升格为 P2 阻塞"。

### 9.4 门禁判定规则（机械判定，减少主观）

前置条件：门禁文件存在且逐项有证据；评审人意见已收集；签署栏完整。

| 条件 | 判定 |
| --- | --- |
| 任一 open P0；或核心 E2E（§9.1 硬门槛）失败；或越权/逃逸用例失败；或扫描出现 Critical/High 未豁免；或覆盖率低于目标 | **REJECT** |
| 无 open P0/P1，全部必需用例 PASS，覆盖率达标，SLO 达标，扫描通过 | **PASS** |
| 无 P0，存在 P1/P2 行动项但每个都有 owner + 截止 + 验证方式，且不阻塞主链路/不存在安全风险 | **PASS-WITH-ACTIONS** |
| 证据不可复现（缺命令/日志/环境信息），或评审只有"同意"无逐项证据 | **不通过**（视同 REJECT，重做记录） |
| `NOT-RUN` 用例存在，无 lead 书面豁免 | **不通过**（不得以 PASS 记录） |

补充规则：
- **一票否决**：qa-reviewer 对安全/隔离类 P0 有一票否决权（ROLES §2 决策权）。
- 行动项必须回到任务板；关闭需复测证据，由 qa 复核后解锁，不得由 owner 自证关闭。
- 同一门禁最多 2 轮 PASS-WITH-ACTIONS；第 3 轮必须 PASS 或 REJECT。
- 门禁文件一旦签署，修订需新增"修订记录"段落并注明原因，不得静默改结论。

---

## 10. 可追溯性矩阵（需求 → 测试）

| 需求 | 主要测试 | 备注 |
| --- | --- | --- |
| R1.1 SSO | E2E-AUTH-01、PERF-03 | |
| R1.2 RBAC | E2E-AUTH-02、SEC-AUTHZ-03/04、E2E-ISO-01 | UI 隐藏不算通过 |
| R1.3 API Key | E2E-AUTH-03、SEC-SECRET-02 | |
| R1.4 审计 | E2E-AUTH-04、E2E-MCP-04、Q-11 | |
| R2.1 注册表 | L2 契约 + 管理台 E2E（并入 MODEL-01） | |
| R2.2 模型策略 | E2E-MODEL-01/02、E2E-ISO-02 | |
| R2.3 密钥托管 | E2E-MODEL-03、SEC-SECRET-01/04/06 | |
| R2.4 网关 | E2E-MODEL-04/05、PERF-07 | |
| R2.5 计量 | E2E-MODEL-06、Q-12 | |
| R2.6 下发 | E2E-MODEL-01、Q-05 | |
| R3.1 隔离/4C8G | E2E-WS-03/10、E2E-ISO-01/02/03 | |
| R3.2 自动拉起 | E2E-WS-01/02/08、PERF-04 | |
| R3.3 退出不销毁 | E2E-WS-01/06/07 | staging soak |
| R3.4 访问/长连接 | E2E-WS-09、PERF-06、SEC-BYPASS-01~05 | |
| R3.5 运行时 | E2E-WS-01（使用步骤） | 工具链可用性冒烟 |
| R3.6 状态 | E2E-WS-04 | |
| R3.7 持久化 | E2E-WS-05、CHAOS-01/04 | |
| R4.1–R4.6 Skill | E2E-SKILL-01~06 | |
| R5.1–R5.6 评测 | E2E-EVAL-01~05、SEC-SBX-01~08 | |
| R6.1–R6.7 应用 | E2E-APP-01~08、SEC-SHARE-01~06 | |
| R7.1–R7.6 MCP | E2E-MCP-01~07、SEC-SSRF-01~05 | |
| R8.1–R8.7 控制台 | E2E 各旅程 UI 步骤、PERF-05、SEC-OWASP-01~03 | 无障碍：axe 扫描并入 L3 |
| R9.1–R9.6 平台工程 | L0 IaC 扫描、G7 演练、CHAOS-02/05/08 | |
| R10.1–R10.5 治理 | E2E-GOV-01~03 | |

---

## 11. 自动化与 CI 集成

### 11.1 流水线阶段

| 阶段 | 触发 | 内容 | 阻断 |
| --- | --- | --- | --- |
| `pr-fast` | PR | L0 + L1 + L2 + 受影响包 | 是 |
| `pr-e2e` | PR（label `e2e` 或关键路径变更） | ENV-1 上 E2E 冒烟（WS-01、AUTH-01、ISO-01） | 是 |
| `main-full` | 合并 main | ENV-1 全量 L3 + L5 静态 + 镜像扫描 | 是 |
| `nightly` | 每日 | ENV-2 全量 L3 + L4 + L5（ZAP/Trivy/矩阵）+ L6（每周） | 是（红灯即建缺陷） |
| `gate` | 门禁前手动 | 按 §9.1 全量 + 证据打包 | 是 |

### 11.2 证据与归档

- 目录：`docs/05-delivery/evidence/G<x>/<YYYYMMDD>-<runid>/`，含 `summary.md`（结论+豁免）、`junit.xml`、`coverage/`、`k6-summary.json`、`trivy.json`、`zap.html`、`playwright-report/`、`k8s-snapshot.yaml`。
- 每个门禁文件必须引用证据路径与 CI 运行链接。
- 保留期：通过 90 天；失败/缺陷相关保留至关闭 + 90 天。

### 11.3 Flaky 与隔离

- 用例标记 `@flaky`，隔离运行，连续 2 次失败才建缺陷；但进入门禁清单的用例必须 7 天内 flaky 率 ≤2%。
- 自动重试仅限 L3 非门禁用例，且重试次数计入报告。

---

## 12. 测试角色与职责

| 角色 | 职责 |
| --- | --- |
| `qa-reviewer` | 本计划维护、门禁汇总与判定、安全用例设计、证据审核、越权矩阵 |
| `infra-devops` | ENV-1/2 环境、Chaos Mesh、镜像/签名/SBOM、备份恢复演练 |
| `platform-backend` | 控制面单测/契约、审计与密钥用例配合 |
| `capability-centers` | 四中心 E2E 脚本、沙箱逃逸用例配合 |
| `web-console` | 控制台 E2E 定位器、无障碍与 LCP、设计一致性 |
| `pm-research` | 验收标准澄清、业务场景优先级 |
| `architect` | 契约权威、SLO/容量模型、安全威胁模型对齐 |
| `lead` | 豁免签署、门禁签署与放行 |

---

## 13. `tests/` 目录规划（本轮不创建实现）

```text
tests/
├── unit/                  # 跨包单测（包内单测就近 src/__tests__，此处放跨模块）
├── contract/
│   ├── openapi/           # openapi.yaml lint/校验/差异
│   └── upstream-schema/   # 用 pinned opencode packages/schema 校验配置片段
├── e2e/
│   ├── ui/                # Playwright 控制台旅程
│   ├── api/               # Playwright request / 跨服务
│   └── k8s/               # kubectl 断言 helper + kind 环境脚本
├── security/
│   ├── authz-matrix/      # 20 资源 × 角色 × 方法 矩阵生成器
│   ├── ssrf/              # 恶意 URL 集与断言
│   ├── sandbox/           # gVisor/Kata escape 用例（分离仓库/受限执行）
│   └── share/             # 分享越权
├── perf/k6/               # 场景脚本 + 阈值
├── chaos/                 # Chaos Mesh CR + 演练脚本
├── data/fixtures/         # 合成数据（固定种子）
└── helpers/               # 租户/清理/证据收集/时钟
```

落地节奏：L1/L2 在 G2（契约冻结）后可并行；ENV-1 kind harness 与 L3 冒烟在 G4 前完成；L5 矩阵与 L6 在 G5/G6 前完成。

---

## 14. 风险与开放问题（测试视角）

| # | 风险/开放问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| T-1 | 真实 ACK 凭证缺失（PLAN A5） | 性能/隔离证据降级 | 早期确认；若缺失，G6 记录必须显式降级并由 lead 签署 |
| T-2 | gVisor 在 kind 不可用 | 逃逸证据不完整 | staging 必跑；`NOT-RUN` 标注；不冒充 PASS |
| T-3 | 沙箱逃逸用例本身是"武器化"风险 | 安全风险 | 用例受控仓库 + 只读执行 + 不落生产；评审人限定 |
| T-4 | 评测 LLC-judge 不可完全复现 | R5.3 | 固定模型版本/温度/种子；声明容差；规则评分器为主 |
| T-5 | 24h/72h soak 占用环境 | 周期长 | staging 定时任务；结果进每日看板 |
| T-6 | 1,000 并发无真机环境 | 容量结论靠外推 | G7 前补专用环境抽测，否则列为遗留风险 |
| T-7 | 上游 opencode 破坏性变更 | 契约/回归失效 | 契约测试 + pinned commit + 升级门禁 |
| T-8 | 分享公开链接被滥用 | 安全/合规 | 速率限制、滥用告警、可关闭；G6 复核 |
| T-9 | 审计留存 180 天与"30 天删除"冲突 | 合规判定 | 需产品明确优先级（G0 问题） |
| T-10 | 成本：4C8G 常驻 × 1000 未量化 | 性能/成本门禁 | 由 infra 容量模型 + 成本看板，G6 判定 |

---

## 15. 变更记录

| 版本 | 日期 | 变更 | 作者 |
| --- | --- | --- | --- |
| v0.1 | 2026-11-04 | 初版：分层/环境/E2E/安全/准出/缺陷分级/门禁规则 | qa-reviewer |

---

> 备注：本计划的**判定规则**（§9.4）与**证据要求**（§11.2）对全部门禁生效；
> 后续 G1/G2/G3 评审记录由 qa-reviewer 统一落盘到 `docs/04-reviews/`，索引见 `docs/04-reviews/README.md`。
