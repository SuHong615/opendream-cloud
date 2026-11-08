// Offline diagram renderer: builds SVG from compact specs, then screenshots to PNG via Playwright Chrome.
// No CDN / no mermaid dependency. Mermaid sources remain the authoring format (*.mmd).
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const FONT = "Microsoft YaHei, Segoe UI, Arial, sans-serif";
const PALETTE = [
  { fill: "#eef2ff", stroke: "#4f46e5", text: "#1e1b4b" },
  { fill: "#ecfeff", stroke: "#0891b2", text: "#164e63" },
  { fill: "#f0fdf4", stroke: "#16a34a", text: "#14532d" },
  { fill: "#fff7ed", stroke: "#ea580c", text: "#7c2d12" },
  { fill: "#fdf2f8", stroke: "#db2777", text: "#831843" },
  { fill: "#fef9c3", stroke: "#ca8a04", text: "#713f12" },
];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function flowSvg(d) {
  const W = 250, COL = 130, PAD = 50;
  const cols = d.layers.length;
  const width = PAD * 2 + cols * W + (cols - 1) * COL;
  const pos = {};
  let maxBottom = 0;
  d.layers.forEach((ids, ci) => {
    const x = PAD + ci * (W + COL);
    let y = 110;
    ids.forEach((id) => {
      const label = d.nodes[id] || id;
      const lines = label.split("\n");
      const h = 24 + lines.length * 20;
      pos[id] = { x, y, w: W, h, lines };
      y += h + 26;
    });
    if (y > maxBottom) maxBottom = y;
    if (d.colTitles && d.colTitles[ci]) {
      // drawn later as header
    }
  });
  const height = maxBottom + 40;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  s += `<rect width="100%" height="100%" fill="#ffffff"/>`;
  s += `<text x="${PAD}" y="34" font-family="${FONT}" font-size="20" font-weight="700" fill="#0f172a">${esc(d.title)}</text>`;
  if (d.subtitle) s += `<text x="${PAD}" y="58" font-family="${FONT}" font-size="12" fill="#64748b">${esc(d.subtitle)}</text>`;
  // column headers
  d.layers.forEach((ids, ci) => {
    const x = PAD + ci * (W + COL);
    const t = (d.colTitles && d.colTitles[ci]) || "";
    if (t) s += `<text x="${x + W / 2}" y="86" text-anchor="middle" font-family="${FONT}" font-size="13" font-weight="600" fill="#334155">${esc(t)}</text>`;
  });
  // edges under boxes
  (d.edges || []).forEach(([a, b, label]) => {
    const p = pos[a], q = pos[b];
    if (!p || !q) return;
    const x1 = p.x + p.w, y1 = p.y + p.h / 2;
    const x2 = q.x, y2 = q.y + q.h / 2;
    let midx = (x1 + x2) / 2;
    s += `<path d="M${x1},${y1} C${midx},${y1} ${midx},${y2} ${x2},${y2}" fill="none" stroke="#94a3b8" stroke-width="1.4"/>`;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const ax = x2 - 9 * Math.cos(ang), ay = y2 - 9 * Math.sin(ang);
    s += `<path d="M${x2},${y2} L${ax - 4 * Math.sin(ang)},${ay + 4 * Math.cos(ang)} L${ax + 4 * Math.sin(ang)},${ay - 4 * Math.cos(ang)} Z" fill="#94a3b8"/>`;
    if (label) {
      const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2;
      const tw = label.length * 7 + 10;
      s += `<rect x="${lx - tw / 2}" y="${ly - 17}" width="${tw}" height="15" rx="3" fill="#ffffff" opacity="0.92"/>`;
      s += `<text x="${lx}" y="${ly - 6}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="#475569">${esc(label)}</text>`;
    }
  });
  // boxes
  d.layers.forEach((ids, ci) => {
    const c = PALETTE[ci % PALETTE.length];
    ids.forEach((id) => {
      const p = pos[id];
      s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.4"/>`;
      p.lines.forEach((ln, i) => {
        s += `<text x="${p.x + p.w / 2}" y="${p.y + 22 + i * 20}" text-anchor="middle" font-family="${FONT}" font-size="12.5" fill="${c.text}">${esc(ln)}</text>`;
      });
    });
  });
  s += `</svg>`;
  return { svg: s, width, height };
}

