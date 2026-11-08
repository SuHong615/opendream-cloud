# Skill Center（G5 服务骨架）

基于 **FROZEN** 契约（`docs/02-architecture/openapi.yaml`）与 `docs/02-architecture/centers/ROUTES.md` 的 Skill 中心骨架（19 公开 ops + 内部/分发端点）。

## 启动

```bash
cd services/skill-center
bun install          # 首次（根 bun install 已覆盖 workspace 时跳过）
bun run dev          # http://127.0.0.1:4101
bun run test         # bun:test（契约 + 领域）
bun run typecheck    # tsc --noEmit
```

环境变量：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 监听地址 |
| `PORT` | `4101` | 服务端口 |
| `NODE_ENV` | `development` | development/test/production |
| `DEFAULT_ORG_ID` | 固定 UUID | 无租户头时的开发默认 org |
| `DEFAULT_USER_ID` | 固定 UUID | 无租户头时的开发默认 user |
| `DEFAULT_ORG_SLUG` | `acme` | by-slug 解析用 |
| `TOKEN_SECRET` | dev 值 | 分发 token HMAC 密钥（生产必须覆盖） |
| `TOKEN_TTL_SECONDS` | `900` | 分发 token TTL（15min，与 ADR-010 一致） |

租户模拟：请求头 `x-oc-org-id` / `x-oc-user-id` / `x-oc-org-slug`（G5 骨架先此方式；G4 控制面就绪后换 OIDC/网关注入）。

## 已实现（公开 19 ops，operationId 与冻结契约一致）

- Skills：`listSkills`、`createSkill`、`resolveSkillBySlug`、`getSkill`、`updateSkill`、`deleteSkill`
- Versions：`listSkillVersions`、`createSkillVersion`、`getSkillVersion`、`publishSkillVersion`
- Review：`submitSkillVersionReview`、`reviewSkillVersion`、`yankSkillVersion`、`rollbackSkillVersion`
- Stats：`getSkillStats`
- Installations：`installSkill`、`listSkillInstallations`、`updateSkillInstallation`、`uninstallSkill`

内部（不注册公开网关、不进 SDK）：

- `POST /internal/skills/{skillId}/source-token`（15min token，绑定 installation）
- `GET /internal/skills/source-keys`
- 分发（独立 listener 语义，本骨架同进程）：`GET /s/{orgSlug}/{skillSlug}/{version}/{token}/index.json`、`GET .../{file}`

## 契约要点

- 门禁：`publishSkillVersion` 在扫描未通过或缺少 `eval_run_id` 时返回 **409 `precondition_failed` + `reason: gate_blocked`**（`details.gate_kind`）。
- 错误：两层 `{error:{code,reason?,message,details?,request_id}}`；`code` 复用 `packages/shared` 的 16 枚举。
- 分页：`?cursor&limit` → `{items,next_cursor}`，默认 20 / 上限 100。
- 版本状态：`SkillVersionSummary.status ∈ {draft,published,yanked}`（与 openapi 一致）；审核中间态在骨架内用 `review_state` 保存，不新增 wire 枚举。

## 未实现 / 后续（G5 集成阶段）

| 项 | 说明 |
| --- | --- |
| 持久化 | 当前内存 store；`src/store.ts` 即 repository 接口，接 PG/SQLite 时替换实现 |
| 真实签名/扫描 | 骨架记录 `archive_sha256`/`signature` 字段；扫描器、Ed25519 签名、OSS 存储待接评测中心/基础设施 |
| 评测 gate | `eval_run_id` 目前由 create 请求带入（骨架）；集成后改为调用 eval-center `GET /internal/eval/...` 校验 |
| 分发内容 | 文件内容为占位文本；接 OSS 后按 `files[].path` 流式返回并校验 sha256 |
| 认证/授权 | 租户头模拟；接 G4 控制面后改为网关主体 + RBAC |
| 审计/计量 | 骨架未写 audit_logs；集成阶段通过 outbox 写入 |
| 观测 | 预留 OTel span 名 = operationId；指标接入平台 Prometheus |

## 契约自检

```bash
cd services/skill-center
bun run test
# contract.test.ts 断言：
#  - 公开 ROUTES ⊆ openapi 路径，且 operationId 全部命中冻结契约
#  - 8 个 x-p2-deferred 路径不出现
#  - /internal/* 不在公开 ROUTES
#  - 门禁错误为 409 + precondition_failed + gate_blocked
```
