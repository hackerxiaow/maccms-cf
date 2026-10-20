CREATE TABLE IF NOT EXISTS collect_run_log (
  run_id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL DEFAULT 0,
  node_name TEXT NOT NULL DEFAULT '',
  hours INTEGER NOT NULL DEFAULT 24,
  page INTEGER NOT NULL DEFAULT 1,
  fetched INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_collect_run_created ON collect_run_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collect_run_node ON collect_run_log(node_id, created_at DESC);
