# ADR-V3-03：数字人实时链路 —— 分层流式管线 + WebRTC SFU + GPU 池分档

- 状态：**Accepted（建议）**
- 日期：2026-11-08
- 决策者：architect（与 pm-research / infra-devops 联合）
- 关联：`ARCH-V3.md §8`、`services/DIGITAL-HUMAN.md`（pm + infra 主笔）、`ADR-V3-01`（MCP 工具调用）

## 背景

数字人应用要求：语音/文本对话、口型与动作自然、可嵌入企业门户/IM/客服、7×24、可分享（App 的一种类型）、可调用企业 MCP 工具（CRM/订单/知识库）。核心约束是**实时延迟**与**GPU 成本**。

链路：`麦克风/文本 → ASR → LLM/Agent（可调 MCP）→ TTS → lip-sync/动作 → RTC 推流 → 用户`。

候选：全自研端到端；采购云厂商 RTC/数字人服务；自建分层管线（ASR/TTS/口型用开源或云 API）+ WebRTC SFU。

## 决策

**分层流式管线 + 自建 WebRTC SFU + GPU 推理池，按延迟分三档；数字人只是 App Center 的一种应用类型（复用权限/分享/审计）。**

### 1) 链路与延迟预算（交互档，voice-to-voice **P50 ≤1.2s / P95 ≤1.8s**，与 `DIGITAL-HUMAN.md:212` 对齐）

| 阶段 | 方案 | 预算（P50） | 备注 |
| --- | --- | --- | --- |
| 采集/编码 | WebRTC（Opus 48k） | 40ms | 客户端 SDK |
| ASR | 流式（分片 200–300ms） | 200ms | 可替换云 ASR |
| LLM/Agent | 流式 token（首 token 优先） | 500ms | 首句先出，不等全文；工具调用时先播过渡语 |
| TTS | 流式（按句/短语切分） | 150ms | 首包即播 |
| lip-sync/渲染 | GPU 推理 + 合成 | 120ms | 2D 贴图优先，3D 降级 |
| 网络/RTC | SFU 转发 | 60ms | 同地域 |

> 关键设计：**"首句优先"流水线**（LLM 首句即送 TTS、TTS 首包即渲染），不要等整段生成；否则延迟不可控。

### 2) 运行时组件

| 组件 | 选型 | 说明 |
| --- | --- | --- |
| WebRTC SFU | **LiveKit（自托管）** 默认；备选 SRS/mediasoup | 房间 = 会话；数据通道传字幕/事件；支持服务端推流录制 |
| ASR | 云 API 或自托管（Whisper 流式/FunASR） | 可插拔 Provider 接口 |
| LLM/Agent | 统一走 Model Gateway（LiteLLM） | **数字人不直连模型供应商**；工具调用走 MCP Gateway |
| TTS | 云 TTS 或自托管（CosyVoice 类） | 音色资产版本化、授权校验 |
| Lip-sync/渲染 | GPU 服务（2D 贴图 / 3D 驱动） | 按会话并发扩缩 |
| 合成/编码 | GPU 或 CPU（720p@25fps 起） | 可降级到 540p |
| 资产 | OSS + CDN | 形象/音色/动作/背景；签名 URL |
| 控制 | `digital-human-control`（控制面） | 形象/音色/场景编排、RTC token、配额 |

### 3) 三档服务等级（成本与体验显式分级）

| 档位 | 形态 | 延迟 | 成本 | 场景 |
| --- | --- | --- | --- | --- |
| **Realtime** | 双向语音 + 口型 + 动作 | ≤800ms P50 | 高（GPU 常驻/弹性） | 客服、接待、直播 |
| **Near-real-time** | 文本/语音输入，视频回放式 | 1–3s | 中 | 培训、播报 |
| **Offline** | 脚本渲染成视频 | 分钟级 | 低（批处理/spot） | 营销视频、课件 |

### 4) 并发与 GPU 容量（`[推断]`，需真机压测校准）

```
单卡 A10（24GB）：2D 口型渲染 ≈ 8–12 路 720p@25fps 并发（含编码）
3D 驱动：≈ 3–5 路/卡
TTS（自托管 GPU）：≈ 20–40 并发流（视模型）
→ 100 路 Realtime 并发 ≈ 10–14 张 A10（含 30% 冗余）+ TTS 3–5 张
```

- KEDA 按 `digital_human_sessions_active` 扩缩 GPU Worker；冷启动预热镜像 + 模型常驻（warm pool）。
- **超卖保护**：每档并发配额（org 级），满载时新会话排队或**降级为 Near-real-time/纯语音**。

