# OpenDream Cloud · 安全架构（STRIDE / 租户隔离证明 / 密钥 / 威胁对策 / 合规）

- 版本：v1.0
- Owner：architect（决策） / qa-reviewer（审计）
- 关联：`ARCHITECTURE.md`、`DATA-MODEL.md`、`openapi.yaml`、`adr/`、`docs/05-delivery/TEST-PLAN.md`
- 状态：**待 G2 评审**
- 安全目标：OWASP ASVS L2；多租户零信任；密钥不出网关；沙箱不可逃逸到宿主/其他租户

---

## 1. 安全边界与信任模型

### 1.1 信任域

| 域 | 信任级别 | 说明 |
| --- | --- | --- |
| 公网 | ❌ 不可信 | 只允许 443 入站到 SLB/WAF |
| 边缘（Ingress / auth-edge / workspace-gateway / app-gateway） | ✅ 半可信 | 唯一持有 SSO 会话与上游 Basic 密码的组件；最小化部署、只读根文件系统 |
| 控制面（API/Console/Operator） | ✅ 可信（受限） | 有 DB 访问；**不应**能读用户工作区磁盘内容 |
| 工作区 Pod | ⚠️ **半可信（semi-trusted）**：runc 共享内核；用户可在容器内取得 root 并执行任意代码，但平台**不**假设其能突破容器边界 | 见 ADR-014 的 12 项强制控制 |
| 沙箱（eval/app/build） | ⚠️ **不可信（untrusted）**：用户提交的代码可能主动尝试逃逸 | 强隔离运行时（gVisor 或 ACK Kata/runV）+ 禁网 + 短生命周期 |
| 数据层（PG/Redis/OSS/ACR） | ✅ 可信 | 仅私网、IAM/RBAC、加密 |
| 模型供应商 | ⚠️ 外部 | 只发送必要的 prompt；不发送平台密钥；按合规要求可选"不发原始代码"策略 |

> **信任边界声明（ADR-014）**：工作区 = **半可信**；评测/应用/构建 = **不可信**。
> 安全目标：即使某工作区被完全攻陷，也只影响该租户自身的数据与配额（由 Pod/节点/网络/存储/密钥四层隔离保证，见 §3）。
> 工作区必须同时具备以下 12 项控制（缺一不可）：非 root、只读根、禁提权（drop ALL）、seccomp RuntimeDefault、无 SA token、无宿主命名空间、独立 Pod+PVC（ReadWriteOncePod）、网络默认拒绝、4C8G requests=limits、独立节点池+无云元数据、PodSecurity restricted + Kyverno 准入、镜像 digest+cosign。

### 1.2 关键不变量（任何改动不得破坏）

1. 用户**永远拿不到**工作区服务密码 / 供应商真实 API Key / MCP 上游凭证 / 其他用户的令牌。
2. 任意两个租户之间**不存在**共享的可读写存储、共享的进程、共享的网络可达路径（除显式公共只读内容）。
3. 工作区访问必须经过"SSO 会话 + 一次性 ticket + 网关归属校验"三重，缺一不可。
4. 所有跨租户查询在 **DB 连接层**（RLS）+ **应用层**双重限制。
5. 所有写操作有审计；所有密钥操作有独立审计。
6. 上游 opencode 只读；任何对镜像的修改都要走构建流水线与签名。

---

## 2. STRIDE 威胁模型

> 评分：影响 × 可能性 → 风险等级（高/中/低）。每行给出对策与**验证方式**（交 qa-reviewer 落测试用例）。

### 2.1 S — Spoofing（身份伪造）

| ID | 威胁 | 场景 | 影响 | 对策 | 验证 |
| --- | --- | --- | --- | --- | --- |
| S-1 | 伪造 SSO 会话 | 攻击者构造 Cookie | 高 | 会话由**控制面 auth-edge（唯一 RP）**签发（`__Host-` 前缀、`__Host-` 无 Domain、HttpOnly/Secure/SameSite=Lax、Redis 存储、登录轮换 sid） | 篡改 Cookie 必须 401；会话固定测试 |
| S-2 | 重放 access-ticket | ticket 被截获二次使用 | 高 | ed25519 JWT + `jti` 一次性（Redis 60s）+ `aud=workspace:<id>` + 绑定 `sub` | 同 ticket 第二次必须 403 |
| S-3 | 伪造工作区 URL 进入他人工作区 | 猜测 `w-<id>.ws` 域名 | 高 | 域名不含敏感信息（随机 short id）；gateway 校验 ticket 的 `ws` 与 Host 一致；无 ticket 一律 302 SSO；归属校验在**网关**不查 DB（用 ticket 自身声明 + 签名） | 跨用户访问必须 403；枚举域名 404 |
| S-4 | 伪造上游 Basic 密码 | 用户直接访问 Pod IP:4096 | 高 | Pod IP 仅在集群内；NetworkPolicy 只允许 ingress/gateway namespace → Pod:4096；服务密码随机 32B 存 Secret，**不出现在任何响应/日志** | 集群内其他 namespace 访问必须被 NP 拒绝（e2e） |
| S-5 | OIDC 参数降级/混淆 | `redirect_uri` 篡改、`state` 缺失 | 高 | 严格白名单 redirect_uri；强制 PKCE(S256)；`state`+`nonce` 校验；`iss`/`aud`/`exp`/`nonce` 全验 | 错误 redirect_uri 必须被 IdP 拒绝；strip state 必须失败 |
| S-6 | API Key 冒用 | `ock_` 泄露 | 高 | Argon2id 存储、scope 最小化、过期、吊销 ≤5s、前缀可识别便于泄露扫描、**禁用于浏览器端** | 使用他人 Key 必须 401；吊销立即 401 |
| S-7 | 服务账号/机器人越权 | CI 使用人类 Key | 中 | Key 带 `kind=service`，scope 限制；服务 Key 不能创建 Key/改成员 | scope 越权测试 |

