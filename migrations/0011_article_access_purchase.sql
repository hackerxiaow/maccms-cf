CREATE TABLE IF NOT EXISTS content_access_purchase (
  purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  model TEXT NOT NULL CHECK(model IN ('art')),
  content_id INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, model, content_id)
);
CREATE INDEX IF NOT EXISTS idx_content_access_purchase_user ON content_access_purchase(user_id, created_at DESC);
INSERT OR IGNORE INTO content_access_purchase (user_id,model,content_id,points,created_at)
SELECT user_id,'art',ulog_rid,ulog_points,ulog_time FROM ulog
WHERE ulog_mid=2 AND ulog_type=3 AND ulog_rid>0;