function seqSvg(d) {
  const PAD = 50, PW = 150, GAP = 70;
  const n = d.participants.length;
  const width = PAD * 2 + n * PW + (n - 1) * GAP;
  const top = 100, rowH = 46;
  const height = top + d.messages.length * rowH + 60;
  const cx = (i) => PAD + i * (PW + GAP) + PW / 2;
  const pIdx = (name) => d.participants.indexOf(name);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  s += `<rect width="100%" height="100%" fill="#ffffff"/>`;
  s += `<text x="${PAD}" y="32" font-family="${FONT}" font-size="20" font-weight="700" fill="#0f172a">${esc(d.title)}</text>`;
  if (d.subtitle) s += `<text x="${PAD}" y="54" font-family="${FONT}" font-size="12" fill="#64748b">${esc(d.subtitle)}</text>`;
  // lifelines
  for (let i = 0; i < n; i++) {
    s += `<line x1="${cx(i)}" y1="${top + 20}" x2="${cx(i)}" y2="${height - 30}" stroke="#cbd5e1" stroke-dasharray="5,4"/>`;
    const c = PALETTE[i % PALETTE.length];
    s += `<rect x="${cx(i) - PW / 2}" y="${top - 20}" width="${PW}" height="40" rx="8" fill="${c.fill}" stroke="${c.stroke}"/>`;
    s += `<text x="${cx(i)}" y="${top + 4}" text-anchor="middle" font-family="${FONT}" font-size="11.5" font-weight="600" fill="${c.text}">${esc(d.participants[i])}</text>`;
  }
  let y = top + 44;
  d.messages.forEach((m, i) => {
    const c = m.color || "#334155";
    if (m.note) {
      const x1 = PAD - 10, x2 = width - PAD + 10;
      s += `<rect x="${x1}" y="${y - 14}" width="${x2 - x1}" height="28" rx="6" fill="#fef9c3" stroke="#eab308"/>`;
      s += `<text x="${(x1 + x2) / 2}" y="${y + 5}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="#713f12">${esc(m.note)}</text>`;
      y += rowH;
      return;
    }
    const from = pIdx(m.from), to = pIdx(m.to);
    if (from < 0 || to < 0) { y += rowH; return; }
    const x1 = cx(from), x2 = cx(to);
    if (from === to) {
      s += `<path d="M${x1},${y} h40 v22 h-40" fill="none" stroke="${c}" stroke-width="1.4"/>`;
      s += `<path d="M${x1 + 40},${y + 22} l-8,-4 v8 Z" fill="${c}"/>`;
      s += `<text x="${x1 + 46}" y="${y + 4}" font-family="${FONT}" font-size="11" fill="${c}">${esc(m.label)}</text>`;
    } else {
      const dir = x2 > x1 ? 1 : -1;
      s += `<line x1="${x1}" y1="${y}" x2="${x2 - dir * 8}" y2="${y}" stroke="${c}" stroke-width="1.4"/>`;
      s += `<path d="M${x2},${y} L${x2 - dir * 10},${y - 4} L${x2 - dir * 10},${y + 4} Z" fill="${c}"/>`;
      const mid = (x1 + x2) / 2;
      s += `<text x="${mid}" y="${y - 7}" text-anchor="middle" font-family="${FONT}" font-size="10.5" fill="#475569">${esc((i + 1) + ". " + m.label)}</text>`;
    }
    y += rowH;
  });
  s += `</svg>`;
  return { svg: s, width, height };
}

