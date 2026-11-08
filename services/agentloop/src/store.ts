// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

export interface TraceSpan {
  name: string;
  status: "ok" | "error";
  duration_ms?: number;
  attributes?: Record<string, unknown>;
}
export interface Trace {
  id: string;
  org_id: string;
  trace_id: string;
  run_id: string;
  status: "ok" | "error";
  spans: TraceSpan[];
  created_at: string;
}
export interface EvalRun {
  id: string;
  org_id: string;
  name: string;
  status: "passed" | "failed";
  score: number;
  passed: number;
  total: number;
  cases: Array<{ trace_id: string; passed: boolean; reason: string }>;
  created_at: string;
}
export interface Gate {
  id: string;
  org_id: string;
  name: string;
  min_score: number;
  active: boolean;
  created_at: string;
}

function now(): string { return new Date().toISOString(); }

export class AgentLoopStore {
  private readonly db: Database;
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS traces (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS eval_runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS gates (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (org_id TEXT NOT NULL, key TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY (org_id, key));
    `);
  }

  upsertTrace(input: { orgId: string; traceId: string; runId: string; status: "ok" | "error"; spans: TraceSpan[] }): Trace {
    const existing = this.db.query<{ data: string }, [string, string]>("SELECT data FROM traces WHERE org_id = ? AND json_extract(data, '$.trace_id') = ?").get(input.orgId, input.traceId);
    if (existing) return JSON.parse(existing.data) as Trace;
    const trace: Trace = { id: `tr_${randomUUID().replace(/-/g, "").slice(0, 16)}`, org_id: input.orgId, trace_id: input.traceId, run_id: input.runId, status: input.status, spans: input.spans, created_at: now() };
    this.db.query("INSERT INTO traces (id, org_id, data) VALUES (?, ?, ?)").run(trace.id, trace.org_id, JSON.stringify(trace));
    return trace;
  }

  getTrace(orgId: string, traceId: string): Trace | null {
    const row = this.db.query<{ data: string }, [string, string]>("SELECT data FROM traces WHERE org_id = ? AND json_extract(data, '$.trace_id') = ?").get(orgId, traceId);
    return row ? JSON.parse(row.data) as Trace : null;
  }

  listTraces(orgId: string): Trace[] {
    return this.db.query<{ data: string }, [string]>("SELECT data FROM traces WHERE org_id = ? ORDER BY rowid DESC LIMIT 200").all(orgId).map((row) => JSON.parse(row.data) as Trace);
  }

  createEvalRun(input: { orgId: string; name: string; cases: Array<{ trace_id: string; expected_status?: "ok" | "error" }> }): EvalRun {
    const results = input.cases.map((item) => {
      const trace = this.getTrace(input.orgId, item.trace_id);
      if (!trace) return { trace_id: item.trace_id, passed: false, reason: "trace_not_found" };
      const expected = item.expected_status ?? "ok";
      return { trace_id: item.trace_id, passed: trace.status === expected && trace.spans.every((span) => span.status === "ok"), reason: trace.status === expected ? "matched" : "status_mismatch" };
    });
    const passed = results.filter((item) => item.passed).length;
    const evalRun: EvalRun = {
      id: `eval_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      org_id: input.orgId,
      name: input.name,
      status: results.length > 0 && passed === results.length ? "passed" : "failed",
      score: results.length ? Number((passed / results.length).toFixed(3)) : 0,
      passed,
      total: results.length,
      cases: results,
      created_at: now(),
    };
    this.db.query("INSERT INTO eval_runs (id, org_id, data) VALUES (?, ?, ?)").run(evalRun.id, evalRun.org_id, JSON.stringify(evalRun));
    return evalRun;
  }

  listEvalRuns(orgId: string): EvalRun[] {
    return this.db.query<{ data: string }, [string]>("SELECT data FROM eval_runs WHERE org_id = ? ORDER BY rowid DESC LIMIT 100").all(orgId).map((row) => JSON.parse(row.data) as EvalRun);
  }

  createGate(input: { orgId: string; name: string; minScore: number }): Gate {
    const gate: Gate = { id: `gate_${randomUUID().replace(/-/g, "").slice(0, 16)}`, org_id: input.orgId, name: input.name, min_score: input.minScore, active: true, created_at: now() };
    this.db.query("INSERT INTO gates (id, org_id, data) VALUES (?, ?, ?)").run(gate.id, gate.org_id, JSON.stringify(gate));
    return gate;
  }

  listGates(orgId: string): Gate[] {
    return this.db.query<{ data: string }, [string]>("SELECT data FROM gates WHERE org_id = ? ORDER BY rowid DESC").all(orgId).map((row) => JSON.parse(row.data) as Gate);
  }

  getIdempotent(orgId: string, key: string): unknown | null {
    const row = this.db.query<{ response: string }, [string, string]>("SELECT response FROM idempotency WHERE org_id = ? AND key = ?").get(orgId, key);
    return row ? JSON.parse(row.response) : null;
  }
  setIdempotent(orgId: string, key: string, response: unknown): void {
    this.db.query("INSERT OR REPLACE INTO idempotency (org_id, key, response) VALUES (?, ?, ?)").run(orgId, key, JSON.stringify(response));
  }
  close(): void { this.db.close(); }
}
