#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
/**
 * workflow-v1 JSON Schema validator (dependency-free).
 *
 * 支持 JSON Schema 2020-12 子集：$ref / type / required / properties / additionalProperties(false)
 * / items / minItems / maxItems / minProperties / maxProperties / enum / const / pattern
 * / minimum / maximum / anyOf / allOf / oneOf / if-then-else / uniqueItems。
 * 另做 DSL 语义校验：id 唯一、needs/compensate/next/else/onError route 引用存在、DAG 无环、
 * 有副作用节点缺补偿告警（warning，不失败）。
 *
 * 用法：
 *   node packages/schema/scripts/validate-workflow.mjs [file.json ...]
 *   默认校验 packages/schema/examples/*.json
 * 退出码：0 = 全部通过；1 = 有错误。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(HERE, "..");
const SCHEMA_PATH = resolve(PKG, "schemas/workflow-v1.json");

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "number" ? (Number.isInteger(v) ? "integer" : "number") : typeof v);

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`unsupported $ref: ${ref}`);
  let cur = root;
  for (const part of ref.slice(2).split("/")) {
    const p = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isObj(cur) || !(p in cur)) throw new Error(`broken $ref: ${ref}`);
    cur = cur[p];
  }
  return cur;
}

function validate(root, schema, data, path, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${path}: schema is false`);
    return;
  }
  if (schema.$ref) {
    validate(root, resolveRef(root, schema.$ref), data, path, errors);
    return;
  }
  if (schema.if !== undefined) {
    const branch = [];
    validate(root, schema.if, data, path, branch);
    if (branch.length === 0 && schema.then !== undefined) validate(root, schema.then, data, path, errors);
    if (branch.length > 0 && schema.else !== undefined) validate(root, schema.else, data, path, errors);
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (!Array.isArray(schema[key])) continue;
    const results = schema[key].map((sub) => {
      const errs = [];
      validate(root, sub, data, path, errs);
      return errs;
    });
    if (key === "allOf") {
      results.forEach((errs) => errors.push(...errs));
    } else if (key === "anyOf") {
      if (!results.some((e) => e.length === 0)) errors.push(`${path}: anyOf 未命中（${results.map((e) => e[0]).filter(Boolean).slice(0, 3).join(" | ")}）`);
    } else {
      const ok = results.filter((e) => e.length === 0).length;
      if (ok !== 1) errors.push(`${path}: oneOf 需恰好命中 1 个分支，实际 ${ok}`);
    }
  }
  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    const okType = allowed.includes(actual) || (actual === "integer" && allowed.includes("number"));
    if (!okType) {
      errors.push(`${path}: 期望类型 ${allowed.join("|")}，实际 ${actual}`);
      return;
    }
  }
  if (schema.const !== undefined && data !== schema.const) errors.push(`${path}: 期望常量 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(data)}`);
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => v === data)) errors.push(`${path}: 不在枚举 [${schema.enum.join(", ")}] 内（实际 ${JSON.stringify(data)}）`);

  if (typeof data === "string") {
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(data)) errors.push(`${path}: 不匹配 pattern ${schema.pattern}（实际 ${JSON.stringify(data)}）`);
    if (schema.minLength !== undefined && data.length < schema.minLength) errors.push(`${path}: 长度 < ${schema.minLength}`);
    if (schema.maxLength !== undefined && data.length > schema.maxLength) errors.push(`${path}: 长度 > ${schema.maxLength}`);
  }
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum) errors.push(`${path}: < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) errors.push(`${path}: > maximum ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push(`${path}: 元素数 < ${schema.minItems}`);
    if (schema.maxItems !== undefined && data.length > schema.maxItems) errors.push(`${path}: 元素数 > ${schema.maxItems}`);
    if (schema.uniqueItems) {
      const seen = new Set();
      for (const v of data) {
        const k = JSON.stringify(v);
        if (seen.has(k)) errors.push(`${path}: 元素重复 ${k}`);
        seen.add(k);
      }
    }
    if (schema.items !== undefined) data.forEach((v, i) => validate(root, schema.items, v, `${path}[${i}]`, errors));
  }
  if (isObj(data)) {
    const props = schema.properties ?? {};
    if (schema.required) for (const k of schema.required) if (!(k in data)) errors.push(`${path}: 缺少必填字段 ${k}`);
    if (schema.minProperties !== undefined && Object.keys(data).length < schema.minProperties) errors.push(`${path}: 属性数 < ${schema.minProperties}`);
    if (schema.maxProperties !== undefined && Object.keys(data).length > schema.maxProperties) errors.push(`${path}: 属性数 > ${schema.maxProperties}`);
    for (const [k, v] of Object.entries(data)) {
      if (k in props) validate(root, props[k], v, `${path}.${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: 不允许的字段 ${k}`);
      else if (isObj(schema.additionalProperties)) validate(root, schema.additionalProperties, v, `${path}.${k}`, errors);
    }
  }
}

/** DSL 语义检查（schema 之外）。返回 {errors, warnings}。 */
export function semanticChecks(doc) {
  const errors = [];
  const warnings = [];
  const spec = doc?.spec ?? {};
  const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];
  const ids = new Set();
  for (const n of nodes) {
    if (isObj(n) && typeof n.id === "string") {
      if (ids.has(n.id)) errors.push(`nodes: id 重复 ${n.id}`);
      ids.add(n.id);
    }
  }
  const ref = (target, where) => {
    if (!target) return;
    if (!ids.has(target)) errors.push(`${where}: 引用不存在的节点 ${target}`);
  };
  for (const n of nodes) {
    if (!isObj(n)) continue;
    (n.needs ?? []).forEach((x) => ref(x, `node ${n.id}.needs`));
    ref(n.compensate, `node ${n.id}.compensate`);
    if (typeof n.onError === "string" && n.onError.startsWith("route:")) ref(n.onError.slice(6), `node ${n.id}.onError`);
    if (n.type === "condition") {
      (n.cases ?? []).forEach((c, i) => ref(c?.next, `node ${n.id}.cases[${i}].next`));
      ref(n.else, `node ${n.id}.else`);
      ref(n.then, `node ${n.id}.then`);
    }
    if (n.type === "parallel") {
      (n.branches ?? []).forEach((b, i) => (typeof b === "string" ? ref(b, `node ${n.id}.branches[${i}]`) : ref(b?.id, `node ${n.id}.branches[${i}].id`)));
      if (n.join === "n_of_m" && typeof n.n !== "number") errors.push(`node ${n.id}: join=n_of_m 需要 n`);
    }
    if (["mcp_tool", "render", "agent"].includes(n.type) && !n.compensate) {
      warnings.push(`node ${n.id}: ${n.type} 可能有副作用，建议声明 compensate（Saga）`);
    }
  }
  // DAG 环检测（needs 边长）
  const graph = new Map(nodes.filter(isObj).map((n) => [n.id, n.needs ?? []]));
  const state = new Map();
  const dfs = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      errors.push(`DAG 存在环: ${[...stack, id].join(" -> ")}`);
      return;
    }
    state.set(id, 1);
    for (const next of graph.get(id) ?? []) dfs(next, [...stack, id]);
    state.set(id, 2);
  };
  for (const id of graph.keys()) dfs(id, []);
  return { errors, warnings };
}

