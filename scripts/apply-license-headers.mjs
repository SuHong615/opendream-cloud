/**
 * 给自研源码添加 Apache-2.0 SPDX + author 头（幂等）。
 * 不处理 node_modules / .next / dist / upstream / 生成文件 / 第三方文件。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["apps", "services", "packages", "scripts", "tests"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".data", "test-results", "upstream", "coverage"]);
const SKIP_FILES = new Set(["next-env.d.ts"]);
const HEADER = `// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
`;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(extname(entry)) && !SKIP_FILES.has(entry)) out.push(full);
  }
  return out;
}

let touched = 0;
for (const root of ROOTS) {
  let files;
  try {
    files = walk(join(ROOT, root));
  } catch {
    continue;
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    if (text.includes("SPDX-License-Identifier: Apache-2.0")) continue;
    if (!text.trim()) continue;
    const shebang = text.startsWith("#!") ? text.slice(0, text.indexOf("\n") + 1) : "";
    let body = shebang ? text.slice(shebang.length) : text;
    let directive = "";
    const directiveMatch = body.match(/^(["']use (?:client|server)["'];?\s*\n)/);
    if (directiveMatch) {
      directive = directiveMatch[1];
      body = body.slice(directive.length);
    }
    writeFileSync(file, `${shebang}${directive}${HEADER}${body}`);
    touched += 1;
  }
}
console.log(`added license headers to ${touched} files (${relative(ROOT, ROOT)})`);
