// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";

export type HarnessState = "created" | "active" | "closing" | "closed";
export type PermissionStatus = "pending" | "allowed" | "denied";

export interface HarnessSession {
  id: string;
  org_id: string;
  user_id: string;
  mode: "cloud" | "local";
  runtime_session_id: string | null;
  workspace_ref: string | null;
  state: HarnessState;
  created_at: string;
}

export interface PermissionRequest {
  id: string;
  org_id: string;
  session_id: string;
  tool: string;
  reason: string;
  status: PermissionStatus;
  decision: "allow_once" | "allow_always" | "deny" | null;
  created_at: string;
  decided_at: string | null;
}

export interface Snapshot {
  id: string;
  org_id: string;
  workspace_id: string;
  commit: string;
  hash: string;
  created_at: string;
}

export interface HarnessEvent {
  id: string;
  org_id: string;
  session_id: string;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
}

function now(): string { return new Date().toISOString(); }

export class HarnessStore {
  private readonly db: Database;
  constructor(path = ":memory:") {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS permissions (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS idempotency (org_id TEXT NOT NULL, key TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY (org_id, key));
    `);
  }

  createSession(input: { orgId: string; userId: string; mode: "cloud" | "local"; runtimeSessionId?: string | null; workspaceRef?: string | null }): HarnessSession {
    const session: HarnessSession = {
      id: `hs_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      org_id: input.orgId,
      user_id: input.userId,
      mode: input.mode,
      runtime_session_id: input.runtimeSessionId ?? null,
      workspace_ref: input.workspaceRef ?? null,
      state: "created",
      created_at: now(),
    };
    this.db.query("INSERT INTO sessions (id, org_id, data) VALUES (?, ?, ?)").run(session.id, session.org_id, JSON.stringify(session));
    return session;
  }

  getSession(orgId: string, id: string): HarnessSession | null {
    const row = this.db.query<{ data: string }, [string, string]>("SELECT data FROM sessions WHERE id = ? AND org_id = ?").get(id, orgId);
    return row ? JSON.parse(row.data) as HarnessSession : null;
  }

  saveSession(session: HarnessSession): void {
    this.db.query("UPDATE sessions SET data = ? WHERE id = ?").run(JSON.stringify(session), session.id);
  }

  createPermission(input: { orgId: string; sessionId: string; tool: string; reason: string }): PermissionRequest {
    const permission: PermissionRequest = {
      id: `perm_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
      org_id: input.orgId,
      session_id: input.sessionId,
      tool: input.tool,
      reason: input.reason,
      status: "pending",
      decision: null,
      created_at: now(),
      decided_at: null,
    };
    this.db.query("INSERT INTO permissions (id, org_id, data) VALUES (?, ?, ?)").run(permission.id, permission.org_id, JSON.stringify(permission));
    return permission;
  }

  getPermission(orgId: string, id: string): PermissionRequest | null {
    const row = this.db.query<{ data: string }, [string, string]>("SELECT data FROM permissions WHERE id = ? AND org_id = ?").get(id, orgId);
    return row ? JSON.parse(row.data) as PermissionRequest : null;
  }

  savePermission(permission: PermissionRequest): void {
    this.db.query("UPDATE permissions SET data = ? WHERE id = ?").run(JSON.stringify(permission), permission.id);
  }

  createSnapshot(input: { orgId: string; workspaceId: string; commit: string; hash: string }): Snapshot {
    const snapshot: Snapshot = { id: `snap_${randomUUID().replace(/-/g, "").slice(0, 16)}`, org_id: input.orgId, workspace_id: input.workspaceId, commit: input.commit, hash: input.hash, created_at: now() };
    this.db.query("INSERT INTO snapshots (id, org_id, data) VALUES (?, ?, ?)").run(snapshot.id, snapshot.org_id, JSON.stringify(snapshot));
    return snapshot;
  }

  appendEvent(orgId: string, sessionId: string, type: string, data: Record<string, unknown>): HarnessEvent {
    const event: HarnessEvent = { id: `hev_${randomUUID().replace(/-/g, "").slice(0, 16)}`, org_id: orgId, session_id: sessionId, type, data, created_at: now() };
    this.db.query("INSERT INTO events (id, org_id, session_id, data) VALUES (?, ?, ?, ?)").run(event.id, event.org_id, event.session_id, JSON.stringify(event));
    return event;
  }

  listEvents(orgId: string, sessionId: string): HarnessEvent[] {
    return this.db.query<{ data: string }, [string, string]>("SELECT data FROM events WHERE org_id = ? AND session_id = ? ORDER BY rowid ASC").all(orgId, sessionId).map((row) => JSON.parse(row.data) as HarnessEvent);
  }

  getIdempotent(orgId: string, key: string): unknown | null {    const row = this.db.query<{ response: string }, [string, string]>("SELECT response FROM idempotency WHERE org_id = ? AND key = ?").get(orgId, key);
    return row ? JSON.parse(row.response) : null;
  }

  setIdempotent(orgId: string, key: string, response: unknown): void {
    this.db.query("INSERT OR REPLACE INTO idempotency (org_id, key, response) VALUES (?, ?, ?)").run(orgId, key, JSON.stringify(response));
  }

  close(): void { this.db.close(); }
}
