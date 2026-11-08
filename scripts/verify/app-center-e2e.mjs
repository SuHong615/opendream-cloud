// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * App Center 权限/协同 API 端到端（本地 Docker）。
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

const login = await call("/api/v1/auth/dev-login", { method: "POST", body: JSON.stringify({ email: `app-e2e-${Date.now()}@example.com` }) });
if (!login.body?.csrf_token) { console.error(login); process.exit(1); }
csrf = login.body.csrf_token;
ok("dev-login", String(login.status));

const slug = `app-${Date.now().toString(36)}`;
const created = await call("/api/v1/apps", {
  method: "POST",
  body: JSON.stringify({ slug, name: "E2E 演示应用", description: "local e2e", template: "static", entry: "index.html" }),
});
assert(created.status === 201, "create app", `${created.status}`);
const app = created.body;
if (!app?.id) { console.error(app); process.exit(1); }
const id = app.id;

const list = await call("/api/v1/apps");
assert(list.status === 200 && list.body?.items?.some((a) => a.id === id), "list contains app", `${list.body?.items?.length ?? 0}`);

const detail = await call(`/api/v1/apps/${id}`);
assert(detail.status === 200 && detail.body?.id === id, "get app", `${detail.status}`);

const perms = await call(`/api/v1/apps/${id}/permissions`);
assert(perms.status === 200 && perms.body?.actions, "permissions", `${perms.status}`);

const members = await call(`/api/v1/apps/${id}/members`);
assert(members.status === 200, "members list", `${members.status}`);

const versions = await call(`/api/v1/apps/${id}/versions`);
assert(versions.status === 200, "versions", `${versions.status}`);

const collab = await call(`/api/v1/apps/${id}/collab`);
assert(collab.status === 200, "collab session", `${collab.status}`);

const msg = await call(`/api/v1/apps/${id}/collab/messages`, {
  method: "POST",
  body: JSON.stringify({ content: "把标题改成 Hello", client_msg_id: `m-${Date.now()}` }),
});
assert(msg.status === 201 || msg.status === 200, "collab message", `${msg.status}`);

const proposals = await call(`/api/v1/apps/${id}/collab/proposals`);
assert(proposals.status === 200, "proposals list", `${proposals.status}`);

console.log(JSON.stringify({ app_id: id, slug }, null, 2));
if (failures) { console.error(`\nAPP CENTER E2E: ${failures} failure(s)`); process.exit(1); }
console.log("\nAPP CENTER E2E PASS");
