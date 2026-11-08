# OpenDream Cloud · 数据模型（ER / 表清单 / 租户键 / RLS / 保留策略）

- 版本：v1.0
- Owner：architect（决策） / platform-backend（实现契约）
- 关联：`ARCHITECTURE.md`、`openapi.yaml`、`SECURITY.md`、`services/BACKEND.md`、`centers/CENTERS.md`
- 状态：**待 G2 评审**

---

## 1. 通用约定（先读这一节）

### 1.1 标识与命名

| 项 | 约定 |
| --- | --- |
| 主键 | `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`；**API 路径参数一律用 id**；`slug` 仅展示 |
| 租户键 | `org_id uuid NOT NULL REFERENCES orgs(id)`，**每张业务表必须有**（例外：`users`/`orgs`/`audit_logs` 见各表说明） |
| 时间 | 全部 `timestamptz`，UTC 存储；对外 ISO-8601 |
| 金额 | `numeric(18,8)`，单位 USD；不存浮点 |
| Token | `bigint`（分项：input/output/reasoning/cache_read/cache_write） |
| 软删除 | `deleted_at timestamptz`（仅对可恢复资源；审计/用量不做软删） |
| 版本号 | `version int NOT NULL DEFAULT 1`（乐观锁，`WHERE id=? AND version=?`） |
| 外键 | 跨租户外键**必须复合**：`(org_id, other_id)` → `UNIQUE(org_id, id)`，杜绝跨租户引用 |

### 1.2 每个请求的租户上下文（RLS 生效前提）

```sql
-- 控制面每获取一个连接后立刻执行（同一事务内）：
SET LOCAL app.user_id    = '<uuid>';
SET LOCAL app.org_id     = '<uuid>';
SET LOCAL app.is_platform_admin = 'false';
-- 平台后台任务/迁移使用独立角色 opencode_platform（BYPASSRLS，仅限 migration/admin 服务）
```

- 连接池使用 **`opencode_app`** 角色（非 owner、非 superuser、**无 BYPASSRLS**）。
- 所有业务表启用 `ROW LEVEL SECURITY` + 策略模板（§4.1）。
- 应用层**同时**在 repository 显式带 `org_id` 条件（双保险；RLS 是兜底不是唯一防线）。

### 1.3 保留策略一览

| 数据类 | 保留 | 依据 |
| --- | --- | --- |
| 身份/组织/成员 | 账号存续期 + 删除后 30 天 | R10.3 |
| 工作区元数据 | 删除后 30 天（与快照一致） | R3.3 / R10.3 |
| `workspace_events` | 90 天（热）/ 1 年（归档 OSS） | 排障 |
| `audit_logs` | **≥180 天**（目标 365 天，按月分区） | PLAN NFR 合规 |
| `usage_records`（明细） | 180 天，之后降采样 | R2.5 / R10.1 |
| `usage_hourly`（聚合） | 3 年 | 账单对账 |
| Skill 版本 | 永久（可下架不可删；合规保留签名证据） | R4.2 |
| 评测结果 | 2 年 | R5.4 |
| 应用部署记录 | 1 年（镜像 tag 保留 90 天） | R6.7 |
| MCP 调用日志 | 180 天（元数据；不含正文） | R7.5 |

---

## 2. ER 图

```mermaid
erDiagram
  users ||--o{ memberships : "has"
  orgs  ||--o{ memberships : "has"
  orgs  ||--o{ teams : "has"
  teams ||--o{ team_members : "has"
  users ||--o{ team_members : "in"
  users ||--o{ api_keys : "owns"
  orgs  ||--o{ api_keys : "tenant"
  users ||--o{ workspaces : "owns"
  orgs  ||--o{ workspaces : "tenant"
  workspaces ||--o{ workspace_events : "emits"
  orgs ||--o{ model_providers : "configures"
  model_providers ||--o{ models : "serves"
  orgs ||--o{ model_policies : "governs"
  model_policies ||--o{ model_policy_rules : "contains"
  orgs ||--o{ skills : "publishes"
  skills ||--o{ skill_versions : "versions"
  users ||--o{ skill_installations : "installs"
  workspace_events }o--|| workspaces : "belongs"
  profiles ||--o{ | : ""
  users ||--o{ skill_installations : "installs"
  skills ||--o{ skill_installations : "installed_as"
  orgs ||--o{ eval_datasets : "owns"
  eval_datasets ||--o{ eval_runs : "evaluated_by"
  skills ||--o{ eval_runs : "subject"
  eval_runs ||--o{ eval_results : "produces"
  orgs ||--o{ apps : "owns"
  apps ||--o{ app_deployments : "deploys"
  apps ||--o{ app_shares : "shared_via"
  users ||--o{ app_shares : "grantee"
  orgs ||--o{ mcp_servers : "registers"
  orgs ||--o{ mcp_bindings : "binds"
  mcp_servers ||--o{ mcp_bindings : "bound"
  workspaces ||--o{ mcp_bindings : "binds"
  users ||--o{ audit_logs : "actor"
  orgs ||--o{ usage_records : "metered"
  workspaces ||--o{ usage_records : "metered"

  users {
    uuid id PK
    text email UK
    text display_name
    text status
    timestamptz created_at
  }
  orgs {
    uuid id PK
    text slug UK
    text kind
    text name
    timestamptz created_at
  }
  memberships {
    uuid id PK
    uuid org_id FK
    uuid user_id FK
    text role
    text status
  }
  workspaces {
    uuid id PK
    uuid org_id FK
    uuid owner_user_id FK
    text state
    text slug UK
    text host
    timestamptz last_activity_at
  }
  skills {
    uuid id PK
    uuid org_id FK
    text slug
    text visibility
    uuid latest_version_id
  }
  apps {
    uuid id PK
    uuid org_id FK
    text slug
    text state
    text host
  }
  usage_records {
    uuid id PK
    uuid org_id
    uuid workspace_id
    text model_id
    bigint tokens_total
    numeric cost_usd
    timestamptz occurred_at
  }
```

> 注：为保证渲染稳定，`profiles` 等无关实体未列出；以 §3 表格为准。

---

## 3. 表清单（23 张）

> 图例：🔑 主键 ｜ 🏷 租户键 ｜ 🔗 外键 ｜ ⚡ 唯一 ｜ 📇 索引 ｜ 🗑 保留

### 3.1 身份与组织

#### `users`

| 项 | 内容 |
| --- | --- |
| 用途 | 自然人身份（来自 OIDC `sub`），平台不存密码 |
| 字段 | `id`🔑, `idp_subject`⚡(text), `idp_issuer`(text), `email`(citext)⚡, `email_verified`(bool), `display_name`, `avatar_url`, `locale`(text default 'zh-CN'), `status`(enum: active/suspended/deactivated), `last_login_at`, `created_at`, `updated_at`, `deleted_at` |
| 🏷 租户键 | 无（全局实体）；通过 `memberships` 关联 org |
| 唯一 | `UNIQUE(idp_issuer, idp_subject)`；`UNIQUE(email)` where `deleted_at is null` |
| 📇 索引 | `idx_users_email`；`idx_users_last_login` |
| 🗑 保留 | 账号存续 + 删除后 30 天（匿名化：email→hash，display_name→"deleted"） |
| RLS | `USING (id = current_setting('app.user_id')::uuid OR current_setting('app.is_platform_admin')='true')` |
| 说明 | `idp_subject` 是 SSO 的稳定锚点；email 变更不建新用户 |

