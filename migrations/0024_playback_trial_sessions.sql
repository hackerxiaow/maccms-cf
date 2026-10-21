-- Server-enforced, one-time anonymous/member trial windows for direct MP4/HLS sources.
CREATE TABLE IF NOT EXISTS playback_trial_session (
  session_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL DEFAULT 0,
  vod_id INTEGER NOT NULL,
  sid INTEGER NOT NULL,
  nid INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_playback_trial_expiry ON playback_trial_session(expires_at);
