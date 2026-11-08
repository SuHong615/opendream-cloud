// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const base = process.argv[2] ?? "http://localhost:4000";
const cookies = new Map();
let csrf = "";

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path, init = {}) {
  const res = await fetch(`${base}${path}`, {
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
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

const login = await call("/api/v1/auth/dev-login", {
  method: "POST",
  body: JSON.stringify({ email: `urlcheck-${Date.now()}@example.com` }),
});
if (!login.body?.csrf_token) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);
csrf = login.body.csrf_token;

const ensure = await call("/api/v1/workspaces/me/ensure", { method: "POST", body: "{}" });
if (!ensure.body?.id) throw new Error(`ensure failed: ${ensure.status} ${JSON.stringify(ensure.body)}`);
const id = ensure.body.id;

let ws;
for (let i = 0; i < 60; i++) {
  const got = await call(`/api/v1/workspaces/${id}`);
  ws = got.body;
  if (ws?.state === "ready") break;
  await Bun.sleep(200);
}
if (ws?.state !== "ready") throw new Error(`workspace not ready: ${JSON.stringify(ws)}`);

const ticket = await call(`/api/v1/workspaces/${id}/access-ticket`, { method: "POST", body: "{}" });
if (!ticket.body?.url) throw new Error(`ticket failed: ${ticket.status} ${JSON.stringify(ticket.body)}`);
console.log(JSON.stringify({ state: ws.state, url: ticket.body.url, base_url: ticket.body.base_url }, null, 2));
