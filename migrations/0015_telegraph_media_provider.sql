ALTER TABLE media_asset ADD COLUMN storage_provider TEXT NOT NULL DEFAULT 'r2';
ALTER TABLE media_asset ADD COLUMN provider_ref TEXT NOT NULL DEFAULT '';
