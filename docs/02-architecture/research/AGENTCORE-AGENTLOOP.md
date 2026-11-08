# AgentCore × AgentLoop：运行时与质量治理边界（精炼版）

- 2026-11-18；范围：AWS Bedrock AgentCore、阿里云 AgentLoop、LangSmith/Langfuse、E2B/Firecracker、回测/回放。
- 方法：官方文档为准；【事实】= 文档明示，【推断】= 研究判断。来源见文末 8 条。

## 1. AWS Bedrock AgentCore 公开能力【事实】

AgentCore 不是单一运行时，而是 **13 个可独立使用的服务**：Harness、Runtime、Memory、Gateway、Identity、Code Interpreter、Browser、Observability、Evaluations、Optimization、Policy、Registry、Payments。

| 服务 | 要点 |
| --- | --- |
| Runtime | Serverless 托管；**每 session 一个独立 microVM**（CPU/内存/文件系统隔离，结束即销毁并清内存）；microVM ≤8h、Instances ≤14d；支持 MCP/A2A/AG-UI、HTTP+WebSocket、100MB payload、OTEL 追踪 |
| Harness | 托管 agent loop（模型/工具/指令声明式）；每 session microVM+文件系统+shell；可切模型；版本+命名 endpoint 灰度/回滚；底层 Strands |
| Gateway | 把 API/Lambda/已有服务转 MCP 工具，或连接已有 MCP server；工具级鉴权/治理/版本 |
| Identity | Agent 身份/访问管理；兼容 Cognito/Okta/Entra/Auth0；入站+出站（OAuth/API key）认证 |
| Memory | 短期（会话内）+ 长期（跨会话偏好/事实/摘要），可跨 agent 共享 store |
| Observability | 统一 trace/debug/monitor，OTEL 兼容，可看每步 prompt/工具调用/中间输出 |
| Policy | 在 **Gateway 边界拦截每次工具调用**；Cedar（兼容 Dogwood）+ 自然语言生成；支持 temporal 与 guardrail 条件；deny-by-default；决策进 CloudWatch 审计 |
| Evaluations | 内置/自定义 evaluator、LLM-as-Judge；在线/按需/批量/数据集；**Simulation** 用 LLM 扮演用户做多轮回归；基于 OTEL/OpenInference |
| Optimization | 基于 trace+评估生成 prompt/工具描述改进建议，版本化配置 + A/B 验证 |

**判断【推断】**：AgentCore 卖的是"托管执行 + 边界治理原语"打包；Evaluations/Optimization 是运行时邻接的质量信号，但数据集/实验治理仍轻，且绑定 AWS 与 CloudWatch。

## 2. 阿里云 AgentLoop 核实【事实】

**存在，且是真实商用产品**：官方文档定义 AgentLoop = **Agent Observation and Optimization**，一站式自进化 Agent 平台，能力包括：
1. **全栈可观测**：trace/metrics/logs，UModel 建 Agent→Tool→Model 拓扑，STAROps 诊断；
2. **行为审计**：工具调用/决策分支防篡改证据链，异常行为（越权/数据外泄）检测；
3. **评测**：Agent-as-a-Judge（评估器本身是 agent，可用工具/多步推理），内置+自定义，覆盖输出/RAG/工具调用/轨迹；
4. **实验**：Playground 做 agent/LLM 在线对比实验（文档称计划 2026-06-30 前正式发布）；
5. **数据中心**：数据集 CRUD/向量检索；**Trace2Dataset** 把线上 trace 转金标/坏例集；
6. **Memory/资产/上下文**：集中式 memory、prompt/skill 版本+评审+canary、memory+经验库的 context engineering 闭环。

**它不是运行时**：官方强调不绑定框架/运行时，兼容 Dify、LangChain/LangGraph、AgentScope、OpenClaw、Hermes，以及运行时 **AgentRun、AgentTeams、ACS** 与第三方。限制：50 AgentSpace、trace 保留 30 天、单账号评测并发 100。

**不要混淆**：AgentScope 是开源 agent 框架（agentscope.io）；百炼（Model Studio）是 Agent 应用平台（RAG/插件/版本发布）；AgentBay 是云沙箱（browser/desktop/code/mobile）；**AgentLoop 是质量治理平面**。

