CREATE TABLE IF NOT EXISTS vod_access_purchase (
  purchase_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vod_id INTEGER NOT NULL,
  access_type TEXT NOT NULL CHECK(access_type IN ('play','download')),
  episode_id INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, vod_id, access_type, episode_id)
);
CREATE INDEX IF NOT EXISTS idx_vod_access_purchase_user ON vod_access_purchase(user_id, created_at DESC);
INSERT OR IGNORE INTO vod_access_purchase (user_id,vod_id,access_type,episode_id,points,created_at)
SELECT user_id,ulog_rid,CASE ulog_type WHEN 3 THEN 'play' ELSE 'download' END,
  ulog_nid,ulog_points,ulog_time
FROM ulog WHERE ulog_mid=1 AND ulog_type IN (3,4) AND ulog_rid>0;