### 2.2 T — Tampering（篡改）

| ID | 威胁 | 影响 | 对策 | 验证 |
| --- | --- | --- | --- | --- |
| T-1 | 用户篡改托管配置以绕过模型策略 | 高 | 强制项写 `/etc/opencode/opencode.json`（ConfigMap 只读挂载，**最高优先级**，压过用户文件）；`policies` 单独进 managed（最终权威） | 用户写 `~/.config/opencode/opencode.json` 指定外部 provider → 仍被拒绝 |
| T-2 | 篡改技能包（供应链） | 高 | 内容寻址 `content_hash`（sha256）+ ed25519 签名（KMS 私钥）；安装前验签；`skill_versions` 不可变 | 篡改 OSS 中的 SKILL.md → 安装失败并告警 |
| T-3 | 篡改审计日志 | 高 | append-only：`REVOKE UPDATE, DELETE`；按月分区 detach 归档；hash 链（可选：每批 `prev_hash`） | 尝试 UPDATE 必须权限错误 |
| T-4 | 镜像被替换（`:latest` 漂移） | 高 | 全链路 digest 锁定（CRD `imageDigest`、Helm values、Argo CD）；ACR 不可变 tag + 签名（cosign） | 部署非签名镜像必须被准入策略拒绝 |
| T-5 | 应用构建产物被替换 | 高 | ACR 不可变 tag + digest 记录在 `app_deployments`；部署只接受已扫描 digest | 篡改 tag 指向 → digest 不符即拒绝 |
| T-6 | 篡改用量/账单数据 | 高 | `usage_records` 只 append + `request_id` 唯一；写入服务专用角色；与 LiteLLM 对账 | 修改历史用量需 platform_admin 且留审计 |
| T-7 | 中间人篡改上游响应 | 中 | 全链路 TLS（mTLS：控制面↔agent、gateway↔Pod 可选）；CSP + SRI 不适用（内嵌资源） | 证书校验测试 |

### 2.3 R — Repudiation（抵赖）

| ID | 威胁 | 对策 | 验证 |
| --- | --- | --- | --- |
| R-1 | 用户否认执行销毁/分享/MCP 调用 | `audit_logs` 记录 actor/IP/UA/request_id/outcome；销毁要求输入工作区名（二次确认文案含后果） | 审计可检索到对应操作 |
| R-2 | 管理员否认改策略/改配额 | 管理操作强制审计 + `detail` 含 diff（脱敏） | 变更前后 diff 可查 |
| R-3 | 服务间操作无法归因 | 服务账号身份 + 请求追踪（`X-Request-Id` + OTel trace） | 每条审计可追到 trace |
| R-4 | 日志被删导致无法取证 | Loki 保留 ≥180 天；OSS 归档 3 年；对象锁（WORM）可选 | 保留策略检查 |

### 2.4 I — Information Disclosure（信息泄露）

| ID | 威胁 | 场景 | 影响 | 对策 | 验证 |
| --- | --- | --- | --- | --- | --- |
| I-1 | 跨租户读数据（IDOR） | 改 `workspace_id` | 高 | RLS + 应用层 `org_id` 双校验；不存在/不可见统一 404 | 遍历他人 id → 404 |
| I-2 | 跨租户读 PVC | 挂错 PVC | 高 | 每工作区独立 PVC + PVC 名带随机后缀 + `ReadWriteOncePod`；Operator 校验 PVC 归属标签 | 强制挂载他人 PVC 应被准入拒绝 |
| I-3 | 服务密码泄露到浏览器/日志 | 抓包/日志 | 高 | 密码仅存 K8s Secret；gateway 注入；日志脱敏中间件（`Authorization`, `Set-Cookie`, `?ticket=`）；浏览器永不接触 | 响应/日志扫描无 Secret 值 |
| I-4 | 供应商 API Key 泄露 | 配置下发 | 高 | 工作区只见 LiteLLM 虚拟 Key；真实 Key 只在 LiteLLM（KMS 解密到内存） | 工作区镜像/环境变量扫描无真实 Key |
| I-5 | MCP 凭证泄露 | 配置下发 | 高 | 凭证只在 Hub；工作区只拿 workspace-scoped token | 工作区配置扫描无上游凭证 |
| I-6 | 他人 prompt/代码被读 | DB 泄露 | 高 | 平台**不存** prompt/代码正文；审计只存元数据；工作区 SQLite 属用户私有 | 抽查 DB 无业务正文 |
| I-7 | 错误信息泄露内部细节 | 500 堆栈 | 中 | 统一错误信封；生产不返回堆栈；`details` 白名单 | 注入错误 payload 检查响应 |
| I-8 | 时序/枚举侧信道 | 404 vs 403 | 中 | 统一 404；列表分页不泄露总数（默认不返回 total） | 响应时间/内容一致性测试 |
| I-9 | 分享链接被搜索引擎索引 | 爬虫 | 中 | 分享页面 `X-Robots-Tag: noindex`；`public` 仍需 SSO → 爬虫只看到登录页 | 匿名抓取只得到 302 |
| I-10 | 快照被其他租户恢复 | 高 | 高 | 快照命名空间隔离 + 恢复前校验 `workspace_id` 归属 + 审计 | 跨租户恢复必须 404 |
| I-11 | 指标/日志含敏感标签 | 中 | 中 | 禁止把 prompt/文件名作为 metric label；日志采样与脱敏 | 日志审计 |

### 2.5 D — Denial of Service（拒绝服务）

