-- A Bot can target multiple channels. Keep the target pair unique while allowing token reuse.
ALTER TABLE telegram_storage_account RENAME TO telegram_storage_account_old;

CREATE TABLE telegram_storage_account (
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

INSERT INTO telegram_storage_account (
  account_id,account_name,bot_token,chat_id,weight,enabled,upload_count,failure_count,last_used_at,last_error,created_at,updated_at
)
SELECT account_id,account_name,bot_token,chat_id,weight,enabled,upload_count,failure_count,last_used_at,last_error,created_at,updated_at
FROM telegram_storage_account_old;

DROP TABLE telegram_storage_account_old;
CREATE INDEX IF NOT EXISTS idx_telegram_storage_enabled ON telegram_storage_account(enabled,account_id);
