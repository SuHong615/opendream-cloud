# ADR-014：工作区信任边界（runc 半可信）与强隔离范围

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / infra-devops / qa-reviewer
- 关联：`SECURITY.md §1.1/§3.4`、`adr/ADR-007-gvisor-scope.md`、PLAN R3.1/R5.2

## 背景

工作区运行用户代码（任意依赖、任意 shell、PTY、文件系统写），但它是产品核心体验，必须保持上游工具链的完整兼容性与性能。容器运行时有两种信任假设：

- **runc（共享宿主内核）**：性能与兼容性最佳，但容器边界即内核边界；内核漏洞可导致逃逸。
- **强隔离（gVisor `runsc` / ACK 安全沙箱 Kata/runV）**：用户态内核或轻量 VM，逃逸面显著降低；但有 syscall 兼容性、IO 性能、启动开销代价。

## 决策

**明确把工作区定义为"半可信"信任域，使用 runc + 强化基线；强隔离只用于评测沙箱与应用构建/运行（ADR-007）。**

工作区（runc，半可信）必须具备以下**全部**控制，缺一不可：

| # | 控制 | 实现 |
| --- | --- | --- |
| 1 | 非 root | `runAsNonRoot: true`、`runAsUser: 1000`、`fsGroup` |
| 2 | 只读根文件系统 | `readOnlyRootFilesystem: true`；可写目录仅 `emptyDir`（`/tmp`、`/run`）+ PVC |
| 3 | 禁止提权 | `allowPrivilegeEscalation: false`、`capabilities.drop: [ALL]` |
| 4 | seccomp | `seccompProfile.type: RuntimeDefault` |
| 5 | 无 K8s 身份 | `automountServiceAccountToken: false`、无 RBAC 绑定 |
| 6 | 无宿主命名空间 | 禁 `hostPID`/`hostNetwork`/`hostIPC`/`hostPath`/`privileged` |
| 7 | 独立 Pod + PVC | 一人一 Pod、一 PVC（`ReadWriteOncePod`），不共享 |
| 8 | 网络默认拒绝 | NetworkPolicy default-deny；入站仅 gateway，出站仅 LiteLLM/MCP Hub/Skill 源/DNS |
| 9 | 资源硬限 | 4C8G `requests=limits`（Guaranteed QoS） |
| 10 | 节点隔离 | 独立节点池 + 污点；节点自动补丁；无云元数据访问 |
| 11 | 准入 | PodSecurity `restricted`（namespace 级）+ Kyverno 规则兜底 |
| 12 | 镜像 | digest 锁定 + cosign 验证 + 扫描 |

**信任边界声明**：

> 工作区 = **半可信（semi-trusted）**：平台假设用户可在容器内取得 root 并执行任意代码，但**不**假设其能突破容器边界。
> 因此所有安全设计必须做到"即使工作区被完全攻陷，也只影响该租户自身的数据与配额"——这由 Pod/节点/网络/存储/密钥四层隔离保证（见 SECURITY §3）。
> 反之，**评测沙箱与应用容器 = 不可信（untrusted）**：用户提交的代码可能主动尝试逃逸，必须用强隔离运行时 + 禁网 + 短生命周期。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 工作区也用 gVisor/Kata** | 工具链兼容性与性能风险（git 大仓、`node_modules`、inotify/文件监听、PTY、LSP），会破坏核心体验；作为 org 级可选开关保留（ADR-007） |
| **B. 不声明信任级别，模糊处理** | 会导致安全评审无法给出"残余风险接受"结论；也导致控制强度不一致（有的加有的不加）。**必须显式声明** |
| **C. 工作区用 VM（Firecracker）** | 启动慢、成本高、与 ACK 集成复杂；当前威胁模型可用 Pod 基线 + 四层隔离覆盖 |
| **D. 把工作区当完全不可信（禁网禁执行）** | 产品不成立（它就是开发环境） |

## 后果

**正面**
- 安全评审有明确的"接受/不接受"边界，残余风险可量化（内核 0day → 靠节点隔离与快速重建）。
- 控制项可逐条自动化验证（PodSecurity、kube-bench、准入测试）。
- 高安全租户有明确升级路径（org 级开关切 `sandbox-runtime`），不需要改架构。

**负面 / 代价**
- 接受"共享内核"风险：内核 0day 可能导致逃逸。补偿：独立节点池、节点补丁 SLA（Critical ≤7 天）、无云元数据、无 SA token、出站白名单、快速重建（≤90s）。
- 只读根 + 非 root 可能与部分工具链冲突，需要镜像内预置可写路径（`/tmp`、`$HOME`、`/workspace`）与验证。
- 客户若要求"工作区也强隔离"，性能会下降，需要作为付费选项并明示。

## 验证

- PodSecurity：`workspaces` namespace 为 `restricted`，创建特权 Pod 必须被拒。
- kube-bench / CIS 扫描通过。
- 逃逸 POC：从工作区 Pod 尝试读宿主 `/proc`、挂载、`ptrace`、访问 SA token、访问云元数据、访问其他租户 Pod IP —— 全部失败。
- 性能回归：runc 下 git status（10 万文件仓库）、文件监听、PTY 时延达标；对比 gVisor 记录差异（用于定价/告知）。
- 高安全开关：开启后工作区 `runtimeClassName=sandbox-runtime`，兼容性降级项在 UI 明示。

## 证据

- 上游需要完整内核语义：`packages/core/src/pty/*`（PTY）、`packages/core/src/filesystem/*`（watcher）、git 操作依赖 `ptrace`/`inotify` 等。
- 强隔离运行时抽象：ADR-007（`RuntimeClass: sandbox-runtime`，handler=runsc 或 kata-qemu/kata-clh）。
- 隔离四层：`SECURITY.md §3.1–§3.4`。
