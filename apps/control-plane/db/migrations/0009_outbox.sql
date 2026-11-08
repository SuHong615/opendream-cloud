-- Transactional outbox for async events
CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  topic TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events (status, available_at);
CREATE INDEX IF NOT EXISTS idx_outbox_org ON outbox_events (org_id, created_at);