#### `orgs`

| 项 | 内容 |
| --- | --- |
| 用途 | 租户边界（团队/企业/个人） |
| 字段 | `id`🔑, `slug`⚡, `name`, `kind`(enum: personal/team/enterprise), `plan`(text), `settings`(jsonb), `data_region`(text default 'cn-hangzhou'), `status`(active/suspended/deleted), `created_at`, `deleted_at` |
| 🏷 租户键 | `id` **自身即租户键** |
| 唯一 | `UNIQUE(slug)` where deleted_at is null |
| 📇 索引 | `idx_orgs_slug` |
| 🗑 保留 | 删除后 30 天（期间可恢复），之后级联清理 |
| RLS | `USING (id = current_setting('app.org_id')::uuid OR current_setting('app.is_platform_admin')='true')` |
| 说明 | 用户首个登录自动建 personal org（`kind=personal`，slug=`u-<short>`） |

#### `memberships`

| 项 | 内容 |
| --- | --- |
| 用途 | 用户 ↔ 组织，含角色 |
| 字段 | `id`🔑, `org_id`🔗🏷, `user_id`🔗, `role`(enum: owner/admin/member/viewer), `status`(invited/active/suspended), `invited_by`, `invited_at`, `joined_at`, `created_at` |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(org_id, user_id)` |
| 📇 索引 | `idx_memberships_user`(user_id, status)；`idx_memberships_org_role`(org_id, role) |
| 🗑 保留 | 移除后立即失效，历史保留 1 年（审计需要） |
| RLS | `org_id = current_setting('app.org_id')::uuid` |
| 说明 | **RBAC 的唯一真相**；JWT 中的角色是快照（≤5min），以库为准做写操作校验 |

#### `teams` / `team_members`（2 张）

| 表 | 字段 | 键/索引 | RLS |
| --- | --- | --- | --- |
| `teams` | `id`🔑, `org_id`🏷🔗, `slug`, `name`, `description`, `created_at` | ⚡`(org_id,slug)`; 📇`idx_teams_org` | `org_id = current` |
| `team_members` | `id`🔑, `org_id`🏷🔗, `team_id`🔗, `user_id`🔗, `role`(member/lead), `created_at` | ⚡`(team_id,user_id)`; 📇`idx_team_members_user` | `org_id = current` |

> 用于分享 ACL 的 `subject_type=team`（R6.4）。保留：随组织删除级联。

#### `api_keys`

| 项 | 内容 |
| --- | --- |
| 用途 | 平台 API Key（`ock_` 前缀），供 SDK/CI 调用控制面 API |
| 字段 | `id`🔑, `org_id`🏷🔗, `user_id`🔗, `name`, `prefix`(text, 前 12 字符便于识别), `key_hash`(bytea, **HMAC-SHA256 + per-env pepper（KMS 保管）**), `key_version`(int, pepper 轮换用), `scopes`(text[]), `last_used_at`, `expires_at`, `revoked_at`, `created_at` |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(prefix)`（前缀碰撞时重新生成）；不存明文 |
| 📇 索引 | `idx_api_keys_user`(user_id) where revoked_at is null；`idx_api_keys_prefix` |
| 🗑 保留 | 吊销后 90 天硬删（保留审计中的 key_id） |
| RLS | `org_id = current` OR `user_id = current_user` |
| 说明 | 明文仅创建时返回一次；校验走 `prefix` 定位 → HMAC 比对（常数时间）。**不用 Argon2id**：`ock_` 是 256-bit 高熵随机串，不存在暴力猜测风险，HMAC-SHA256 足够且支持 5s 吊销；Argon2id 只用于低熵口令（本平台不存口令）。`pepper` 轮换时双版本并行校验，`key_version` 标记 |

### 3.2 工作区

#### `workspaces`

| 项 | 内容 |
| --- | --- |
| 用途 | 每用户工作区（默认 1 个，可配多开） |
| 字段 | `id`🔑, `org_id`🏷🔗, `owner_user_id`🔗, `display_name`, `slug`(text, 用于展示), `state`(enum 见下), `state_reason`, `host`⚡(text), `image`, `image_digest`, `cpu_request`(text default '4'), `mem_request`(text default '8Gi'), `pvc_size`(text), `pvc_name`, `config_revision`(bigint), `model_default`(text), `last_activity_at`, `idle_since`, `destroy_requested_at`, `destroy_scheduled_at`, `deleted_at`, `snapshot_id`, `version`, `created_at`, `updated_at` |
| `state` 枚举 | `provisioning, starting, ready, idle, stopping, stopped, error, deleting, deleted`（严格对应 `ARCHITECTURE.md §7.2`） |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(org_id, owner_user_id)` where `deleted_at is null`（默认 1 个/用户，多开时改为 `(org_id, slug)`）；`UNIQUE(host)` |
| 📇 索引 | `idx_ws_owner`(owner_user_id, state)；`idx_ws_org_state`(org_id, state)；`idx_ws_activity`(last_activity_at) where state in ('ready','idle')；`idx_ws_destroy`(destroy_scheduled_at) where state='stopped' |
| 🗑 保留 | 删除后 30 天（软删），快照同期 |
| RLS | `org_id = current AND (owner_user_id = current_user OR current_setting('app.is_platform_admin')='true')`；**org admin 通过视图访问**（不放开基础表，防止误读他人代码元数据） |
| 说明 | `host` 唯一且不可变（`w-<short>.<ws-domain>`）；`config_revision` 单调递增，用于 agent 判断是否已应用；`version` 乐观锁防并发状态迁移 |

#### `workspace_events`

| 项 | 内容 |
| --- | --- |
| 用途 | 状态机审计 + 用户可见事件 + SSE 回放 |
| 字段 | `id`🔑(bigserial 可读性更好，但用 uuid+seq), `org_id`🏷, `workspace_id`🔗, `seq`(bigserial, 单调), `type`(enum: state_changed/provisioned/started/stopped/restarted/destroy_requested/destroyed/snapshot_created/config_applied/error), `from_state`, `to_state`, `reason`, `message`, `actor_type`(user/system/operator), `actor_id`, `metadata`(jsonb), `created_at` |
| 🏷 租户键 | `org_id` |
| 📇 索引 | `idx_wse_ws_seq`(workspace_id, seq DESC)；`idx_wse_created`(created_at)（分区裁剪）；`idx_wse_type`(type, created_at) |
| 🗑 保留 | 热 90 天，归档 OSS 1 年（按月分区 `workspace_events_pYYYYMM`） |
| RLS | `org_id = current` |
| 说明 | `seq` 用于 SSE `Last-Event-ID` 续传（控制面 SSE，不是上游 `/api/event`） |

#### `workspace_snapshots`（隐含但必须有）

| 项 | 内容 |
| --- | --- |
| 用途 | PVC 快照记录（VolumeSnapshot 元数据 + 恢复入口） |
| 字段 | `id`🔑, `org_id`🏷, `workspace_id`🔗, `volume_snapshot_name`, `pvc_name`, `size_bytes`, `trigger`(user/scheduled/pre_delete), `status`(creating/ready/error), `restore_of`, `created_at`, `expires_at` |
| 📇 索引 | `idx_snap_ws_created`(workspace_id, created_at DESC) |
| 🗑 保留 | 触发=pre_delete 保留 30 天；scheduled 保留 7/30 天策略；user 保留 90 天 |
| RLS | `org_id = current AND owner 校验经 workspaces` |

### 3.3 模型中心

#### `model_providers`

| 项 | 内容 |
| --- | --- |
| 用途 | 供应商接入（LiteLLM 后端） |
| 字段 | `id`🔑, `org_id`🏷(nullable，**null = 平台级共享**), `name`, `kind`(enum: openai_compatible/azure/anthropic/google/bedrock/custom), `base_url`, `credential_ref`(text, **KMS 密文引用，不存明文**), `region`, `enabled`, `health`(healthy/degraded/down/unknown), `last_check_at`, `settings`(jsonb), `created_at`, `updated_at` |
| 🏷 租户键 | `org_id`（NULL 表示平台级；RLS 策略允许 `org_id IS NULL` 读） |
| 唯一 | `UNIQUE(org_id, name)`（NULL 用 partial unique index） |
| 📇 索引 | `idx_prov_enabled`(enabled, health) |
| 🗑 保留 | 永久（禁用即软删 `enabled=false`） |
| RLS | `org_id = current OR org_id IS NULL` |
| 说明 | 凭证由 Model Service 写入 KMS，DB 只存 `credential_ref`；LiteLLM 侧对应一个 `model_list` 条目 |

#### `models`

| 项 | 内容 |
| --- | --- |
| 用途 | 模型目录（展示 + 策略 + 计量维度） |
| 字段 | `id`🔑, `org_id`🏷(nullable), `provider_id`🔗, `provider_model_id`(text, 如 `gpt-4o`), `display_name`, `context_window`(int), `max_output`(int), `capabilities`(text[]: vision/tools/reasoning/caching), `input_price`(numeric/1M), `output_price`(numeric/1M), `currency`, `enabled`, `health`, `litellm_alias`⚡(text), `created_at` |
| 🏷 租户键 | `org_id`（NULL=平台级） |
| 唯一 | `UNIQUE(litellm_alias)` 全局；`UNIQUE(org_id, provider_id, provider_model_id)` |
| 📇 索引 | `idx_models_provider`(provider_id)；`idx_models_enabled`(enabled) |
| 🗑 保留 | 永久（下架 `enabled=false`） |
| RLS | `org_id = current OR org_id IS NULL` |
| 说明 | `litellm_alias` 是 opencode 侧 `model` 配置与 LiteLLM 路由的锚点；**改名会破坏历史用量归因**，禁止重命名，只可新增 |

#### `model_policies`

| 项 | 内容 |
| --- | --- |
| 用途 | 策略头（组织级模型治理） |
| 字段 | `id`🔑, `org_id`🏷🔗, `name`, `description`, `default_model_id`🔗, `is_default`(bool), `enforcement`(enum: enforce/warn/off), `cost_budget_usd`(numeric, 月预算), `created_by`, `created_at`, `updated_at` |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(org_id, name)`；`UNIQUE(org_id) WHERE is_default` |
| 📇 索引 | `idx_pol_org_default`(org_id, is_default) |
| 🗑 保留 | 永久（版本化：修改即新 revision） |
| RLS | `org_id = current` |

