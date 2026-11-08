#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * Start all four capability-center services, wait for health, and verify
 * contract-shaped responses. Proves the four services run side by side.
 *
 * Usage: bun scripts/verify/all-services.mjs
 */
import { spawn } from "node:child_process";

const services = [
  { name: "skill-center", dir: "services/skill-center", port: 4101 },
  { name: "eval-center", dir: "services/eval-center", port: 4102 },
  { name: "app-center", dir: "services/app-center", port: 4103 },
  { name: "mcp-hub", dir: "services/mcp-hub", port: 4104 },
];

const children = [];

async function waitHealth(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return await response.json();
      lastError = new Error(`status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(200);
  }
  throw lastError ?? new Error("timeout");
}

let failed = 0;
try {
  for (const service of services) {
    const child = spawn("bun", ["run", "src/server.ts"], {
      cwd: service.dir,
      env: { ...process.env, NODE_ENV: "test" },
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    children.push(child);
  }

  for (const service of services) {
    try {
      const health = await waitHealth(service.port);
      console.log(`ok   ${service.name} :${service.port} ${JSON.stringify(health)}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${service.name} :${service.port} ${error}`);
    }
  }

  for (const service of services) {
    try {
      const response = await fetch(`http://127.0.0.1:${service.port}/api/v1/does-not-exist`);
      const body = await response.json();
      const twoLayer = typeof body?.error?.code === "string";
      console.log(`${twoLayer ? "ok  " : "FAIL"} ${service.name} two-layer error (status=${response.status})`);
      if (!twoLayer) failed += 1;
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${service.name} error envelope ${error}`);
    }
  }
} finally {
  for (const child of children) {
    try {
      child.kill();
    } catch {}
  }
}

if (failed > 0) {
  console.error(`ALL-SERVICES FAIL (${failed})`);
  process.exit(1);
}
console.log("ALL-SERVICES PASS");
