-- Centralized credentials for agents / MCP servers (AgentCore-style)
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  env_key TEXT NOT NULL,
  cipher TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_org_key ON credentials (org_id, env_key);
CREATE INDEX IF NOT EXISTS idx_credentials_org ON credentials (org_id, updated_at DESC);
