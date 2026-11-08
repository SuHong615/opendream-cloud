#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * 端口一致性门禁：禁止出现历史端口 `4200`（lead 2026-11-08 冻结：mcp-hub = 4104）。
 *
 * 扫描：docs/ deploy/ services/ scripts/ apps/ + 根配置
 * 排除：node_modules/.git/upstream/dist/build/.next/coverage/evidence（历史证据快照）/*.lock/*.tsbuildinfo/二进制
 * 用途：`bun run check:ports`；已加入根 `lint`（CI 执行）。G-V3 证据引用本脚本。
 *
 * ── allowlist 政策（architect 2026-11-08 复核要求）────────────────────────────
 * 1) **目的**：允许的命中只用于三类上下文，不代表端口可配置/可用：
 *    a. 禁止性说明（"只允许 4104、禁止 4200"）；
 *    b. 测试判据（"4200 出现即测试失败"）；
 *    c. 证据/历史记录引用（`port-4200-scan` 文件名、"文档笔误"已知问题归档）。
 * 2) **原则**：任何"真正的端口配置/代码/命令/路由"中出现 4200 都必须 BLOCK；
 *    不得为了让流水线变绿而扩大 allowlist；新增 allowlist 词必须经 architect + qa 复核并在此处注释理由。
 * 3) **过期复核**：G5/G6 门禁前必做一次（并在此前检查是否仍有真实 4200 残留）：
 *    - `ALLOWLIST_REVIEW_MILESTONES = ["G5", "G6"]`
 *    - `ALLOWLIST_REVIEW_DUE = "2026-12-15"`（G5 前；如节奏变化由 infra 更新）
 *    - 到期后每次运行打印 WARN；`--strict-allowlist` 在过期后返回 2（CI 可用）。
 * 4) 排除 `docs/05-delivery/evidence/**` 的原因：历史扫描快照本身包含旧结论，
 *    纳入会导致门禁对归档误报；G-V3 证据由 qa 归档 + 本脚本二次扫描佐证。
 * ──────────────────────────────────────────────────────────────────────────
 *
 * 退出码：0 = 通过；1 = 存在 BLOCK；2 = `--strict-allowlist` 且 allowlist 已过复核期。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const ROOTS = ["docs", "deploy", "services", "scripts", "apps"];
const ROOT_FILES = [
  "package.json",
  "tsconfig.json",
  "tsconfig.base.json",
  "bunfig.toml",
  ".env.example",
  "README.md",
  ".gitignore",
];
const TEXT_EXT = /\.(md|yaml|yml|json|ts|tsx|js|mjs|cjs|toml|sh|ps1|conf|example)$/i;
const EXCLUDE_PATH =
  /(^|[\\/])(node_modules|\.git|upstream|dist|build|\.next|coverage|evidence)([\\/]|$)|\.(tsbuildinfo|lock)$|package-lock\.json|bun\.lock/i;
/** 自身脚本包含 "4200" 字面量（用于检测），不参与扫描。 */
const SELF = resolve(import.meta.dir, "check-port-4200.mjs");

/** 禁止性说明 / 测试判据（architect 指定；含实际文档措辞：测试失败/判据/门禁）。 */
const PROHIBITION_RE = /禁止|作废|即失败|即测试失败|测试失败|历史值|deprecated|判据|门禁/i;
/** 证据文件名 / 已知问题归档引用（非配置；见头部政策 1c）。 */
const EVIDENCE_REF_RE = /port-4200-scan|文档笔误|check-port-4200/i;

/** allowlist 过期复核（G5/G6 前；到期后 --strict-allowlist 返回 2）。 */
const ALLOWLIST_REVIEW_MILESTONES = ["G5", "G6"];
const ALLOWLIST_REVIEW_DUE = "2026-12-15";
const STRICT_ALLOWLIST = process.argv.includes("--strict-allowlist");

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (EXCLUDE_PATH.test(abs)) continue;
    if (entry.isDirectory()) walk(abs, out);
    else if (TEXT_EXT.test(entry.name)) out.push(abs);
  }
}

const files = [];
for (const root of ROOTS) walk(join(ROOT, root), files);
for (const name of ROOT_FILES) {
  const abs = join(ROOT, name);
  if (existsSync(abs) && statSync(abs).isFile()) files.push(abs);
}
const scanFiles = files.filter((f) => resolve(f) !== SELF);

const hits = [];
for (const file of scanFiles) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue; // 二进制/不可读 → 跳过（只读扫描）
  }
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!line.includes("4200")) return;
    const prohibition = PROHIBITION_RE.test(line);
    const evidenceRef = !prohibition && EVIDENCE_REF_RE.test(line);
    hits.push({
      file: relative(ROOT, file),
      line: idx + 1,
      classification: prohibition ? "禁止性说明/测试判据" : evidenceRef ? "证据引用/已知问题" : "blocking",
      allowed: prohibition || evidenceRef,
      context: line.trim().slice(0, 200),
    });
  });
}

const blocking = hits.filter((h) => !h.allowed);
const today = new Date().toISOString().slice(0, 10);
const overdue = today > ALLOWLIST_REVIEW_DUE;

console.log(`[check-ports] scanned ${scanFiles.length} files; "4200" hits: ${hits.length}`);
for (const h of hits) {
  const tag = h.allowed ? `ALLOW(${h.classification})` : "BLOCK";
  console.log(`  ${tag} ${h.file}:${h.line}  ${h.context}`);
}
console.log(
  `[check-ports] allowlist review: ${ALLOWLIST_REVIEW_MILESTONES.join("/")} 前必需；due ${ALLOWLIST_REVIEW_DUE}` +
    (overdue ? "  ⚠️ OVERDUE：请先复核是否仍有真实 4200 残留，再决定是否保留 allowlist" : ""),
);

if (blocking.length > 0) {
  console.error(
    `\n[check-ports] FAILED: ${blocking.length} blocking hit(s). mcp-hub 唯一端口为 4104（lead 2026-11-08 冻结）；` +
      `4200 仅允许出现在"禁止性说明/测试判据/证据引用"中。`,
  );
  process.exit(1);
}
if (overdue && STRICT_ALLOWLIST) {
  console.error(`\n[check-ports] FAILED(strict): allowlist 复核已过期（due ${ALLOWLIST_REVIEW_DUE}），请复核后更新 ALLOWLIST_REVIEW_DUE。`);
  process.exit(2);
}
console.log(`[check-ports] OK: ${hits.length} hit(s) all allowlisted（禁止性说明/测试判据/证据引用）。`);
process.exit(0);