#### `model_policy_rules`

| 项 | 内容 |
| --- | --- |
| 用途 | 策略规则（谁可用哪些模型） |
| 字段 | `id`🔑, `org_id`🏷, `policy_id`🔗, `effect`(allow/deny), `subject_type`(user/team/role/org), `subject_id`(uuid/null，role 时用 role 枚举), `model_id`🔗(null=全部), `provider_id`🔗(null), `limits`(jsonb: rpm/tpm/daily_usd), `priority`(int, 小者优先), `created_at` |
| 🏷 租户键 | `org_id` |
| 📇 索引 | `idx_polrules_policy_priority`(policy_id, priority)；`idx_polrules_subject`(org_id, subject_type, subject_id) |
| 🗑 保留 | 永久 |
| RLS | `org_id = current` |
| 说明 | 解析顺序：deny 优先 → 精确 subject > role > org → 优先级数值小者优先；结果写入 agent 配置与 LiteLLM key 的 `models` 允许集合（双执行点） |

### 3.4 Skill 中心

#### `skills`

| 项 | 内容 |
| --- | --- |
| 用途 | 技能实体（逻辑名 + 可见性） |
| 字段 | `id`🔑, `org_id`🏷🔗(nullable=平台公开), `slug`, `name`, `summary`, `category`, `visibility`(enum: public/org/private), `status`(draft/in_review/published/deprecated/blocked), `latest_version_id`, `install_count`, `avg_rating`(numeric(3,2)), `rating_count`, `owner_user_id`, `created_at`, `updated_at`, `deleted_at` |
| 🏷 租户键 | `org_id`（NULL=平台级公开） |
| 唯一 | `UNIQUE(org_id, slug)`（NULL 用 partial index `UNIQUE(slug) WHERE org_id IS NULL`） |
| 📇 索引 | `idx_skills_visibility_status`(visibility, status)；`idx_skills_slug`(slug)；GIN `idx_skills_search`(to_tsvector(name||summary)) |
| 🗑 保留 | 永久（下架不删；`deleted_at` 仅运营误建） |
| RLS | `org_id = current OR (org_id IS NULL AND status='published')` |
| 说明 | **API 用 id**；`by-slug` 解析需 `org_slug + skill_slug`（公开技能 org_slug 省略=__platform） |

#### `skill_versions`

| 项 | 内容 |
| --- | --- |
| 用途 | 不可变版本（签名 + 内容寻址） |
| 字段 | `id`🔑, `org_id`🏷, `skill_id`🔗, `version`(semver text), `manifest`(jsonb: frontmatter 规范化), `permissions`(jsonb: `{tools,mcp,network.egress,filesystem{read,write},secrets}`), `entry`(text, "SKILL.md"), **`resource_paths text[]`（权威文件清单）**, **`archive_sha256`（包级哈希）**, `files`(jsonb: `[{path,size,sha256}]`, 派生), `content_hash`⚡(sha256, 内容寻址), **`distribution_ready`(bool, >10MB 异步分发就绪)**, `oss_prefix`(text), `signature`(bytea, ed25519), `signing_key_id`, `scan_status`(pending/passed/failed), `scan_report_ref`, `eval_run_id`🔗(nullable), `status`(draft/published/yanked), `published_at`, `published_by`, `created_at` |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(skill_id, version)`；`UNIQUE(content_hash)`（同内容不重复存） |
| 📇 索引 | `idx_skv_skill_version`(skill_id, published_at DESC)；`idx_skv_hash`(content_hash) |
| 🗑 保留 | 永久（`yanked` 状态阻止新安装，已安装不受影响） |
| RLS | 同 `skills`（经 skill_id 关联判定） |
| 说明 | **不可 UPDATE 内容**：只允许 `status`/`published_at` 变更；任何内容修改必须是新版本。`eval_gate_run_id` 非空且 PASS 才可 `published`（R5.5） |

#### `skill_installations`

| 项 | 内容 |
| --- | --- |
| 用途 | 用户/工作区启用记录（驱动 `skills[]` 配置与下载） |
| 字段 | `id`🔑, `org_id`🏷, `user_id`🔗, `workspace_id`🔗(nullable=用户级), `skill_id`🔗, `version_id`🔗, `enabled`(bool), `auto_update`(bool default true), `installed_at`, `last_synced_at`, `last_error`(text), `source`(user/admin/org_default) |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(workspace_id, skill_id)`；用户级 `UNIQUE(user_id, skill_id) WHERE workspace_id IS NULL` |
| 📇 索引 | `idx_skinst_ws`(workspace_id, enabled)；`idx_skinst_user`(user_id) |
| 🗑 保留 | 卸载后保留 90 天（统计用），之后硬删 |
| RLS | `org_id = current` |
| 说明 | 安装 ≠ 下载成功：`last_synced_at`/`last_error` 由 agent 回写；`skill_versions.status=yanked` 时 `enabled` 自动转 false 并通知 |

