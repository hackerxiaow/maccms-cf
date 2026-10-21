CREATE TABLE IF NOT EXISTS role_vote (
  role_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  vote_type TEXT NOT NULL CHECK(vote_type IN ('up','down')),
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(role_id,voter_key)
);
CREATE INDEX IF NOT EXISTS idx_role_vote_created ON role_vote(created_at DESC);

CREATE TABLE IF NOT EXISTS role_score_vote (
  role_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 10),
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(role_id,voter_key)
);

CREATE TABLE IF NOT EXISTS user_post_comment (
  comment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1 CHECK(status IN (0,1,2)),
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_post_comment ON user_post_comment(post_id,status,created_at);

CREATE TABLE IF NOT EXISTS user_post_report (
  report_id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','dismissed')),
  created_at INTEGER NOT NULL DEFAULT 0,
  reviewed_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_post_report ON user_post_report(status,created_at DESC);

CREATE TABLE IF NOT EXISTS user_post_attachment (
  post_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(post_id,media_id)
);
CREATE INDEX IF NOT EXISTS idx_user_post_attachment_media ON user_post_attachment(media_id);

INSERT OR IGNORE INTO config(key,value) VALUES('search_terms_logging','0');
ALTER TABLE search_query_log ADD COLUMN query_text TEXT NOT NULL DEFAULT '';
