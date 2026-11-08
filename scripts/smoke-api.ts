#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * G4 API smoke: dev-login -> ensure -> ready -> access-ticket -> destroy -> cancel.
 * Usage: bun scripts/smoke-api.ts [baseUrl]  (default http://127.0.0.1:4001)
 */

const base = process.argv[2] ?? "http://127.0.0.1:4001";
const cookies = new Map<string, string>();
let csrf = "";

function sessionCookieFrom(response: Response): void {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const raw of setCookies) {
    const pair = raw.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader(): string {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: any; res: Response }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(cookies.size ? { cookie: cookieHeader() } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
      ...(init.headers ?? {}),
    },
  });
  sessionCookieFrom(res);
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body, res };
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`ASSERT FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}

const email = `smoke-${Date.now()}@example.com`;
console.log(`base=${base} email=${email}`);

const login = await call("/api/v1/auth/dev-login", {
  method: "POST",
  body: JSON.stringify({ email, name: "Smoke" }),
});
assert(login.status === 200, `dev-login 200 (got ${login.status})`);
assert(typeof login.body?.csrf_token === "string", "csrf_token present");
csrf = login.body.csrf_token;

const ensure = await call("/api/v1/workspaces/me/ensure", { method: "POST", body: "{}" });
assert(ensure.status === 202 || ensure.status === 200, `ensure 2xx (got ${ensure.status})`);
const id = ensure.body?.id as string;
assert(typeof id === "string" && id.length > 0, "workspace id returned");
assert(ensure.body?.resources?.cpu === "4" && ensure.body?.resources?.memory === "8Gi", "resources are 4C8G");

let workspace: any;
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  const got = await call(`/api/v1/workspaces/${id}`);
  workspace = got.body;
  if (workspace?.state === "ready") break;
  await Bun.sleep(250);
}
assert(workspace?.state === "ready", `workspace ready (state=${workspace?.state})`);
assert(workspace?.storage?.retain === true, "PVC retain=true (退出不销毁)");

const ticket = await call(`/api/v1/workspaces/${id}/access-ticket`, { method: "POST", body: "{}" });
assert(ticket.status === 200, `access-ticket 200 (got ${ticket.status})`);
assert(ticket.body?.expires_in === 60, "ticket TTL 60s");
assert(typeof ticket.body?.url === "string" && ticket.body.url.includes("__ticket="), "ticket url contains __ticket");

const wrongName = await call(`/api/v1/workspaces/${id}/destroy`, {
  method: "POST",
  body: JSON.stringify({ confirm_name: "wrong", acknowledge_data_loss: true }),
});
assert(wrongName.status === 400, `destroy wrong name 400 (got ${wrongName.status})`);

const destroy = await call(`/api/v1/workspaces/${id}/destroy`, {
  method: "POST",
  body: JSON.stringify({
    confirm_name: workspace.display_name,
    acknowledge_data_loss: true,
    keep_snapshot: true,
  }),
});
assert(destroy.status === 202, `destroy accepted 202 (got ${destroy.status})`);
assert(Boolean(destroy.body?.destroy_scheduled_at), "destroy_scheduled_at set (cooldown)");

const cancel = await call(`/api/v1/workspaces/${id}/destroy/cancel`, { method: "POST", body: "{}" });
assert(cancel.status === 200, `destroy cancel 200 (got ${cancel.status})`);

const after = await call(`/api/v1/workspaces/${id}`);
assert(after.body?.state === "ready" && after.body?.destroy_scheduled_at === null, "cancel restores ready state");

const audit = await call("/api/v1/audit-logs");
assert(audit.status === 200, `audit-logs 200 (got ${audit.status})`);
assert(Array.isArray(audit.body?.items) && audit.body.items.length >= 3, "audit has workspace/ensure/destroy entries");

console.log("\nSMOKE PASS");
