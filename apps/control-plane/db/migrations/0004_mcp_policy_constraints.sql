-- 0004_mcp_policy_constraints.sql — v3/1.1 工具策略行补齐 constraints/require_explicit_allow（MVP 存储）
ALTER TABLE mcp_tool_policies ADD COLUMN constraints TEXT;
ALTER TABLE mcp_tool_policies ADD COLUMN require_explicit_allow INTEGER NOT NULL DEFAULT 1;