### 3.5 评测中心

#### `eval_datasets`

| 项 | 内容 |
| --- | --- |
| 用途 | 评测数据集（版本化） |
| 字段 | `id`🔑, `org_id`🏷🔗, `slug`, `name`, `description`, `visibility`(org/public), `schema`(jsonb: 字段定义), `version`(semver), `cases_count`(int), `content_hash`, `oss_prefix`, `created_by`, `created_at` |
| 🏷 租户键 | `org_id`（NULL=平台内置） |
| 唯一 | `UNIQUE(org_id, slug, version)`；`UNIQUE(content_hash)` |
| 📇 索引 | `idx_evalds_org`(org_id)；`idx_evalds_slug`(slug) |
| 🗑 保留 | 2 年（被 run 引用时禁止删，改为 archived） |
| RLS | `org_id = current OR org_id IS NULL` |
| 说明 | 用例正文存 OSS（JSONL），DB 只存索引与 hash；**数据集不可变**，新版本=新行 |

#### `eval_runs`

| 项 | 内容 |
| --- | --- |
| 用途 | 一次评测执行 |
| 字段 | `id`🔑, `org_id`🏷🔗, `dataset_id`🔗, `dataset_version`, `subject_type`(skill/model/app/agent), `subject_id`, `subject_version_id`, `name`, `status`(queued/running/succeeded/failed/canceled/timeout), `trigger`(manual/ci/publish_gate), `commit_sha`, `scorer`(jsonb: 规则/LLM-judge/人工), `sandbox`(jsonb: image_digest, runtime_class=gvisor, network=deny, cpu/mem/timeout), `metrics`(jsonb: pass_rate, p50_latency_ms, cost_usd, tokens_total), `started_at`, `finished_at`, `error`, `created_by`, `created_at` |
| 🏷 租户键 | `org_id` |
| 📇 索引 | `idx_evalrun_org_status`(org_id, status, created_at DESC)；`idx_evalrun_subject`(subject_type, subject_id) |
| 🗑 保留 | 2 年 |
| RLS | `org_id = current` |
| 说明 | `priority` 调度；同一 `(subject_id, subject_version_id, dataset_id)` 并发限制 1（DB 部分唯一索引 `WHERE status IN ('queued','running')`） |

#### `eval_results`

| 项 | 内容 |
| --- | --- |
| 用途 | 单用例结果 |
| 字段 | `id`🔑, `org_id`🏷, `run_id`🔗, `case_index`(int), `case_hash`, `status`(pass/fail/error/skipped), `score`(numeric(5,4)), `latency_ms`, `tokens`(jsonb: input/output/reasoning), `cost_usd`, `output_ref`(text, OSS), `error`, `scorer_detail`(jsonb), `created_at` |
| 唯一 | `UNIQUE(run_id, case_index)` |
| 📇 索引 | `idx_evalres_run`(run_id)；`idx_evalres_status`(run_id, status) |
| 🗑 保留 | 2 年（随 run 级联） |
| RLS | `org_id = current` |
| 说明 | 高基数表 → 按月分区；输出正文只在 OSS（避免 DB 膨胀） |

### 3.6 应用中心

#### `apps`

| 项 | 内容 |
| --- | --- |
| 用途 | 应用元数据 |
| 字段 | `id`🔑, `org_id`🏷🔗, `slug`, `name`, `description`, `state`(**draft/ready/failed/stopped/deleted**；部署/构建态在 deployments/builds，不混入), `source_workspace_id`🔗, `template`(node/python/static/custom), `entry`(text), `context_subdir`(text), `visibility`(enum: private/org/public), `host`⚡, `custom_domain`, `default_deployment_id`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| 🏷 租户键 | `org_id` |
| 唯一 | `UNIQUE(org_id, slug)`；`UNIQUE(host)`；`UNIQUE(custom_domain) WHERE custom_domain IS NOT NULL` |
| 📇 索引 | `idx_apps_org_state`(org_id, state)；`idx_apps_host`(host) |
| 🗑 保留 | 删除后 30 天（镜像 tag 90 天后清理） |
| RLS | `org_id = current` |
| 说明 | 资源限额固定 `1C2G`（存 `apps.limits` jsonb 便于后续放开，但写入侧硬编码校验） |

#### `app_deployments`

| 项 | 内容 |
| --- | --- |
| 用途 | 部署版本（不可变） |
| 字段 | `id`🔑, `org_id`🏷, `app_id`🔗, `build_no`(int), `image`(text), `image_digest`(text), `commit_sha`, `build_log_ref`(OSS), `scan_status`(passed/failed), `status`(**pending/deploying/running/sleeping/failed/stopped**；构建态在 `app_builds`), `replicas`(int), `resources`(jsonb: cpu 1/mem 2Gi, requests=limits), `host`, `url`, `health`(healthy/unhealthy/unknown), `deployed_by`, `started_at`, `finished_at`, `created_at` |
| 唯一 | `UNIQUE(app_id, build_no)` |
| 📇 索引 | `idx_appdep_app`(app_id, created_at DESC)；`idx_appdep_status`(status) |
| 🗑 保留 | 1 年；镜像保留最近 10 个 + 90 天 |
| RLS | `org_id = current` |
| 说明 | 回滚 = 把 `default_deployment_id` 指向历史 deployment（≤2min，R6.7），不重建镜像 |

#### `app_shares`

| 项 | 内容 |
| --- | --- |
| 用途 | 分享 ACL（R6.4：`public` = 平台内已登录用户） |
| 字段 | `id`🔑, `org_id`🏷, `app_id`🔗, `scope`(enum: public/org/users), `subject_type`(enum: user/team/org, nullable for public), `subject_id`(uuid, nullable for public), `role`(enum: view/use/edit), `expires_at`(nullable), `created_by`, `created_at` |
| 唯一 | **表达式唯一索引**（表级 UNIQUE 不允许表达式）：`CREATE UNIQUE INDEX uq_app_share_subject ON app_shares (app_id, scope, COALESCE(subject_type,''), COALESCE(subject_id,'00000000-0000-0000-0000-000000000000'::uuid));` + `CREATE UNIQUE INDEX uq_app_share_public ON app_shares (app_id) WHERE scope='public';` |
| 📇 索引 | `idx_share_app`(app_id)；`idx_share_subject`(subject_type, subject_id) |
| 🗑 保留 | 撤销即删；审计保留 1 年 |
| RLS | `org_id = current`（跨 org 的 `public` 读取通过 gateway 的 `app_id` 直查 + 缓存） |
| 说明 | **禁止**无 `subject` 的 `users` 记录；`public` 不产生匿名访问；`expires_at` 到期由 gateway 视为无效（缓存 TTL 60s，主动失效 ≤5s） |

### 3.7 MCP 中心

#### `mcp_servers`

