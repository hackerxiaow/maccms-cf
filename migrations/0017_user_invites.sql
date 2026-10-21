CREATE TABLE IF NOT EXISTS user_invite_code (
  user_id INTEGER PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_invite_reward (
  invite_id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_user_id INTEGER NOT NULL,
  invitee_user_id INTEGER NOT NULL UNIQUE,
  inviter_points INTEGER NOT NULL DEFAULT 0,
  invitee_points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invite_reward_inviter ON user_invite_reward(inviter_user_id, created_at DESC);

INSERT OR IGNORE INTO user_invite_code (user_id,invite_code,created_at)
SELECT user_id,upper(hex(randomblob(8))),unixepoch() FROM user WHERE user_id>0;

INSERT OR IGNORE INTO config (key,value) VALUES
  ('user_invite_status','0'),
  ('user_invite_points','50'),
  ('user_invited_points','0');
