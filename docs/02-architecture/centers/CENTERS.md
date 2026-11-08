# 能力中心方案（CENTERS）· 总览与对齐结论

> 本文件是 `docs/02-architecture/centers/` 的入口；详细设计拆分在四份分册，**以分册为准**。公共约定见 [README.md](README.md)。

## 1. 交付物

| 分册 | 范围 | 关键决策 |
| --- | --- | --- |
| [SKILL-CENTER.md](SKILL-CENTER.md) | 包规范/审核/发布/分发/安装/回滚/扫描/统计 | 分发走**路径令牌** URL 源（禁止 query 签名）；每安装项一条 `skills[]` URL；token 15min + agent 5min 续签；`skill.yaml` 平台清单 + `SKILL.md` 原生 frontmatter |
| [EVAL-CENTER.md](EVAL-CENTER.md) | 数据集/任务/评分器/沙箱/复现/报告/A-B/准入/CI | K8s Job + **RuntimeClass 强隔离抽象**（gVisor 优先，Kata/runV 可替代；无强隔离记 DEGRADED）；默认禁网；三层可复现口径（N=3/方差≤5%）；Skill 发布强 gate |
| [APP-CENTER.md](APP-CENTER.md) | 创建/构建/1C2G/分享/SSO/域名/回滚/日志/休眠 | rootless BuildKit → ACR（digest 唯一真值）；`public`=平台内已登录用户（匿名禁止）；分享 ID 128-bit + 票据 ≤5min |
| [MCP-HUB.md](MCP-HUB.md) | 注册/目录/凭证/代理/审计/绑定/降级 | 企业 MCP 一律走 Hub 代理（凭证不下发）；transport 枚举 `stdio|sse|streamable_http`；stdin 仅白名单；`mcp.use` 策略兜底 |

## 2. 对 architect 四个问题的结论（openapi/DATA-MODEL 对齐口径）

