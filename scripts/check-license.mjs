// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["apps", "services", "packages", "scripts", "tests"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".data", "test-results", "upstream", "coverage"]);
const SKIP_FILES = new Set(["next-env.d.ts"]);
const REQUIRED = ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "TRADEMARK.md", "LICENSES/APACHE-2.0.txt", "LICENSES/MIT.txt", "LICENSES/opencode-MIT.txt", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md"];

const errors = [];

for (const file of REQUIRED) {
  if (!existsSync(join(ROOT, file))) errors.push(`missing required file: ${file}`);
}

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

let checked = 0;
const missingHeaders = [];
for (const root of ROOTS) {
  const dir = join(ROOT, root);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    checked += 1;
    const text = readFileSync(file, "utf8");
    if (!text.includes("SPDX-License-Identifier: Apache-2.0") || !text.includes("Author: suhong")) {
      missingHeaders.push(file);
    }
  }
}
if (missingHeaders.length > 0) {
  errors.push(`${missingHeaders.length} source files missing license/author header, e.g.\n${missingHeaders.slice(0, 10).join("\n")}`);
}

const packageFiles = [
  "package.json",
  ...["apps", "services", "packages"].flatMap((root) => {
    const dir = join(ROOT, root);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .map((entry) => join(dir, entry, "package.json"))
      .filter((file) => existsSync(file));
  }),
];
for (const file of packageFiles) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (json.license !== "Apache-2.0") errors.push(`${file}: license must be Apache-2.0`);
  if (json.author !== "suhong") errors.push(`${file}: author must be suhong`);
}

console.log(`checked ${checked} source files, ${packageFiles.length} package.json files`);
if (errors.length > 0) {
  console.error("\nLICENSE CHECK FAILED:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("LICENSE CHECK PASS (Apache-2.0 + author suhong)");
