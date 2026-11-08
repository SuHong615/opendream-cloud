// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
export type WorkspaceState =
  | "provisioning"
  | "starting"
  | "ready"
  | "idle"
  | "stopping"
  | "stopped"
  | "error"
  | "deleting"
  | "deleted";

export interface WorkspaceResources {
  cpu?: string;
  memory?: string;
}

export interface Workspace {
  id: string;
  org_id: string;
  owner_user_id: string;
  display_name: string;
  slug?: string | null;
  state: WorkspaceState;
  state_reason?: string | null;
  /** Console progress stage derived from state (G2-WC-03, backend closed). */
  stage?: string | null;
  host: string;
  url?: string | null;
  resources?: WorkspaceResources;
  storage?: { size?: string | null; retain?: boolean };
  destroy_scheduled_at?: string | null;
  created_at: string;
  updated_at: string;
  /** Console enrichment (optional; not yet in openapi — G2-WC-03). */
  last_active_at?: string | null;
  last_session_title?: string | null;
  skill_count?: number;
  mcp_count?: number;
  pvc_size?: string | null;
}

export interface WorkspaceEvent {
  id: string;
  workspace_id: string;
  seq: number;
  type: string;
  from_state?: WorkspaceState | null;
  to_state?: WorkspaceState | null;
  reason?: string | null;
  message?: string | null;
  created_at: string;
}

export interface AccessTicket {
  workspace_id?: string;
  url: string;
  base_url?: string;
  ticket?: string;
  expires_in: number;
  mode: "redirect" | "embed";
  fallback_url?: string;
}

export interface OrgSummary {
  id: string;
  name: string;
  slug?: string;
}

export interface Me {
  user: {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string | null;
    locale?: string;
    status: string;
  };
  orgs: OrgSummary[];
  active_org: OrgSummary;
  permissions?: string[];
  entitlements?: {
    max_workspaces?: number;
    default_model?: string;
    features?: string[];
  };
}

export interface Model {
  id: string;
  name: string;
  provider?: string;
  context_window?: number;
  capabilities?: string[];
  status?: string;
  price_in?: string | number;
  price_out?: string | number;
  is_default?: boolean;
}

/** Model center (task-18 backend contract). */
export interface ModelProviderPreset {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  default_models?: string[];
  docs_url?: string | null;
}

export interface ProviderModel {
  id: string;
  name: string;
}

export type ProviderHealth = "healthy" | "unhealthy" | "unknown" | string;

export interface ModelProvider {
  id: string;
  name: string;
  kind: string;
  base_url: string;
  region?: string | null;
  enabled: boolean;
  is_active: boolean;
  health: ProviderHealth;
  last_check_at?: string | null;
  models_count?: number;
  models?: ProviderModel[];
  default_model_id?: string | null;
  default_model?: string | null;
  api_key_masked?: string | null;
  preset_id?: string | null;
}

export interface ProviderTestResult {
  ok: boolean;
  latency_ms?: number;
  models?: ProviderModel[];
  error_code?: string | null;
  message?: string | null;
  request_id?: string;
}

export interface ProviderInput {
  name: string;
  kind: string;
  base_url: string;
  api_key?: string;
  models?: string[];
  default_model?: string;
  preset_id?: string;
  enabled?: boolean;
}

export interface OpencodeConfigPreview {
  [key: string]: unknown;
}

export interface ApiErrorBody {
  code: string;
  reason?: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}
