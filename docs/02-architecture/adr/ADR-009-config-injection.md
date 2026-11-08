# ADR-009：配置注入采用"托管 ConfigMap + 全局可写文件 + 文件热加载"

- 状态：**Accepted**
- 日期：2026-11-04
- 决策者：architect / platform-backend
- 关联：`ARCHITECTURE.md §7.4`、PLAN R2.6/R3.6

## 背景

平台要把"模型、技能、MCP、策略"统一下发到工作区，要求 ≤30s 生效、无需重启、用户不可绕过。上游配置体系（已核实）：多来源合并 + 文件监听热加载。

## 决策

**三层 + 双通道**：

| 层 | 位置 | 写入方 | 优先级 | 内容 |
| --- | --- | --- | --- | --- |
| L1 托管（强制） | `/etc/opencode/opencode.json`（ConfigMap `subPath` 只读） | Helm/Operator | **最高**（managedSettings 最后加载） | `policies`、`update:"disable"`、默认 `model`、**`providers.litellm.settings`（唯一允许出现 baseURL/apiKey 的层；apiKey 用 `{env:OPENCODE_LITELLM_KEY}` 引用，不落明文）** |
| L2 全局（可写） | `$OPENCODE_CONFIG_DIR/opencode.json`（默认 `~/.config/opencode/`） | workspace-agent（原子 rename） | 中 | `model`、`providers.litellm.models`（允许集/展示）、`skills[]`、`mcp.servers` —— **禁止** `baseURL`/`apiKey`/`settings`（BK-05 / G2-05） |
| L3 项目（用户态） | `/workspace/.opencode/opencode.json` | 用户/仓库 | 低 | agents/commands/instructions |

**热更新**：写文件 → 上游 `Config` watcher 触发重载（无需重启）；`spec.config.revision` + agent 上报 `configAppliedRevision` 用于确认生效。

## 备选方案

| 方案 | 否决理由 |
| --- | --- |
| **A. 只写托管配置（/etc/opencode）** | ConfigMap 更新有 kubelet 同步延迟（默认 60–120s），不满足 ≤30s；且 `subPath` 挂载**不会**热更新（`subPath` 是已知限制） |
| **B. 只写全局配置（可写）** | 用户/进程可能覆盖，模型策略可被绕过（安全红线） |
| **C. 用 `PATCH /api/experimental/config` 运行时改** | 只有全局文档；重启丢失；无法表达"强制"；并发写冲突 |
| **D. `OPENCODE_CONFIG_CONTENT` 环境变量注入** | 环境变量变更必须重启 Pod（违反 ≤30s/不重启）；且大 JSON 不适合 env |
| **E. 自研 sidecar 配置服务 + API 下发** | 上游已有 watcher，重复造轮子；不改上游是原则 |
| **F. 每次变更重建 Pod** | 中断会话，违反 R3.3/R2.6 |

## 后果

**正面**
- 强制项不可绕过（managedSettings 压过一切用户文件）——这是策略可信的基础。
- 用户偏好/技能/MCP 可在 30s 内热更新（写 L2 文件即可）。
- 无需改上游；升级兼容性风险低。

**负面 / 代价**
- 两个配置源，需明确"什么写哪里"（本文表格即规约），否则会出现"改了没生效"的支持问题。
- L1 使用 `subPath` 时无法热更新 → 强制项变更需滚动重启或在 L2 中放"可覆盖但被策略兜底"的部分。缓解：把易变的强制项（模型允许集合）放到 **LiteLLM Key 的 models 白名单**（即时生效），把**真正稳定**的强制项（baseURL、update:disable）留在 L1。
- 文件写入必须原子（`write tmp + rename`），否则 watcher 可能读到半个 JSON。
- 需要 agent 校验写后配置合法性（JSON parse + schema check），失败时保留旧文件并告警。

## 实现要点

```js
// workspace-agent 写 L2（原子）
const tmp = `${path}.tmp-${randomUUID()}`
await fs.writeFile(tmp, JSON.stringify(config), { mode: 0o600 })
await fs.rename(tmp, path)
```

- 优先使用 `fs.watch` 的上游实现，确保 `Config` 服务监听到 **deny 列表**（`/proc`, `/sys`）外的路径。
- **上游 v2 键名**：`providers.*.settings`（`options` 是 v1 兼容名，`normalize.ts` 迁移）；新配置一律用 `settings`。
- **密钥注入**：apiKey 用 `{env:OPENCODE_LITELLM_KEY}`（上游 `core/src/config/variable.ts` 支持环境变量替换），Secret → Pod env → 配置引用，避免明文落 ConfigMap。
- 配置 schema 由 platform-backend 维护（zod/JSON Schema），与上游 `schema/src/config.ts` 对齐；**未知字段不拒绝**（前向兼容），但必需字段缺失告警。
- 版本确认：`workspaces.config_revision` 与 agent 上报比对，不一致 >60s 告警（R2.6 的监控）。
- 回滚：保留上一版文件（`.bak`），agent 应用失败自动回滚。

## 验证

- 策略变更 → 30s 内工作区 `GET /api/model` 反映新集合（e2e）。
- 用户手改 L2 加 `baseURL`/`apiKey` → **agent schema 白名单拒绝** + 漂移告警 `config_drift_detected`（即使写入也无效：合并以 L1 为准，且 LiteLLM Key 白名单兜底）。
- 写入非法 JSON → 上游不受影响（agent 回滚）。
- 重启 Pod → 配置仍正确（ConfigMap + 上次 L2）。
