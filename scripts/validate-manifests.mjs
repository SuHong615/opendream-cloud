#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * Deploy manifest validator (G4 / task-13).
 * Dependency-free static checks for kind manifests, Helm chart and workspace image.
 * Exit 0 = all checks pass, 1 = at least one problem.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const problems = [];
const notes = [];

const ok = (message) => notes.push(`ok   ${message}`);
const bad = (file, message) => problems.push(`${relative(ROOT, file)}: ${message}`);

function read(rel) {
  const abs = join(ROOT, rel);
  return existsSync(abs) ? readFileSync(abs, "utf8") : undefined;
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git"].includes(entry.name)) continue;
      walk(abs, out);
    } else if (/\.ya?ml$/i.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

// 1) Root config
for (const rel of ["package.json", "tsconfig.json", "tsconfig.base.json"]) {
  const text = read(rel);
  if (text === undefined) {
    bad(rel, "missing");
    continue;
  }
  try {
    JSON.parse(text);
    ok(rel);
  } catch (error) {
    bad(rel, `invalid JSON: ${error.message}`);
  }
}

const pkg = JSON.parse(read("package.json") ?? "{}");
for (const script of ["dev", "test", "build", "lint", "smoke:api"]) {
  if (!pkg.scripts?.[script]) bad("package.json", `missing script: ${script}`);
}

// 2) Kind manifests: apiVersion/kind + required objects
const kindFiles = walk(join(ROOT, "deploy", "kind"));
if (kindFiles.length === 0) bad("deploy/kind", "no YAML manifests");

const kinds = new Map();
let kindText = "";
for (const file of kindFiles) {
  const text = readFileSync(file, "utf8");
  kindText += `\n# ${relative(ROOT, file)}\n${text}`;
  if (text.trim().length === 0) bad(file, "empty YAML file");
  if (/^\t/m.test(text)) bad(file, "YAML must not use Tab indentation");
  for (const doc of text.split(/^---$/m)) {
    if (!doc.trim()) continue;
    const apiVersion = /^apiVersion:\s*(\S+)/m.exec(doc)?.[1];
    const kind = /^kind:\s*(\S+)/m.exec(doc)?.[1];
    if (!apiVersion || !kind) bad(file, "document missing apiVersion/kind");
    else kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
}
for (const required of ["Namespace", "CustomResourceDefinition", "Deployment", "Service", "NetworkPolicy", "ResourceQuota", "RuntimeClass"]) {
  if (!kinds.has(required)) bad("deploy/kind", `missing required kind: ${required}`);
}

// 3.1 G5 四中心服务必须出现在 kind 清单中
const centers = read("deploy/kind/35-centers.yaml") ?? "";
for (const center of ["skill-center", "eval-center", "app-center", "mcp-hub"]) {
  if (!centers.includes(`name: ${center}`)) bad("deploy/kind/35-centers.yaml", `missing center: ${center}`);
}

// 3) Resource guarantees: workspace 4C8G, app 1C2G, PVC Retain
const quota = read("deploy/kind/50-netpol-quota.yaml") ?? "";
if (!/cpu:\s*"?4"?/.test(quota) || !/memory:\s*"?8Gi"?/.test(quota)) {
  bad("deploy/kind/50-netpol-quota.yaml", "workspace LimitRange must be 4C8G");
}
if (!/cpu:\s*"?1"?/.test(quota) || !/memory:\s*"?2Gi"?/.test(quota)) {
  bad("deploy/kind/50-netpol-quota.yaml", "app LimitRange must be 1C2G");
}
const storage = (read("deploy/kind/40-ingress-storage.yaml") ?? "") + (read("deploy/kind/60-samples.yaml") ?? "");
if (!/reclaimPolicy:\s*(Retain|retain)/.test(storage)) {
  bad("deploy/kind", "workspace PVC must use Retain");
}
const crd = read("deploy/kind/10-crd.yaml") ?? "";
if (!/resources:/.test(crd)) bad("deploy/kind/10-crd.yaml", "CRD must declare resources (4C8G)");
if (!/reclaimPolicy/.test(crd)) bad("deploy/kind/10-crd.yaml", "CRD must declare reclaimPolicy");

// 4) Pod hardening
for (const rel of ["deploy/kind/20-operator.yaml", "deploy/kind/30-data-plane.yaml"]) {
  const text = read(rel) ?? "";
  if (!/runAsNonRoot:\s*true/.test(text)) bad(rel, "missing runAsNonRoot: true");
  if (!/readOnlyRootFilesystem:\s*true/.test(text)) bad(rel, "missing readOnlyRootFilesystem: true");
  if (!/allowPrivilegeEscalation:\s*false/.test(text)) bad(rel, "missing allowPrivilegeEscalation: false");
}
if (!/name:\s*sandbox-runtime/.test(read("deploy/kind/15-runtimeclass.yaml") ?? "")) {
  bad("deploy/kind/15-runtimeclass.yaml", "missing RuntimeClass sandbox-runtime");
}

// 5) Helm chart
const chart = read("deploy/helm/opendream-cloud/Chart.yaml") ?? "";
if (!/^apiVersion:/m.test(chart) || !/^name:/m.test(chart) || !/^version:/m.test(chart)) {
  bad("deploy/helm/opendream-cloud/Chart.yaml", "invalid chart metadata");
}
const values = read("deploy/helm/opendream-cloud/values.yaml") ?? "";
for (const key of ["workspace", "image", "resources"]) {
  if (!values.includes(key)) bad("deploy/helm/opendream-cloud/values.yaml", `missing key: ${key}`);
}

// 6) Workspace runtime image
const dockerfile = read("deploy/docker/workspace/Dockerfile") ?? "";
for (const [label, pattern] of [
  ["non-root USER", /^USER\s+\d+:\d+/m],
  ["EXPOSE 4096", /EXPOSE[^\n]*4096/],
  ["bun base image", /FROM\s+oven\/bun:/],
  ["opencode version pin", /OPENCODE_VERSION/],
  ["entrypoint", /ENTRYPOINT/],
]) {
  if (!pattern.test(dockerfile)) bad("deploy/docker/workspace/Dockerfile", `missing ${label}`);
}
const entrypoint = read("deploy/docker/workspace/entrypoint.sh") ?? "";
if (!/OPENCODE_SERVER_PASSWORD:?/.test(entrypoint)) bad("deploy/docker/workspace/entrypoint.sh", "must require OPENCODE_SERVER_PASSWORD");
if (!/--port\s+4096|OPENCODE_PORT/.test(entrypoint)) bad("deploy/docker/workspace/entrypoint.sh", "must pin port 4096");

// Report
console.log(`[validate-manifests] yaml files=${kindFiles.length}, kinds=${[...kinds.keys()].sort().join(",")}`);
for (const note of notes) console.log(`  ${note}`);
for (const problem of problems) console.error(`  FAIL ${problem}`);
if (problems.length > 0) {
  console.error(`[validate-manifests] ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`[validate-manifests] PASS (${notes.length} checks)`);
