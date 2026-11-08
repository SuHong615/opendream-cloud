-- 0001_init.sql — control-plane MVP schema (bun:sqlite)
-- 权威 DDL/RLS 见 docs/02-architecture/DATA-MODEL.md；本文件只实现 G4 的 15 张表。
-- 约定：id 为应用生成的 uuid（TEXT），时间为 epoch ms（INTEGER），JSON 为 TEXT。
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  locale TEXT NOT NULL DEFAULT 'zh-CN',
  status TEXT NOT NULL DEFAULT 'active',
  last_login_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'personal',
  plan TEXT NOT NULL DEFAULT 'free',
  settings TEXT,
  data_region TEXT NOT NULL DEFAULT 'cn-hangzhou',
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  status TEXT NOT NULL DEFAULT 'active',
  invited_by TEXT,
  invited_at INTEGER,
  joined_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org_role ON memberships(org_id, role);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  scopes TEXT NOT NULL DEFAULT '[]',
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT NOT NULL,
  slug TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('provisioning','starting','ready','idle','stopping','stopped','error','deleting','deleted')),
  state_reason TEXT,
  host TEXT NOT NULL UNIQUE,
  image TEXT NOT NULL,
  image_digest TEXT NOT NULL,
  cpu_request TEXT NOT NULL DEFAULT '4',
  mem_request TEXT NOT NULL DEFAULT '8Gi',
  pvc_size TEXT NOT NULL DEFAULT '20Gi',
  pvc_name TEXT,
  config_revision INTEGER NOT NULL DEFAULT 1,
  model_default TEXT,
  last_activity_at INTEGER,
  idle_since INTEGER,
  destroy_requested_at INTEGER,
  destroy_scheduled_at INTEGER,
  deleted_at INTEGER,
  snapshot_id TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ws_owner_alive ON workspaces(org_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ws_owner_state ON workspaces(owner_user_id, state);
CREATE INDEX IF NOT EXISTS idx_ws_org_state ON workspaces(org_id, state);

CREATE TABLE IF NOT EXISTS workspace_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  org_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  reason TEXT,
  message TEXT,
  actor_type TEXT NOT NULL DEFAULT 'user',
  actor_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wse_ws_seq ON workspace_events(workspace_id, seq);

CREATE TABLE IF NOT EXISTS model_providers (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES orgs(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('openai_compatible','azure','anthropic','google','bedrock','custom')),
  base_url TEXT NOT NULL,
  region TEXT,
  credential_ref TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  health TEXT NOT NULL DEFAULT 'unknown' CHECK (health IN ('healthy','degraded','down','unknown')),
  last_check_at INTEGER,
  settings TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_org_name ON model_providers(ifnull(org_id,''), name);

CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES orgs(id),
  provider_id TEXT NOT NULL REFERENCES model_providers(id),
  provider_model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  litellm_alias TEXT NOT NULL UNIQUE,
  context_window INTEGER NOT NULL DEFAULT 0,
  max_output INTEGER NOT NULL DEFAULT 0,
  capabilities TEXT NOT NULL DEFAULT '[]',
  input_price_per_1m TEXT,
  output_price_per_1m TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  health TEXT NOT NULL DEFAULT 'unknown' CHECK (health IN ('healthy','degraded','down','unknown')),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
CREATE INDEX IF NOT EXISTS idx_models_enabled ON models(enabled);

CREATE TABLE IF NOT EXISTS model_policies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  description TEXT,
  default_model_id TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  enforcement TEXT NOT NULL DEFAULT 'enforce',
  cost_budget_usd TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (org_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_policy_default ON model_policies(org_id) WHERE is_default = 1 AND enforcement != 'off';

CREATE TABLE IF NOT EXISTS model_policy_rules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  policy_id TEXT NOT NULL REFERENCES model_policies(id) ON DELETE CASCADE,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','team','role','org')),
  subject_id TEXT,
  subject_role TEXT,
  model_id TEXT,
  provider_id TEXT,
  limits TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policy_rules ON model_policy_rules(policy_id, priority);

CREATE TABLE IF NOT EXISTS litellm_keys (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  key_fingerprint TEXT NOT NULL UNIQUE,
  key_alias TEXT NOT NULL,
  budget_usd TEXT,
  rpm_limit INTEGER,
  tpm_limit INTEGER,
  models TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  rotated_from TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_litellm_ws_active ON litellm_keys(workspace_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','service','system')),
  actor_id TEXT,
  actor_ip TEXT,
  user_agent TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','denied','error')),
  detail TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_org_time ON audit_logs(org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT,
  workspace_id TEXT,
  api_key_id TEXT,
  provider_id TEXT,
  model_id TEXT,
  litellm_alias TEXT,
  request_id TEXT NOT NULL UNIQUE,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_reasoning INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,
  cost_usd TEXT NOT NULL DEFAULT '0',
  currency TEXT NOT NULL DEFAULT 'USD',
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'success',
  error_code TEXT,
  occurred_at INTEGER NOT NULL,
  ingested_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_org_time ON usage_records(org_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
