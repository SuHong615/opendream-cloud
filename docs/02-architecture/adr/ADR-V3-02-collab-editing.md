# ADR-V3-02：应用协同编辑模型 —— 对话式 Patch + 版本乐观锁 + 审批门禁（非 CRDT 实时协同）

- 状态：**Accepted（建议）**
- 日期：2026-11-08
- 决策者：architect（与 platform-backend / web-console 联合）
- 关联：`ARCH-V3.md §5.3`、`services/APP-COLLAB.md`、`adr/ADR-V3-04-workflow-engine.md`

## 背景

v3 应用中心要支持"在线协同修改应用"：用户在应用详情里用对话描述修改，Agent 读应用仓库/文件、生成 patch、审批后构建发布。需要定义协同模型：

- 多人/多 Agent 并发修改同一应用；
- 变更必须可审计、可回滚、不能绕过构建/安全门禁；
- 与 opencode 工作区的执行模型（单实例、文件系统、SQLite）对齐；
- 实时性诉求：用户希望看到"正在生成/提案/审批"的实时状态。

候选：CRDT/OT 实时协同编辑、Git 式分支 + PR 合并、对话式 Patch 提案 + 乐观锁。

## 决策

**采用"对话式 Patch 提案 + `base_version` 乐观锁 + 审批门禁"，不使用 CRDT/OT 实时协同编辑。**

核心模型：

```
collab_session {
  app_id, base_version_id, base_commit,
  branch: collab/<session_id>,           # 每次会话独立分支（Git）
  participants: [user, agent_workspace]
}
1. 用户对话 → Agent 在分支上产出 patch（commit）
2. 平台生成 proposal = {diff, affected_files, risk, test_suggestion, preview_url}
3. 审批人 diff 预览 → approve / request_changes / reject
4. approve → 合并到 main（rebase 到最新 base，冲突则要求重新生成）
5. CI 门禁（测试/安全扫描/体积）→ 构建 → 预览环境 → 发布新版本（可回滚）
```

- **并发**：`base_version_id` 乐观锁（提交时校验；不匹配 → 409 `conflict` + `reason=collab_base_moved`，返回可 rebase 提示）。
  - Agent 侧：读的是分支快照，提交前 fetch + rebase；冲突文件转人工或重新生成。
  - 同一 `app_id` 同时允许多个 collab session，但**同一时间只允许一个 pending proposal 被审批合并**（合并队列，避免互相覆盖）。
- **实时状态**：SSE/WebSocket 推送 `session_opened / message / proposal_created / review_decision / merged / build_status`；**推送的是事件，不是文档字符流**。
- **安全门禁**：patch 只允许应用目录（`context_subdir`）内的路径；禁止删除保护文件（`.env` 模板、`Dockerfile` 基线、许可证文件）；必须过 CI（单测/构建/Trivy/密钥扫描）；高危变更（依赖升级、网络策略、Dockerfile）需二次审批。
- **审计**：每条消息、每次工具调用、每个 patch、每次审批、每次发布都落 `app_collab_events`（含 actor、base_version、diff hash），可回放。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. CRDT/OT 实时协同编辑** | 适合"多人同时编辑同一文档/代码"的字符级协同（如 Google Docs/Figma 类）；但本场景是 **Agent 生成 patch + 人审批**，并发粒度是"提案"而非"字符"；CRDT 需引入协同服务（Yjs/Automerge）+ 与 Git 双写一致性，复杂度高、审计难（字符流难回放）、与构建门禁冲突 | 否决（文档类场景可后续单独引入 CRDT） |
| **B. 仅 Git 分支 + PR（无平台协同层）** | 工程化好，但平台缺少"对话→提案→审批"的产品形态；用户需切到 Git 平台；审计与权限分散 | 部分采纳（分支/PR 作为底层机制），但需平台协同层 |
| **C. 对话式 Patch + 乐观锁 + 审批（采纳）** | 与 Agent 生成式修改天然契合；变更粒度清晰、可审计/可回滚；复用 Git 分支与 CI；并发冲突显式暴露 | **采纳** |
| **D. 锁文件/悲观锁** | 用户体验差（他人不能改），且 Agent 长任务会长时间持锁；死锁风险 | 否决 |
| **E. 直接在工作区原地改 + 实时共享同一工作区** | 多人共享一个 opencode 实例 = 破坏"一人一实例"隔离（ADR-001），且并发写文件不可控 | 否决 |

