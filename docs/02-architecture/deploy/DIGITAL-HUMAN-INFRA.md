# 数字人基础设施依赖（DIGITAL-HUMAN-INFRA）

- 版本：v0.1（task-28 支援；2026-11-08）
- Owner：`infra-devops`（基础设施部分）；产品/API/数据模型见 [DIGITAL-HUMAN.md](../services/DIGITAL-HUMAN.md)（pm-research 主笔）
- 关联：[AI-GATEWAY.md](AI-GATEWAY.md)（统一入口/`dh-*` 路由）、[ARCH-V3.md](../ARCH-V3.md) §8/§10、[DEPLOYMENT.md](DEPLOYMENT.md)（ACK 基线）
- 写作用域：`docs/02-architecture/deploy/`；**不 commit**

---

## 0. 结论摘要

1. **GPU**：ACK 独立 GPU 节点池，A10 24GB（gn7i，实时主力）/ L20 48GB（gn8is，高配，`[推断]`）；`dh-infer`（实时，time-slicing 2–4 副本）与 `dh-render`（离线，独立节点池 + taint，MIG/独占）分命名空间；≥2 AZ、PDB、GPU autoscaler（缩容延迟 ≥10min）。
2. **RTC**：自建 **LiveKit SFU**（默认）+ **SRS**（RTMP/HLS）；UDP 7881/7882 + TURN/TLS 443 兜底；**RTC 媒体流不进 WAF/HTTP 网关**，走独立四层 SLB（支持 UDP）+ 安全组；阿里云 RTC 仅 P2 feature flag 兜底。
3. **带宽**：720p@25fps ≈1.5–2.5 Mbps/路；100 并发 ≈250 Mbps（峰值 375 Mbps）；EIP/共享带宽包按 **500 Mbps** 预留；模型/API 流量走内网。
4. **存储**：资产/产物 OSS + CDN；离线渲染单条 ≤500MB、保留 30 天（生命周期分层）；签名 URL 防直链；GPU 节点本地 NVMe 模型缓存。
5. **模型/licence**：FunASR（Apache-2.0）、CosyVoice（Apache-2.0 代码/权重待法务）、MuseTalk（MIT 依赖待复核）、**Wav2Lip 禁商用默认**；GPU 推理 Triton（BSD-3）或 FastAPI+ONNX/TensorRT。
6. **成本基准**（`[假设]`，需价格 API 复核）：A10 按量 ≈ **¥7/h**（pm 假设，本机口径 ¥6–10/h 区间）；2 路/卡时 GPU 单路 ≈¥3.5/h ≈ **¥0.058/分钟**；加 30% 冗余 + 带宽/存储/RTC ≈ **¥0.11–0.13/分钟**（720p 实时），与 DIGITAL-HUMAN §13 一致。
7. **M1/M2 建议**：M2 按 lead 决策**GPU 非硬依赖**；联调可先开 **1–2 张 A10**（`dh-infer` 最小池，1 节点 1 卡），M3 再扩多 AZ/多卡。GPU 配额需在阿里云工单确认（见 §9）。

---

## 1. 范围与边界

| 本文件负责 | 不负责（引用） |
|---|---|
| GPU 节点池/共享策略/调度/弹性；RTC/LiveKit/SRS/TURN 的网络与部署；媒体带宽/SLB/安全组；OSS/CDN 存储；观测（DCGM）；7x24；成本校准 | 会话协议/状态机/API（DIGITAL-HUMAN.md）；模型算法/评分（pm + 算法）；统一入口路由（AI-GATEWAY.md）；计费/账单（平台 E10） |

---

## 2. GPU 节点池

### 2.1 规格与节点池