| 项 | 内容 |
| --- | --- |
| 用途 | MCP 服务注册（企业目录） |
| 字段 | `id`🔑, `org_id`🏷🔗, `slug`, `name`, `description`, `transport`(enum: stdio/sse/streamable_http), `upstream_url`(text), `command`(text, 仅 stdio 白名单), `args`(text[]), `env_refs`(text[], KMS 引用), `auth_type`(none/api_key/oauth2/mtls), `credential_ref`(KMS), `visibility`(org/public), `status`(draft/pending_review/published/disabled), `health`(healthy/degraded/down), `last_check_at`, `tool_manifest`(jsonb: 工具列表+风险标注), `created_by`, `created_at` |
| 🏷 租户键 | `org_id`（NULL=平台公共目录） |
| 唯一 | `UNIQUE(org_id, slug)` |
| 📇 索引 | `idx_mcp_status`(status, health)；GIN `idx_mcp_tools`(tool_manifest) |
| 🗑 保留 | 永久（disabled 软下架） |
| RLS | `org_id = current OR org_id IS NULL` |
| 说明 | `stdio` 仅允许镜像内置白名单（`command` 必须命中平台白名单表，见 SECURITY §6.4） |

#### `mcp_bindings`

| 项 | 内容 |
| --- | --- |
| 用途 | 授权绑定：谁（user/workspace/app）可用哪个 MCP 的哪些工具 |
| 字段 | `id`🔑, `org_id`🏷, `mcp_server_id`🔗, `subject_type`(enum: user/workspace/app/org), `subject_id`(uuid), `allowed_tools`(text[], null=全部经审批工具), `denied_tools`(text[]), `credential_override_ref`(KMS, nullable), `enabled`(bool), `created_by`, `created_at`, `expires_at` |
| 唯一 | `UNIQUE(mcp_server_id, subject_type, subject_id)` |
| 📇 索引 | `idx_mcpbind_subject`(subject_type, subject_id, enabled)；`idx_mcpbind_ws`(subject_id) WHERE subject_type='workspace' |
| 🗑 保留 | 解绑即删；审计 1 年 |
| RLS | `org_id = current` |
| 说明 | **默认拒绝**：无 binding 则 MCP Hub 拒绝；`allowed_tools` 为 null 时仍受 `mcp_servers.tool_manifest` 中 `risk=high` 的工具排除（需显式列出才允许） |

### 3.8 计量与审计

#### `usage_records`

| 项 | 内容 |
| --- | --- |
| 用途 | 模型调用计量明细（**权威源：LiteLLM spend log 同步**） |
| 字段 | `id`🔑, `org_id`🏷, `user_id`, `workspace_id`, `api_key_id`(虚拟 Key 指纹), `provider_id`, `model_id`, `litellm_alias`, `request_id`⚡(text, LiteLLM request id), `tokens_input`, `tokens_output`, `tokens_reasoning`, `tokens_cache_read`, `tokens_cache_write`, `cost_usd`(numeric(18,8)), `currency`, `latency_ms`, `status`(success/failure/rate_limited), `error_code`, `occurred_at`, `ingested_at` |
| 🏷 租户键 | `org_id`（**必有**；由虚拟 Key 的 metadata 反解，缺失则拒收并告警） |
| 唯一 | `UNIQUE(request_id)`（幂等：LiteLLM 重放不重复计费） |
| 📇 索引 | `idx_usage_org_time`(org_id, occurred_at DESC) BRIN 更优 → `USING brin(occurred_at)`；`idx_usage_ws_time`(workspace_id, occurred_at)；`idx_usage_model`(model_id, occurred_at)；`idx_usage_user`(org_id, user_id, occurred_at) |
| 🗑 保留 | 明细 180 天 → 降采样到 `usage_hourly` 后删除；按月分区 `usage_records_pYYYYMM` |
| RLS | `org_id = current` |
| 说明 | 只 append，不 update/delete（除保留策略）；写入用 `INSERT ... ON CONFLICT (request_id) DO NOTHING`；**对账**：每日与上游 `session/stats` 比对，>2% 告警 |

#### `usage_hourly`

| 项 | 内容 |
| --- | --- |
| 用途 | 小时聚合（账单/看板） |
| 字段 | `id`🔑, `org_id`🏷, `bucket_start`(timestamptz), `user_id`, `workspace_id`, `model_id`, `requests`(int), `tokens_input`…(bigint 各项), `cost_usd`, `unique(s)` |
| 唯一 | `UNIQUE(org_id, bucket_start, user_id, workspace_id, model_id)` |
| 📇 索引 | `idx_usageh_org_bucket`(org_id, bucket_start DESC) |
| 🗑 保留 | 3 年 |
| RLS | `org_id = current` |

#### `audit_logs`

| 项 | 内容 |
| --- | --- |
| 用途 | 安全/合规审计（**append-only**） |
| 字段 | `id`🔑, `org_id`🏷(nullable=平台事件), `actor_type`(user/service/system), `actor_id`(uuid/null), `actor_ip`(inet), `user_agent`(text), `action`(text, 如 `workspace.destroy`), `resource_type`(text), `resource_id`(uuid/text), `outcome`(success/denied/error), `detail`(jsonb, **不含正文/密钥**), `request_id`, `created_at` |
| 🏷 租户键 | `org_id`（NULL 为平台级，仅 platform_admin 可见） |
| 📇 索引 | `idx_audit_org_time`(org_id, created_at DESC)；`idx_audit_actor`(actor_id, created_at)；`idx_audit_resource`(resource_type, resource_id, created_at)；`idx_audit_action`(action, created_at) |
| 🗑 保留 | **≥180 天**（目标 365），按月分区；到期分区 detach 后归档 OSS 并保留 3 年（合规） |
| RLS | `org_id = current OR current_setting('app.is_platform_admin')='true'` |
| 说明 | **不可 UPDATE/DELETE**：`REVOKE UPDATE, DELETE ON audit_logs FROM opencode_app`；分区 detach 由 `opencode_platform` 角色执行；写失败**必须阻断业务**（同事务）或进本地 WAL（跨服务） |

#### `idempotency_keys`（Redis 为主，PG 兜底）

| 项 | 内容 |
| --- | --- |
| 用途 | 幂等键持久化兜底（Redis 丢时用） |
| 字段 | `key`(text, PK：`<scope>:<user_id>:<header>`), `org_id`, `request_hash`(sha256), `status_code`(int), `response`(jsonb), `created_at`, `expires_at` |
| 📇 索引 | `idx_idem_expires`(expires_at) |
| 🗑 保留 | 24h 后定时清理 |
| RLS | `org_id = current` |

#### `litellm_keys`（虚拟 Key 生命周期，G2 补充）

| 项 | 内容 |
| --- | --- |
| 用途 | 工作区 ↔ LiteLLM 虚拟 Key 的映射与轮换链（**不存明文**，只存指纹与引用） |
| 字段 | `id`🔑, `org_id`🏷, `workspace_id`🔗, `key_fingerprint`⚡(sha256 of key), `key_ref`(KMS/Secret 引用), `litellm_key_alias`, `budget_usd`, `rpm_limit`, `tpm_limit`, `models`(text[], 允许集合), `status`(active/rotating/revoked), `rotated_from`(uuid), `expires_at`, `created_at`, `revoked_at` |
| 唯一 | `UNIQUE(key_fingerprint)`；`UNIQUE(workspace_id) WHERE status='active'` |
| 📇 索引 | `idx_lk_ws`(workspace_id, status)；`idx_lk_alias`(litellm_key_alias) |
| 🗑 保留 | 吊销后 180 天（对账需要） |
| RLS | `org_id = current` |
| 说明 | 轮换双 Key 灰度：新建 → 配置切换 → 观察 24h → 撤销旧；`models` 与 `model_policy_rules` 解析结果保持一致（双执行点） |