| ID | 威胁 | 对策 | 验证 |
| --- | --- | --- | --- |
| D-1 | 单用户耗尽集群（多开工作区） | 配额（默认 1 工作区/用户）+ 组织配额 + `ResourceQuota`；创建并发限流 | 超配额 429/409 |
| D-2 | 模型调用打爆预算/供应商 | LiteLLM 虚拟 Key 预算 + RPM/TPM；平台侧本地令牌桶兜底 | 超限 429 + 审计 |
| D-3 | 工作区挖矿/滥用 CPU | requests=limits + `LimitRange` + 节点级 CPU 超卖禁用；异常 CPU 告警 | 压测 & 告警验证 |
| D-4 | 大文件写满 PVC 影响他人 | 每工作区独立 PVC + 容量告警 + ResourceQuota | 打满测试（只影响本人） |
| D-5 | 慢 SSE 消费者拖垮 gateway | 每连接缓冲上限 + 超时断开 + `Retry-After`；gateway 4 副本 + HPA | 慢消费者测试 |
| D-6 | 评测/构建 Job 抢占资源 | 独立 namespace + `ResourceQuota` + 优先级（平台优先）+ 并发上限 | 并发提交测试 |
| D-7 | 登录接口爆破 | IdP 侧限流 + 控制面 `/auth/*` 独立限流（IP+指纹）+ 失败审计告警 + WAF 规则 | 爆破测试 |
| D-8 | 超长 prompt / 大请求体 | 请求体大小限制（1MB 默认，附件走 OSS 预签名） | 413 测试 |
| D-9 | 依赖供应链攻击拖垮构建 | 构建缓存隔离 + 禁网（仅 registry）+ 超时 | 构建隔离测试 |

### 2.6 E — Elevation of Privilege（提权）

| ID | 威胁 | 场景 | 影响 | 对策 | 验证 |
| --- | --- | --- | --- | --- | --- |
| E-1 | 工作区容器逃逸 | 内核漏洞/配置错误 | 高 | 非 root（`runAsNonRoot`, `runAsUser=1000`）、`allowPrivilegeEscalation:false`、drop ALL caps、`seccompProfile: RuntimeDefault`、只读根文件系统、禁 `hostPath`/`hostNetwork`/`hostPID`/`privileged`、PodSecurity `restricted`；**评估：workspace 不用 gVisor**（工具链兼容性），因此必须靠上述基线 + 节点隔离 + 及时补丁；高风险租户（试用/匿名）可强制 gVisor | kube-bench / PodSecurity 准入；逃逸 POC 集 |
| E-2 | 沙箱逃逸执行恶意代码 | eval/app 提交代码 | 高 | **gVisor RuntimeClass** + 禁网（默认 deny，白名单出）+ 只读根 + 非 root + 资源限额 + 生命周期短 | 逃逸测试用例（PLAN R5.2 要求全部拦截） |
| E-3 | 工作区访问 K8s API | 挂载 SA token | 高 | `automountServiceAccountToken: false`；无 RBAC 绑定 | Pod 内 `kubectl` 必须失败 |
| E-4 | 工作区访问云元数据服务 | SSRF 到 100.100.100.200 | 高 | NetworkPolicy 阻断元数据网段；NAT 白名单；CSI 用 RAM 角色而非节点角色 | 访问元数据必须超时 |
| E-5 | 控制面 SSRF（技能/应用输入外部 URL） | 管理员配置 MCP/商品源 | 高 | 出站代理 + 域名白名单 + 禁内网段（`169.254/16`, `10/8`, `172.16/12`, `192.168/16`, `::1`, `fd00::/8`）+ 禁 `file://`/`gopher://`；DNS rebinding 防护（解析后校验 IP） | SSRF 测试集（含 DNS rebinding） |
| E-6 | 越权提升为 org admin | 改 memberships | 高 | 角色变更仅 owner/admin 可做；**不能**给自己提权；owner 唯一性保护；审计 | 自提权必须 403 |
| E-7 | 通过 MCP Hub 越权调用 | 无绑定直接调 | 高 | 默认拒绝 + 工具级白名单 + workspace token 绑定 + 审计告警 | 无绑定调用必须拒绝 |
| E-8 | 插件/Skill 加载执行任意代码 | 恶意 Skill | 高 | Skill 只提供 prompt/指令与资源，**不允许**可执行插件（平台侧禁止上传可执行二进制；静态扫描）；工具权限在 opencode `permissions` 层限制 | 恶意 Skill 扫描拦截 |
| E-9 | 构建逃逸 | rootless BuildKit + gVisor | 高 | rootless + 独立 namespace + 禁 host mount + 网络仅 registry | 构建逃逸测试 |
| E-10 | Token 混淆（aud/iss 校验缺失） | 用应用 token 调 API | 中 | 全部 JWT 校验 `iss/aud/exp/nbf`；不同用途不同 `aud` | 交叉使用必须 401 |

### 2.7 风险汇总（Top 10）

| 排名 | 风险 | 等级 | 主要对策 | 残余风险 |
| --- | --- | --- | --- | --- |
| 1 | 工作区容器逃逸（无 gVisor） | 高 | 强化 Pod 安全基线 + 节点隔离 + 补丁 SLA | 内核 0day（接受，靠节点池隔离 + 快速重建） |
| 2 | Skill/MCP 供应链 | 高 | 签名 + 扫描 + 审核 + 权限声明 | 审核疏漏（靠评测 + 用户举报） |
| 3 | 服务密码/凭证泄露 | 高 | Secret + 注入 + 脱敏 | gateway 内存泄露（靠最小化 + 隔离部署） |
| 4 | IDOR / 跨租户 | 高 | RLS + 双校验 + 404 统一 | 新表漏 RLS（靠 CI 检查 + 测试） |
| 5 | 成本型 DoS（挖矿/刷模型） | 高 | 配额 + 预算 + 告警 | 内部滥用（靠审计 + 人工） |
| 6 | SSRF（配置外部源） | 高 | 出站代理 + 白名单 | 代理配置错误（靠定期审计） |
| 7 | 沙箱逃逸（eval/app） | 高 | gVisor + 禁网 | gVisor 漏洞（接受，短生命周期） |
| 8 | 构建供应链 | 中 | rootless + 扫描 + 签名 + 只读缓存 | 依赖投毒（靠锁文件 + 私有镜像） |
| 9 | 会话/ticket 重放 | 中 | 短 TTL + 一次性 jti | 时钟偏移（靠 NTP + 容差） |
| 10 | 审计被篡改/丢失 | 中 | append-only + 归档 + WORM | 存量大（靠分区 + 归档） |