| 节点池 | 实例（`[推断]`，以账号可售为准） | GPU | 用途 | 标签/污点 |
|---|---|---|---|---|
| `dh-infer-a/b` | `ecs.gn7i-c8g1.2xlarge`（8 vCPU/30 GiB/1×A10 24GB） | A10 | 实时 ASR/TTS/lip-sync；每节点可多卡（多台实例） | `dedicated=dh-infer:NoSchedule`，`nvidia.com/gpu.present=true` |
| `dh-render` | 同 gn7i 或 L20（`gn8is`） | A10/L20 | 离线渲染（独占/MIG） | `dedicated=dh-render:NoSchedule`，独立节点池 |
| `dh-rtc`（CPU） | 8C16G ×3 | — | LiveKit SFU / SRS / dh-gateway | `dedicated=dh-rtc:NoSchedule` |

- **安装**：NVIDIA GPU Operator（driver/device-plugin/DCGM exporter/GFD）；RuntimeClass 用标准 **`nvidia`**（无需自定义 `sandbox-runtime`；评测沙箱独立）。
- **节点 OS**：Alibaba Cloud Linux 3；关闭自动升级（GPU 驱动/内核兼容），升级走节点池分批 + 排空。
- **AZ**：`dh-infer` ≥2 AZ（3 AZ 更佳）；PDB `minAvailable: 1`（实时推理 Deployment 每 AZ 至少 1 副本）。
- **弹性**：cluster-autoscaler 管 `dh-infer`（缩容延迟 **≥10min**，避免抖动）；`dh-render` 可用竞价/低优先级，可中断重试。

### 2.2 GPU 共享与隔离

| 模式 | 适用 | 配置 | 风险 |
|---|---|---|---|
| **time-slicing（默认）** | 实时（A10），并发优先 | GPU Operator device plugin `time-slicing` ConfigMap，`replicas: 2–4`；`nvidia.com/gpu.shared` | 显存争抢 → 需按模型显存预算调度（TTS/ASR/lip-sync 分别限并发） |
| **MIG（仅离线）** | `dh-render` 隔离档 | A10 有限 profile（需真机验证）；或 L20/A100 | 切分粒度/兼容性；不作为实时默认 |
| **独占** | 高保真渲染/大模型 | `nvidia.com/gpu: 1` + taint | 成本高，仅按需 |

- **命名空间**：`dh-infer`（实时，PSA restricted + `runtimeClassName: nvidia`）；`dh-render`（离线 Job，独占/MIG，NetworkPolicy 默认拒绝 + 仅 OSS 内网上传）。
- **配额**：按"会话槽位（slot）"限并发（每租户 slot 数由控制面下发）；GPU 资源用 `ResourceQuota`（`requests.nvidia.com/gpu`）防单租户打满。
- **隔离**：进程级（容器）+ NetworkPolicy + 只读根 + 非 root；**不做多租户共享同一模型进程**（会话数据隔离风险）。

---

## 3. RTC 与媒体

### 3.1 组件

| 组件 | 镜像/来源 | 副本 | 暴露 | 说明 |
|---|---|---|---|---|
| LiveKit SFU | `livekit/livekit-server`（Apache-2.0） | 3（每 AZ 1） | **四层 SLB**：UDP 7881/7882（RTC）、TCP 7880（信令/WSS） | 房间/发布/订阅；内置 TURN（或独立 coturn） |
| TURN/TLS | LiveKit 内置 / coturn | 2 | TCP 443（TLS） | 企业 NAT 兜底；证书用通配符 |
| SRS | `ossrs/srs`（MIT） | 2 | 四层 SLB：TCP 1935（RTMP）、8080（HLS） | RTMP ingest → HLS/FLV；直播档 |
| dh-gateway | 自研（DH Control） | 3 | Higress `*.dh` HTTP 路由 | 会话 API/信令；RTC token 签发 |

### 3.2 网络

- **四层 SLB**：公网 LB（`LoadBalancer` Service + `mixedProtocolLBService: true`）暴露 UDP 7881/7882 + TCP 443/7880；安全组仅放行这些端口；**WAF 只接 `*.dh` HTTP**，不处理媒体。
- **UDP 端口**：LiveKit 默认 UDP 7881（单端口可复用）或 50000–60000 范围；**优先单端口 7881**（便于安全组/SLB），TURN/TLS 443 兜底。
- **带宽**：单路 720p 1.5–2.5 Mbps；100 并发 250 Mbps（峰值 375）；预留 **500 Mbps**（EIP/共享带宽包），RTC 与 API 分 SLB/带宽。
- **内网**：DH 服务↔LiveKit↔ASR/TTS 走 ClusterIP；GPU 节点在私网子网，无公网 IP；模型权重走 OSS 内网 endpoint。

