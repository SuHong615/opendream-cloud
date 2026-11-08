// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateWorkflow, semanticChecks } from "../scripts/validate-workflow.mjs";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(join(PKG, "schemas/workflow-v1.json"), "utf8"));
const examplesDir = join(PKG, "examples");

describe("workflow-v1 schema", () => {
  test("schema 本身是合法 JSON 且为 2020-12", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toContain("workflow-v1.json");
    expect(Object.keys(schema.$defs).length).toBeGreaterThan(10);
  });

  test("10 类节点枚举齐全", () => {
    const nodeTypes = schema.$defs.nodeBase.properties.type.enum;
    expect(nodeTypes).toEqual([
      "agent", "mcp_tool", "human_approval", "condition", "parallel",
      "subworkflow", "timer", "webhook", "script", "render",
    ]);
  });

  test("示例全部通过 schema + 语义校验", () => {
    const files = readdirSync(examplesDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const doc = JSON.parse(readFileSync(join(examplesDir, f), "utf8"));
      const { valid, errors } = validateWorkflow(doc, schema);
      expect({ file: f, errors }).toEqual({ file: f, errors: [] });
      expect(valid).toBe(true);
    }
  });

  test("反例：未知节点类型被拒", () => {
    const doc = structuredClone(JSON.parse(readFileSync(join(examplesDir, "cs-ticket.json"), "utf8")));
    doc.spec.nodes[0].type = "quantum_node";
    const { valid } = validateWorkflow(doc, schema);
    expect(valid).toBe(false);
  });

  test("反例：needs 引用不存在节点", () => {
    const doc = structuredClone(JSON.parse(readFileSync(join(examplesDir, "cs-ticket.json"), "utf8")));
    doc.spec.nodes[2].needs = ["nope"];
    const { valid, errors } = validateWorkflow(doc, schema);
    expect(valid).toBe(false);
    expect(errors.join("\n")).toContain("nope");
  });

  test("反例：DAG 有环", () => {
    const doc = structuredClone(JSON.parse(readFileSync(join(examplesDir, "cs-ticket.json"), "utf8")));
    doc.spec.nodes[0].needs = ["close"];
    const { errors } = semanticChecks(doc);
    expect(errors.join("\n")).toContain("环");
  });

  test("反例：agent 缺 model_ref", () => {
    const doc = structuredClone(JSON.parse(readFileSync(join(examplesDir, "cs-ticket.json"), "utf8")));
    delete doc.spec.nodes[0].model_ref;
    const { valid, errors } = validateWorkflow(doc, schema);
    expect(valid).toBe(false);
    expect(errors.join("\n")).toContain("model_ref");
  });
});
