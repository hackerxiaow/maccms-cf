-- Cloudflare-native parity modules: D1-backed commerce, interaction, moderation,
-- edge scheduling, administrator roles, and optional R2 media metadata.
CREATE TABLE IF NOT EXISTS admin_role (
  role_id INTEGER PRIMARY KEY AUTOINCREMENT,
  role_key TEXT NOT NULL UNIQUE,
  role_name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '[]',
  role_status INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS admin_account (
  admin_id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_key TEXT NOT NULL DEFAULT 'administrator',
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  last_login_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_admin_account_role ON admin_account(role_key, status);
INSERT OR IGNORE INTO admin_role (role_key, role_name, permissions) VALUES
  ('administrator', '超级管理员', '["*"]'),
  ('editor', '内容编辑', '["content","collect"]'),
  ('support', '会员客服', '["users","ops"]');

CREATE TABLE IF NOT EXISTS user_follow (
  follow_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  follow_mid INTEGER NOT NULL DEFAULT 1,
  follow_rid INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, follow_mid, follow_rid)
);
CREATE INDEX IF NOT EXISTS idx_follow_user ON user_follow(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS danmaku (
  danmaku_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT '访客',
  vod_id INTEGER NOT NULL DEFAULT 0,
  episode_id INTEGER NOT NULL DEFAULT 0,
  position_ms INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#ffffff',
  content TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_danmaku_vod ON danmaku(vod_id, episode_id, status, position_ms);
CREATE TABLE IF NOT EXISTS chatroom_message (
  message_id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_key TEXT NOT NULL DEFAULT 'default',
  user_id INTEGER NOT NULL DEFAULT 0,
  user_name TEXT NOT NULL DEFAULT '访客',
  content TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chatroom_created ON chatroom_message(room_key, status, created_at DESC);
CREATE TABLE IF NOT EXISTS user_pm (
  pm_id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL DEFAULT 0,
  receiver_id INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pm_receiver ON user_pm(receiver_id, status, created_at DESC);
CREATE TABLE IF NOT EXISTS share_log (
  share_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL DEFAULT 'vod',
  content_id INTEGER NOT NULL DEFAULT 0,
  channel TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_share_created ON share_log(created_at DESC);

CREATE TABLE IF NOT EXISTS cash_log (
  cash_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 0,
  cash_type TEXT NOT NULL DEFAULT 'admin_adjustment',
  amount REAL NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  operator TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cash_user ON cash_log(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS coupon (
  coupon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_code TEXT NOT NULL UNIQUE,
  coupon_name TEXT NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  discount_value REAL NOT NULL DEFAULT 0,
  min_spend REAL NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_coupon (
  user_coupon_id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  redeemed_at INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER NOT NULL DEFAULT 0,
  order_id INTEGER NOT NULL DEFAULT 0,
  UNIQUE(coupon_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_coupon_user ON user_coupon(user_id, used_at);
CREATE TABLE IF NOT EXISTS mall_goods (
  goods_id INTEGER PRIMARY KEY AUTOINCREMENT,
  goods_name TEXT NOT NULL,
  goods_desc TEXT NOT NULL DEFAULT '',
  goods_pic TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  inventory INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS mall_order (
  mall_order_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  goods_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  total_price REAL NOT NULL DEFAULT 0,
  total_points INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mall_order_status ON mall_order(status, created_at DESC);
CREATE TABLE IF NOT EXISTS site_notice (
  notice_id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  notice_type TEXT NOT NULL DEFAULT 'site',
  status INTEGER NOT NULL DEFAULT 1,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sign_log (
  sign_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sign_day TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, sign_day)
);
CREATE INDEX IF NOT EXISTS idx_sign_day ON sign_log(sign_day, user_id);
CREATE TRIGGER IF NOT EXISTS sign_log_credit_after_insert
AFTER INSERT ON sign_log
BEGIN
  UPDATE user SET user_points = user_points + NEW.points WHERE user_id = NEW.user_id;
  INSERT INTO cash_log (user_id, cash_type, amount, points, status, note, operator, created_at)
    VALUES (NEW.user_id, 'daily_sign', 0, NEW.points, 1, '每日签到奖励', 'system', NEW.created_at);
END;
CREATE TABLE IF NOT EXISTS vod_play_fail (
  fail_id INTEGER PRIMARY KEY AUTOINCREMENT,
  vod_id INTEGER NOT NULL DEFAULT 0,
  vod_name TEXT NOT NULL DEFAULT '',
  play_from TEXT NOT NULL DEFAULT '',
  play_part TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  client_ip TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_play_fail_created ON vod_play_fail(status, created_at DESC);
CREATE TABLE IF NOT EXISTS content_check_rule (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'vod',
  field_name TEXT NOT NULL DEFAULT 'name',
  match_text TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content_check_issue (
  issue_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  model TEXT NOT NULL,
  content_id INTEGER NOT NULL,
  content_name TEXT NOT NULL DEFAULT '',
  field_name TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(rule_id, model, content_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_content_issue_status ON content_check_issue(status, created_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_task (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_name TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'collect',
  node_id INTEGER NOT NULL DEFAULT 0,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT '',
  last_message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_due ON scheduled_task(enabled, next_run_at);
CREATE TABLE IF NOT EXISTS scheduled_task_log (
  task_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL DEFAULT 0,
  task_name TEXT NOT NULL DEFAULT '',
  success INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scheduled_task_log ON scheduled_task_log(created_at DESC);
CREATE TABLE IF NOT EXISTS media_asset (
  media_id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  public_url TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_asset(created_at DESC);
CREATE TABLE IF NOT EXISTS user_access_rule (
  rule_id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_type TEXT NOT NULL DEFAULT 'ip',
  rule_value TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(rule_type, rule_value)
);
CREATE INDEX IF NOT EXISTS idx_access_rule_value ON user_access_rule(rule_type, rule_value);
CREATE TABLE IF NOT EXISTS recycle_bin (
  recycle_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  record_json TEXT NOT NULL,
  deleted_by TEXT NOT NULL DEFAULT '',
  deleted_at INTEGER NOT NULL DEFAULT 0,
  restored_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_recycle_model ON recycle_bin(model, deleted_at DESC);
