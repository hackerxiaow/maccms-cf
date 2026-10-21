CREATE TABLE IF NOT EXISTS telegram_storage_account (
  account_id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_name TEXT NOT NULL DEFAULT '',
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  upload_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(bot_token,chat_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_storage_enabled ON telegram_storage_account(enabled,account_id);
CREATE TABLE IF NOT EXISTS telegram_storage_state (
  state_key TEXT PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO telegram_storage_state (state_key,counter) VALUES ('upload',0);

-- Preserve a previously configured single Bot when upgrading to the account pool.
INSERT OR IGNORE INTO telegram_storage_account (account_name,bot_token,chat_id,weight,enabled,created_at,updated_at)
SELECT '默认 TG Bot', token.value, chat.value, 1, 1, unixepoch(), unixepoch()
FROM config AS token
JOIN config AS chat ON chat.key='telegram_chat_id'
WHERE token.key='telegram_bot_token' AND token.value<>'' AND chat.value<>'';