export function validateWorkflow(doc, schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"))) {
  const errors = [];
  validate(schema, schema, doc, "$", errors);
  const sem = semanticChecks(doc);
  return { valid: errors.length === 0 && sem.errors.length === 0, errors: [...errors, ...sem.errors], warnings: sem.warnings };
}

function main() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : readdirSync(resolve(PKG, "examples")).filter((f) => f.endsWith(".json")).map((f) => resolve(PKG, "examples", f));

  let failed = 0;
  for (const file of files) {
    if (!existsSync(file)) {
      console.error(`MISSING ${file}`);
      failed++;
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      console.error(`INVALID JSON ${file}: ${e.message}`);
      failed++;
      continue;
    }
    const { valid, errors, warnings } = validateWorkflow(doc, schema);
    const name = basename(file);
    if (valid) {
      console.log(`PASS ${name}${warnings.length ? ` (warnings: ${warnings.length})` : ""}`);
      warnings.forEach((w) => console.log(`  WARN ${w}`));
    } else {
      failed++;
      console.error(`FAIL ${name}`);
      errors.forEach((e) => console.error(`  - ${e}`));
    }
  }
  console.log(failed === 0 ? `\nRESULT: PASS (${files.length} file(s))` : `\nRESULT: FAIL (${failed}/${files.length})`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