---

## 3. 租户隔离证明

> 目标：**任意两个租户之间不存在**共享可读写资源。以下按四个层面给出机制与可验证证据。

### 3.1 身份隔离（Identity）

| 机制 | 证据 | 验证 |
| --- | --- | --- |
| SSO 会话绑定 `user_id` + `org_id`，登录后由服务端解析，不接受客户端传入的租户标识 | `openapi.yaml` 所有路径无 `orgId` 由客户端自由传入的写操作；`Me` 返回 `active_org` | 篡改 `org_id` 请求头/参数必须无效 |
| 每请求 `SET LOCAL app.org_id/app.user_id` | `DATA-MODEL.md §1.2` | 单测：未设置上下文时查询必须失败 |
| RBAC 在服务层校验，不只依赖前端 | 角色矩阵见 `services/BACKEND.md`；`openapi.yaml` 403 响应 | 越权矩阵测试（每个角色 × 每个端点） |
| 工作区归属在**网关**校验（ticket 的 `ws` 声明 + 签名） | `ARCHITECTURE.md §7.3` | 跨用户进入必须 403 |
| 应用/技能/MCP 的资源级 ACL 独立于 org 角色 | `app_shares`/`skill_installations`/`mcp_bindings` | ACL 矩阵测试 |

### 3.2 网络隔离（Network）

```yaml
# 工作区默认拒绝（每 namespace 一条 default-deny + 显式放行）
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: default-deny, namespace: ws-<orgId> }
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: workspace-allow, namespace: ws-<orgId> }
spec:
  podSelector: { matchLabels: { app: opencode-workspace } }
  policyTypes: [Ingress, Egress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: platform-system } }
          podSelector: { matchLabels: { app: workspace-gateway } }
      ports: [{ protocol: TCP, port: 4096 }]
  egress:
    - to:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: platform-system } }
          podSelector: { matchLabels: { app: litellm } }
      ports: [{ protocol: TCP, port: 4000 }]
    - to:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: platform-system } }
          podSelector: { matchLabels: { app: mcp-hub } }
      ports: [{ protocol: TCP, port: 8080 }]
    - to:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: platform-system } }
          podSelector: { matchLabels: { app: skill-content } }
      ports: [{ protocol: TCP, port: 8080 }]
    - to: [{ namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: kube-system } } }]
      ports: [{ protocol: UDP, port: 53 }, { protocol: TCP, port: 53 }]
    # 注意：无 100.100.100.200/32、无 0.0.0.0/0 → 默认无公网、无元数据访问
```

| 隔离项 | 机制 | 验证 |
| --- | --- | --- |
| 租户 A 不能访问租户 B 工作区 | 所有工作区 Pod 位于同一 namespace 但**入站只允许 gateway**；Pod 间无横向放行（default-deny 已阻断 Pod→Pod） | `kubectl exec` 从 A 的 Pod curl B 的 IP:4096 必须超时 |
| 工作区不能访问 K8s API/元数据 | egress 未放行 + `automountServiceAccountToken:false` | Pod 内 curl API server / 元数据必须失败 |
| 工作区不能访问其他租户应用 | app namespace 独立 NP，仅 ingress 可达 | 同上 |
| 沙箱无网 | eval namespace NP egress 仅 allowlist | 逃逸测试 |
| 出站唯一出口 | NAT 白名单（git/npm/pypi 镜像），逐个域名 | 出站审计 |

### 3.3 存储隔离（Storage）

| 机制 | 说明 | 验证 |
| --- | --- | --- |
| 每工作区独立 PVC | 名称 `ws-<uuid>-home` / `ws-<uuid>-workspace`，标签 `tenant=<org_id>`；`ReadWriteOncePod` 防多 Pod 挂载 | 挂载他人 PVC 被准入拒绝 |
| 存储类不共享 | ESSD 每卷独立加密（KMS CMK per org 可选） | 卷加密状态检查 |
| OSS 前缀隔离 | `s3://bucket/org/<org_id>/...` + 服务端按租户前缀签名 URL | 越前缀访问 403 |
| 快照隔离 | VolumeSnapshot 含 `workspace_id` 标签；恢复 API 校验归属 | 跨租户恢复 404 |
| 数据库行隔离 | RLS（`DATA-MODEL.md §4`） | RLS 测试矩阵 |
| 缓存隔离 | Redis key 前缀 `org:<org_id>:`，禁止无前缀 key | key 审计 |

### 3.4 运行时隔离（Runtime）

| 机制 | workspace | eval / app / build |
| --- | --- | --- |
| 独立 Pod | ✅ | ✅ |
| requests=limits（Guaranteed QoS） | ✅ 4C8G | ✅ 1C2G / 2C4G |
| 非 root + 只读根 + drop ALL | ✅ | ✅ |
| seccomp RuntimeDefault | ✅ | ✅ |
| gVisor (runsc) | ❌（工具链兼容性，见 ADR-007） | ✅ |
| automount SA token=false | ✅ | ✅ |
| 禁止 hostPath/hostNetwork/privileged | ✅（PodSecurity restricted） | ✅ |
| Pod 间反亲和（可选，强隔离租户） | 可配 | — |
| 独立节点池 | ✅（`dedicated=workspace`） | ✅（`dedicated=sandbox`） |

