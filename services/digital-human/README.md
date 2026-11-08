# digital-human（数字人 L1 服务，M3）

OpenDream Cloud 数字人 **L1 文本/语音 MVP（演示级）**：会话状态机、文本消息 mock 回复、SSE 事件流、Webhook HMAC 回调。
Bun + Fastify 5 + Zod，内存 store（无 DB/GPU/RTC 依赖），端口 **4106**，仅集群内可达；公网/控制台经 control-plane 门面（task-41）访问。

- 设计要求：`docs/02-architecture/services/DIGITAL-HUMAN.md`（v0.7，M2 仅 L1，GPU 延后 M3）
- 契约口径：`docs/02-architecture/G-V4-CONTRACT.md §4`（1.1.0 canonical + MVP extension）
- 任务：shared task `task-39`（backend）/ `task-40`（console UI）

## 启动

```bash
cd services/digital-human
bun install          # 根 bun install 已覆盖 workspace 时可跳过
bun run dev          # http://127.0.0.1:4106
bun run test         # 25 cases（HTTP/SSE/Webhook/错误）
bun run typecheck    # tsc --noEmit
```

### 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `HOST` / `PORT` | `127.0.0.1` / `4106` | 监听地址/端口 |
| `NODE_ENV` | `development` | test 时自动关闭 Fastify 日志 |
| `DEFAULT_ORG_ID` / `DEFAULT_USER_ID` | 固定 UUID | 无 `x-oc-*` 租户头时的开发默认（生产由门面透传） |
| `SESSION_TTL_SECONDS` | `1800` | 会话最长存活；超时自动结束（`end_reason=ttl_expired`） |
| `RTC_TOKEN_TTL_SECONDS` | `300` | mock RTC token TTL（openapi 约定 ≤300s） |
| `MOCK_CONNECT_MS` | `120` | created→connecting→active 的 mock 建连耗时 |
| `MOCK_LLM_LATENCY_MS` | `120` | mock LLM 回复延迟 |
| `DEGRADED_LATENCY_MS` | `1500` | 单轮延迟超阈值 → `degraded`（音频/字幕兜底） |
| `MOCK_AUDIO_MS_PER_CHAR` | `60` | mock 音频时长估算 |
| `MAX_EVENTS_PER_SESSION` | `500` | SSE 事件回放上限（Last-Event-ID 只能回放最近 N 条） |
| `WEBHOOK_TIMEOUT_MS` / `WEBHOOK_MAX_ATTEMPTS` | `3000` / `2` | Webhook 投递超时/重试 |
| `SSE_HEARTBEAT_MS` | `15000` | SSE 心跳注释间隔 |
| `MOCK_SCENARIOS_ENABLED` | `1` | 演示/测试钩子开关（生产应设 `0`） |
| `MOCK_RENDER_MS` | `250` | mock 离线渲染任务完成耗时 |

## API

所有路径前缀 `/api/v1/dh`。租户以 `x-oc-org-id` / `x-oc-user-id` / `x-oc-roles` 头为准（control-plane 门面透传；服务本身不做用户鉴权）。
错误统一两层：`{ "error": { "code", "reason"?, "message", "details"?, "request_id" } }`。

### 资产（MVP extension，1.2 收编）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/v1/dh/avatars` | 2 个 L1 2D 形象（`id,name,tier,status,preview_url,manifest_url,license_ref`） |
| GET | `/api/v1/dh/voices` | 3 个音色（`id,name,provider,language,gender,style,status`） |

### 会话（canonical 1.1.0 + MVP 字段）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/v1/dh/sessions` | 会话列表（`?cursor&limit`，按创建时间倒序；仅本租户+本用户） |
| POST | `/api/v1/dh/sessions` | 创建会话（支持 `Idempotency-Key`，同 key 同 body 返回 200 + 原会话） |
| GET | `/api/v1/dh/sessions/{id}` | 会话详情 |
| DELETE | `/api/v1/dh/sessions/{id}` | 结束会话（canonical） |
| POST | `/api/v1/dh/sessions/{id}/input` | 文本输入（canonical `sendDhTextInput`；同步返回 mock 回复） |
| POST | `/api/v1/dh/sessions/{id}/messages` | 发消息（MVP alias of `/input`，返回 assistant 回复） |
| POST | `/api/v1/dh/sessions/{id}/end` | 结束会话（MVP alias of `DELETE`） |
| GET | `/api/v1/dh/sessions/{id}/events` | SSE 事件流（MVP extension）：`state` / `message` / `ended` / `error`，支持 `Last-Event-ID` |