## 3. LangSmith / Langfuse：可观测+评测+实验的成熟形态【事实】

- **LangSmith**：trace/thread/run 视图；基于 trace 建数据集；在线评估与 automations（规则/webhook/在线 eval）；dashboard/告警；datasets+experiments 回归；cloud/hybrid/self-hosted。
- **Langfuse**：开源可自托管；trace→observation 嵌套数据模型；token/成本追踪；scores、LLM-as-Judge、prompt 管理、datasets/experiments；自定义 dashboard/告警。

两者都覆盖"观测→数据集→评测→实验"闭环，但**不提供 agent 运行时/沙箱/工具网关**——与 AgentLoop 的"跨运行时质量平面"定位一致。

## 4. 沙箱与回测/回放：三个概念别混用

- **E2B**：云沙箱 SDK（sandbox/templates/network/secrets/commands），面向 AI 生成代码执行；Firecracker 官网把 E2B 列为使用方【事实】。
- **Firecracker**：KVM microVM，<125ms 启动、单机 150 microVM/s、<5MiB 开销、仅 5 个模拟设备、jailer 二次隔离；是隔离执行底座，不含 agent 语义【事实】。
- **回放 Replay**：对已发生 trace 重放/时间旅行调试（如 AgentOps）；要求确定性（记录模型版本/temperature/seed/工具结果，或只回放工具序列）【推断】。
- **回测 Backtest**：固定数据集+evaluator 对版本批量比较（LangSmith/Langfuse experiments、AgentLoop 的历史数据集回归）【事实+推断】。
- **仿真 Simulation**：LLM 扮演用户/环境生成多轮对话（AgentCore Simulation），更接近真实分布但成本/方差更高【事实+推断】。

## 5. 职责边界：Runtime 与质量闭环是正交平面，不是上下层

### 5.1 拥有 / 不拥有

| 平面 | 拥有 | 不拥有 |
| --- | --- | --- |
| **Runtime（AgentCore Runtime 型）** | 执行单元与生命周期、session 隔离（microVM/容器）、扩缩容/冷启动、文件系统与网络、入站/出站身份、工具连接（Gateway/MCP）、trace 发射（OTEL）、策略执行点（PEP） | 评测标准与数据集治理、跨版本实验设计、跨运行时质量对比、业务验收指标、长期数据资产 |
| **质量治理（AgentLoop 型）** | trace 接入与拓扑、证据链/审计、evaluator 与 Agent-as-Judge、数据集/Trace2Dataset、实验（A/B/回测）、版本质量门禁、资产/上下文/记忆优化 | agent 执行与沙箱、身份颁发、工具路由与策略**执行**（可建议/验证策略，不替代 PEP）、运行时扩缩容 |

**结论**：Runtime 的边界是"安全可扩展地跑起来 + 边界确定性治理"；质量平面的边界是"可观测、可评估、可实验、可审计地变好"。二者通过 **OTEL trace + 版本标识 + 策略决策日志** 交接，而非互相包含。

### 5.2 对"五层架构"的批判

1. **AgentCore 横跨多层**：Runtime/沙箱属执行面，Gateway/Identity/Policy 属控制面，Memory/Observability/Evaluations 属数据/质量面——把它当"执行层"会漏掉治理能力。
2. **AgentLoop 不属于任何单层**：它是对所有层输出的横切质量平面，与执行面正交。
3. 所以"五层中 AgentCore=第4层、AgentLoop=第5层"的相邻假设**不成立**。正确模型是**功能平面**（执行/工具动作/上下文记忆/质量证据/治理控制），产品与平面多对多映射，而非产品堆叠成层。

## 6. 对 OpenDream 的启示【推断/建议】

**可借鉴**
1. 执行面做薄、接口做厚：session=隔离单元（microVM/gVisor/E2B 协议），Runtime 只负责跑与隔离，输出 `session/run/toolcall` 标准事件。
2. PEP 外置：工具策略在网关/沙箱边界执行（OPA/Rego 或 Cedar），agent 代码不可绕过；`policy_decision_id` 进 trace。
3. 质量面独立：自建或集成 Langfuse/LangSmith 式 trace+evaluator+dataset+experiment，**跨运行时**接入 OpenCode/Claude Code/Codex/第三方 agent。
4. Trace2Dataset + 发布门禁：坏例自动入集；发布前跑回归（数据集+Agent-as-Judge），指标不过不发布；灰度/canary/回滚。
5. 回放与回测分家：回放要确定性；回测要数据集快照+可复现环境；不要用"重跑一遍"冒充回放。
6. 沙箱先行：Firecracker/E2B 类 microVM + 快照/fork、池化复用（成本中心）。