#### `quota_limits`（配额，G2 补充）

| 项 | 内容 |
| --- | --- |
| 用途 | 组织/用户/工作区三级配额（资源时长、token/月、并发、数量） |
| 字段 | `id`🔑, `org_id`🏷, `scope`(enum: org/user/workspace), `scope_id`(uuid/null), `resource`(enum: model_usd/tokens/workspaces/storage_gib/app_cpu_minutes/concurrent_sessions), `limit_value`(numeric), `used_value`(numeric, 可空=从 usage 聚合), `period`(enum: hour/day/month), `enforce_mode`(block/warn), `updated_at`, `created_at` |
| 唯一 | **表达式唯一索引**：`CREATE UNIQUE INDEX uq_quota_scope ON quota_limits (org_id, scope, COALESCE(scope_id,'00000000-0000-0000-0000-000000000000'::uuid), resource, period);`（uuid 不能用 `'0'` 比较） |
| 📇 索引 | `idx_quota_scope`(org_id, scope, scope_id) |
| 🗑 保留 | 永久（变更留审计） |
| RLS | `org_id = current` |
| 说明 | 执行点：LiteLLM（模型预算）+ 控制面（数量/并发）；80%/100% 双阈值告警（PRD-E10-02） |

#### `workspace_config_revisions`（配置漂移排查，G2 补充）

| 项 | 内容 |
| --- | --- |
| 用途 | 每次配置下发的不可变快照（drift 排查、回滚、审计） |
| 字段 | `id`🔑, `org_id`🏷, `workspace_id`🔗, `revision`(bigint), `config_hash`(sha256), `managed_hash`(sha256), `global_hash`(sha256), `skills`(jsonb), `mcp`(jsonb), `model`(text), `applied_at`, `applied_by`(agent), `status`(pending/applied/failed), `error`(text), `created_at` |
| 唯一 | `UNIQUE(workspace_id, revision)` |
| 📇 索引 | `idx_wcr_ws`(workspace_id, revision DESC) |
| 🗑 保留 | 90 天（失败项 1 年） |
| RLS | `org_id = current` |
| 说明 | 只存**摘要与 hash**，不存完整配置正文（正文在 ConfigMap/文件）；`status=applied` 由 agent 上报，用于验证 ≤30s 生效与 `config_stale` 告警 |

#### `audit_chain_heads`（防篡改锚点，G2 补充）

| 项 | 内容 |
| --- | --- |
| 用途 | 审计链锚点（每批审计的 hash 链头，定期锚定到 OSS/WORM 或外部时间戳） |
| 字段 | `id`🔑, `org_id`🏷(nullable=全局), `partition`(text, 如 `audit_logs_p202611`), `batch_start`, `batch_end`, `rows`(int), `prev_hash`, `batch_hash`, `anchor_ref`(OSS 对象/WORM 引用), `anchored_at`, `created_at` |
| 唯一 | `UNIQUE(partition, batch_start)` |
| 📇 索引 | `idx_ach_partition`(partition, created_at DESC) |
| 🗑 保留 | 永久（锚点删除即失去证明意义） |
| RLS | 服务角色专用；platform_admin 只读 |
| 说明 | `batch_hash = H(prev_hash || 排序后的 (id, action, actor, created_at, detail_hash) 连接)`；每日锚定一次到 OSS 不可变对象；用于证明审计未被篡改/删行 |

---

## 3.10 G2-08 中心表（9 张：中心自建，控制面只读共享 FK）

> 归属：`mcp_call_logs` 由控制面按月分区承载（审计/计费）；其余 8 张由各中心写入，控制面只做 FK 引用与只读校验。全部含 `org_id` + RLS + 保留期。

| 表 | 关键字段 | 唯一/索引 | 保留 | RLS |
| --- | --- | --- | --- | --- |
| `mcp_call_logs` | `id`🔑, `org_id`🏷, `mcp_server_id`, `binding_id`, `workspace_id`, `user_id`, `tool_name`, `status`(ok/denied/error), `latency_ms`, `request_hash`, `response_bytes`, `error`, `created_at` | 📇`(org_id, created_at)` 分区；📇`(mcp_server_id, created_at)` | 180 天（按月分区） | `org_id = current` |
| `skill_source_tokens` | `id`🔑, `org_id`🏷, `skill_id`, `version_id`, `workspace_id`, `user_id`, `token_hash`(sha256), `jti`⚡, `expires_at`, `revoked_at`, `created_at` | ⚡`UNIQUE(jti)`；📇`(workspace_id, expires_at)` | 过期 +7 天 | `org_id = current` |
| `eval_dataset_versions` | `id`🔑, `org_id`🏷, `dataset_id`, `version`, `content_hash`⚡, `cases_count`, `oss_prefix`, `immutable`(bool, 默认 true), `created_at` | ⚡`UNIQUE(dataset_id, version)`；⚡`UNIQUE(content_hash)` | 2 年 | `org_id = current` |
| `eval_specs` | `id`🔑, `org_id`🏷, `name`, `version`, `schema_version`, `spec`(jsonb), `created_by`, `created_at` | ⚡`UNIQUE(org_id, name, version)` | 2 年 | `org_id = current` |
| `eval_baselines` | `id`🔑, `org_id`🏷, `subject_type`(skill/model/app/agent), `subject_id`, `dataset_id`, `run_id`, `metrics`(jsonb), `is_active`, `created_at` | 📇`(subject_type, subject_id, dataset_id)` WHERE `is_active` | 2 年 | `org_id = current` |
| `eval_ci_links` | `id`🔑, `org_id`🏷, `run_id`, `provider`(github), `repo`, `pr_number`, `check_run_id`, `conclusion`, `created_at` | 📇`(run_id)`；📇`(repo, pr_number)` | 1 年 | `org_id = current` |
| `app_builds` | `id`🔑, `org_id`🏷, `app_id`, `build_no`, `status`(queued/running/succeeded/failed/canceled), `image_digest`, `sbom_key`, `provenance`(jsonb), `scan_report`(jsonb), `log_ref`, `started_at`, `finished_at` | ⚡`UNIQUE(app_id, build_no)` | 1 年（镜像 90 天） | `org_id = current` |
| `app_domains` | `id`🔑, `org_id`🏷, `app_id`, `domain`⚡, `status`(pending_verification/issuing/active/failed), `cert_ref`, `verified_at`, `created_at` | ⚡`UNIQUE(domain)` | 永久（失效即删） | `org_id = current` |
| `app_secrets` | `id`🔑, `org_id`🏷, `app_id`, `key`, `value_ref`(KMS 密文引用), `created_at`, `rotated_at` | ⚡`UNIQUE(app_id, key)` | 应用删除后 30 天 | `org_id = current` |

> **状态机落契约（G2-07）**：`app_builds.status` = `queued/running/succeeded/failed/canceled`；`app_deployments.status` = `pending/deploying/running/sleeping/failed/stopped`；`app_domains.status` = `pending_verification/issuing/active/failed`；`eval_runs.status` = `queued/preparing/running/collecting/grading/completed/failed/canceled/timed_out` —— 与 openapi 枚举一一对应，不得在中心文档另立一套。

