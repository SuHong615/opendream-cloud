# ADR-010：Skill 分发用上游原生 URL 源，而非 OCI artifact

- 状态：**Accepted**（附限制与缓解）
- 日期：2026-11-04
- 决策者：architect / capability-centers
- 关联：`ARCHITECTURE.md §6.4`、`centers/CENTERS.md`、PLAN R4.3/D4

## 背景

Skill 需要：版本化、审核、按用户/工作区启用、自动同步、可撤销、可统计。上游原生支持 `skills: string[]`（目录或 **URL 源**），URL 源格式已核实（`core/src/skill/discovery.ts`）：

```
GET {url}/index.json → {"skills":[{"name":"<seg>","version":"<str?>","files":["SKILL.md",...]}]}
GET {url}/{name}/{file}    # 所有文件必须与 index 同 origin
# version 变化 → staging 下载 + 原子替换 + .opencode-version 标记
```

## 决策

**使用上游原生 URL 源**：Skill Center 把版本内容发布为静态目录（OSS/内部静态服务），生成 `index.json`，通过路径令牌的签名 URL 注入 `skills[]`。

- 内容寻址：`content_hash`（sha256）+ ed25519 签名（KMS），安装前验签（平台侧 + agent 双验）。
- 令牌**放路径**（关键）：`https://skills.internal/s/{org}/{skill}/{version}/{token}/index.json`。
- 版本驱动升级：新版本 = 改 `version` 字段 → 上游自动 staging 替换（自带回滚）。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. OCI artifact（`oci://`）+ 镜像卷挂载** | ① 上游不认 OCI（`Skill.Source` 只有 directory/url/embedded）；需要改上游或自研同步器；② 每次安装要走镜像拉取（慢，>2min 目标难达标）；③ 需要 registry 凭据进工作区（凭证面扩大）；④ 镜像层不适合频繁小版本。**但**版本不可变、签名、供应链能力更强 → 作为 P2 企业内网/离线方案 |
| **B. 挂载共享 NFS/OSS FUSE 目录** | 共享存储 = 跨租户隔离风险；FUSE 性能差；上游按目录扫描会扫到别人的技能（若权限配置错） |
| **C. 平台 agent 直接写目录（不用 URL）** | 可行且更简单（上游也支持目录源），但：① 下载与版本管理全由平台实现（重复上游能力）；② 无法利用上游的原子替换；③ 大文件包传输要走控制面。**作为离线/内网降级方案**，主路径仍 URL |
| **D. 内嵌技能（embedded）** | 适合平台内置技能；用户技能无法用 |

## 后果

**正面**
- 零改造、热更新、自带版本与原子替换。
- 可撤销：URL 令牌短期 + 可拒绝签发 → 新安装失败，已安装保留（上游有缓存）。
- 与上游升级解耦（URL 格式稳定）。

**负面 / 代价 / 限制（必须写进实现约束）**
1. **签名令牌不能放 query**：`new URL("index.json", base)` 会丢弃 base 的 query → 子文件请求 403。**必须放路径段**。
2. **所有文件必须同 origin**：不能用 CDN 分域；内容源必须直连（内部静态服务，禁用公网 CDN）。
3. **文件名限制**：`isSafeRelativePath` 禁止 `?`/`#`/绝对路径/URL；`name` 必须是安全路径段。
4. **必须含 `SKILL.md` 或 `<name>.md`**，否则静默丢弃（平台侧需预校验）。
5. **`files` 清单必须完整**：上游只下载清单内文件，漏列资源 = 技能缺文件。
6. **不缓存版本冲突**：`version` 未变但内容变了 → 上游会重下（version 为 undefined 时每次重下；有 version 且相同→跳过）。**因此内容变更必须升 version**。
7. 无法做二进制校验（上游不验 hash）→ 平台侧签名校验必须在**发布时**完成，且 token 短期限定防替换。

## 实现要点

- 发布流水线：上传 zip → 校验规范/路径安全 → 静态扫描 → 签名 → 写入 OSS 前缀 `org/<org>/skills/<slug>/<version>/`（含 `index.json`）→ 记录 `content_hash`。
- URL 生成：`/s/{orgSlug}/{skillSlug}/{version}/{jwt-token}/`，token 绑定 `{user_id, workspace_id, exp≤15min}`，由 Skill Center 签发、内容源网关校验；**token 在路径**。
- **令牌续签（必需，不可省）**：配置里的 URL 是静态的，上游在任意时刻可能重拉 `index.json`；若令牌不续签会 401 导致安装随机失效。因此 **workspace-agent 每 5min 用双令牌重叠窗口续签**（新令牌写入配置并原子替换，旧令牌保留至过期），容量估算 1000 工作区 × 5 技能 ≈ 17 req/s。若采用 10min TTL 且不续签，则 R4.3 的"≤2min 可用"不可实现——故本 ADR 明确：**15min TTL + 5min 续签为强制设计**。
- 安装：agent 拉清单 → 写 `skills:[...]` → 上游拉取 → agent 校验 `~/.cache` 下文件 hash 与 `skill_versions.files` 一致 → 上报成功。
- 撤销：停止签发新 token（已安装保留，符合"已安装不受影响"）；重大安全问题走"强制卸载"（agent 删缓存 + 移除配置项 + 通知）。
- 离线/内网：切换为目录源（agent 下载到 `~/.config/opencode/skills/`），同一套包格式。

## 验证

- 发布 → 安装 → `GET /api/skill` 可见 ≤2min（R4.3）。
- 版本升级：改 version → 内容热替换，旧会话不中断。
- 篡改：修改 OSS 文件 → 安装/校验失败并告警。
- 令牌：过期/换用户/换工作区 → 403。
- 路径注入：`name=../x`、`file=a/../b`、`file=?x=1` 全部被拒。
