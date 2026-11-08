// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

export type SessionState = "created" | "active" | "closing" | "closed";
export type RunState = "queued" | "running" | "succeeded" | "failed" | "canceling" | "canceled";

export interface Session {
  id: string;
  org_id: string;
  user_id: string;
  workspace_id: string;
  workspace_mode: "cloud" | "local";
  state: SessionState;
  agent: Record<string, unknown>;
  created_at: string;
}

export interface Step {
  id: string;
  run_id: string;
  seq: number;
  type: string;
  status: "completed" | "failed";
  output: string;
  started_at: string;
  ended_at: string;
}

export interface Run {
  id: string;
  org_id: string;
  session_id: string;
  state: RunState;
  input: string;
  steps: Step[];
  usage: { tokens: number; cost_usd: number };
  legacy?: { source: string; id: string; data: unknown };
  created_at: string;
  completed_at: string | null;
}

export interface RuntimeProvider {
  id: string;
  execute(session: Session, run: Run): Promise<{ steps: Array<{ type: string; output: string }>; usage: { tokens: number; cost_usd: number } }>;
  cancel?(run: Run): Promise<void>;
}

export class MockRuntimeProvider implements RuntimeProvider {
  readonly id = "mock";
  async execute(_session: Session, run: Run) {
    return {
      steps: [
        { type: "plan", output: `plan for: ${run.input}` },
        { type: "execute", output: "executed in runtime mock" },
        { type: "verify", output: "verified artifacts" },
      ],
      usage: { tokens: 120, cost_usd: 0.001 },
    };
  }
}

function now(): string { return new Date().toISOString(); }

export class RuntimeStore {
  private readonly db: Database;
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (org_id TEXT NOT NULL, key TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY (org_id, key));
    `);
  }

  createSession(input: { orgId: string; userId: string; workspaceMode: "cloud" | "local"; agent: Record<string, unknown>; workspaceId?: string }): Session {
    const session: Session = {
      id: `sess_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      org_id: input.orgId,
      user_id: input.userId,
      workspace_id: input.workspaceId ?? `ws_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      workspace_mode: input.workspaceMode,
      state: "created",
      agent: input.agent,
      created_at: now(),
    };
    this.db.query("INSERT INTO sessions (id, org_id, data) VALUES (?, ?, ?)").run(session.id, session.org_id, JSON.stringify(session));
    return session;
  }

  getSession(orgId: string, id: string): Session | null {
    const row = this.db.query<{ data: string }, [string, string]>("SELECT data FROM sessions WHERE id = ? AND org_id = ?").get(id, orgId);
    return row ? JSON.parse(row.data) as Session : null;
  }

  createRun(orgId: string, session: Session, input: string): Run {
    const run: Run = {
      id: `run_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      org_id: orgId,
      session_id: session.id,
      state: "queued",
      input,
      steps: [],
      usage: { tokens: 0, cost_usd: 0 },
      created_at: now(),
      completed_at: null,
    };
    session.state = "active";
    this.db.query("UPDATE sessions SET data = ? WHERE id = ?").run(JSON.stringify(session), session.id);
    this.db.query("INSERT INTO runs (id, org_id, session_id, data) VALUES (?, ?, ?, ?)").run(run.id, run.org_id, run.session_id, JSON.stringify(run));
    return run;
  }

  getRun(orgId: string, id: string): Run | null {
    const row = this.db.query<{ data: string }, [string, string]>("SELECT data FROM runs WHERE id = ? AND org_id = ?").get(id, orgId);
    return row ? JSON.parse(row.data) as Run : null;
  }

  saveRun(run: Run): void {
    this.db.query("UPDATE runs SET data = ? WHERE id = ?").run(JSON.stringify(run), run.id);
  }

  /** M2b: one-time import from legacy agent-workforce; NOT a dual-write path. */
  importLegacyRun(input: {
    orgId: string;
    sessionId: string;
    legacyRunId: string;
    source: string;
    goal: string;
    status: string;
    tasks: Array<{ title?: string; employee_name?: string; status?: string; output?: string | null }>;
    legacyData?: unknown;
  }): Run {
    const existing = this.db.query<{ data: string }, [string, string]>("SELECT data FROM runs WHERE org_id = ? AND json_extract(data, '$.legacy.id') = ?").get(input.orgId, input.legacyRunId);
    if (existing) {
      const run = JSON.parse(existing.data) as Run;
      if (input.legacyData !== undefined && run.legacy) {
        run.legacy.data = input.legacyData;
        this.saveRun(run);
      }
      return run;
    }
    const run: Run = {
      id: `run_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      org_id: input.orgId,
      session_id: input.sessionId,
      state: input.status === "completed" ? "succeeded" : input.status === "failed" ? "failed" : "running",
      input: input.goal,
      steps: input.tasks.map((task, index) => ({
        id: `step_${index + 1}`,
        run_id: "",
        seq: index + 1,
        type: "legacy_task",
        status: task.status === "completed" ? "completed" : "failed",
        output: `${task.employee_name ?? "employee"}: ${task.output ?? task.title ?? ""}`,
        started_at: now(),
        ended_at: now(),
      })),
      usage: { tokens: 0, cost_usd: 0 },
      legacy: { source: input.source, id: input.legacyRunId, data: input.legacyData ?? { tasks: input.tasks } },
      created_at: now(),
      completed_at: input.status === "completed" ? now() : null,
    };
    run.steps = run.steps.map((step) => ({ ...step, run_id: run.id }));
    this.db.query("INSERT INTO runs (id, org_id, session_id, data) VALUES (?, ?, ?, ?)").run(run.id, run.org_id, run.session_id, JSON.stringify(run));
    return run;
  }

  listLegacyRuns(orgId: string, limit = 50, offset = 0): Array<{ source: string; id: string; data: unknown }> {
    const rows = this.db.query<{ data: string }, [string, number, number]>(
      "SELECT data FROM runs WHERE org_id = ? AND json_extract(data, '$.legacy.id') IS NOT NULL ORDER BY json_extract(data, '$.created_at') DESC LIMIT ? OFFSET ?",
    ).all(orgId, limit, offset);
    return rows.map((row) => {
      const run = JSON.parse(row.data) as Run;
      return run.legacy ? { source: run.legacy.source, id: run.legacy.id, data: run.legacy.data } : { source: "agent-workforce", id: run.id, data: run };
    });
  }

  findRunByLegacyId(orgId: string, legacyId: string): Run | null {
    const row = this.db.query<{ data: string }, [string, string]>(
      "SELECT data FROM runs WHERE org_id = ? AND json_extract(data, '$.legacy.id') = ?",
    ).get(orgId, legacyId);
    return row ? (JSON.parse(row.data) as Run) : null;
  }

  getLegacyRun(orgId: string, legacyId: string): { source: string; id: string; data: unknown } | null {
    const run = this.findRunByLegacyId(orgId, legacyId);
    if (!run) return null;
    return run.legacy ? { source: run.legacy.source, id: run.legacy.id, data: run.legacy.data } : { source: "agent-workforce", id: run.id, data: run };
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
