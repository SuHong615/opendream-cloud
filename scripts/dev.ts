#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 本地开发编排（T4.1 占位版）
 *
 * 目标：一条命令同时拉起控制面 :4000 与控制台 :3000。
 * - 若 apps/control-plane / apps/console 已存在（backend/web-console 落地后），各自 `bun run dev`；
 * - 否则启动占位 HTTP 服务，保证 `bun run dev` 始终可用（G4 验收：能同时拉起两个进程）。
 *
 * 用法：
 *   bun run dev            # 启动（占位或真实）
 *   bun run dev -- --check # 只做环境/目录自检并打印计划，不启动
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createConnection } from "node:net";
import { DEFAULT_PORTS } from "@opendream-cloud/shared";

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolveFree) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolveFree(false);
    });
    socket.once("error", () => resolveFree(true));
  });
}

const ROOT = resolve(import.meta.dir, "..");
const CHECK_ONLY = process.argv.includes("--check");
/** 强制使用占位服务（apps/* 尚未可运行时用于打通链路/验收） */
const FORCE_PLACEHOLDER = process.argv.includes("--placeholder");

interface Target {
  name: string;
  dir: string;
  port: number;
  script: "dev";
}

const targets: Target[] = [
  { name: "control-plane", dir: join(ROOT, "apps/control-plane"), port: DEFAULT_PORTS.controlPlane, script: "dev" },
  { name: "console", dir: join(ROOT, "apps/console"), port: DEFAULT_PORTS.console, script: "dev" },
];

function hasRealApp(t: Target): boolean {
  if (FORCE_PLACEHOLDER) return false;
  return existsSync(join(t.dir, "package.json"));
}

function printPlan(): void {
  console.log("OpenDream Cloud · dev");
  console.log(`  root: ${ROOT}`);
  for (const t of targets) {
    const mode = hasRealApp(t) ? "real (bun run dev)" : "placeholder";
    console.log(`  - ${t.name.padEnd(14)} :${t.port}  ${mode}`);
  }
  console.log("\n  提示：占位服务仅用于打通本地链路；apps/* 落地后自动切换为真实进程。");
}

function placeholderServer(name: string, port: number) {
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/healthz" || url.pathname === "/health") {
        return Response.json({ status: "ok", service: name, placeholder: true });
      }
      return Response.json(
        {
          error: {
            code: "service_unavailable",
            message: `${name} 尚未实现（placeholder）。等待 G4 对应任务落盘。`,
            request_id: crypto.randomUUID(),
          },
        },
        { status: 503 },
      );
    },
  });
  console.log(`[placeholder] ${name} listening on http://localhost:${server.port}`);
  return server;
}

if (CHECK_ONLY) {
  printPlan();
  const real = targets.filter(hasRealApp);
  console.log(`\n  real apps: ${real.length}/${targets.length}；其余将用占位进程。`);
  process.exit(0);
}

printPlan();

const children: Bun.Subprocess[] = [];
const servers: Array<ReturnType<typeof Bun.serve>> = [];

for (const t of targets) {
  if (hasRealApp(t)) {
    // 端口已被占用 = 服务可能已在运行（backend/console 常驻），直接复用，避免端口漂移。
    if (!(await isPortFree(t.port))) {
      console.log(`[reuse] ${t.name} already listening on :${t.port}（跳过 spawn；不改端口，避免 E2E 漂移）`);
      continue;
    }
    console.log(`[spawn] ${t.name}: bun run ${t.script} (PORT=${t.port})`);
    const child = Bun.spawn(["bun", "run", t.script], {
      cwd: t.dir,
      env: { ...process.env, PORT: String(t.port) },
      stdio: ["inherit", "inherit", "inherit"],
    });
    children.push(child);
  } else {
    servers.push(placeholderServer(t.name, t.port));
  }
}

function shutdown(signal: string): void {
  console.log(`\n[dev] ${signal} received, shutting down...`);
  for (const s of servers) s.stop(true);
  for (const c of children) c.kill();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// 常驻直到被信号终止
await new Promise<void>(() => {});
