# ADR-007：沙箱强隔离运行时用于 eval/app/build（gVisor，或 ACK 安全沙箱 Kata/runV），工作区不用

- 状态：**Accepted**
- 日期：2026-11-04（2026-11-04 修订：R5.2 由"gVisor/Kata"改为"gVisor 或 ACK 安全沙箱 Kata/runV"，本 ADR 同步扩展运行时抽象）
- 决策者：architect / infra-devops / qa-reviewer
- 关联：`SECURITY.md §3.4`、PLAN R5.2、风险 6

## 背景

需求：评测沙箱要"逃逸测试全部拦截"（R5.2）；应用容器隔离；工作区也运行用户代码（更危险：持续运行、有网、有持久数据）。

gVisor（runsc）提供用户态内核，能显著降低容器逃逸风险，但有**兼容性与性能代价**：`inotify`/`io_uring`/`ptrace`/部分 syscall 行为差异、文件 IO 性能下降（尤其大量小文件与 git 操作）。

## 决策

**分而治之**：
- **eval / app / build**：强制**强隔离运行时**，通过统一的 `RuntimeClass` 名称 **`sandbox-runtime`** 抽象：
  默认实现为 **gVisor（`runsc`）**；在 ACK 启用安全沙箱（**Kata Containers / runV**）的集群上，优先使用 **Kata**（`kata-qemu` / `kata-clh`），由集群管理员在 RuntimeClass 中指定 handler，**工作负载 YAML 不变**。
  选择理由：两者都提供远超 runc 的隔离；gVisor 启动快、开销低、适合高频短任务；Kata 兼容性与 syscall 完整度更高（适合需要完整内核语义的应用容器）。平台只依赖"RuntimeClass = sandbox-runtime"这一契约，避免绑定单一实现。
- **workspace**：**不用**强隔离运行时，改用强化 Pod 安全基线（非 root、只读根、drop ALL caps、seccomp RuntimeDefault、禁 hostPath/hostNetwork/SA token、独立节点池、网络默认拒绝）。
- 提供 **org 级可选开关** `workspaces.settings.isolation=gvisor|kata`（高安全租户/付费能力），默认关闭。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. 全部用 gVisor（含 workspace）** | 隔离最强，但 opencode 的核心工作负载（git status 大仓、`node_modules` 万级小文件、文件监听、PTY、LSP）在 gVisor 下性能显著下降甚至功能异常；会破坏核心体验（"我的终端/文件监听不工作"） | 否决为默认；保留为 org 级开关 |
| **B. 全部不用 gVisor** | eval/app 跑用户提交代码是最高风险场景，无强隔离不可接受；且 R5.2 明确要求"逃逸测试全部拦截" | 否决 |
| **C. Kata Containers（轻量 VM）** | 隔离≈VM，**兼容性优于 gVisor**（完整内核语义），启动 ~500ms–1s、需要嵌套虚拟化/裸金属支持、节点成本高。**在 ACK 安全沙箱（Kata/runV）上作为首选实现**（见决策：RuntimeClass 抽象为 `sandbox-runtime`，handler 可以是 kata-qemu/kata-clh 或 runsc）；不在非沙箱节点池上强行启用 | **采纳为 sandbox-runtime 的实现之一**（与 gVisor 二选一，按集群能力） |
| **D. Firecracker 自研** | 与 K8s 集成复杂（需要独立 runtime/kata 类方案） | 否决 |
| **E. 只靠 seccomp/AppArmor** | 对内核漏洞无隔离；沙箱要求不满足 | 否决用于 eval |

## 后果

**正面**
- workspace 保持上游原生性能与兼容性（这是产品核心体验）。
- eval/app 获得强隔离，满足 R5.2 与安全准出。
- 成本可控：只有沙箱节点需要 gVisor；gVisor 节点可与 workspace 节点复用（打标签调度）。

**负面 / 代价**
- workspace 的逃逸风险依赖内核补丁与 Pod 基线 → 必须：节点自动补丁、PodSecurity restricted、独立节点池、无云元数据/SA token、出站白名单、快速重建能力。
- 需向客户/评审明确解释"为什么工作区不用 gVisor"（本 ADR 即证据），并提供高安全开关。
- 高安全租户的 workspace 性能下降需提前告知（PRD 标注为可选项）。

## 实现要点

```yaml
# RuntimeClass（平台只依赖这个契约名；handler 由集群能力决定）
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata: { name: sandbox-runtime }
handler: runsc          # gVisor 集群；ACK 安全沙箱集群改为 kata-qemu / kata-clh（runV）
overhead: { podFixed: { cpu: 50m, memory: 64Mi } }
```
- 调度：`runtimeClassName: sandbox-runtime` + 节点亲和 `sandbox=true`。
- eval Job 模板：sandbox-runtime + `network:deny` + 只读根 + `automountServiceAccountToken:false` + `activeDeadlineSeconds`。
- 应用容器：sandbox-runtime + 1C2G + 只读根 + 非 root + 健康检查。
- workspace：`runtimeClassName` 留空（默认 runc）+ PodSecurity `restricted`；高安全 org 可指定 `sandbox-runtime`。

## 验证

- eval 逃逸 POC 集全部拦截（`/proc` 逃逸、cgroup、ptrace、mount、docker socket、元数据）。
- workspace 功能回归：git 大仓 status、文件监听、PTY、LSP 正常（性能基线对比 runc）。
- 高安全开关：开启后 workspace 使用 gVisor，功能降级项在 UI 明示。
