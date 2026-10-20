-- Cloudflare implementations of MacCMS10 live, access/audit, and URL push modules.
CREATE TABLE IF NOT EXISTS live_category (
  live_category_id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_category_name TEXT NOT NULL,
  live_category_sort INTEGER NOT NULL DEFAULT 0,
  live_category_status INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_live_category_status_sort
  ON live_category(live_category_status, live_category_sort, live_category_id);

CREATE TABLE IF NOT EXISTS live_channel (
  live_id INTEGER PRIMARY KEY AUTOINCREMENT,
  live_category_id INTEGER NOT NULL DEFAULT 0,
  live_name TEXT NOT NULL,
  live_url TEXT NOT NULL,
  live_logo TEXT NOT NULL DEFAULT '',
  live_desc TEXT NOT NULL DEFAULT '',
  live_status INTEGER NOT NULL DEFAULT 1,
  live_sort INTEGER NOT NULL DEFAULT 0,
  live_time INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_live_channel_status_sort
  ON live_channel(live_status, live_sort, live_id);
CREATE INDEX IF NOT EXISTS idx_live_channel_category
  ON live_channel(live_category_id, live_status, live_sort);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_name TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL DEFAULT '',
  response_status INTEGER NOT NULL DEFAULT 0,
  client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS traffic_event (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  content_id INTEGER NOT NULL DEFAULT 0,
  visitor_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_traffic_day_model ON traffic_event(day, model);
CREATE INDEX IF NOT EXISTS idx_traffic_content ON traffic_event(model, content_id, created_at DESC);

CREATE TABLE IF NOT EXISTS url_push_log (
  push_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL DEFAULT '',
  submitted INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 0,
  remain INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0,
  response TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_url_push_created ON url_push_log(created_at DESC);
