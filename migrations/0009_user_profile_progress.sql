CREATE TABLE IF NOT EXISTS user_play_progress (
  progress_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vod_id INTEGER NOT NULL,
  play_sid INTEGER NOT NULL DEFAULT 0,
  play_nid INTEGER NOT NULL DEFAULT 0,
  episode_name TEXT NOT NULL DEFAULT '',
  position_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, vod_id, play_sid, play_nid)
);
CREATE INDEX IF NOT EXISTS idx_play_progress_user ON user_play_progress(user_id, updated_at DESC);