**为什么 workspace 不用 gVisor（必须解释清楚）**：opencode 的工具链（git、node、python、package managers、PTY、文件监听）在 gVisor 下有兼容性与性能风险（`inotify`、`io_uring`、`ptrace` 相关路径），会破坏核心体验并放大支持成本。补偿控制：非 root + 只读根 + drop caps + seccomp + 独立节点池 + 网络默认拒绝 + 无 SA token + 无云元数据。**若客户要求强隔离，可按 org 级开关强制 gVisor**（`workspaces.settings.isolation=gvisor`），代价是性能与兼容性下降——需在 PRD 明确为可选付费能力。

### 3.5 隔离证明小结（可审计结论）

> **结论**：租户 A 与租户 B 之间不存在共享的可读写资源。唯一共享的是**只读平台内容**（公共 Skill、公共 MCP 目录、平台模型目录）与**集群控制面**（K8s API，租户无权限访问）。
> 证明路径：身份（§3.1）→ 网络（§3.2）→ 存储（§3.3）→ 运行时（§3.4），四层任一失效仍有其余三层兜底；RLS 为数据层最后防线。

---

## 4. 密钥与凭证管理

### 4.1 密钥清单

| 密钥 | 存放 | 谁能读 | 轮换 | 泄露影响 |
| --- | --- | --- | --- | --- |
| 工作区服务密码 | K8s Secret（每工作区） | gateway、workspace-agent | 90 天或事件驱动（轮换 = 重启 opencode 进程 + gateway 缓存刷新） | 可完全控制该工作区 API（不含其他租户） |
| LiteLLM 虚拟 Key | K8s Secret / ConfigMap（每工作区） | opencode 进程（配置注入） | 90 天 / 事件驱动 | 可消耗该工作区预算（有预算上限） |
| 供应商真实 API Key | KMS（CMK 加密）+ LiteLLM 内存 | LiteLLM 进程 | 90 天 | 供应商账单风险（高） |
| MCP 上游凭证 | KMS + MCP Hub 内存 | MCP Hub | 90 天 | 该 MCP 权限范围内的数据（高） |
| OIDC client_secret | K8s Secret | 控制面 auth-edge（唯一 RP） | 180 天 | 可伪造该 client 的授权（高） |
| 平台 API Key（ock_） | DB（Argon2id 哈希） | 无（不可逆） | 用户自管 | 该用户的 API 权限（中） |
| access-ticket 签名私钥 | KMS（ed25519） | Control-Plane | 每年（JWKS 支持多 kid 灰度） | 可伪造任意工作区 ticket（高） |
| 会话存储密钥 | Redis（加密）+ K8s Secret | 控制面 auth-edge | 90 天 | 会话伪造（高） |
| 数据库凭证 | KMS + K8s Secret | control-plane | 90 天 | 全量数据（高） |
| 快照加密密钥 | KMS CMK | CSI driver | 按 KMS 策略 | 快照数据（高） |

### 4.2 密钥生命周期（KMS）

```
创建：控制面生成 → KMS Encrypt（CMK per 环境：dev/staging/prod 分离）→ 密文存 DB（credential_ref）
使用：服务按需 KMS Decrypt 到内存（不落盘、不写日志）→ 用后立即释放引用（不保证内存清零，但避免常驻）
轮换：新旧双活期（provider 支持双 Key 时）→ 写入新 → 验证 → 撤销旧 → 审计
撤销：KMS 禁用 CMK → 所有密文不可解 → 强制重建（应急手段）
审计：所有 KMS 调用记录 CloudTrail/ActionTrail；异常 Decrypt 频率告警
```

- **禁止**：把密钥写进代码、镜像、Helm values、ConfigMap 明文、日志、错误信息、前端 bundle。
- **Secret 挂载**：优先 `secretKeyRef` 环境变量（Simple）或 CSI Secret Store（强）；工作区只挂自己那一个 Secret。
- **可观测性**：日志脱敏中间件过滤 `authorization|cookie|set-cookie|password|token|secret|api[-_]?key|ticket` 字段；CI 用 `gitleaks` 扫描。
- **CI/CD**：OIDC 联邦（GitHub Actions → 云 RAM），不存长期云凭证。

### 4.3 凭证泄露应急（Runbook 摘要）

1. **确认范围**：审计日志按 `credential_ref`/`key_id` 检索使用记录；KMS 调用日志。
2. **立即**：吊销/轮换该密钥（API Key 吊销 ≤5s；服务密码轮换需重建 Pod）；若为供应商 Key，通知供应商 + 限额。
3. **隔离**：可疑工作区进入 `error` 状态（停止 Pod，保留 PVC）→ 取证快照。
4. **复盘**：24h 内出事故报告；更新威胁模型与测试用例；若涉及跨租户，按合规流程通知。

---

## 5. 认证与会话安全

