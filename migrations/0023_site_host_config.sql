-- Per-host branding and isolated desktop/mobile theme overrides for shared D1 content.
CREATE TABLE IF NOT EXISTS site_host_config (
  hostname TEXT PRIMARY KEY,
  site_name TEXT NOT NULL DEFAULT '',
  site_url TEXT NOT NULL DEFAULT '',
  site_keywords TEXT NOT NULL DEFAULT '',
  site_description TEXT NOT NULL DEFAULT '',
  theme_json TEXT NOT NULL DEFAULT '{}',
  mobile_theme_json TEXT NOT NULL DEFAULT '{}',
  status INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_site_host_status ON site_host_config(status,hostname);
