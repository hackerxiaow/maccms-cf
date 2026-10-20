CREATE TABLE IF NOT EXISTS user_login_log (
  login_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT 'login',
  client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_login_created ON user_login_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_user ON user_login_log(user_id, created_at DESC);