export const DIAGRAMS = [
  {
    name: "c4-l1-context",
    kind: "flow",
    title: "C4-L1 系统上下文（OpenDream Cloud v3）",
    subtitle: "MCP 能力总线 + 统一 AI 网关；工作区/应用/数字人/工作流",
    colTitles: ["用户 / 系统", "平台", "外部依赖", "数据"],
    layers: [["U1", "U2", "U3"], ["S"], ["E1", "E2", "E3", "E4", "E5"], ["D1"]],
    nodes: {
      U1: "开发者 / 平台管理员\nWeb 控制台",
      U2: "应用使用者 / 观众\n分享链接 · 数字人会话",
      U3: "企业系统 / IM\n钉钉·飞书·企微·Webhook",
      S: "OpenDream Cloud v3\nMCP 总线 · AI 网关\n工作区/应用/数字人/工作流",
      E1: "企业 IdP\nOIDC",
      E2: "模型供应商\nDeepSeek·通义·OpenAI",
      E3: "企业 MCP Server\nCRM·订单·知识库",
      E4: "Git / CI\nPR · Check · 构建",
      E5: "RTC / GPU\nACK · GPU 池",
      D1: "PostgreSQL / Redis\nOSS / KMS",
    },
    edges: [
      ["U1", "S", "HTTPS + SSO"], ["U2", "S", "SSO / WebRTC"], ["U3", "S", "Webhook / MCP"],
      ["S", "E1", "OIDC PKCE"], ["S", "E2", "OpenAI 兼容"], ["S", "E3", "MCP HTTP/SSE"],
      ["S", "E4", "PR / 构建"], ["S", "E5", "WebRTC / GPU"], ["S", "D1", "持久化"],
    ],
  },
  {
    name: "c4-l2-containers",
    kind: "flow",
    title: "C4-L2 容器视图（分层 + 数据面）",
    subtitle: "L0 接入 → L1 控制面 → L2 数据面 → L3 执行 → L4 业务",
    colTitles: ["L0 接入层", "L1 控制面", "L2 数据面", "L3 执行层", "L4 业务层"],
    layers: [
      ["GW", "EXT"],
      ["ID", "WSO", "MCPR", "MCPP", "MC", "AC", "WF", "DHC", "AU"],
      ["MCPGW", "MGW", "APPGW", "TRIG"],
      ["WS", "APP", "WFW", "DHR"],
      ["B1", "B2", "B3"],
    ],
    nodes: {
      GW: "Higress\nTLS/WAF·路由·限流\n灰度·ext-auth",
      EXT: "auth-edge\next-auth 回调",
      ID: "Identity/Tenant/RBAC/APIKey",
      WSO: "Workspace Orchestrator",
      MCPR: "MCP Registry\n生命周期·版本·签名",
      MCPP: "MCP Policy\n工具级 allow/deny",
      MC: "Model Center",
      AC: "App Center\n权限·分享·协同",
      WF: "Workflow Control\nDSL·实例·人工任务",
      DHC: "Digital Human Control",
      AU: "Audit/Usage/Watchdog",
      MCPGW: "mcp-gateway\n协议适配·凭证注入\n工具级 PEP·脱敏·熔断",
      MGW: "model-gateway\nLiteLLM·虚拟 Key·预算",
      APPGW: "app/workspace gateway\nticket·ACL·反代",
      TRIG: "Trigger Bus\nRedis Streams→NATS",
      WS: "opencode workspace\n4C8G·PVC·serve:4096",
      APP: "App runtime\n1C2G·sandbox-runtime",
      WFW: "Workflow worker\nagent/tool/human/render",
      DHR: "Digital Human runtime\nASR·TTS·lip-sync·SFU",
      B1: "Web/Agent/数字人\n/工作流应用",
      B2: "SDLC/通用工作流",
      B3: "数字人 API/SDK/iframe",
    },
    edges: [
      ["GW", "MCPGW", "mcp.*"], ["GW", "MGW", "模型"], ["GW", "APPGW", "app/ws"],
      ["GW", "EXT", "ext-auth"],
      ["MCPR", "MCPGW", "版本"], ["MCPP", "MCPGW", "策略"],
      ["MCPGW", "WS", ""], ["APPGW", "WS", ""], ["APPGW", "APP", ""],
      ["TRIG", "WFW", "触发"], ["WF", "WFW", "任务"], ["DHC", "DHR", "编排"],
      ["WFW", "WS", "agent 节点"], ["WFW", "MCPGW", "tool 节点"],
      ["WS", "B1", ""], ["APP", "B1", ""], ["WFW", "B2", ""], ["DHR", "B3", ""],
    ],
  },
  {
    name: "deploy-ack",
    kind: "flow",
    title: "部署视图（ACK 单地域 · 3 AZ + 本地双模）",
    subtitle: "Higress 入口 → 数据面 → 控制面/执行层；ns: platform-system / ws-<orgId> / apps / sandbox / digital-human",
    colTitles: ["边缘", "数据面（集群内）", "控制面与调度", "执行层", "托管数据"],
    layers: [
      ["SLB", "HIG"],
      ["MCPGW", "MGW", "SFU"],
      ["CP", "AUTH", "TEMP", "WFC"],
      ["WSPOD", "APOD", "EVAL", "DHW", "GPUP", "TRIG"],
      ["RDS", "REDIS", "OSS", "KMS", "ACR"],
    ],
    nodes: {
      SLB: "SLB + WAF + 证书\n*.mcp / *.apps / *.ws / *.dh",
      HIG: "Higress ×4\nGateway API",
      MCPGW: "mcp-gateway ×3\n工具级 PEP（仅内网）",
      MGW: "model-gateway ×3\nLiteLLM",
      SFU: "WebRTC SFU ×3\nLiveKit",
      CP: "control-plane ×6",
      AUTH: "auth-edge ×3\n唯一 OIDC RP",
      TEMP: "Temporal\nfrontend3/history3/matching3",
      WFC: "workflow workers\n5 队列",
      WSPOD: "workspace Pod ×1000\n4C8G Guaranteed",
      APOD: "App runtime 1C2G",
      EVAL: "eval/build Job\nsandbox-runtime 禁网",
      DHW: "ASR/TTS/lip-sync",
      GPUP: "GPU 池 A10 ×N\nKEDA",
      TRIG: "trigger-bus",
      RDS: "RDS PG16\n主+只读",
      REDIS: "Redis 7 主从",
      OSS: "OSS + CDN",
      KMS: "KMS",
      ACR: "ACR",
    },
    edges: [
      ["SLB", "HIG", "HTTPS"], ["HIG", "MCPGW", "mcp.*"], ["HIG", "CP", "api.*"],
      ["HIG", "WSPOD", "w-*.ws"], ["HIG", "APOD", "app-*.apps"], ["HIG", "SFU", "dh-*"],
      ["MCPGW", "RDS", "审计"], ["MCPGW", "KMS", "凭证"], ["CP", "RDS", ""],
      ["TEMP", "WFC", "队列"], ["WFC", "WSPOD", "agent"], ["WFC", "MCPGW", "tool"],
      ["SFU", "DHW", "音频"], ["DHW", "GPUP", "推理"], ["WSPOD", "OSS", "快照"],
      ["APOD", "ACR", "镜像"], ["EVAL", "ACR", "构建"],
    ],
  },
  {
    name: "flow-mcp-call",
    kind: "seq",
    title: "数据流：MCP 工具调用（工具级 PEP）",
    subtitle: "opencode → Higress → mcp-gateway → Registry/Policy → KMS → 企业 MCP → 审计",
    participants: ["opencode WS", "Higress", "mcp-gateway", "Registry/Policy", "KMS", "企业 MCP", "审计/Trace"],
    messages: [
      { from: "opencode WS", to: "Higress", label: "POST /v1/acme/crm + workspace-ticket" },
      { from: "Higress", to: "mcp-gateway", label: "mTLS 转发（保留 Host/头）" },
      { from: "mcp-gateway", to: "mcp-gateway", label: "验 ticket（JWKS 本地, aud=mcp:org:acme）" },
      { from: "mcp-gateway", to: "Registry/Policy", label: "策略查询（租户/角色/工具/版本）" },
      { from: "Registry/Policy", to: "mcp-gateway", label: "allow + tool_snapshot + credential_ref" },
      { from: "mcp-gateway", to: "KMS", label: "解密凭证（仅内存）" },
      { from: "mcp-gateway", to: "企业 MCP", label: "initialize / tools/call（注入凭证）" },
      { from: "企业 MCP", to: "mcp-gateway", label: "result（流式）" },
      { from: "mcp-gateway", to: "审计/Trace", label: "audit + span（脱敏）" },
      { from: "mcp-gateway", to: "opencode WS", label: "result（脱敏/限长/缓存标记）" },
      { note: "未授权工具：error -32001 + audit denied；tools/list 在网关侧过滤，opencode 不可见" },
    ],
  },
  {
    name: "flow-app-release",
    kind: "seq",
    title: "数据流：应用发布 + 分享访问",
    subtitle: "工作区 → BuildKit → ACR → 1C2G Runtime → ACL → 使用者 SSO/ticket",
    participants: ["开发者", "Console", "App Center", "Workspace", "BuildKit", "ACR", "App Runtime", "app-gateway", "使用者"],
    messages: [
      { from: "开发者", to: "Console", label: "发布应用（入口/模板/上下文）" },
      { from: "Console", to: "App Center", label: "POST /apps + preflight" },
      { from: "App Center", to: "Workspace", label: "导出构建上下文" },
      { from: "App Center", to: "BuildKit", label: "构建 Job（rootless, 缓存）" },
      { from: "BuildKit", to: "ACR", label: "push rev-uuid + digest + SBOM" },
      { from: "App Center", to: "App Runtime", label: "Deployment 1C2G + Ingress" },
      { from: "开发者", to: "App Center", label: "分享 ACL（scope/role/subject）" },
      { from: "使用者", to: "app-gateway", label: "打开分享链接（sst_ token）" },
      { from: "app-gateway", to: "Console", label: "无 SSO → 302 登录（return_to）" },
      { from: "app-gateway", to: "App Runtime", label: "验 token+ACL → 反代" },
      { note: "token 过期/撤销 → 410；签名不符 → 403；ACL 变更 ≤5s（Redis 主动失效）" },
    ],
  },
  {
    name: "flow-collab",
    kind: "seq",
    title: "数据流：应用协同编辑（Patch + 乐观锁 + 审批）",
    subtitle: "对话 → Agent 分支 patch → 提案 → 审批 → CI → 预览 → 发布",
    participants: ["编辑者", "Console", "Collab Service", "Agent/Workspace", "Git", "审批人", "CI/构建", "App Runtime"],
    messages: [
      { from: "编辑者", to: "Console", label: "打开协同修改（描述需求）" },
      { from: "Console", to: "Collab Service", label: "创建 session（app_id + base_version）" },
      { from: "Collab Service", to: "Agent/Workspace", label: "启动 Agent 任务" },
      { from: "Agent/Workspace", to: "Git", label: "checkout collab/<session> + commit patch" },
      { from: "Agent/Workspace", to: "Collab Service", label: "提案（diff/风险/测试建议）" },
      { from: "Collab Service", to: "审批人", label: "proposal_created（SSE）" },
      { from: "审批人", to: "Collab Service", label: "approve（高风险双人）" },
      { from: "Collab Service", to: "Git", label: "rebase + merge" },
      { from: "Collab Service", to: "CI/构建", label: "测试/扫描门禁" },
      { from: "CI/构建", to: "App Runtime", label: "预览环境 → 发布（可回滚）" },
      { note: "base_version 落后 → 409 version_conflict；同一 app 仅一个 pending proposal 可合并" },
    ],
  },
  {
    name: "flow-digital-human",
    kind: "seq",
    title: "数据流：数字人实时会话（首句优先）",
    subtitle: "RTC token → SFU → 流式 ASR → Agent(+MCP) → 流式 TTS → GPU 口型 → 下行",
    participants: ["用户", "DH Control", "WebRTC SFU", "ASR", "Agent/Model", "MCP GW", "TTS", "GPU 渲染"],
    messages: [
      { from: "用户", to: "DH Control", label: "创建会话（persona/voice/mode）" },
      { from: "DH Control", to: "DH Control", label: "授权校验 + 配额 + 内容策略" },
      { from: "DH Control", to: "WebRTC SFU", label: "room + RTC token（≤5min）" },
      { from: "用户", to: "WebRTC SFU", label: "加入 room（音频上行）" },
      { from: "WebRTC SFU", to: "ASR", label: "音频分片 200-300ms" },
      { from: "ASR", to: "Agent/Model", label: "流式转写" },
      { from: "Agent/Model", to: "MCP GW", label: "tools/call（可选）" },
      { from: "Agent/Model", to: "TTS", label: "首句流式输出（不等全文）" },
      { from: "TTS", to: "GPU 渲染", label: "音频 chunk" },
      { from: "GPU 渲染", to: "WebRTC SFU", label: "视频帧 + 水印（720p）" },
      { from: "WebRTC SFU", to: "用户", label: "下行音视频（P50 ≤800ms）" },
      { note: "降级：3D→2D 静态贴图→纯音频→文本+HLS；默认水印 + 内容审核 + 会话审计" },
    ],
  },
  {
    name: "flow-workflow",
    kind: "seq",
    title: "数据流：工作流（Trigger → Router → Runtime → 节点）",
    subtitle: "Redis Streams/NATS → 状态机/Temporal → agent/mcp/human/render → App Center",
    participants: ["Trigger", "Trigger Bus", "Workflow Router", "Runtime", "Workspace", "MCP GW", "人工任务", "App Center"],
    messages: [
      { from: "Trigger", to: "Trigger Bus", label: "事件（event_id/type/thread_id）" },
      { from: "Trigger Bus", to: "Workflow Router", label: "消费（thread 保序 + 幂等）" },
      { from: "Workflow Router", to: "Runtime", label: "start（DSL 版本不可变）" },
      { from: "Runtime", to: "Workspace", label: "agent 节点（工作区 API）" },
      { from: "Workspace", to: "Runtime", label: "产物（PR/代码/报告）" },
      { from: "Runtime", to: "MCP GW", label: "mcp_tool 节点" },
      { from: "Runtime", to: "人工任务", label: "human_approval（SLA/升级）" },
      { from: "人工任务", to: "Runtime", label: "decision（Signal）" },
      { from: "Runtime", to: "App Center", label: "发布节点（构建/部署）" },
      { from: "Runtime", to: "Runtime", label: "补偿（逆序 Saga）→ 死信/人工" },
      { note: "幂等键 {workflow_id}/{run_id}/{activity_id}/{attempt}；取消级联到 opencode/MCP/部署" },
    ],
  },
];

export async function renderAll() {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-proxy-server"] });
  const out = [];
  for (const d of DIAGRAMS) {
    const { svg, width, height } = d.kind === "seq" ? seqSvg(d) : flowSvg(d);
    const svgPath = resolve(dir, `${d.name}.svg`);
    writeFileSync(svgPath, svg, "utf8");
    const page = await browser.newPage({ viewport: { width: Math.ceil(width), height: Math.ceil(height) }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`);
    const pngPath = resolve(dir, `${d.name}.png`);
    await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: Math.ceil(width), height: Math.ceil(height) } });
    await page.close();
    out.push({ name: d.name, width, height, svgPath, pngPath });
    console.log("rendered", d.name, width + "x" + height);
  }
  await browser.close();
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("build-diagrams.mjs")) {
  await renderAll();
}
