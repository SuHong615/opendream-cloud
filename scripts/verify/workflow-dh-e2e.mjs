// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * Workflow + Digital Human L1 端到端（经 control-plane 门面，本地 Docker）。
 */
const BASE = process.argv[2] ?? "http://localhost:4000";
const cookies = new Map();
let csrf = "";
let failures = 0;
const ok = (n, d = "") => console.log(`  ok  ${n}${d ? ` (${d})` : ""}`);
const fail = (n, d = "") => { failures += 1; console.error(`FAIL  ${n}${d ? ` (${d})` : ""}`); };
const assert = (c, n, d = "") => (c ? ok(n, d) : fail(n, d));
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

const login = await call("/api/v1/auth/dev-login", { method: "POST", body: JSON.stringify({ email: `wf-dh-e2e-${Date.now()}@example.com` }) });
if (!login.body?.csrf_token) { console.error(login); process.exit(1); }
csrf = login.body.csrf_token;
ok("dev-login", String(login.status));

// ---------------- workflow
const templates = await call("/api/v1/workflow-templates");
assert(templates.status === 200 && templates.body?.items?.length >= 5, "workflow templates", String(templates.body?.items?.length ?? 0));
const template = templates.body.items[0];
const created = await call("/api/v1/workflows", { method: "POST", body: JSON.stringify({ template_id: template.id, name: `E2E ${template.name}` }) });
if (!(created.status === 201 || created.status === 200)) console.error("CREATE_ERR", JSON.stringify(created.body));
assert(created.status === 201 || created.status === 200, "create workflow", `${created.status}`);
const wf = created.body;
const run = await call("/api/v1/workflow-runs", { method: "POST", body: JSON.stringify({ definition_id: wf.id, input: { feature: "E2E demo feature" } }) });
assert(run.status === 201 || run.status === 200, "start workflow run", `${run.status}`);
const runId = run.body?.instance_id ?? run.body?.id ?? run.body?.run?.id;
assert(Boolean(runId), "run id returned", runId ?? "");
if (runId) {
  const got = await call(`/api/v1/workflow-runs/${runId}`);
  assert(got.status === 200 && (got.body?.status || got.body?.state), "get workflow run", `${got.status} ${got.body?.status ?? ""}`);
  const tasks = await call("/api/v1/human-tasks");
  assert(tasks.status === 200 && Array.isArray(tasks.body?.items), "human tasks list", String(tasks.body?.items?.length ?? 0));
}

// ---------------- digital human
const avatars = await call("/api/v1/dh/avatars");
assert(avatars.status === 200 && avatars.body?.items?.length >= 1, "dh avatars", String(avatars.body?.items?.length ?? 0));
const voices = await call("/api/v1/dh/voices");
assert(voices.status === 200 && voices.body?.items?.length >= 1, "dh voices", String(voices.body?.items?.length ?? 0));
const session = await call("/api/v1/dh/sessions", { method: "POST", body: JSON.stringify({ avatar_id: avatars.body.items[0].id, voice_id: voices.body.items[0].id, greeting: "你好" }) });
assert(session.status === 201 || session.status === 200, "dh create session", `${session.status}`);
const sessionId = session.body?.session_id ?? session.body?.id;
assert(Boolean(sessionId), "dh session id", sessionId ?? "");
if (sessionId) {
  const got = await call(`/api/v1/dh/sessions/${sessionId}`);
  assert(got.status === 200, "dh get session", `${got.status}`);
  const msg = await call(`/api/v1/dh/sessions/${sessionId}/messages`, { method: "POST", body: JSON.stringify({ text: "帮我查一下订单" }) });
  assert(msg.status === 200 && (msg.body?.text || msg.body?.reply || msg.body?.content || msg.body?.message), "dh send message", `${msg.status}`);
  const ended = await call(`/api/v1/dh/sessions/${sessionId}/end`, { method: "POST", body: "{}" });
  assert(ended.status === 200 && (ended.body?.state ?? ended.body?.status) === "ended", "dh end session", `${ended.status}`);
}

if (failures) { console.error(`\nWORKFLOW/DH E2E: ${failures} failure(s)`); process.exit(1); }
console.log("\nWORKFLOW/DH E2E PASS");
