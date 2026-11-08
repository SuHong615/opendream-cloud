// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const roots = ["apps", "services", "packages"];
const nameMap = {
  "@oc/console": "@opendream-cloud/console",
  "@opencode/agent-workforce": "@opendream-cloud/agent-workforce",
  "@opencode/experiment-center": "@opendream-cloud/experiment-center",
};

function packageFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    out.push(join(full, "package.json"));
  }
  return out;
}

const files = ["package.json", ...roots.flatMap((root) => packageFiles(root))];
let changed = 0;
for (const file of files) {
  if (!existsSync(file)) continue;
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (json.name && nameMap[json.name]) json.name = nameMap[json.name];
  json.license = "Apache-2.0";
  json.author = "suhong";
  json.contributors = ["suhong"];
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  changed += 1;
}
console.log(`updated ${changed} package.json files`);