**创建请求**（两种形态都接受，可混用）：

```jsonc
// canonical
{ "app_id": "<uuid>", "mode": "realtime|near_realtime|offline", "persona_ref": "av_l1_cartoon", "voice_ref": "vo_zh_female_warm" }
// MVP extension（task-39 / console UI）
{ "avatar_id": "av_l1_cartoon", "voice_id": "vo_zh_female_warm", "greeting": "您好，我是小云" }
```

**创建响应**（`DhSession` + task-39 字段）：

```jsonc
{
  "id": "<uuid>", "session_id": "<uuid>", "app_id": "<uuid>", "mode": "realtime",
  "status": "created", "state": "created",
  "avatar_id": "av_l1_cartoon", "avatar_name": "小云（2D 卡通）",
  "voice_id": "vo_zh_female_warm", "voice_name": "晓云 · 温暖女声",
  "rtc_url": "ws://mock-rtc.local/rooms/<uuid>",
  "rtc": { "room": "dh-<uuid>", "url": "ws://mock-rtc.local/rooms/<uuid>", "token": "dh_rtc_...", "expires_at": "..." },
  "token": "dh_rtc_...", "expires_in": 300,
  "usage": { "turns": 0, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "audio_ms": 0 },
  "created_at": "...", "started_at": null, "ended_at": null
}
```

**消息响应**（`POST /messages`）：

```jsonc
{
  "message_id": "<uuid>", "session_id": "<uuid>", "role": "assistant",
  "text": "我收到了您的消息：「...」。我是小云（2D 卡通），正在用晓云 · 温暖女声为您播报。",
  "state": "active", "latency_ms": 12,
  "usage": { "input_tokens": 8, "output_tokens": 30, "total_tokens": 38 },
  "session_usage": { "turns": 1, "input_tokens": 8, "output_tokens": 30, "total_tokens": 38, "audio_ms": 1800 },
  "created_at": "..."
}
```

`POST /input` 额外包一层：`{ "accepted": true, "state": "...", "reply": <上面的消息响应> }`。

### 事件流 SSE

```
GET /api/v1/dh/sessions/{id}/events
（可选请求头 Last-Event-ID: <seq> 或 query ?last_event_id=<seq>）
```

- 事件 `id` = 会话内单调递增 `seq`；先回放 `seq > Last-Event-ID` 的缓冲事件，再推实时事件。
- 帧格式：`id: 3\nevent: state\ndata: {"seq":3,"type":"state","session_id":"...","state":"active","ts":"..."}\n\n`
- 终态（`ended`/`error`）事件发出后服务端关闭连接；客户端可带 `Last-Event-ID` 重连补漏。
- 事件类型：`state`（created/connecting/active/degraded）、`message`（assistant 回复）、`ended`、`error`（含 `reason`）。

### 嵌入 token（canonical 1.1.0，mock）

`POST /api/v1/dh/embed-tokens` `{app_id, origin?, ttl?}` → `{token:"dhemb_...", app_id, expires_in, origin, expires_at}`（库中只存 `sha256(token)`，TTL ≤600s）。

### 离线渲染任务（canonical 1.1.0，mock）

`GET/POST /api/v1/dh/render-jobs`、`GET /api/v1/dh/render-jobs/{jobId}`；任务 state：`queued→running→succeeded`（`MOCK_RENDER_MS` 后 `output_ref=mock://dh/render/<id>.mp4`）。真实 GPU 渲染在 M3（known-gaps）。

### Webhook（MVP extension，1.2 正式化）

`POST /api/v1/dh/webhooks` `{url, events?, description?}` → 201：

```jsonc
{ "webhook_id": "<uuid>", "url": "...", "events": ["dh.session.*","dh.message"],
  "status": "active", "secret": "whsec_...", "secret_masked": "whsec_****abcd", ... }
```

- `secret` **仅注册时返回一次**；`GET /api/v1/dh/webhooks` 只回显 `secret_masked`。
- 事件名：`dh.session.created` / `dh.session.connecting` / `dh.session.active` / `dh.session.degraded` / `dh.session.ended` / `dh.session.error` / `dh.message`；
  `events` 支持精确名与 `dh.session.*` 通配；缺省订阅全部。
- 投递：`POST <url>`，body `{id,type,created_at,data}`，headers：
  - `x-dh-event: <type>`
  - `x-dh-delivery: <uuid>`
  - `x-dh-signature: t=<unix 秒>,v1=<hex(hmac-sha256(secret, "${t}.${rawBody}"))>`