---

## 3.9 新增表合计（G2 对齐补充）

`DATA-MODEL` 表总数：**46 张**（§3.1–§3.8 的 23 张 + §3.9 的 4 张 + §3.10 的 9 张 + §3.11 的 10 张）。
- §3.9 四张：G2 对齐 platform-backend `BACKEND.md §13`（A2–A5）；
- §3.10 九张：G2-08 中心表（中心自建，控制面只读共享 FK）；
- §3.11 十张：v3 工作流与 `human_tasks`（A6 收口，源 `services/WORKFLOW.md v0.4`）；
- 全部表含 `org_id` 租户键与 RLS 策略；`mcp_call_logs` 由控制面按月分区写入。

| 项 | 内容 |
| --- | --- |
| 用途 | 控制面 → Operator/Agent/审计的可靠投递 |
| 字段 | `id`🔑, `org_id`, `topic`, `payload`(jsonb), `status`(pending/in_flight/done/failed), `attempts`(int), `next_attempt_at`, `created_at`, `processed_at` |
| 📇 索引 | `idx_outbox_pending`(status, next_attempt_at) |
| 🗑 保留 | done 后 7 天 |
| RLS | 服务角色专用（非用户请求路径） |

---

## 3.11 工作流与人工任务表（A6 收口，2026-11-08）

> 来源：`services/WORKFLOW.md v0.4`（pm-research）§10；**引擎权威** = `adr/ADR-V3-04-workflow-engine.md`。全部带 `org_id` 租户键与 RLS；`human_tasks` 为**跨中心共享表**（App 发布/协同/工作流/数字人共用，禁止各中心另建审批表）。

| 表 | 关键字段 | 唯一/索引 | 保留 | RLS |
| --- | --- | --- | --- | --- |
| `workflow_definitions` | `id`🔑, `org_id`🏷, `slug`, `name`, `description`, `category`(sdlc/general), `visibility`(org/public), `latest_version_id`, `status`(draft/published/deprecated), `created_by`, `created_at` | ⚡`UNIQUE(org_id, slug)`；📇`(org_id, status)` | 2 年 | `org_id = current` |
| `workflow_versions` | `id`🔑, `org_id`🏷, `definition_id`, `version`(semver), `dsl`(jsonb), `dsl_hash`⚡, `schema_version`, `changelog`, `immutable`(bool, 默认 true), `published_at`, `created_by` | ⚡`UNIQUE(definition_id, version)`；⚡`UNIQUE(dsl_hash)` | 永久（不可变） | `org_id = current` |
| `workflow_instances` | `id`🔑, `org_id`🏷, `definition_id`, `dsl_version_id`, `runtime`(state_machine/temporal), `runtime_run_id`, `status`(pending/running/waiting_human/waiting_timer/succeeded/failed/canceled/compensating), `input_ref`(OSS), `output_ref`, `correlation`(jsonb: thread_id/trigger_event_id), `trigger_id`, `deadline_at`, `started_at`, `finished_at`, `error`, `created_by`, `created_at` | 📇`(org_id, status, created_at)`；📇`(definition_id)`；📇`(correlation->>'thread_id')` | 1 年（含 audit 引用） | `org_id = current` |
| `workflow_steps` | `id`🔑, `org_id`🏷, `instance_id`, `node_id`, `attempt`(int), `type`(agent/mcp_tool/human_approval/condition/parallel/subworkflow/timer/webhook/script/render), `status`(pending/running/waiting/succeeded/failed/compensated/skipped), `idempotency_key`⚡, `input_hash`, `output_ref`, `error`, `started_at`, `finished_at` | ⚡`UNIQUE(instance_id, node_id, attempt)`；📇`(instance_id, status)` | 1 年 | `org_id = current` |
| `workflow_events` | `id`🔑, `org_id`🏷, `instance_id`, `seq`(bigserial), `type`, `node_id`, `payload_hash`, `payload_ref`(OSS), `created_at` | 📇`(instance_id, seq)` 唯一；📇`(org_id, created_at)` 按月分区 | 热 180 天 + 归档 1 年 | `org_id = current` |
| `workflow_artifacts` | `id`🔑, `org_id`🏷, `instance_id`, `step_id`, `kind`(pr/code/report/file), `uri`(OSS/Git), `sha256`, `size_bytes`, `meta`(jsonb), `created_at` | 📇`(instance_id, kind)` | 随实例（1 年） | `org_id = current` |
| `workflow_triggers` | `id`🔑, `org_id`🏷, `definition_id`, `type`(manual/timer/webhook/im/git/ci/event), `config`(jsonb), `secret_ref`(KMS), `enabled`, `last_fired_at`, `created_at` | 📇`(org_id, enabled)`；📇`(definition_id)` | 永久（停用软删） | `org_id = current` |
| `workflow_dead_letters` | `id`🔑, `org_id`🏷, `instance_id`, `step_id`, `error`, `payload_ref`, `retry_count`, `status`(pending/replayed/ignored), `created_at`, `resolved_at` | 📇`(org_id, status, created_at)` | 1 年 | `org_id = current` |
| `human_tasks`（**共享**） | `id`🔑, `org_id`🏷, `scope`(app/collab/publish/workflow/dh), `subject_type`, `subject_id`, `instance_id`(nullable), `node_id`(nullable), `title`, `form`(jsonb), `assignee_type`(user/role/team), `assignee_id`, `sla_due_at`, `escalation_policy`(jsonb), `status`(pending/claimed/completed/expired/canceled), `decision`(approve/reject/request_changes), `decision_by`, `decision_at`, `comment`, `attachments`(jsonb, OSS 引用), `created_at` | 📇`(org_id, assignee_type, assignee_id, status)`；📇`(subject_type, subject_id)`；📇`(sla_due_at)` WHERE status='pending' | 2 年 | `org_id = current` |

**约束**
1. `workflow_versions.dsl` **不可变**（只 INSERT）；实例绑定 `dsl_version_id`，运行中不随 DSL 升级。
2. `human_tasks` 是唯一审批表：App 发布/协同审批/工作流人工节点/数字人转人工都写此表；`scope` 区分来源，审批人规则在各中心解析。
3. `workflow_events` 为回放权威：`replay(runId, fromSeq)` 只读此表，不依赖 Temporal history；迁移引擎不丢证据。
4. 取消/补偿：取消级联写 `workflow_events`，补偿按逆序写 `workflow_steps.status=compensated`；失败进 `workflow_dead_letters`。

---

## 4. RLS 方案

### 4.1 策略模板

```sql
-- 1) 所有业务表统一开启
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;   -- 表 owner 也受限

-- 2) 租户隔离策略（读+写共用）
CREATE POLICY tenant_isolation ON workspaces
  USING (
    org_id = current_setting('app.org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  )
  WITH CHECK (
    org_id = current_setting('app.org_id', true)::uuid
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

-- 3) 个人范围（工作区这类"org 内仍需 owner 限定"的表）
CREATE POLICY workspace_owner_only ON workspaces
  FOR ALL
  USING (
    org_id = current_setting('app.org_id', true)::uuid
    AND (
      owner_user_id = current_setting('app.user_id', true)::uuid
      OR current_setting('app.is_platform_admin', true) = 'true'
    )
  );

-- 4) 平台级共享行（org_id IS NULL 的公共模型/技能/MCP）
CREATE POLICY platform_shared_read ON models FOR SELECT
  USING (org_id IS NULL AND current_setting('app.org_id', true) IS NOT NULL);
```

