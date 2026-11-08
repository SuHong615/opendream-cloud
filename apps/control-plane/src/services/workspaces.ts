// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
import type { Env } from "../env";
import type { Principal } from "../types";
import type { Sqlite } from "../db/client";
import type { DatabasePort } from "../db/port";
import type { WorkspaceState } from "../lib/constants";
import { ApiError, conflict, notFound } from "../lib/errors";
import { randomId, sha256Hex } from "../lib/crypto";
import { iso, parseJson } from "../lib/http";
import { resolvePolicy, listEnabledModels } from "./policy";

export interface WorkspaceRow {
  id: string;
  org_id: string;
  owner_user_id: string;
  display_name: string;
  slug: string;
  state: WorkspaceState;
  state_reason: string | null;
  host: string;
  image: string;
  image_digest: string;
  cpu_request: string;
  mem_request: string;
  pvc_size: string;
  pvc_name: string | null;
  config_revision: number;
  model_default: string | null;
  last_activity_at: number | null;
  idle_since: number | null;
  destroy_requested_at: number | null;
  destroy_scheduled_at: number | null;
  deleted_at: number | null;
  snapshot_id: string | null;
  version: number;
  created_at: number;
  updated_at: number;
}

const ALLOWED: Record<WorkspaceState, WorkspaceState[]> = {
  provisioning: ["starting", "error"],
  starting: ["ready", "error"],
  ready: ["idle", "stopping", "deleting", "error"],
  idle: ["ready", "stopping", "deleting", "error"],
  stopping: ["stopped", "error"],
  stopped: ["starting", "deleting"],
  error: ["starting", "deleting"],
  deleting: ["deleted"],
  deleted: [],
};

export function canTransition(from: WorkspaceState, to: WorkspaceState): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export async function findWorkspace(db: DatabasePort, id: string): Promise<WorkspaceRow | undefined> {
  return (await db.get<WorkspaceRow>("SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL", [id])) ?? undefined;
}

export async function requireOwnedWorkspace(db: DatabasePort, principal: Principal, id: string): Promise<WorkspaceRow> {
  const workspace = await findWorkspace(db, id);
  if (!workspace || workspace.org_id !== principal.orgId) {
    throw notFound("Workspace not found", "workspace_not_found");
  }
  if (workspace.owner_user_id !== principal.userId) {
    // 同一租户但不是 owner：不暴露存在性，统一 404
    throw notFound("Workspace not found", "workspace_not_found");
  }
  return workspace;
}

