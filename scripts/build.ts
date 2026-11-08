#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 根构建脚本（T4.1 占位版）：
 * 1) 类型检查（tsc --noEmit，覆盖 scripts + packages/shared）；
 * 2) 构建 packages/shared 到 dist（bun build，后续服务通过 workspace 引用）。
 *
 * apps/* / services/* 的构建由各自 package.json 的 build 脚本负责（G4 后补）。
 */
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

async function run(cmd: string[], label: string): Promise<void> {
  console.log(`\n[build] ${label}: ${cmd.join(" ")}`);
  const proc = Bun.spawn(cmd, { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`[build] ${label} failed (exit ${code})`);
    process.exit(code);
  }
}

await run(["bunx", "tsc", "--noEmit", "-p", "tsconfig.json"], "typecheck");
await run(
  ["bun", "build", "packages/shared/src/index.ts", "--outdir", "packages/shared/dist", "--target", "bun", "--format", "esm"],
  "packages/shared",
);

console.log("\n[build] ok");
