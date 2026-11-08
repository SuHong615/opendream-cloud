#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 根测试入口（T4.1）。
 *
 * 为什么不用裸 `bun test <dir>`：
 *  - `bun test packages` 会递归进入 workspace 的 node_modules 符号链接，Bun 1.4.3/Windows 会崩溃；
 *  - `tests/e2e/*.spec.ts` 是 Playwright 用例，不应被 bun test 执行。
 *
 * 因此本脚本显式发现 `*.test.ts`（排除 node_modules/dist/.next/upstream/tests/e2e），
 * 再以文件列表调用 `bun test`；无测试时打印提示并退出 0。
 *
 * 范围：默认 packages/services/scripts/tests（跨包契约与冒烟）；`--all` 额外包含 apps/*。
 * apps 的测试平时由各自 package 的 test 脚本负责，CI 汇总时用 `bun run test:all`。
 *
 * 用法：bun run test [--watch] [--all]
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const WATCH = process.argv.includes("--watch");
const ALL = process.argv.includes("--all");
const SEARCH_ROOTS = ALL
  ? ["packages", "services", "apps", "scripts", "tests"]
  : ["packages", "services", "scripts", "tests"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".next", "coverage", "upstream", ".git", ".data"]);
const SKIP_PATH_SEGMENTS = [join("tests", "e2e"), join("tests", "perf")];

function discover(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (SKIP_PATH_SEGMENTS.some((seg) => abs.endsWith(seg))) continue;
      discover(abs, out);
    } else if (/\.test\.(tsx?|mjs)$/.test(entry.name)) {
      out.push(abs);
    }
  }
}

const files: string[] = [];
for (const root of SEARCH_ROOTS) discover(join(ROOT, root), files);

if (files.length === 0) {
  console.log("[test] no *.test.ts found; nothing to run (ok)");
  process.exit(0);
}

console.log(`[test] ${files.length} test file(s)${ALL ? " (all workspaces)" : ""}:`);
for (const f of files) console.log(`  - ${relative(ROOT, f)}`);

const args = ["test", ...(WATCH ? ["--watch"] : []), ...files];
const proc = Bun.spawn(["bun", ...args], { cwd: ROOT, stdio: ["inherit", "inherit", "inherit"] });
const code = await proc.exited;
process.exit(code);