### 5) 安全与合规（数字人是高风险场景，必须显式）

- **形象/音色授权**：上传需上传者声明授权（肖像权/声音权），平台存授权凭证；企业资产仅组织内可见。
- **深度伪造防护**：默认输出 **不可见/可见水印**（可配强制）；禁止用于未授权真人仿冒；对外 API 调用记录 audit。
- **RTC 令牌**：短 TTL（≤5min）、绑定 `session_id+user/tenant`、一次性（或可续期）；房间隔离（一会话一 room）。
- **内容安全**：ASR/TTS/文本经过内容审核钩子（可配）；违规会话终止并审计。
- **凭证**：MCP/模型凭证一律经 Gateway，数字人运行时**不持有**上游凭证。
- **数据**：音视频默认不落盘（仅流式）；录制需显式开启 + 保留策略 + 访问审计。

## 备选方案

| 方案 | 评价 | 结论 |
| --- | --- | --- |
| **A. 采购云厂商数字人/RTC 整体方案** | 上线快；但强绑定、按路计费成本高、定制（企业 MCP/审批/私有化）受限、数据驻留风险 | 否决为默认；可作为 Realtime 档的**备用供应商**（Provider 抽象） |
| **B. 纯 RTMP/HLS 推流** | 单向、延迟 2–10s，无法双向对话 | 否决（只能用于 Offline/Near-real-time） |
| **C. 自建 WebRTC SFU + 分层管线（采纳）** | 可控、可私有化、可组合最优 ASR/TTS；工程复杂度与 GPU 运维成本高 | **采纳** |
| **D. 客户端渲染（浏览器 lip-sync）** | 省 GPU；但移动端/低端设备体验差、版权资产下发不可控 | 否决（可作为 P2 轻量档） |
| **E. 全自研 3D 引擎** | 成本与周期不可接受 | 否决（用 2D 贴图/第三方 3D SDK） |

## 后果

**正面**
- 延迟预算清晰（首句优先流水线），可按档位选择成本。
- 复用统一 Model/MCP Gateway：数字人天然拥有企业工具能力，凭证统一治理。
- 复用 App Center 权限/分享/审计：数字人应用与 Web/Agent/工作流应用同一套治理。
- Provider 抽象（ASR/TTS/lip-sync/RTC）避免单点绑定。

**负面 / 代价**
- GPU 成本高且波动：必须配额 + 排队 + 降级；否则容易被单租户打爆。
- 运维复杂：SFU、GPU 池、TTS/ASR 服务、录制存储、CDN 都要 7×24。
- 端到端延迟受网络影响大；跨地域体验差（MVP 单地域）。
- 合规要求高（肖像权/水印/内容审核），需要产品与法务配合。

## 实现要点

```yaml
# digital-human session（控制面创建）
session:
  id: dhs_...
  app_id: app_...
  tenant: acme
  mode: realtime | near_realtime | offline
  persona_ref: oss://dh/personas/...
  voice_ref: oss://dh/voices/...
  llm: { via: model-gateway, model_alias: default }
  mcp_bindings: [crm, kb]
  rtc: { sfu: livekit, room: dhs_..., token_ttl_s: 300 }
  limits: { max_duration_s: 3600, max_turns: 200, concurrency: 1 }
```

- 会话状态机：`created → connecting → active → degraded(audio_only) → ended/error`。
- 首句优先：LLM 流式 → 句子切分 → TTS 流式 → 渲染队列；字幕经 data channel 同步。
- 降级顺序：3D→2D 静态贴图 → 纯音频 → 文本回复 + HLS 回放。
- 录制（可选）：SFU 服务端合成 → OSS；带水印；保留 7 天（可配）。

## 验证

- 延迟：同地域 Realtime **P50 ≤1.2s / P95 ≤1.8s**（voice-to-voice）；含 MCP 工具调用的回合单列（允许 +300ms，先播过渡语）。
- 并发：100 路 Realtime 压测，GPU 利用率 ≤85%，无 OOM，降级策略生效。
- 安全：未授权形象/音色使用被拒；水印存在；RTC token 重放 401；越权房间加入被拒。
- 工具：数字人通过 MCP 调 CRM 查询成功且审计完整（含 session/user/tool）。
- 故障：SFU 单副本故障会话迁移/重连 ≤5s；GPU 池满载时排队与降级可用。
