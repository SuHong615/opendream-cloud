# ADR-002：用 workspace-operator（CRD reconcile）编排，而非控制面直连 K8s API

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / infra-devops
- 关联：`ARCHITECTURE.md §5/§6.2`、`deploy/DEPLOYMENT.md`

## 背景

控制面需要创建工作区（Pod/VPC/Service/Ingress/PVC）、推进状态、处理漂移。有两种实现路径：控制面直接调 K8s API（命令式），或定义 CRD + Operator（声明式）。

## 决策

**定义 CRD `OpencodeWorkspace`（`opencode.cloud/v1alpha1`），由 `workspace-operator`（Go + controller-runtime，2 副本 + leader-election）reconcile。**

- 控制面是 **spec 唯一写者**；operator 是 **status + finalizer 唯一写者**。
- 控制面创建/更新 = 写 spec（期望态）；状态来源 = watch status。
- 删除 = 设置 `deletionTimestamp`，operator 执行"快照 → 删 PVC/Ingress/Service → 移除 finalizer"。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 控制面直连 K8s API（命令式）** | ① 无 reconcile：任一 API 调用失败/部分成功 → 漂移无法自愈，需要大量补偿代码；② 控制面故障时状态丢失，重启后不知道"创建到哪一步"；③ 控制面需要集群内高权限，安全面扩大；④ 无法处理手工变更/节点故障导致的 Pod 消失；⑤ 无统一 finalizer 语义，删除可能半途而废（PVC 泄漏） |
| **B. Helm/Argo CD 管理每工作区** | 1000 个 Release 不可行（Argo CD 规模、渲染开销）；生命周期（start/stop）不是 GitOps 语意 |
| **C. Job 一次性脚本创建** | 无持续 reconcile，漂移即失效；错误处理弱 |
| **D. 用 KubeVirt/VM operator** | 见 ADR-001 方案 D，成本与生态不符 |

## 后果

**正面**
- 状态自愈：Pod 被删、节点故障、PVC 漂移都会被 reconcile 修正。
- 控制面与 K8s 解耦：控制面只需 `create/patch/delete CR` 权限（namespace 级），operator 持有实际资源权限（最小权限分离）。
- 删除语义清晰（finalizer + 快照钩子），PVC 不会泄漏。
- 可观测：CR status 即工作区状态的单一真相，`kubectl get ow` 可运维。
- 可测试：envtest + fake client 就能覆盖 reconcile 逻辑。

**负面 / 代价**
- 多一个 Go 服务要维护（CI/CD、镜像、RBAC）。
- 状态有延迟（watch + reconcile 通常 <1s，满足 R3.6 ≤2s）。
- CRD 版本演进需要 conversion webhook（v1alpha1 → v1beta1 时）。

## 实现要点

- CRD 字段（与 platform-backend 对齐）：`spec{tenantId, ownerUserId, image, imageDigest, resources(4C8G 固定), storage{pvcSize,storageClass,retainPolicy}, server{port:4096,passwordSecretRef}, config{revision,...}, access{host,...}, lifecycle{autoStart,idleSuspend:false,destroyAfter}}`；`status{phase, reason, conditions[], observedGeneration, podName, url, lastActivityAt, failureCount}`。
- `phase` 枚举：`Provisioning|Starting|Ready|Idle|Stopping|Stopped|Deleting|Deleted|Failed`（与 `DATA-MODEL.workspaces.state` 映射）。
- 幂等：reconcile 全部 `createOrUpdate` 语义；`observedGeneration` 防止旧事件覆盖新 spec。
- 冷却期销毁由控制面计时（写 `destroy_scheduled_at`），operator 到点执行。

## 验证

- envtest 覆盖：创建/就绪/停止/销毁/漂移修复/删除阻塞（PVC 快照失败）。
- 混沌：删除运行中 Pod → 自动重建；删除 PVC → 不重建（数据安全优先，进入 error 并告警）。
- 权限：控制面 SA 无 `pods/exec`、无 `secrets` 读（除自己的）。
