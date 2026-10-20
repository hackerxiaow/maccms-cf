-- D1-backed continuous-sign-in milestones and one-time point awards.
CREATE TABLE IF NOT EXISTS sign_milestone (
  milestone_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sign_days INTEGER NOT NULL UNIQUE,
  reward_name TEXT NOT NULL DEFAULT '',
  reward_points INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_sign_milestone (
  claim_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  milestone_id INTEGER NOT NULL,
  sign_days INTEGER NOT NULL,
  reward_name TEXT NOT NULL DEFAULT '',
  reward_points INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, milestone_id)
);
CREATE INDEX IF NOT EXISTS idx_user_sign_milestone_user ON user_sign_milestone(user_id, claimed_at DESC);
CREATE TRIGGER IF NOT EXISTS sign_milestone_credit_after_insert
AFTER INSERT ON user_sign_milestone
BEGIN
  UPDATE user SET user_points = user_points + NEW.reward_points WHERE user_id = NEW.user_id;
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
    VALUES (NEW.user_id,'sign_milestone',0,NEW.reward_points,1,NEW.reward_name,'system',NEW.claimed_at);
END;