## 后果

**正面**
- 变更以"提案"为单位，天然可审计、可回滚、可做影响分析（diff + 风险 + 测试建议）。
- 复用 Git/CI/构建链路，应用发布门禁不被绕过。
- 乐观锁实现简单、无需协同服务；冲突显式提示而非静默覆盖。
- 与"工作区即执行单元"一致：Agent 在独立工作区生成 patch，不自造共享进程。

**负面 / 代价**
- 不是"实时共同编辑"，用户感受到的是"异步提案 + 实时状态"；文档类场景需另做（P2 可引入 CRDT）。
- 合并冲突需要产品化处理（rebase 提示、重新生成按钮、冲突文件列表）。
- 审批队列串行化可能成为瓶颈（单 app 同时一个 pending proposal）→ 需要 SLA 与超时自动升级。
- Git 分支管理增加存储与清理成本（session 分支保留 30 天）。

## 实现要点

- 分支命名：`collab/<app_id>/<session_id>`；patch 提交 message 含 `session_id` 与 `proposal_id`。
- 提案表：`app_collab_sessions` / `app_proposals`（`base_version_id`、`diff_ref`、`risk_level`、`status`、`approved_by`）；diff 全文存 OSS（DB 存 hash/摘要）。
- 预览：提案 approve 前可构建到预览环境（独立子域 + ticket），不发布生产。
- 回滚：每次发布产生 `app_deployments` 版本；回滚 = 切换指针（≤2min），不回滚 Git 历史。
- 权限：`edit` 才能开 collab session；`approve` 需 owner/admin/指定审批人；作者不能自审（高风险变更强制双人）。
- 并发保护：合并时对 `app_id` 行 `SELECT ... FOR UPDATE` + `base_version` 校验；失败返回 409 并附带最新 base。

## 补丁路径白名单（V3-COL-001 定稿，2026-11-08）

> 适用于"提案创建"与"批准合并"两个时点（**两处都校验**，不能只在前端/单点校验）。

| 类别 | 规则 |
| --- | --- |
| **允许** | `src/**`、`public/**`、`assets/**`、`app/**`（若模板使用）、`package.json`、`package-lock.json`/`pnpm-lock.yaml`/`bun.lock`、`tsconfig*.json`、`README.md`、`index.html`、`LICENSE` |
| **拒绝（永远）** | `.git/**`、`.github/**`、`.gitlab-ci.yml`、`.circleci/**`、`Jenkinsfile`、`.env*`、`**/.env*`、`Dockerfile*`、`docker-compose*.yml`、`k8s/**`/`helm/**`/`deploy/**`、`*.pem`/`*.key`/`*.p12`/`*.crt`、`id_rsa*`、`.npmrc`/`.yarnrc*`、`secrets/**` |
| **拒绝（逃逸/畸形）** | 绝对路径、`..` 逃逸、反斜杠、NUL/控制字符、`%2e%2e` 等编码绕过、符号链接（解析后必须仍在应用根内）、大小写/Unicode 归一化后越界 |
| **大小限制** | 单文件 ≤2MB；单提案 ≤50 文件 / ≤200KB diff（超出给"拆分提案"提示） |
| **特殊** | 删除/重命名保护文件一律拒绝；依赖/构建配置变更（lockfile、`tsconfig`、`Dockerfile`）**允许但标高风险**，审批需双人（与 §实现要点一致） |

**错误语义**：`400 validation_failed` + `reason=collab_patch_denied`（1.1.0 已有 reason）+ `details.files[]`（逐文件原因）；`path_not_allowed` 作为 `details.cause` 值（1.2 再考虑升为独立 reason，避免冻结期改枚举）。

**校验方式**：先做字符串规范化（POSIX、禁反斜杠/编码绕过）→ 拼接应用根并 `realpath` → 断言仍在根内 → 再匹配 allow/deny glob（deny 优先于 allow）。

## 验证

- 并发：两个 session 基于同一 base 提交，第二个必须 409 且提示 rebase；合并后版本唯一。
- 审计：从消息→patch→审批→发布全链路可回放（按 `session_id`）。
- 安全：尝试修改应用目录外文件、删除保护文件、绕过 CI 的提案必须被阻断。
- 体验：提案生成 ≤90s（P95，取决于 Agent 任务）；审批到预览 ≤3min。
- 回滚：发布后回滚 ≤2min 且数据/版本一致。
