-- 0003_mcp.sql — v3 MCP 控制面：工具级策略 + 调用审计（control-plane 为 mcp_call_logs 唯一写入方）
CREATE TABLE IF NOT EXISTS mcp_tool_policies (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  subject_type TEXT NOT NULL DEFAULT 'org' CHECK (subject_type IN ('org','role','user','team')),
  subject_id TEXT,
  subject_role TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcp_tool_policy
  ON mcp_tool_policies(org_id, server_id, tool_name, subject_type, ifnull(subject_id, ''), ifnull(subject_role, ''));
CREATE INDEX IF NOT EXISTS idx_mcp_tool_policy_server ON mcp_tool_policies(org_id, server_id);

CREATE TABLE IF NOT EXISTS mcp_call_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  version_id TEXT,
  binding_id TEXT NOT NULL,
  workspace_id TEXT,
  app_id TEXT,
  user_id TEXT,
  method TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  args_hash TEXT NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  trace_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mcp_call_org_time ON mcp_call_logs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_call_server_time ON mcp_call_logs(server_id, created_at DESC);
