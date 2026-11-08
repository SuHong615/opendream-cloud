# ADR-011：应用构建用 rootless BuildKit（Job 内），推 ACR

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / capability-centers / infra-devops
- 关联：`ARCHITECTURE.md §6.5`、PLAN R6.2

## 背景

应用中心要从工作区产物构建镜像（Node/Python/静态站点），推 ACR，再 1C2G 部署。要求：无根构建、缓存、可扫描、隔离、失败可重试、构建日志可查。

## 决策

**每个构建是一个一次性 K8s Job：rootless BuildKit（`buildkitd --rootless`）+ 独立 namespace + gVisor + 只读根 + 网络仅放行 ACR/依赖源；产物推 ACR（不可变 tag + digest），记录到 `app_deployments`。**

- 构建上下文：从工作区 PVC 复制到 OSS 临时前缀（排除 `.git`/`node_modules` 按 ignore），Job 从 OSS 拉取 → 不直接挂载用户 PVC（避免跨租户误挂）。
- 缓存：ACR 作为 `--cache-from/--cache-to`（registry cache），按 app 隔离 cache ref。
- 扫描：推完触发 Trivy；HIGH/CRITICAL 阻断部署。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 在工作区内 `docker build`** | 工作区无 Docker daemon（也不应有，安全红线）；即使有（DinD）也是特权容器 = 逃逸风险；构建会污染用户环境 |
| **B. Kaniko（Job 内）** | 可用、无特权，但**无内置缓存**（每次全量构建慢）、增量能力弱；大项目构建时间不可接受。可作为降级备选 |
| **C. Buildah/docker buildx 在特权 Pod** | 需要 privileged 或 `CAP_SYS_ADMIN` → 违反 PodSecurity restricted；节点逃逸风险 |
| **D. 云厂商镜像构建服务（ACR EE 构建/Aliyun CodeBuild）** | 托管省事，但供应商锁定、无法在 kind 本地验证、成本与配额不透明；P2 可接 |
| **E. 用 Nixpacks/Herokuish 直接生成镜像** | 只覆盖特定模板，灵活性差；仍需要一个构建运行时 |
| **F. 在工作区 PV 上直接 rootless BuildKit sidecar** | 构建与用户环境耦合，资源竞争，清理困难 |

## 后果

**正面**
- 无特权、可审计、与 gVisor 兼容（BuildKit rootless 在 gVisor 下可运行）。
- 缓存有效（registry cache），重复构建快。
- 构建与运行解耦：构建失败不影响工作区；构建 Job 可重试/取消。
- 产物可追溯：image digest + commit + build_no + SBOM。

**负面 / 代价**
- 构建上下文传输（PVC→OSS→Job）增加时延与临时存储成本。
- rootless BuildKit 在 gVisor 下有网络/overlay 兼容性风险 → 需在 kind/staging 验证，必要时 build 节点用 runc（仍 rootless），仅 eval 用 gVisor。
- 需要 registry 凭据（ACR）注入构建 Job → 用 ServiceAccount + 短期 token（免密插件）而非长期密码。
- 构建并发需限流（避免打满节点）。

## 实现要点

```yaml
# 构建 Job（摘要）
spec:
  ttlSecondsAfterFinished: 3600
  activeDeadlineSeconds: 1800
  template:
    spec:
      runtimeClassName: gvisor        # 验证通过则启用
      automountServiceAccountToken: false
      containers:
        - name: buildkitd
          image: moby/buildkit:v0.x-rootless@sha256:...
          securityContext: { runAsUser: 1000, runAsGroup: 1000, readOnlyRootFilesystem: true, allowPrivilegeEscalation: false, capabilities: { drop: [ALL] } }
          resources: { requests: {cpu: '2', memory: 4Gi}, limits: {cpu: '4', memory: 8Gi} }
```

- 步骤：`prepare`（导出上下文到 OSS）→ `build`（BuildKit）→ `scan`（Trivy）→ `deploy`（写 `app_deployments` + 创建 Deployment/Service/Ingress）。
- 模板：Node（`npm ci && npm run build`）、Python（`pip install -r`）、静态（直接打包）；`custom` 接受用户 Dockerfile（仍需扫描）。
- 失败处理：Job 失败 → `app_deployments.status=failed` + 日志引用；重试生成新 build_no（不复用 tag）。
- 清理：`ttlSecondsAfterFinished` + OSS 临时前缀 24h 生命周期。

## 验证

- 构建成功 → 镜像 digest 与 `app_deployments` 一致；不可变 tag 校验。
- 无特权：PodSecurity restricted 通过；`kubectl auth can-i` 无多余权限。
- 扫描阻断：含 HIGH 漏洞镜像不得部署。
- 缓存命中：二次构建时间显著下降。
- 隔离：构建 Job 无法访问其他租户 PVC/Secrets；网络仅 ACR + 依赖源。
