# ADR-012：PVC 生命周期 = Retain + 快照（退出不销毁 / 显式销毁 / 可恢复）

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / infra-devops
- 关联：`ARCHITECTURE.md §7.2`、`DATA-MODEL.md workspace_snapshots`、PLAN R3.3/R3.7/D1

## 背景

产品红线："退出不销毁，仅显式销毁"（D1）。同时销毁必须干净（不能留垃圾），且删除后 30 天内可恢复（合规/误操作）。上游 SQLite + 用户代码都在 PVC 上。

## 决策

**PVC 默认 `Retain`，生命周期与工作区解耦；销毁时先创建 VolumeSnapshot，再删除 Pod/PVC；快照保留 30 天（可配）。**

| 动作 | Pod | PVC | 快照 |
| --- | --- | --- | --- |
| 关闭浏览器 / 会话过期 | 不变 | 不变 | 不变 |
| `stop`（显式） | 删除 | **保留** | 可选 |
| `idle`（无活动） | 保留 | 保留 | 无 |
| `destroy`（显式 + 冷却期默认 5min，可配 5min–24h） | 删除 | **删前快照**，然后删除 | 保留 30 天 |
| 冷却期内取消 | 不变 | 不变 | 无 |
| 恢复（30 天内） | 重建 | 从快照恢复 | — |
| 销毁 30 天后 | — | 已删 | 过期删除 |

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. PVC 随 Pod 删除（Delete reclaim policy）** | 违反"退出不销毁"；一次误操作即永久丢数据 |
| **B. 数据同步到对象存储（rsync/restic），PVC 可删** | 同步有延迟（丢最后一段）；恢复慢（TB 级）；SQLite 热同步不一致；运维复杂 |
| **C. 每用户 NFS 共享存储** | 跨租户隔离风险；性能差；NFS 单点 |
| **D. scale-to-zero（Pod=0，PVC 保留）作为默认** | 用户明确要求"退出不销毁"，默认休眠会让"回来还在跑"变成"回来要等启动"；作为**可选**开关（R3.10）保留，默认关闭 |
| **E. 快照作为唯一持久化（PVC 短生命周期）** | 恢复必须重建 PVC（慢），且频繁快照成本高；不适合日常 |

## 后果

**正面**
- 满足产品红线；误销毁可恢复（30 天）。
- `stop` 可省计算成本（Pod=0）而不丢数据。
- 快照提供勒索/误删的最后防线。
- 与 K8s 标准（VolumeSnapshot）集成，不需要自研备份系统。

**负面 / 代价**
- 存储成本随用户数线性增长（20–50 TiB）→ 需要配额与回收策略。
- 快照依赖 CSI 驱动（ESSD 支持）；跨 AZ 恢复受限（快照是区域级）。
- RWO PVC + 节点故障：Pod 重建可能等待原节点清理（multattach），恢复时间可能 >90s → 需要 `ReadWriteOncePod` + 节点排水策略。
- 删除流程变长（快照 → 删除 → 验证），需要 finalizer 保证幂等。
- 用户删除后 30 天内数据仍在（合规要求明确说明）。

## 实现要点

```yaml
# PVC 创建（Operator）
storageClassName: essd-pl1
accessModes: [ReadWriteOncePod]
resources: { requests: { storage: 20Gi } }
# 删除保护：不设置 ownerReference 到 Pod；归属由 label 表达
labels: { app: opencode-workspace, tenant: <org_id>, workspace: <ws_id> }
```

- **删除序列**（operator finalizer）：
  1. 标记 `deleting`，停止 Pod（grace 30s）
  2. `VolumeSnapshot` 创建并等待 `readyToUse`
  3. 记录 `workspace_snapshots`（trigger=pre_delete, expires_at=+30d）
  4. 删除 Pod/Service/Ingress/PVC
  5. 移除 finalizer → `deleted`
- **恢复**：`workspace_snapshots` 选快照 → 创建新 PVC from `dataSource`（同 AZ）→ 重建 Pod。
- **日备**：CronJob 每日为活跃工作区打快照（保留 7 天，增量成本）；销毁前快照优先于日备。
- **一致性**：SQLite WAL 模式下直接快照可能不一致 → 快照前 agent 执行 `sqlite3 .backup`/`VACUUM INTO` 到 PVC 内 `backup/` 目录（可选，强一致要求时启用）。
- **错误码（G2-02）**：快照失败统一 `internal_error` + `details.phase="snapshot"`（**不新增** reason，保持 23 枚举稳定）；文案「数据仍未删除，可重试销毁」。
- **清理**：快照过期由定时任务删除；删除失败告警。

## 验证

- 关闭浏览器 24h 后：Pod 仍在（或 idle），数据完整（R3.3 验收）。
- `stop` 后 `start`：数据完整，会话恢复（R3.7）。
- 销毁：二次确认 → 冷却期 → 快照 → 删除；30 天内可恢复。
- 误删保护：冷却期内取消成功。
- 节点故障：Pod 重建后 PVC 挂载成功（同 AZ），数据完整。
- 快照一致性：SQLite 可打开、`PRAGMA integrity_check` 通过。