**反模式**：可观测当 APM 日志；单轮 LLM-as-Judge 代替轨迹评估；策略写在 prompt（可注入绕过）；评测/实验绑定单一运行时；trace 无租户隔离/无限保留；回测用实时流量无快照；把托管 Harness 当唯一路径。

**差异化机会**：中国云/私有化 + K8s 原生 + 数据不出域；"证据优先"（hash 链审计+可回放 trace+可复现评测）；质量面可观测**任何 agent**；token/GPU/沙箱秒级成本治理；开源适配层（OTel/OPA/E2B），不重造 AgentCore 全栈。

## 7. 关键数据模型（最小共识）

| 对象 | 关键字段 |
| --- | --- |
| Session | id, tenant_id, agent_version_id, runtime, isolation_ref, state, created_at, expires_at, trace_id |
| Run | id, session_id, parent_run_id, status, input, output, model, tokens, cost, latency, error |
| Step/ToolCall | run_id, seq, kind(model/tool/retrieval), tool_name, args_hash, result_ref, status, policy_decision_id, sandbox_id |
| Trace/Span | trace_id, span_id, parent_span_id, gen_ai.*(OTEL), attributes, events, status |
| Evaluator | id, kind(builtin/custom/agent_as_judge), prompt/skill/tools, output_schema, version |
| EvalRun | id, dataset_id, evaluator_ids[], target_version, status, metrics[], samples[] |
| Experiment | id, variants[], traffic_split, metrics, significance, guardrail_gates |
| Backtest/Replay | id, source_trace_ids 或 dataset_snapshot, mode(replay/regression), diff_vs_baseline |
| Policy | engine, rules(Cedar/Rego), effect, scope, temporal/guardrail conditions, decision_log |
| AuditEvent | event_id, actor, action, resource, decision, hash_prev, hash_self, ts |

## 8. 一页结论

1. AgentCore 不是"运行时层"，而是"运行时+边界治理原语"的打包；Runtime 管隔离执行/身份/Gateway/Memory/OTEL/PEP。
2. AgentLoop 真实存在（阿里云 Agent Observation and Optimization），是**跨运行时质量治理平面**：观测/审计/评测/实验/Trace2Dataset/资产与上下文优化；不是运行时。
3. 二者正交，不是相邻两层；边界=Runtime 管"跑与隔离+边界 PEP"，质量面管"可观测/可评估/可实验/可审计"。
4. 五层假设需修正：产品≠层，按功能平面建模（执行/工具/上下文/质量/治理），产品多对多映射。
5. OpenDream 应做"运行时适配层 + 质量证据平面"：PEP 外置、评价先行、Trace2Dataset、回放/回测分家、沙箱池化；差异化在私有化/国产云/跨 agent 可观测与成本治理。

## 9. 来源（8）

1. AWS, *What is Amazon Bedrock AgentCore?* — <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html>
2. AWS, *Host agent or tools with AgentCore Runtime* — <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agents-tools-runtime.html>
3. AWS, *Policy in AgentCore* — <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html>
4. AWS, *AgentCore Evaluations* — <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/evaluations.html>
5. 阿里云, *What is AgentLoop* — <https://www.alibabacloud.com/help/en/agentloop/product-overview/what-is-agentloop>
6. LangSmith, *Observability* — <https://docs.langchain.com/langsmith/observability>
7. Langfuse, *AI Observability & Application Tracing* — <https://langfuse.com/docs/observability/overview>
8. Firecracker, *Secure and fast microVMs* — <https://firecracker-microvm.github.io/>

> 交叉核对（非正式来源）：E2B Docs <https://docs.e2b.dev>；AWS Simulation <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/simulation.html>；Azure Foundry <https://learn.microsoft.com/en-us/azure/ai-foundry/agents/overview>；AgentOps <https://www.agentops.ai/>。
