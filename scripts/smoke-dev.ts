#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * `bun run dev` 冒烟（T4.1 验收）：拉起 dev 编排（--placeholder 强制占位），
 * 用原始 TCP/HTTP 探测 :4000 控制面与 :3000 控制台（绕过系统代理），然后关闭。
 */
import { connect } from "node:net";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const TARGETS = [
  { name: "control-plane", port: 4000 },
  { name: "console", port: 3000 },
] as const;

function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolvePromise, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    let buffer = "";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`timeout connecting :${port}`));
    }, 3_000);
    socket.on("connect", () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
    });
    socket.on("end", () => {
      clearTimeout(timer);
      const statusLine = buffer.split("\r\n")[0] ?? "";
      const status = Number(statusLine.split(" ")[1] ?? 0);
      resolvePromise({ status, body: buffer });
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function waitHealthy(port: number, timeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await httpGet(port, "/healthz");
      if (res.status === 200) {
        const body = res.body.split("\r\n\r\n").slice(1).join("\r\n\r\n");
        try {
          return JSON.parse(body);
        } catch {
          return body.trim();
        }
      }
      lastError = new Error(`status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await Bun.sleep(300);
  }
  throw new Error(`port ${port} not healthy in ${timeoutMs}ms: ${String(lastError)}`);
}

const child = Bun.spawn(["bun", "run", "dev", "--", "--placeholder"], {
  cwd: ROOT,
  stdio: ["ignore", "inherit", "inherit"],
});

let failed = false;
try {
  const results = await Promise.all(TARGETS.map((t) => waitHealthy(t.port, 20_000)));
  for (const [i, t] of TARGETS.entries()) {
    console.log(`[smoke:dev] ${t.name} :${t.port} -> ${JSON.stringify(results[i])}`);
  }
  console.log("[smoke:dev] ok");
} catch (err) {
  failed = true;
  console.error(`[smoke:dev] FAILED: ${String(err)}`);
} finally {
  child.kill("SIGKILL");
  await Promise.race([child.exited.catch(() => 0), Bun.sleep(2_000)]);
  process.exit(failed ? 1 : 0);
}
