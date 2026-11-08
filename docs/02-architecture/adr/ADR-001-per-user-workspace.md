# ADR-001：每用户单实例工作区（4C8G），而非共享多租户 server

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect
- 关联：`ARCHITECTURE.md §3/§7`、`SECURITY.md §3`、PLAN R3.1

## 背景

需求要求"每个用户 SSO 后自动获得独立 4C8G 工作区，持久、退出不销毁"。上游 opencode 的 `serve` 是**单租户设计**：
一个服务密码（`OPENCODE_SERVER_PASSWORD`）、一个 SQLite 库、一个进程内状态、无用户概念（`server/src/auth.ts` 用户名固定 `opencode`）。

需要决定：一人一实例，还是一个（或少数）多租户 server 承载多人？

## 决策

**每个用户一个独立工作区 = 一个 Pod（4C8G, requests=limits）+ 一个 PVC + 一个 `opencode serve` 进程 + 一个模型虚拟 Key + 独立 NetworkPolicy。**

默认每用户 1 个工作区（`UNIQUE(org_id, owner_user_id)`），多开是 P2 能力（配额控制）。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 共享多租户 server（一个 Pod 多人）** | ① 上游无用户隔离，服务密码是全局的，任何用户拿到即可读他人会话；② SQLite 单库，`session`/`message` 无租户键；③ 无法做资源配额（4C8G/人）；④ 一个用户的死循环/内存泄漏影响所有人；⑤ PTY/文件系统是进程级全局。**无法证明隔离**，直接违反 R3.1 与 SECURITY §3 |
| **B. 一人一容器但共享 Pod（多容器）** | 网络/文件系统仍共享，PTY 与端口分配复杂；K8s 的调度单位是 Pod，资源隔离粒度不足 |
| **C. 一人一 Pod 但共享 PVC** | 跨租户存储共享，IDOR 与数据泄露面巨大；PVC 挂载权限无法按子目录授权 |
| **D. 用 VM（Firecracker/Kata）替代 Pod** | 隔离更强，但启动慢（>2s vs 容器）、成本高、与 ACK 生态集成复杂、运维成熟度低；当前威胁模型（无 gVisor 的 workspace）用强 Pod 基线 + 网络/存储隔离已足够，VM 方案留作高安全租户的 P2 选项 |
| **E. 每用户多副本（HA）** | 上游是单进程 + 本地 SQLite，无法多副本共享状态；HA 用"Pod 重建 + PVC 保留"替代 |

## 后果

**正面**
- 隔离可证明：进程/文件系统/网络/存储/密钥五重独立（SECURITY §3）。
- 故障域小：一个用户崩溃不影响他人；Pod 重建 ≤90s。
- 资源可精确计量：4C8G Guaranteed QoS + 每工作区虚拟 Key。
- 与上游设计一致，零改造。

**负面 / 代价**
- 成本高：4000 vCPU 常驻（约 70–140 万/月量级）→ 必须提供 `stopped` 显式动作与成本可见（R3.10），但**默认不自动销毁**。
- 调度压力：1000 Pod 需要 ~260 台 16c64g 节点 + 镜像预热/创建限流。
- 每 Pod 一个 SQLite，需要 PVC 快照备份（不能 cp 活文件）。
- 冷启动慢：镜像拉取 + opencode 启动，需要预热策略（P2）。

## 验证

- 隔离测试：跨租户 Pod 网络不可达、PVC 不可挂载、SA token 不可用（`TEST-PLAN` 安全用例）。
- 资源测试：`kubectl describe pod` 显示 requests=limits；QoS class=Guaranteed。
- 成本看板：单工作区日成本可见。

## 证据

- 上游单租户：`upstream/opencode/packages/server/src/auth.ts`（`username: "opencode"` 硬编码）
- 上游单库：`cli/src/database-path.ts`、`core/src/database/database.ts`（单文件 + WAL）
- 上游无用户概念：`schema/src/config.ts` 无 user 字段；session 无 owner