### 4.2 覆盖矩阵

| 表 | 策略 |
| --- | --- |
| `users` | 自己的行 + platform_admin |
| `orgs` | `id = app.org_id` + platform_admin |
| `memberships`/`teams`/`team_members` | `org_id = app.org_id` |
| `api_keys` | `org_id = app.org_id AND user_id = app.user_id`（org admin 可看元数据但不看 hash） |
| `workspaces` | 见 `workspace_owner_only`（org admin 用 `v_workspaces_admin` 视图） |
| `workspace_events`/`snapshots` | `org_id = app.org_id` |
| `model_providers`/`models`/`mcp_servers`/`skills`/`eval_datasets` | `org_id = app.org_id OR org_id IS NULL` |
| `model_policies`/`rules`/`skill_versions`/`skill_installations`/`eval_runs`/`eval_results`/`apps`/`app_deployments`/`app_shares`/`mcp_bindings` | `org_id = app.org_id` |
| `usage_records`/`usage_hourly` | `org_id = app.org_id`（用户级聚合由 API 过滤 `user_id`） |
| `audit_logs` | `org_id = app.org_id OR platform_admin` |
| `idempotency_keys`/`outbox` | 服务角色（`app.org_id` 仍强制） |

### 4.3 防绕过检查（QA 必测）

1. **忘记 `SET LOCAL`**：连接池从 `pg_stat_activity` 采样，若存在未设置 `app.org_id` 的事务执行了业务查询 → 测试失败（可加 `pg_audit` 或应用层断言）。
2. **表 owner 绕过**：`FORCE ROW LEVEL SECURITY` 已覆盖；验证 `opencode_app` **非** owner。
3. **聚合泄漏**：`GROUP BY` 查询也必须带租户键；对 `usage`/`audit` 的跨租户聚合走 platform_admin 专用视图（审计留痕）。
4. **时序侧信道**：跨租户 `id` 查询必须返回 `404`（不返回 `403`），避免存在性探测；已授权但无权限返回 `403`。
5. **外键穿透**：所有跨表查询经 `(org_id, id)` 复合条件；禁止 `WHERE other_id = ?` 单键查。

---

## 5. 索引与性能要点

| 表 | 关键查询 | 索引/手段 |
| --- | --- | --- |
| `workspaces` | 我最近的工作区 | `(owner_user_id, state)` + `updated_at DESC` |
| `workspace_events` | SSE 续传 | `(workspace_id, seq)` |
| `usage_records` | 用量看板（时间范围+维度） | BRIN(occurred_at) + `(org_id, occurred_at)`；看板优先查 `usage_hourly` |
| `audit_logs` | 审计检索 | 复合 `(org_id, created_at)` + 资源/动作索引；分区裁剪 |
| `skills` | 名称搜索 | GIN tsvector（中文用 `zhparser` 或 pg_trgm `gin_trgm_ops`） |
| `eval_results` | 单 run 汇总 | `(run_id, status)`；避免全表 count，用增量计数器 |

**大表策略**：`workspace_events` / `eval_results` / `usage_records` / `audit_logs` 均按月分区（`PARTITION BY RANGE (created_at/occurred_at)`）；分区创建由 `pg_partman` 或控制面定时任务提前 3 个月创建。

---

## 6. 数据一致性与事务边界

| 场景 | 一致性要求 | 实现 |
| --- | --- | --- |
| 创建工作区 | 最终一致 | DB 写 `workspaces`(provisioning) + `outbox` 事件 → operator；DB 是意图真相，K8s 是实际真相 |
| 状态变更 | 最终一致（≤2s 推送） | operator 写 CR status → Watch → 控制面落 `workspaces.state` + `workspace_events`（单事务）+ 发 SSE |
| 销毁 | **强一致**（不可逆） | `DELETE` API 写 `destroy_scheduled_at` + 审计（同事务）→ 冷却期 → operator 删 PVC 前先快照 → `deleted` |
| 计量 | 幂等最终一致 | LiteLLM 拉取 + `ON CONFLICT(request_id) DO NOTHING` |
| 分享变更 | 最终一致（≤5s） | PG 写 + Redis 主动失效（pub/sub） |
| 审计 | **强一致**（同请求事务） | 审计与业务写同事务；跨服务审计走 outbox + 重试，失败进死信并告警 |

---

## 7. 迁移与演进

- 迁移工具：`node-pg-migrate` 或 Prisma Migrate（由 platform-backend 定，需在 `BACKEND.md` 声明）；**只允许前向迁移**，破坏性变更分三步（新增列 → 双写 → 删旧列）。
- 每张表必须有 `created_at`；大表新增列使用 `ADD COLUMN ... DEFAULT NULL`（避免全表重写）。
- 分区表变更需在分区模板上执行。
- 数据导出（R10.3）：按 `org_id` 导出 JSONL（用户/工作区元数据/技能安装/审计/用量），工具与格式由 backend 实现，**不含他人数据**。
- 删除（R10.3）：账号删除 → 匿名化 users，30 天内完成业务数据清理（工作区 PVC 按销毁流程），产出删除证明（审计事件 `compliance.purge_completed`）。

---

## 8. 与 opencode 上游的映射（不复制上游数据库）

| 上游（每 Pod SQLite） | 平台（PG） | 关系 |
| --- | --- | --- |
| `session` / `message` | 无 | 用户私有，留在工作区；平台只存统计（`usage_records`） |
| `project` | `workspaces` | 1:1 概念映射（platform 侧不需要上游 project 明细） |
| 配置文档 | `workspaces.config_revision` + ConfigMap | 平台不存配置正文（ConfigMap 即真相） |
| `skill` 发现结果 | `skill_installations` | 平台是意图，上游是结果 |
| `mcp` 连接状态 | `mcp_bindings` | 平台是授权，上游是连接 |
| token 统计（session/stats） | `usage_records`（对账） | 上游非权威 |

> **原则**：上游 SQLite 是"用户运行时私有数据"，平台**不读取、不复制、不备份到共享存储**（快照属于用户数据，按用户删除策略处理）。这既是隔离要求，也避免平台成为用户代码的囤积点。

---

## 9. 待对齐项（与 platform-backend / capability-centers）

| # | 项 | 现状 | 需要谁确认 |
| --- | --- | --- | --- |
| 1 | CRD `OpencodeWorkspace` spec/status 与 `workspaces` 表字段映射 | backend 已给字段清单（消息），本文按 `state↔phase` 映射 | platform-backend |
| 2 | `skills` 的 `manifest`/`permissions` JSON Schema | 草案已给（tools/mcp/network/fs） | capability-centers |
| 3 | `eval_datasets.schema` 与评分器定义 | 草案 jsonb | capability-centers |
| 4 | `app_deployments.status` 与构建流水线状态 | 草案 9 态 | capability-centers |
| 5 | `mcp_servers.transport` 枚举 | `stdio/sse/streamable_http` | capability-centers |
| 6 | `audit_logs.action` 命名规范 | 建议 `<resource>.<verb>`，见 SECURITY §8 | qa-reviewer |

---

## 变更记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v0.1 | 2026-11-04 | 初稿：ER + 23 表 + RLS 模板 + 保留/分区策略 |
