CREATE TABLE IF NOT EXISTS media_sync_scan (
  scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL DEFAULT 'running',
  model_index INTEGER NOT NULL DEFAULT 0,
  last_id INTEGER NOT NULL DEFAULT 0,
  scanned_rows INTEGER NOT NULL DEFAULT 0,
  found_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS media_sync_item (
  item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  record_name TEXT NOT NULL DEFAULT '',
  field_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  target_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  error_text TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(scan_id,model,record_id,field_name,source_url)
);
CREATE INDEX IF NOT EXISTS idx_media_sync_item_queue ON media_sync_item(scan_id,status,item_id);
CREATE INDEX IF NOT EXISTS idx_media_sync_item_target ON media_sync_item(target_url,status);
