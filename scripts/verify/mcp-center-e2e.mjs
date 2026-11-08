// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * MCP 中心端到端（本地 Docker）：
 * 登录 → 创建 server → 提交审核 → 审核通过 → 健康检查 → 发布 → 版本 → 绑定 →
 * 经 local-gateway 调 tools/list / tools/call（mock proxy）→ 下线。
 */
const BASE = process.argv[2] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:4000";
const GATEWAY = process.env.MCP_GATEWAY_URL ?? "http://localhost:8080/mcp";
const cookies = new Map();
let csrf = "";
let failures = 0;

function ok(name, detail = "") { console.log(`  ok  ${name}${detail ? ` (${detail})` : ""}`); }
function fail(name, detail = "") { failures += 1; console.error(`FAIL  ${name}${detail ? ` (${detail})` : ""}`); }
function assert(cond, name, detail = "") { cond ? ok(name, detail) : fail(name, detail); }
const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookies.size ? { cookie: cookieHeader() } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(init.headers ?? {}),
    },
  });
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const pair = raw.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: res.status, body };
}

const login = await call("/api/v1/auth/dev-login", { method: "POST", body: JSON.stringify({ email: `mcp-e2e-${Date.now()}@example.com` }) });
if (!login.body?.csrf_token) { console.error("login failed", login.status, login.body); process.exit(1); }
csrf = login.body.csrf_token;
ok("dev-login", `${login.status}`);

const slug = `e2e-mcp-${Date.now().toString(36)}`;
const created = await call("/api/v1/mcp-servers", {
  method: "POST",
  body: JSON.stringify({
    slug,
    name: "E2E Echo MCP",
    description: "local e2e",
    transport: "streamable_http",
    endpoint: "http://mock-mcp:9000/mcp",
    auth_type: "none",
    tools: [{ name: "echo", description: "echo input", destructive: false }],
    default_tools: ["echo"],
  }),
});
assert(created.status === 201, "create server", `${created.status}`);
const server = created.body;
if (!server?.id) { console.error(server); process.exit(1); }
const id = server.id;
assert(server.status === "draft", "initial status draft", server.status);
const org = server.org_id;

assert((await call(`/api/v1/mcp-servers/${id}/submit-review`, { method: "POST", body: "{}" })).status === 200, "submit-review");
assert((await call(`/api/v1/mcp-servers/${id}/review`, { method: "POST", body: JSON.stringify({ decision: "approve" }) })).status === 200, "review approve");
assert((await call(`/api/v1/mcp-servers/${id}/health-check`, { method: "POST", body: "{}" })).status === 200, "health-check");
const published = await call(`/api/v1/mcp-servers/${id}/publish`, { method: "POST", body: "{}" });
assert(published.status === 200 && published.body?.status === "published", "publish", `${published.status}`);

const versions = await call(`/api/v1/mcp-servers/${id}/versions`);
assert(versions.status === 200 && Array.isArray(versions.body?.items) && versions.body.items.length >= 1, "versions", `${versions.body?.items?.length ?? 0}`);

const policy = await call(`/api/v1/mcp-servers/${id}/tool-policy`);
assert(policy.status === 200, "tool-policy", `${policy.status}`);

const binding = await call("/api/v1/mcp-bindings", {
  method: "POST",
  body: JSON.stringify({ mcp_server_id: id, subject_type: "workspace", subject_id: "local-ws", allowed_tools: ["echo"] }),
});
assert(binding.status === 201 && typeof binding.body?.token === "string", "create binding", `${binding.status}`);
const token = binding.body?.token;
const ticketRes = await call(`/api/v1/mcp-bindings/${binding.body?.id}/ticket`, {
  method: "POST",
  body: JSON.stringify({ workspace_id: "00000000-0000-4000-8000-000000000000" }),
});
assert(ticketRes.status === 200 && typeof ticketRes.body?.ticket === "string", "issue EdDSA ticket", `${ticketRes.status} ${JSON.stringify(ticketRes.body).slice(0, 120)}`);
const ticket = ticketRes.body?.ticket;
const gatewayOrg = (() => {
  try {
    const payload = JSON.parse(Buffer.from(ticket.split(".")[1], "base64url").toString("utf8"));
    return String(payload.org_slug ?? org);
  } catch {
    return org;
  }
})();

async function rpc(method, params) {
  const res = await fetch(`${GATEWAY}/v1/${gatewayOrg}/${slug}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${ticket ?? token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const init = await rpc("initialize");
assert(init.status === 200 && init.body?.result?.serverInfo, "gateway initialize", `${init.status}`);
const listed = await rpc("tools/list");
assert(listed.status === 200 && listed.body?.result?.tools?.some((t) => t.name === "echo"), "gateway tools/list", JSON.stringify(listed.body?.result?.tools?.map((t) => t.name)));
const called = await rpc("tools/call", { name: "echo", arguments: { text: "hello" } });
assert(called.status === 200 && called.body?.result?.content?.[0]?.text?.includes("echo"), "gateway tools/call", JSON.stringify(called.body?.result?.content));

const offline = await call(`/api/v1/mcp-servers/${id}/offline`, { method: "POST", body: "{}" });
assert(offline.status === 200 && offline.body?.status === "offline", "offline", `${offline.status}`);

if (failures) { console.error(`\nMCP CENTER E2E: ${failures} failure(s)`); process.exit(1); }
console.log("\nMCP CENTER E2E PASS");