| 项 | 策略 |
| --- | --- |
| OIDC | Authorization Code + PKCE(S256)；强制 `state`/`nonce`；`id_token` 校验签名（JWKS）、`iss`、`aud`、`exp`、`nonce`、`azp`；拒绝 `alg=none` 与 HS256 |
| 会话 Cookie | `__Host-oc_session`：`Secure; HttpOnly; SameSite=Lax; Path=/`；无 `Domain`；服务端存 Redis（可即时吊销）；绝对 TTL 8h，空闲 TTL 30min（可配） |
| 会话固定 | 登录成功后重新生成会话 ID |
| 登出 | 服务端删除会话 + 撤销 refresh token + 广播（其他设备可选） |
| 强制重新认证 | 敏感操作（销毁工作区、修改成员、轮换 Key）要求 `max_age` ≤5min（`prompt=login` 或 step-up） |
| 上游工作区会话 | 网关注入 Basic；**不**向浏览器下发上游 Cookie（ADR-005） |
| access-ticket | ed25519、60s、一次性（jti）、`aud=workspace:<id>`、绑定 `sub`；仅允许一次 302 兑换 |
| CSRF | 状态变更接口要求 `Origin`/`Sec-Fetch-Site` 校验 + `SameSite=Lax`；**不使用**可被跨站提交的纯 Cookie 鉴权（写接口额外要求自定义头 `X-Requested-With` 或 CSRF token） |
| CORS | 白名单（控制台域名、工作区域名）；不返回 `*`；预检缓存 1h |
| 会话并发 | 单用户最多 N 个活跃会话（默认 5），超出踢最旧并审计 |

### 5.1 上游 opencode 鉴权的特殊处理（已核实）

- 上游密码为空时**完全无鉴权**（`auth.ts` `required()`）→ 容器启动必须校验 Secret 非空，**否则拒绝启动**（入口脚本 `test -n "$OPENCODE_SERVER_PASSWORD"`）。
- 上游会话 Cookie 的 HMAC 密钥由密码派生，**知道密码即可签发 30 天会话** → 服务密码的保密等级等同于该工作区全部权限；因此密码只能存在于 Secret 与 gateway 内存。
- 上游支持 `?auth_token=<base64(user:pass)>` 查询参数鉴权 → **网关必须拒绝/剥离**客户端的 `auth_token` query，避免令牌进日志/Referer（上游视作鉴权手段，平台视为泄露面）。
- 上游配对链接（`/api/pair` + `/auth/connect/:code`）**可从密码派生 30 天会话** → 生产环境**禁止**暴露 `POST /api/pair`（网关层直接 404），保留为离线运维应急（需手工 + 审计）。

---

## 6. 输入校验与专项对策

### 6.1 SSRF（服务端请求伪造）

**入口**：MCP 上游 URL、Skill 源 URL、应用自定义域名/健康检查、Webhook、图片/媒体拉取。

```
校验链：
1. Scheme 白名单：仅 https（内部服务允许 http 但必须命中内网白名单）
2. 解析 → 校验 IP：拒绝 loopback/私网/链路本地/组播/广播/云元数据（169.254.169.254、100.100.100.200）
3. 禁止 URL 中的 userinfo（user:pass@）、禁止非标准端口（白名单 443/8443/8080）
4. 强制经**出站代理**（egress-proxy）：代理二次校验 + DNS 解析后校验（防 DNS rebinding）
5. 限制跳转：最多 3 次，每次重定向重新校验
6. 禁止 file/gopher/dict/ftp 等协议
7. 响应大小/超时限制（10MB / 10s）
```

**验证**：SSRF 测试集（内网地址、元数据、`0x7f.0.0.1`、IPv6 映射、DNS rebinding、重定向链）。

### 6.2 IDOR / 越权

- 资源访问一律 `id` + 租户上下文查询；**禁止** `findById(id)` 后判断（判断与查询非原子，且易漏）。
- 统一返回 404（不可见）与 403（可见但无权）的边界，见 `openapi.yaml`。
- 子资源（`/apps/{id}/shares/{shareId}`）必须校验 `share.app_id == {id}`（防路径穿越式越权）。
- 批量接口（列表）不得因权限过滤差异泄露总数。
- 验证：自动化越权矩阵（每端点 × 2 租户 × 3 角色）。

### 6.3 注入

| 类型 | 对策 |
| --- | --- |
| SQL | 全部参数化查询/ORM；禁止字符串拼接；RLS 兜底 |
| 命令注入 | 构建/评测命令使用参数数组（`execFile` 而非 `exec`）；`stdio` MCP 命令白名单 |
| 路径穿越 | Skill 文件路径校验（上游已实现 `isSafeRelativePath`，平台侧对上传包再校验一遍）；OSS key 规范化 |
| XSS | 控制台 React 默认转义；`dangerouslySetInnerHTML` 禁用；CSP（上游 Web UI 自带 CSP，网关追加 `frame-ancestors`）；用户内容（Skill 描述/应用名）渲染需 sanitize |
| SSTI/模板注入 | 应用中心不渲染用户模板到服务端；评测评分器沙箱 |
| 反序列化 | 不接受语言原生序列化格式（pickle 等）；JSON/YAML 用安全加载器 |
| 日志注入 | 结构化日志 + 转义换行 |

### 6.4 沙箱与逃逸

| 控制 | 说明 |
| --- | --- |
| gVisor RuntimeClass | eval/app/build 强制；`runsc` 默认平台 |
| 禁网 | eval 默认 `network: deny`；白名单仅 registry/model（如需） |
| 只读根文件系统 | `readOnlyRootFilesystem: true` + `emptyDir` 挂载可写目录 |
| 非 root | `runAsUser: 65532`、`runAsNonRoot: true` |
| Capabilities | `drop: [ALL]`；`allowPrivilegeEscalation: false` |
| seccomp | `RuntimeDefault`；可选自定义 profile 进一步收紧 |
| 生命周期 | eval Job `activeDeadlineSeconds`；应用容器 health check + 自动重启上限 |
| 资源 | requests=limits；`ResourceQuota` per namespace |
| 内核 | 节点自动补丁；`node-restriction` 标签；gVisor 节点专用 |
| 准入 | PodSecurity `restricted`（workspace/app/sandbox）；Kyverno/ValidatingAdmissionPolicy 禁止 privileged/hostPath/hostNetwork，并限制 **CRD `OpencodeWorkspace.spec` 仅控制面/operator SA 可写**、`imageDigest/retainPolicy/access.host/resources` 不可变（防手工改 CR 绕过审计） |
| 验证 | 逃逸测试集（`/proc` 逃逸、cgroup 逃逸、ptrace、内核模块、挂载、Docker socket、云元数据、SSRF） |