1. **Skill 包字段**：最终 JSON Schema 见 [SKILL-CENTER.md 附录 A](SKILL-CENTER.md#附录-askillyaml-json-schemaV1供-data-modelopenapi-落列)。落表口径：`skill_versions` 用 `semver/manifest jsonb/permissions jsonb/resource_paths text[]/archive_sha256/signature/signing_key_id`；`skills` 用 `(org_id, slug)` 唯一、`latest_version_id uuid`。权限枚举：`tools: [read,write,edit,bash,webfetch,websearch,task,skill,mcp,pty]`；`network.egress: string[]`；`filesystem.{read,write}: string[]`；`secrets: [A-Z0-9_]`。
2. **评测表字段**：见 [EVAL-CENTER.md §9 字段/枚举契约](EVAL-CENTER.md#9-数据模型增量表均带-org_id--rls)。`eval_runs.status` 九态、`target_type ∈ {skill,workspace_snapshot,app}`；`eval_case_results` PK `(run_id, case_id)`。
3. **应用构建回传与状态**：ACR 仓库 `<acr>/oc/<env>/apps/<org_slug>/<app_slug>`，tag `rev-<revision_uuid>`，部署只认 digest；`app_deployments.status ∈ {pending,deploying,running,sleeping,failed,stopped}`；`app_builds.status ∈ {queued,running,succeeded,failed,canceled}`；构建回传 `image_ref/image_digest/sbom_key/provenance/scan_report` → `app_revisions`。
4. **MCP**：`mcp_servers.transport ∈ {stdio,sse,streamable_http}`；健康检查协议见 [MCP-HUB.md §7.1](MCP-HUB.md#71-探活)，探针 60s、`initialize`+`tools/list`、3 失败→down、2 成功→healthy；`mcp_server_versions.auth_type ∈ {none,api_key,header,oauth2}`。

## 3. ID 与 API 约定（已按 architect 口径修订）

- 路径参数/FK 一律 **uuid**；`slug` 为唯一键（`(org_id, slug)`；app slug 全局唯一用于域名）。
- 按 slug 解析端点：`/api/v1/skills/by-slug/{org_slug}/{skill_slug}`、`/api/v1/apps/by-slug/{slug}`。
- 统一错误包/幂等键/游标分页/状态机 409 见 [README.md §2](README.md)。

## 4. 裁决与关闭项（lead Q1–Q6 + architect 确认）

| # | 事项 | 结论（已落地到分册） |
| --- | --- | --- |
| Q1 | 评测强隔离 | 改为 **RuntimeClass 抽象**：gVisor runsc 优先、ACK 安全沙箱 Kata/runV 可替代；无强隔离记 **DEGRADED**，不得宣称 R5.2 满足 / G5 PASS（EVAL §4.2） |
| Q2 | MCP stdio 凭证 | 远程 MCP 凭证不出 Hub；**stdio 仅无凭证白名单**；凭证型 stdio 降 **M5.2 + 安全审批**（MCP §4.2/§12） |
| Q3 | Skill 包大小 / 域名依赖 | MVP 包 **≤10MB**，超限走异步分发；自定义域名需用户 ICP 备案 + DNS，绑定页前置说明与错误码（SKILL §3.1/§5.5、APP §8） |
| Q4 | Cookie/域名 | 控制台会话 `__Host-oc_session`（无 Domain）+ 独立可注册域；对齐 architect ADR-004（APP §7.1/A15） |
| Q5 | CI 降级 | GitHub App 无凭证时允许"手动触发 + webhook"，G5 记 DEGRADED + lead 豁免（EVAL §6） |
| Q6 | 可复现 | 三层口径：环境/过程/结果；LLM N=3、通过率方差 ≤5%，CI 只保证下界（EVAL §5） |
| A1 | Skill 分发 token | architect 批准 **15min TTL + agent 5min 双 token 续签**（ADR-010）；**续签连续失败 3 次：保留旧 token 至过期 + 告警 + 停止写配置**（SKILL §5.2） |
| A2 | 错误码 | wire 一律 `lower_snake`；发布门禁 → **409 `code=precondition_failed` + `reason=gate_blocked`**（architect C 裁定，不用 412）；eval run 失败是 `200 + status=failed`（README §2.2） |
| A3 | 表结构差异 | `skill_versions` 以我侧 `resource_paths text[]` 为准（architect 已标注待对齐）；`eval_runs` 采纳 9 态；`eval_case_results.case_id` 为 text |
| A4 | 应用状态 | `app_deployments` **不承载构建态**（pending/deploying/running/sleeping/failed/stopped）；构建态只在 `app_builds`（queued/running/succeeded/failed/canceled） |
| A5 | MCP 健康接口 | **GET `/mcp-servers/{serverId}/health`（读历史）+ POST `/mcp-servers/{serverId}/health-check`（主动探活）均在 openapi（architect canonical）**；原重复定义已去重（BK-06/architect G2-06） |
| A6 | MCP binding token | 仅 `Authorization` header，不入 URL/日志；内部 HTTPS 域；TTL ≤ 工作区生命周期；绑 `(workspace_id, binding_id)`；轮换走配置热更新（MCP §4.2） |

## 5. 风险摘要（G2 需确认）

| # | 风险 | 影响 |
| --- | --- | --- |
| R1 | 分发 token 续签依赖 agent；连续失败会停止更新（已设计降级） | 技能源无法更新，但已装技能仍可用 |
| R2 | 目标 ACK 是否提供强隔离 RuntimeClass（gVisor/Kata） | 缺失则评测记 DEGRADED，R5.2/G5 需 lead 豁免 |
| R3 | 1C2G 应用无持久化 | 有状态应用体验受限，需产品确认 |
| R4 | 上游无技能调用计量 | 统计只能是近似值，需在 PRD 标注 |
| R5 | MCP 调用日志 180 天留存 | 成本与配额模型需一起评估 |