export async function transition(
  db: DatabasePort,
  id: string,
  fromStates: WorkspaceState[],
  to: WorkspaceState,
  meta: { actorType?: string; actorId?: string; reason?: string; message?: string; type?: string } = {},
): Promise<WorkspaceRow> {
  const current = await findWorkspace(db, id);
  if (!current) throw notFound("Workspace not found", "workspace_not_found");
  if (!fromStates.includes(current.state)) {
    throw conflict(`Cannot transition ${current.state} -> ${to}`, "workspace_not_ready");
  }
  if (!canTransition(current.state, to)) {
    throw conflict(`Illegal transition ${current.state} -> ${to}`, "workspace_not_ready");
  }
  const now = Date.now();
  await db.transaction(async (tx) => {
    const result =
      to === "deleted"
        ? await tx.run("UPDATE workspaces SET state = ?, state_reason = ?, deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND state = ?", [to, meta.reason ?? null, now, now, id, current.state])
        : await tx.run("UPDATE workspaces SET state = ?, state_reason = ?, updated_at = ?, version = version + 1 WHERE id = ? AND state = ?", [to, meta.reason ?? null, now, id, current.state]);
    if (result.changes !== 1) throw conflict("Concurrent state transition", "workspace_not_ready");
    const eventType =
      meta.type ?? (to === "ready" ? (current.state === "stopped" ? "started" : "provisioned") : to === "stopped" ? "stopped" : to === "deleted" ? "destroyed" : "state_changed");
    await tx.run(
      `INSERT INTO workspace_events (id, org_id, workspace_id, type, from_state, to_state, reason, message, actor_type, actor_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
      [randomId(), current.org_id, id, eventType, current.state, to, meta.reason ?? null, meta.message ?? null, meta.actorType ?? "system", meta.actorId ?? null, now],
    );
  });
  const updated = await findWorkspace(db, id);
  if (!updated) throw notFound("Workspace not found", "workspace_not_found");
  return updated;
}

export function serializeWorkspace(env: Env, workspace: WorkspaceRow) {
  return {
    id: workspace.id,
    org_id: workspace.org_id,
    owner_user_id: workspace.owner_user_id,
    display_name: workspace.display_name,
    slug: workspace.slug,
    state: workspace.state,
    stage: stageOf(workspace.state),
    state_reason: workspace.state_reason,
    host: workspace.host,
    url: `https://${workspace.host}/`,
    resources: { cpu: workspace.cpu_request, memory: workspace.mem_request },
    storage: { size: workspace.pvc_size, retain: true },
    image: workspace.image,
    image_digest: workspace.image_digest,
    model_default: workspace.model_default,
    config_revision: workspace.config_revision,
    last_active_at: iso(workspace.last_activity_at),
    last_activity_at: iso(workspace.last_activity_at),
    idle_since: iso(workspace.idle_since),
    destroy_scheduled_at: iso(workspace.destroy_scheduled_at),
    error: workspace.state === "error" ? { code: workspace.state_reason ?? "internal", message: "workspace failed", retryable: true } : null,
    created_at: new Date(workspace.created_at).toISOString(),
    updated_at: new Date(workspace.updated_at).toISOString(),
    env_base: env.PUBLIC_BASE_URL,
  };
}

/** G2-WC-03：控制台阶段（进度条用），由 9 态映射。 */
function stageOf(
  state: WorkspaceState,
): "provisioning" | "starting" | "ready" | "stopped" | "deleting" | "deleted" | "error" {
  switch (state) {
    case "provisioning":
      return "provisioning";
    case "starting":
      return "starting";
    case "ready":
    case "idle":
      return "ready";
    case "stopping":
    case "stopped":
      return "stopped";
    case "deleting":
      return "deleting";
    case "deleted":
      return "deleted";
    case "error":
      return "error";
    default:
      return "provisioning";
  }
}

export function createMockVirtualKey(sqlite: Sqlite, workspaceId: string, orgId: string, principal: Principal): void {
  const resolved = resolvePolicy(sqlite, principal);
  const alias = `oc-ws-${workspaceId.slice(0, 8)}`;
  const mockKey = `sk-dev-${randomId().replace(/-/g, "").slice(0, 24)}`;
  sqlite
    .query(
      `INSERT INTO litellm_keys (id, org_id, workspace_id, key_fingerprint, key_alias, budget_usd, rpm_limit, tpm_limit, models, status, created_at)
       VALUES (?, ?, ?, ?, ?, '20', 60, 200000, ?, 'active', ?)`,
    )
    .run(
      randomId(),
      orgId,
      workspaceId,
      sha256Hex(mockKey).slice(0, 16),
      alias,
      JSON.stringify(listEnabledModels(sqlite, orgId).filter((m) => resolved.allowedModelIds.has(m.id)).map((m) => m.litellm_alias)),
      Date.now(),
    );
}

export interface CreateWorkspaceInput {
  display_name: string;
  model_default?: string | undefined;
  storage_size?: string | undefined;
}

export async function ensureOwnedWorkspace(db: DatabasePort, principal: Principal): Promise<WorkspaceRow | undefined> {
  return (await db.get<WorkspaceRow>("SELECT * FROM workspaces WHERE org_id = ? AND owner_user_id = ? AND deleted_at IS NULL", [principal.orgId, principal.userId])) ?? undefined;
}

export async function workspaceMaxReached(db: DatabasePort, principal: Principal): Promise<boolean> {
  const row = await db.get<{ count: number }>("SELECT COUNT(*) AS count FROM workspaces WHERE org_id = ? AND owner_user_id = ? AND deleted_at IS NULL", [principal.orgId, principal.userId]);
  return (row?.count ?? 0) >= 1;
}

export async function workspaceEvents(db: DatabasePort, workspaceId: string, limit = 100) {
  const events = await db.all<{
    id: string;
    org_id: string;
    workspace_id: string;
    seq: number;
    type: string;
    from_state: string | null;
    to_state: string | null;
    reason: string | null;
    message: string | null;
    actor_type: string;
    actor_id: string | null;
    metadata: string | null;
    created_at: number;
  }>("SELECT * FROM workspace_events WHERE workspace_id = ? ORDER BY seq DESC LIMIT ?", [workspaceId, limit]);
  return events.map((event) => ({
    id: event.id,
    workspace_id: event.workspace_id,
    seq: event.seq,
    type: event.type,
    from_state: event.from_state,
    to_state: event.to_state,
    reason: event.reason,
    message: event.message,
    actor_type: event.actor_type,
    actor_id: event.actor_id,
    metadata: parseJson<Record<string, unknown>>(event.metadata, {}),
    created_at: new Date(event.created_at).toISOString(),
  }));
}

