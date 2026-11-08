// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

export interface ProjectionEvent {
  id: string;
  org_id: string;
  type: string;
  subject: string;
  data: Record<string, unknown>;
  time: string;
}

export interface Intervention {
  id: string;
  org_id: string;
  mission_id: string;
  target_run_id: string;
  action: "pause" | "resume" | "send_back" | "takeover" | "reassign" | "cancel";
  reason: string;
  status: "issued" | "dispatched" | "failed";
  created_at: string;
}

export class CommandStore {
  private readonly db: Database;
  constructor(path = ":memory:") {    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS interventions (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (org_id TEXT NOT NULL, key TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY (org_id, key));
    `);
  }

  ingest(input: { orgId: string; eventId: string; type: string; subject: string; data: Record<string, unknown>; time?: string }): ProjectionEvent {
    const existing = this.db.query<{ data: string }, [string, string]>("SELECT data FROM events WHERE org_id = ? AND id = ?").get(input.orgId, input.eventId);
    if (existing) return JSON.parse(existing.data) as ProjectionEvent;
    const event: ProjectionEvent = { id: input.eventId, org_id: input.orgId, type: input.type, subject: input.subject, data: input.data, time: input.time ?? new Date().toISOString() };
    this.db.query("INSERT INTO events (id, org_id, data) VALUES (?, ?, ?)").run(`${input.orgId}:${event.id}`, input.orgId, JSON.stringify(event));
    return event;
  }

  listEvents(orgId: string): ProjectionEvent[] {
    return this.db.query<{ data: string }, [string]>("SELECT data FROM events WHERE org_id = ? ORDER BY rowid DESC LIMIT 1000").all(orgId).map((row) => JSON.parse(row.data) as ProjectionEvent);
  }

  fronts(orgId: string): Array<{ tenant_id: string; events: number; waiting_human: number; failed: number; last_event_at: string | null }> {
    const events = this.listEvents(orgId);
    return [{
      tenant_id: orgId,
      events: events.length,
      waiting_human: events.filter((event) => event.type.includes("waiting") || event.type.includes("gate.waiting")).length,
      failed: events.filter((event) => event.type.includes("failed") || event.type.includes("error")).length,
      last_event_at: events[0]?.time ?? null,
    }];
  }

  createIntervention(input: { orgId: string; missionId: string; targetRunId: string; action: Intervention["action"]; reason: string; status?: Intervention["status"] }): Intervention {
    const intervention: Intervention = { id: `intv_${randomUUID().replace(/-/g, "").slice(0, 16)}`, org_id: input.orgId, mission_id: input.missionId, target_run_id: input.targetRunId, action: input.action, reason: input.reason, status: input.status ?? "issued", created_at: new Date().toISOString() };
    this.db.query("INSERT INTO interventions (id, org_id, data) VALUES (?, ?, ?)").run(intervention.id, intervention.org_id, JSON.stringify(intervention));
    return intervention;
  }

  listInterventions(orgId: string): Intervention[] {
    return this.db.query<{ data: string }, [string]>("SELECT data FROM interventions WHERE org_id = ? ORDER BY rowid DESC LIMIT 200").all(orgId).map((row) => JSON.parse(row.data) as Intervention);
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