### 6.5 供应链

| 环节 | 控制 |
| --- | --- |
| 基础镜像 | 官方最小镜像（distroless/alpine）+ 固定 digest；每周重建 |
| opencode 版本 | 锁定 commit + 镜像 digest；升级走金丝雀 + 回归；`update:"disable"` + `OPENCODE_DISABLE_AUTOUPDATE=1` |
| 依赖 | 锁文件（bun.lock）+ 私有 registry 代理 + `bun audit`/`npm audit` + Renovate 受控升级 |
| 镜像签名 | cosign 签名 + 准入验证（Kyverno `verifyImages`） |
| 镜像扫描 | Trivy（HIGH/CRITICAL 阻断）+ 定期重扫 |
| SBOM | 构建时生成 SPDX/CycloneDX，随镜像存档 |
| Skill 包 | 签名（ed25519）+ 静态扫描 + 权限声明 + 人工审核（高危） |
| 构建 | rootless BuildKit + 隔离网络 + 缓存隔离（每 app 独立 cache） |
| CI/CD | OIDC 联邦、最小权限、制品签名、Argo CD 只允许签名镜像 |
| 供应商 | LiteLLM 侧凭证最小权限；不把用户代码发给非必要供应商（可配） |

### 6.6 应用分享的直链拦截

- 所有应用域名必须经 `app-gateway`（Ingress 注解不允许直连 Service）。
- 无 SSO 会话 → 302 IdP（带 `redirect_uri` 回到原 URL）。
- `scope=public` 仍需 SSO；**不存在**匿名可读路径（R6.4 的硬约束）。
- ACL 检查在 gateway：`(app_id, user)` → 角色（Redis 60s 缓存，变更主动失效 ≤5s）。
- `role=view` 只读；`use` 可交互（表单/API）；`edit` 可改配置（不含删除）。
- 防枚举：无权 404、无权域名一律返回统一"未找到或无权访问"页。

---

## 7. 审计与合规

### 7.1 审计事件清单（必须落审计）

| 类别 | 事件（`action`） |
| --- | --- |
| 身份 | `auth.login`, `auth.logout`, `auth.login_failed`, `auth.session_revoked`, `auth.mfa_changed` |
| 组织 | `org.created`, `org.updated`, `member.invited`, `member.role_changed`, `member.removed`, `team.*` |
| 密钥 | `api_key.created`, `api_key.revoked`, `api_key.rotated`, `credential.created`, `credential.rotated`, `credential.deleted` |
| 工作区 | `workspace.created`, `workspace.started`, `workspace.stopped`, `workspace.destroy_requested`, `workspace.destroy_canceled`, `workspace.destroyed`, `workspace.access_granted`, `workspace.snapshot_created`, `workspace.restored`, `workspace.config_applied` |
| 模型 | `model_policy.created`, `model_policy.updated`, `model_provider.created`, `model_provider.credential_rotated`, `usage.quota_exceeded` |
| Skill | `skill.created`, `skill_version.uploaded`, `skill_version.published`, `skill_version.yanked`, `skill.installed`, `skill.uninstalled` |
| 评测 | `eval_run.created`, `eval_run.finished`, `eval_gate.failed` |
| 应用 | `app.created`, `app.build_started`, `app.deployed`, `app.rolled_back`, `app.deleted`, `app.domain_bound` |
| 分享 | `app.share.created`, `app.share.updated`, `app.share.revoked`, `app.access_denied` |
| MCP | `mcp.server.registered`, `mcp.binding.created`, `mcp.binding.removed`, `mcp.tool.call`, `mcp.tool.denied` |
| 运维 | `platform.admin_action`, `compliance.export_requested`, `compliance.purge_completed` |

### 7.2 审计要求

- **同事务**：用户触发的写操作，审计与业务写在同一 PG 事务（失败则整体回滚）；跨服务事件走 outbox，投递失败进死信并告警。
- **不可篡改**：`opencode_app` 无 UPDATE/DELETE 权限；分区 detach 由 `opencode_platform` 执行并记录。
- **可检索**：按 actor/资源/动作/时间；导出 CSV（R8.6）需审计。
- **不含敏感内容**：不记录 prompt、代码、附件、密钥；`detail` 只存元数据与哈希。
- **保留**：≥180 天（目标 365），归档 3 年（OSS + 可选对象锁）。
- **时间同步**：节点 NTP；审计用 UTC。

### 7.3 合规映射

| 要求 | 实现 | 证据 |
| --- | --- | --- |
| 数据留存 ≥180 天 | 审计分区 + OSS 归档 | 保留策略配置 + 抽样 |
| 数据删除（30 天内） | 账号删除 → 匿名化 + 业务数据清理 + PVC 销毁 + 快照过期；产出删除证明 | `compliance.purge_completed` 事件 + 报告 |
| 数据导出 | 按 org 导出 JSONL（用户/工作区元数据/审计/用量） | 导出工具 + 审计 |
| 数据不出境 | 单地域部署；供应商选择按 region 白名单 | `models.region` + 出站策略 |
| 最小权限 | RBAC + 资源 ACL + 服务账号最小权限 | 权限矩阵测试 |
| 可审计 | 本文件 §7 | 审计覆盖率报告 |
| 加密 | 传输 TLS 1.2+；静态：RDS/OSS/ESSD KMS 加密；K8s Secret etcd 加密 | 配置检查 + 渗透测试 |
| 备份 | RDS 自动备份 + PVC 快照 + OSS 版本化 | 恢复演练 |