### 3.3 延迟与容量（与 DIGITAL-HUMAN 对齐）

| 指标 | 目标 | 说明 |
|---|---|---|
| 会话建立 P95 | ≤2s | 含 token/房间创建 |
| 语音往返 P95 | ≤1.8s（M3）/ ≤3s（M2 放宽） | ASR→LLM→TTS→lip-sync |
| lip-sync | ≥25fps@A10，单卡 2–4 路 720p | time-slicing 2–4 |
| TTS 首包 | ≤300ms | 流式分块 |
| ASR partial | ≤300ms | 流式 |

---

## 4. 存储与 CDN

| 对象 | 方案 | 策略 |
|---|---|---|
| 形象/音色/动作资产 | OSS 私有 Bucket（SSE-KMS） | 前缀 `tenant/<id>/dh/assets/`；版本化；签名 URL（≤15min） |
| 渲染产物 | OSS + CDN（私有回源鉴权） | 单条 ≤500MB；30 天保留后转低频/归档；生命周期规则 |
| 模型权重 | OSS 内网 endpoint | GPU 节点本地 NVMe 缓存（`emptyDir`/本地盘），启动预拉 |
| 会话录音/视频 | **默认不落盘**（DIGITAL-HUMAN §10.3） | 需显式开启 + 告知 + 30 天保留 |
| 审计/用量 | SLS/OSS WORM + `dh_usage_records` | 365 天（合规） |

---

## 5. 7x24 与可观测

- **多 AZ**：`dh-infer` ≥2 AZ；LiveKit 3 副本跨 AZ；SLB 健康检查；会话断线重连（≤30s）。
- **弹性**：HPA（dh-gateway/LiveKit 按连接/CPU）、KEDA（ASR/TTS 队列深度、渲染队列）、GPU 节点 autoscaler。
- **降级**：GPU 不足 → 排队 + 半实时（RTMP/文件）档；LiveKit 故障 → 已建立会话短时重连，新会话降级 HLS；模型服务降级 → 预置话术/转人工。
- **Watchdog**：GPU XID/ECC/温度/降频、DCGM 指标、LiveKit 房间数、TURN 失败率、SRS 推流中断；只读诊断 → 人工确认 → 自动修复（P2）。
- **观测**：DCGM exporter（GPU 利用率/显存/温度/降频）、LiveKit Prometheus、SRS 指标、`dh-gateway` OTel；SLO 面板对齐 DIGITAL-HUMAN §12。

---

## 6. 成本校准（`[假设]`，需价格 API 复核）

> 目的：给 DIGITAL-HUMAN §13 替换 `【假设】`；单价为 2026-11 中国站目录价量级（未含折扣），T7 用 `DescribePrice` 复核。

### 6.1 GPU 单价与月度固定成本

| 项 | 假设单价 | 月成本（元） | 备注 |
|---|---|---|---|
| A10 24GB（gn7i，1 卡） | **¥7/h**（区间 ¥6–10/h `[推断]`） | 7×24×30 ≈ **¥5,040/卡** | 按量；包月/节省计划可降 20–40% |
| L20 48GB（gn8is，1 卡） | **¥12–16/h** `[推断]` | ≈ **¥8,640–11,520/卡** | 高配档，待报价 |
| GPU 池最小联调（M2/M3 前） | 1×A10 | **≈¥5,040/月** | M1/M2 可先开 1 卡（见 §9） |
| 实时池基线（M3） | 2 节点 ×1 A10（≥2 AZ） | **≈¥10,080/月** | 2 路/卡 → 4 路并发基线 |
| 离线渲染池 | 1×A10（可竞价） | ¥3,000–5,040/月 | 低优先级/可中断 |
| CPU 池（LiveKit/SRS/gateway） | 3×8C16G | ≈¥3,000/月 | 与 gateway 池可共享 |
| 带宽 500 Mbps | 共享带宽包 | ≈¥3,000/月 | 峰值预留 |
| OSS/CDN/存储 | 1–2 TB + CDN | ≈¥500–1,500/月 | 按量 |
| **M3 基线合计** | | **≈¥16,000–20,000/月** | 4 路实时 + 1 卡离线 + RTC |

