// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { JsonObject, WorkflowDsl, WorkflowNode } from "./core";

export interface DslValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ValidatorModule {
  validateWorkflow(doc: unknown): { valid?: boolean; errors?: string[]; warnings?: string[] };
}

let cachedValidator: ValidatorModule | null = null;

async function loadValidator(): Promise<ValidatorModule> {
  if (cachedValidator) return cachedValidator;
  const href = new URL("../../../packages/schema/scripts/validate-workflow.mjs", import.meta.url).href;
  const mod = (await import(href)) as unknown as ValidatorModule;
  if (typeof mod.validateWorkflow !== "function") throw new Error("workflow schema validator is unavailable");
  cachedValidator = mod;
  return mod;
}

/** 复用 packages/schema 的 workflow-v1 校验器（JSON Schema + DAG/引用/DAG 环语义检查）。 */
export async function validateDsl(doc: unknown): Promise<DslValidation> {
  try {
    const validator = await loadValidator();
    const result = validator.validateWorkflow(doc);
    return {
      valid: result.valid === true,
      errors: Array.isArray(result.errors) ? result.errors : [],
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    };
  } catch (error) {
    return { valid: false, errors: [`dsl_validator_unavailable: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
}

export function nodesOf(dsl: WorkflowDsl): WorkflowNode[] {
  return Array.isArray(dsl.spec?.nodes) ? (dsl.spec.nodes as WorkflowNode[]) : [];
}

export function nodeMap(dsl: WorkflowDsl): Map<string, WorkflowNode> {
  return new Map(nodesOf(dsl).map((node) => [node.id, node]));
}

export function isCompensationNode(dsl: WorkflowDsl): Set<string> {
  const result = new Set<string>();
  for (const node of nodesOf(dsl)) if (typeof node.compensate === "string") result.add(node.compensate);
  return result;
}

/** 允许 JSON Schema 子集：required / properties.type / enum / items.type，用于 inputs 预检。 */
export function validateInputs(schema: unknown, inputs: JsonObject): string[] {
  if (schema === undefined || schema === true) return [];
  if (schema === false) return ["inputs schema is false"];
  if (typeof schema !== "object" || schema === null) return [];
  const spec = schema as JsonObject;
  const errors: string[] = [];
  const required = Array.isArray(spec.required) ? (spec.required as string[]) : [];
  for (const key of required) if (!(key in inputs)) errors.push(`inputs.${key}: required`);
  const properties = spec.properties;
  if (properties && typeof properties === "object") {
    for (const [key, property] of Object.entries(properties as JsonObject)) {
      if (!(key in inputs)) continue;
      const value = inputs[key];
      const propertySpec = property as JsonObject;
      if (typeof propertySpec !== "object" || propertySpec === null) continue;
      const expected = propertySpec.type;
      if (typeof expected === "string" && !matchesType(value, expected)) errors.push(`inputs.${key}: expected ${expected}`);
      if (Array.isArray(propertySpec.enum) && !propertySpec.enum.includes(value)) errors.push(`inputs.${key}: expected one of enum`);
    }
  }
  return errors;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

export interface ExpressionContext {
  inputs: JsonObject;
  steps: Record<string, { output?: unknown; status?: string }>;
  run: { id: string; tenantId: string };
  secrets?: Record<string, string>;
  env?: Record<string, string>;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function resolvePath(path: string, ctx: ExpressionContext): unknown {
  const parts = path.trim().split(".").filter(Boolean);
  if (parts.length === 0) return undefined;
  const [root, ...rest] = parts;
  let current: unknown;
  if (root === "inputs") current = ctx.inputs;
  else if (root === "steps") current = ctx.steps;
  else if (root === "run") current = ctx.run;
  else if (root === "secrets") current = ctx.secrets ?? {};
  else if (root === "env") current = ctx.env ?? {};
  else current = ctx.inputs[root as string];
  for (const part of rest) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as JsonObject)[part];
  }
  return current;
}

function operand(token: string, ctx: ExpressionContext): unknown {
  const trimmed = token.trim();
  if (trimmed.startsWith("${") && trimmed.endsWith("}")) return resolvePath(trimmed.slice(2, -1), ctx);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return unquote(trimmed);
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  if (operator === "==") return JSON.stringify(left) === JSON.stringify(right) || asString(left) === asString(right) && typeof right === "string";
  if (operator === "!=") return !compare(left, "==", right);
  const leftNumber = typeof left === "number" ? left : Number(left);
  const rightNumber = typeof right === "number" ? right : Number(right);
  if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) return false;
  if (operator === ">") return leftNumber > rightNumber;
  if (operator === "<") return leftNumber < rightNumber;
  if (operator === ">=") return leftNumber >= rightNumber;
  if (operator === "<=") return leftNumber <= rightNumber;
  return false;
}

/** 受限表达式：字段访问 + 比较 + contains()/length() + &&/||，不执行任意 JS。 */
export function evalExpression(expression: string, ctx: ExpressionContext): boolean {
  const trimmed = expression.trim();
  if (!trimmed) return true;
  const orParts = trimmed.split(/\s+\|\|\s+/);
  if (orParts.length > 1) return orParts.some((part) => evalExpression(part, ctx));
  const andParts = trimmed.split(/\s+&&\s+/);
  if (andParts.length > 1) return andParts.every((part) => evalExpression(part, ctx));
  const contains = /^contains\(\s*(.+?)\s*,\s*(.+?)\s*\)$/.exec(trimmed);
  if (contains) return asString(operand(contains[1] ?? "", ctx)).includes(asString(operand(contains[2] ?? "", ctx)));
  const length = /^length\(\s*(.+?)\s*\)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(trimmed);
  if (length) {
    const value = operand(length[1] ?? "", ctx);
    const count = Array.isArray(value) ? value.length : typeof value === "string" ? value.length : 0;
    return compare(count, length[2] ?? "==", operand(length[3] ?? "", ctx));
  }
  const relation = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(trimmed);
  if (relation) return compare(operand(relation[1] ?? "", ctx), relation[2] ?? "==", operand(relation[3] ?? "", ctx));
  return Boolean(operand(trimmed, ctx));
}
