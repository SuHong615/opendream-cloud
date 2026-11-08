#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * M2b：把 agent-workforce 的 legacy Agent Run 一次性导入 AgentCore。
 *
 * 只做迁移，不做双写；每 run 使用稳定 Idempotency-Key，可重复执行。
 *
 * 用法：
 *   CONTROL_PLANE_URL=http://localhost:4000 MIGRATE_EMAIL=lilei@xingyun.example \
 *     bun scripts/migrate/legacy-runs-to-agentcore.ts          # dry-run
 *   ... --apply                                                # 实际导入
 */

const BASE = (process.env.CONTROL_PLANE_URL ?? "http://localhost:4000").replace(/\/+$/, "");
const EMAIL = process.env.MIGRATE_EMAIL ?? "lilei@xingyun.example";
const APPLY = process.argv.includes("--apply");

interface LegacyRun {
  id?: string;
  goal?: string;
  status?: string;
  tasks?: Array<{ title?: string; employee_name?: string; status?: string; output?: string | null }>;
}

async function login(): Promise<{ cookie: string; csrf: string }> {
  const response = await fetch(`${BASE}/api/v1/auth/dev-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL }),
  });
  if (!response.ok) throw new Error(`login failed: ${response.status}`);
  const body = await response.json() as { csrf_token?: string };
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  if (!body.csrf_token) throw new Error("login returned no csrf_token");
  return { cookie, csrf: body.csrf_token };
}

async function listRuns(auth: { cookie: string }): Promise<LegacyRun[]> {
  const response = await fetch(`${BASE}/api/v1/agent-runs`, { headers: { cookie: auth.cookie } });
  if (!response.ok) throw new Error(`list runs failed: ${response.status}`);
  const body = await response.json() as { items?: LegacyRun[] };
  return body.items ?? [];
}

async function importRun(auth: { cookie: string; csrf: string }, run: LegacyRun): Promise<{ status: number; body: unknown }> {
  // 防御：如果灰度读已开启，/agent-runs 返回的是 {source,id,data} 包装，取回原始 run 再迁移。
  const raw = run && typeof run === "object" && "source" in run && "data" in run
    ? (run as unknown as { data: LegacyRun }).data
    : run;
  const response = await fetch(`${BASE}/api/v1/runtime/import/legacy-run`, {
    method: "POST",
    headers: {
      cookie: auth.cookie,
      "content-type": "application/json",
      "x-csrf-token": auth.csrf,
      // v3: v2 可能在灰度读开启时写入嵌套包装；换 key 触发一次正确补写。
      "idempotency-key": `migrate-v3-${run.id}`,
    },
    body: JSON.stringify({
      source: "agent-workforce",
      legacy_run_id: run.id,
      goal: raw.goal ?? "legacy run",
      status: raw.status ?? "completed",
      tasks: raw.tasks ?? [],
      legacy_data: raw,
    }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const auth = await login();
const runs = await listRuns(auth);
const valid = runs.filter((run): run is LegacyRun & { id: string } => typeof run.id === "string" && run.id.length > 0);
console.log(`[M2b] legacy runs: ${runs.length} (valid: ${valid.length}); mode=${APPLY ? "apply" : "dry-run"}`);
if (!APPLY) {
  for (const run of valid.slice(0, 10)) console.log(`  - ${run.id} ${run.status ?? "?"} ${(run.goal ?? "").slice(0, 60)}`);
  console.log("[M2b] dry-run complete; re-run with --apply to import.");
  process.exit(0);
}

let imported = 0;
let failed = 0;
for (const run of valid) {
  const result = await importRun(auth, run);
  if (result.status >= 200 && result.status < 300) imported += 1;
  else { failed += 1; console.error(`[M2b] import failed ${run.id}: ${result.status}`); }
}
console.log(`[M2b] imported=${imported} failed=${failed}`);
if (failed > 0) process.exit(1);
