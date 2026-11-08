#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/** 清理本地构建产物（不动 node_modules，避免误删缓存）。 */
import { existsSync, rmSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const targets = [
  "packages/shared/dist",
  "coverage",
  ".turbo",
  ...readdirSync(join(ROOT, "apps"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `apps/${d.name}/.next`),
  ...readdirSync(join(ROOT, "services"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => `services/${d.name}/dist`),
];

for (const rel of targets) {
  const abs = join(ROOT, rel);
  if (existsSync(abs)) {
    rmSync(abs, { recursive: true, force: true });
    console.log(`[clean] removed ${rel}`);
  }
}
console.log("[clean] ok");
