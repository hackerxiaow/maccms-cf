ALTER TABLE user ADD COLUMN user_email_verified INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS member_email_token (
  token_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('verify','reset')),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  consumed_at INTEGER NOT NULL DEFAULT 0,
  request_ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_member_email_token_lookup ON member_email_token(action,email,expires_at,consumed_at);

CREATE TABLE IF NOT EXISTS auth_rate_limit (
  rate_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_notification (
  notification_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'system',
  target_url TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  read_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_notification_owner ON user_notification(user_id,read_at,created_at DESC);

CREATE TABLE IF NOT EXISTS web_push_subscription (
  subscription_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_push_subscription_user ON web_push_subscription(user_id);

CREATE TABLE IF NOT EXISTS payment_intent (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  product_type TEXT NOT NULL,
  product_value TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  vip_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','expired','cancelled','refunded')),
  provider_ref TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL DEFAULT 0,
  paid_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payment_intent_user ON payment_intent(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS payment_event (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_event_id TEXT NOT NULL UNIQUE,
  order_code TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_post (
  post_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
  status INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_user_post_feed ON user_post(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_post_owner ON user_post(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS user_post_like (
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_user_post_like_user ON user_post_like(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS cash_withdrawal (
  withdrawal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  payout_method TEXT NOT NULL,
  payout_account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','paid')),
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_wallet (
  user_id INTEGER PRIMARY KEY,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS search_query_log (
  search_id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_hash TEXT NOT NULL,
  query_length INTEGER NOT NULL DEFAULT 0,
  result_count INTEGER NOT NULL DEFAULT 0,
  search_mode TEXT NOT NULL DEFAULT 'sql',
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_search_query_created ON search_query_log(created_at DESC);

CREATE TABLE IF NOT EXISTS resource_check_item (
  check_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  UNIQUE(model,record_id,url)
);
CREATE INDEX IF NOT EXISTS idx_resource_check_status ON resource_check_item(status_code,checked_at DESC);

CREATE TABLE IF NOT EXISTS content_translation (
  translation_id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  record_id INTEGER NOT NULL,
  language TEXT NOT NULL,
  field_name TEXT NOT NULL,
  translated_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(model,record_id,language,field_name)
);
CREATE INDEX IF NOT EXISTS idx_content_translation_lookup ON content_translation(model,record_id,language);

INSERT OR IGNORE INTO config (key,value) VALUES
  ('user_email_required','0'),
  ('mail_smtp_host',''),
  ('mail_smtp_port','587'),
  ('mail_smtp_secure','0'),
  ('mail_smtp_starttls','1'),
  ('mail_smtp_auth_type','plain'),
  ('mail_smtp_username',''),
  ('mail_from',''),
  ('user_email_verification','0'),
  ('payment_checkout_url',''),
  ('payment_query_url',''),
  ('payment_merchant_id',''),
  ('payment_currency','CNY'),
  ('payment_products','[]'),
  ('ai_base_url',''),
  ('ai_model',''),
  ('meilisearch_url',''),
  ('push_vapid_public_key',''),
  ('push_vapid_subject','mailto:admin@example.com'),
  ('user_post_audit','0');