### 6.2 单路分钟成本（与 DIGITAL-HUMAN §13 对齐）

| 成本项 | 计算 | ¥/分钟 |
|---|---|---|
| GPU（A10 ¥7/h，2 路/卡） | 3.5/h ÷ 60 | **0.058** |
| ASR/TTS/LLM（模型网关按 token） | 0.5–1.5/h | 0.008–0.025 |
| 带宽（2 Mbps，¥0.8/Mbps/月摊） | — | 0.007 |
| RTC/存储/基础设施摊销 | — | 0.008 |
| **合计（理论）** | | **0.082–0.098** |
| **加 30% 冗余/峰值** | | **0.11–0.13/分钟** |

> 结论：与 DIGITAL-HUMAN §13.1（¥0.11–0.13/分钟）一致。**关键敏感度**：每卡路数（2→4 路可把 GPU 成本减半）、GPU 单价（¥7→¥6/h 降 14%）、空闲会话超时（120s）与 TTS 缓存。

### 6.3 离线渲染

| 项 | 计算 | 成本 |
|---|---|---|
| 渲染（A10 独占，1 分钟视频 ≈1–2 分钟 GPU） | ¥7/h × 1–2 min | ¥0.12–0.23/分钟视频 |
| 存储/CDN（≤500MB/条，30 天） | — | ¥0.1–0.3/条 |
| **合计** | | **≈¥0.2–0.5/分钟成品视频**（不含重试；竞价 GPU 可再降） |

---

## 7. 部署清单（建议新增，T7 落地）

```
deploy/digital-human/
├── namespace.yaml            # dh-infer / dh-render / dh-rtc（PSA restricted）
├── gpu/
│   ├── node-pools.md         # 实例规格/AZ/taint/autoscaler（Terraform 引用）
│   ├── time-slicing-configmap.yaml
│   └── dcgm-servicemonitor.yaml
├── rtc/
│   ├── livekit-deployment.yaml   # 3 副本 + LoadBalancer(UDP/TCP) + PDB
│   ├── turn-deployment.yaml      # TURN/TLS 443
│   └── srs-deployment.yaml       # RTMP/HLS
├── infer/
│   ├── asr-deployment.yaml       # FunASR
│   ├── tts-deployment.yaml       # CosyVoice
│   └── lipsync-deployment.yaml   # MuseTalk（license gate）
├── networkpolicy.yaml
└── quota.yaml
```

> 本轮不落盘该目录（task-27 写作用域为 `deploy/gateway/`）；作为 M3 前置交付清单，T7 落地。`*.dh` HTTP 路由见 `AI-GATEWAY.md` §3.2/§8。

### 7.1 脚本与证据口径（计划，供 DIGITAL-HUMAN/WORKFLOW 引用）

| 交付 | 计划路径 | 口径（命令/环境变量/输出） |
|---|---|---|
| 数字人压测 | `scripts/verify/dh-loadtest.mjs` | `DH_BASE_URL`、`CONCURRENCY`、`DURATION_S`、`SCENARIO=realtime|half|render`；输出 JSON `{p50,p95,errors,first_frame_ms,gpu_util}`；结果写 `docs/05-delivery/evidence/dh/` |
| GPU/推理验收 | `scripts/verify/dh-gpu-smoke.mjs` | `GPU_NODE`/`NAMESPACE=dh-infer`；检查 DCGM 指标、单卡并发 2/4 路、TTS 首包/ASR partial/lip-sync fps；失败 exit≠0 |
| Runbook | `docs/05-delivery/RUNBOOK.md` 的 `#digital-human` 章节 | GPU 掉卡/降频、LiveKit 房间异常、TURN 失败率、渲染队列积压的处置步骤 |
| 成本快照 | `scripts/t7/cost-snapshot.mjs`（T7） | 调价格 API 生成 `docs/05-delivery/evidence/cost/gpu-YYYYMMDD.json`，回填本文 §6 与 DIGITAL-HUMAN §13 |