- 失败按 `WEBHOOK_MAX_ATTEMPTS` 重试（fire-and-forget，不阻塞会话请求）。
- 注：L1 不校验 URL 私网/SSRF（仅门面 admin 可注册）；真实环境需 SECURITY §6.1 私网阻断。

## 状态机

```
created ──(mock 建连)──> connecting ──> active ──(延迟超预算/降级模拟)──> degraded
   │                        │             │                                  │
   └────────── 首条消息自动提升 ──────────┘                                  │
                                                                          └──> ended（用户结束/TTL）
active/degraded/connecting/created ──(TTS/RTC/lip-sync 故障)──> error ──> ended（可结束）
```

- 同一 org+user 同时只允许 1 个活跃会话（再次创建 409 `dh_session_active`）。
- `error`/`ended` 为终态；终态后发消息 409；`POST /end` 与 `DELETE` 幂等。

## 错误 reason（openapi 1.1.0 `ErrorReason`，不新增）

| 场景 | HTTP | code | reason |
| --- | --- | --- | --- |
| 已有活跃会话 | 409 | `conflict` | `dh_session_active` |
| 形象不可用 | 409 | `conflict` | `dh_avatar_unavailable` |
| 音色未授权 | 403 | `forbidden` | `dh_voice_unauthorized` |
| TTS 故障（mock） | 503 | `model_gateway_unavailable` | `dh_tts_unavailable` |
| RTC 故障（mock） | 503 | `model_gateway_unavailable` | `dh_rtc_unavailable` |
| lip-sync 故障（mock） | 503 | `model_gateway_unavailable` | `dh_lipsync_failed` |
| 内容安全拦截（mock） | 403 | `forbidden` | `dh_content_blocked` |
| 跨租户 / 未知会话 | 404 | `not_found` | —（不泄露存在性） |
| 参数非法 | 400 | `validation_failed` | — |

演示钩子（`MOCK_SCENARIOS_ENABLED=1`）：`POST /messages` body 可带
`simulate: "degraded" | "tts_unavailable" | "rtc_unavailable" | "lipsync_failed" | "content_blocked"`，用于 UI/QA 覆盖降级与错误态。

## 契约映射（G-V4-CONTRACT §4）

| task-39 MVP 路径 | 1.1.0 canonical | 处置 |
| --- | --- | --- |
| `POST /sessions/{id}/messages` | `POST /sessions/{id}/input` | 两者都实现；MVP 名为 1.2 alias |
| `POST /sessions/{id}/end` | `DELETE /sessions/{id}` | 两者都实现；MVP 名为 1.2 alias |
| `GET /avatars`、`GET /voices` | 无 | MVP extension（1.2） |
| `GET /sessions/{id}/events`（SSE） | 无 | MVP extension（1.2） |
| `POST /webhooks` | 无 | MVP extension（1.2；HMAC 已实现） |
| `embed-tokens`、`render-jobs*` | canonical | 已实现（mock） |

## 已知限制（演示级）

| # | 限制 | 计划 |
| --- | --- | --- |
| L1-1 | LLM/TTS/RTC/lip-sync/渲染全部 mock；无真实 WebRTC 房间 | M3 GPU/实时链路 |
| L1-2 | 内存 store：重启丢失；单实例；无 Redis 多副本 | M3 落库 `dh_sessions/dh_turns` |
| L1-3 | 无 GPU 预算/并发配额执行（`dh_gpu_budget_exceeded`/`dh_concurrency_exceeded` 仅契约占位） | M3 配额 |
| L1-4 | Webhook 无 SSRF 私网阻断、无死信/重放窗口 | M3 安全加固 |
| L1-5 | `render-jobs` 为 mock 状态推进，无真实产物 | M3 离线渲染 |
| L1-6 | 服务自身不做鉴权/RBAC（信任 `x-oc-*` 内网头） | 门面/NetworkPolicy 保证 |

## 测试

`bun run test` 25 cases：
- HTTP：资产/创建/查询/canonical 字段/幂等/发消息/`/input` alias/结束/错误/租户隔离/降级/内容拦截/embed token/render job/webhook/healthz；
- SSE：终态回放、`Last-Event-ID` 续传不重复、实时 message、错误事件后关流、跨租户 404；
- Webhook：HMAC 验签、事件类型覆盖、事件过滤、非法 URL 400。