---

## 8. 安全测试与红线

### 8.1 必测项（交 qa-reviewer 落 TEST-PLAN）

1. 越权矩阵：每端点 × 2 租户 × 4 角色（含跨租户 IDOR、子资源越权）。
2. 会话/ticket：重放、过期、篡改、跨 `aud`、跨工作区。
3. 网关：直连 Pod IP、枚举域名、剥离 `auth_token`、`/api/pair` 阻断、Host 头注入。
4. SSRF：内网、元数据、DNS rebinding、重定向、IPv6。
5. 沙箱逃逸：`/proc`、cgroup、ptrace、挂载、docker socket、云元数据。
6. 供应链：镜像扫描、依赖审计、签名验证、Skill 篡改。
7. 密钥：日志/响应/前端 bundle 扫描（`gitleaks` + 自定义正则）。
8. 配置绕过：用户改配置指定外部 provider → 必须被拒。
9. RLS：漏设上下文、跨租户聚合、`FORCE RLS` 生效。
10. 限流/配额：模型预算、创建并发、登录爆破。
11. 审计：写操作覆盖率 100%、不可篡改、导出审计。
12. 前端：CSP、XSS、点击劫持（`frame-ancestors`）、CSRF。

### 8.2 安全红线（任何角色不得突破）

- 不把用户密钥/口令写入代码、日志、镜像、文档、前端。
- 不做跨租户数据访问；所有查询必须带租户/用户上下文。
- 不绕过 SSO 直接暴露工作区或应用端口。
- 不在生产使用 `latest` 镜像 tag；全部锁定 digest/版本。
- 不引入无许可证或高风险依赖。
- 不删除用户数据（工作区/PVC/会话），除非用户显式请求且有审计。
- 不关闭审计、不关闭 RLS、不关镜像扫描来"让测试通过"。

### 8.3 渗透测试范围

| 目标 | 测试重点 |
| --- | --- |
| 控制台（Web） | XSS/CSRF/开放重定向/点击劫持/敏感信息泄露 |
| 控制面 API | 认证绕过/IDOR/批量赋值/限流/错误处理 |
| workspace-gateway | Host 注入/request smuggling/SSE 长连接/WS 升级/缓存投毒 |
| 工作区 Pod | 容器逃逸/横向/元数据/SA token/文件系统 |
| 沙箱 | 逃逸/资源耗尽/网络逃逸 |
| 构建 | 供应链/缓存投毒/网络隔离 |
| 数据层 | RLS 绕过/SQL 注入/备份加密 |

---

## 9. 残余风险与接受标准

| # | 残余风险 | 等级 | 接受理由/补偿 |
| --- | --- | --- | --- |
| 1 | workspace 无 gVisor，内核 0day 可能导致逃逸 | 高 | 补齐 Pod 安全基线 + 独立节点池 + 快速补丁/重建；提供 org 级 gVisor 开关（付费/高安全场景） |
| 2 | 用户在工作区内拥有 root（容器内） | 中 | 容器边界即租户边界；节点隔离；无 SA token/元数据；出站受限 |
| 3 | 模型供应商可见 prompt 内容 | 中 | 合同/DPA；可选脱敏；企业可 BYOK/私有化（P2） |
| 4 | 服务密码在 gateway 内存中 | 中 | 最小化部署、只读根、定期轮换、事件驱动轮换 |
| 5 | Skill 审核依赖人工 | 中 | 扫描 + 签名 + 权限声明 + 测评门禁 + 举报下架 |
| 6 | 1000 并发下审计写放大 | 低 | 分区 + 异步归档 + 采样（仅非关键事件） |

**安全准出（G2/G6）**：无 P0/P1 安全问题；STRIDE 每项有对策与验证；隔离四层有自动化测试证据；密钥扫描零命中；沙箱逃逸测试全部拦截。

---

## 附录：与上游代码相关的事实（安全相关）

| 事实 | 影响 | 证据 |
| --- | --- | --- |
| 无密码 = 无鉴权 | 容器必须强制校验 Secret | `server/src/auth.ts:required` |
| 会话 Cookie = HMAC(密码派生)，30 天 | 密码保密等级 = 工作区全权限 | `server/src/auth.ts:issueSession/verifySession` |
| `?auth_token=` 查询参数可鉴权 | 令牌进日志/Referer 风险 → 网关剥离 | `middleware/authorization.ts:credentialFromRequest` |
| `/api/pair` 可换 30 天会话 | 生产必须封禁该端点 | `handlers/server.ts`、`pairing.ts` |
| PTY/WS 带 ticket 的 3 条路径跳过密码校验 | 网关必须校验 ticket 不可被替换/重放；不得让客户端直连 | `middleware/authorization.ts:78-92` |
| Web UI 无 `X-Frame-Options`、CSP 无 `frame-ancestors` | 平台网关必须追加 `frame-ancestors 'self' https://console.<domain>` 防点击劫持；若做 iframe 嵌入需显式允许 | `cli/src/services/web-ui.ts:csp()` |
| 工作区 SQLite 明文存储会话/消息 | PVC 必须静态加密（ESSD KMS）；备份加密 | `cli/src/database-path.ts`、`core/src/database/database.ts` |
| 上游默认自动更新 | 容器可能自改行为 → 必须 `update:"disable"` + env | `schema/src/config.ts:39`、`services/updater.ts:535` |
| Skills 从 URL 拉取（同 origin 限制） | 恶意 Skill 源可投递任意指令文本 → 签名 + 审核 + 域名白名单 | `core/src/skill/discovery.ts` |

---

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v0.1 | 2026-11-04 | 初稿：STRIDE 全表、四层隔离证明、密钥生命周期、SSRF/IDOR/沙箱/供应链对策、审计与合规映射 |