> 以上路径为**计划**（T7 落地）；pm 可在 DIGITAL-HUMAN §11.1/§12 先引用路径占位，落地后以实际文件为准。压测脚本与 Runbook 口径将同时用于 WORKFLOW §12.2 第 7 条（Temporal/工作流压测）的 SLO 对齐。

---

## 8. 与 DIGITAL-HUMAN.md 的对齐表

| DIGITAL-HUMAN 章节 | 本文件对应 | 状态 |
|---|---|---|
| §11 基础设施依赖表 | §2–§5 | ✅ 一致 |
| §11.1 现有制品与缺口 | §7 部署清单 + AI-GATEWAY §8 | ✅ 缺口已列 |
| §13 成本模型 | §6 | ✅ 校准（A10 ¥7/h、2 路/卡、¥0.11–0.13/min） |
| §14 里程碑 | §9（M1/M2 GPU 配额） | ✅ M2 GPU 非硬依赖 |
| §10.3 数据保留/合规 | §4（默认不落盘） | ✅ |

---

## 9. GPU 配额与 M1/M2 联调建议

- **现状**：当前环境**无 GPU 节点**（本地/此前 ACK 均未创建）；GPU 实例库存与配额需在目标账号确认（工单）。
- **M1/M2（GPU 非硬依赖，lead 决策）**：先用 CPU 降级（L1 形象/文本+音频文件/WS 回放）验证编排/API；GPU 相关延迟/并发/成本验收延后到 M3。
- **联调建议（M2 末/M3 前）**：先开 **1 张 A10**（`dh-infer` 单节点、单卡、time-slicing=2），验证：TTS 首包/ASR partial/lip-sync 帧率/单卡 2 路；通过后扩到 **2 节点 ×1 卡（≥2 AZ）**。
- **配额 checklist**：① GPU 实例配额（gn7i/gn8is）② 弹性伸缩组配额 ③ 共享带宽包 500Mbps ④ 四层 SLB（UDP）白名单 ⑤ NVIDIA GPU Operator 所需 DaemonSet 权限。

---

## 10. 风险与待验证

| ID | 风险/待验证 | 级别 | 对策 |
|---|---|---|---|
| DHI-1 | A10/L20 实际单价与库存（地区/账号差异） | 高 | T7 价格 API + 工单；成本表标 DEGRADED |
| DHI-2 | ACK 四层 SLB 对 UDP 7881/7882 的支持与安全组配置 | 高 | 真机联调；TURN/TLS 443 兜底 |
| DHI-3 | A10 MIG profile 能力（离线隔离档） | 中 | 真机验证；不支持则用独占节点池 |
| DHI-4 | time-slicing 显存争抢导致实时卡顿 | 高 | 按模型显存预算限并发 + 压测；必要时独占 |
| DHI-5 | LiveKit/SRS 版本与 K8s/内核兼容 | 中 | 版本锁定 + 回归 |
| DHI-6 | 模型权重许可（CosyVoice/MuseTalk） | 高 | 法务确认（G2 行动项），未通过不用默认 |
| DHI-7 | RTC 媒体数据合规（出境/录制） | 高 | 数据驻留 + 默认不落盘 + 合规评审 |
| DHI-8 | GPU 节点故障转移 ≤30s | 中 | 多副本 + 会话重连 + 演练 |

---

## 11. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v0.1 | 2026-11-08 | 初版：GPU 池/RTC/网络/存储/7x24/成本校准/M1-M2 配额建议 |
