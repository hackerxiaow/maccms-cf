-- D1-backed flash sale inventory and order references.
CREATE TABLE IF NOT EXISTS seckill_campaign (
  campaign_id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_name TEXT NOT NULL,
  goods_id INTEGER NOT NULL,
  sale_price REAL NOT NULL DEFAULT 0,
  inventory INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER NOT NULL DEFAULT 0,
  ends_at INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_seckill_active ON seckill_campaign(status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_seckill_goods ON seckill_campaign(goods_id, status);
ALTER TABLE mall_order ADD COLUMN seckill_id INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_mall_order_seckill ON mall_order(seckill_id, status);

CREATE TRIGGER IF NOT EXISTS mall_order_seckill_validate_before_insert
BEFORE INSERT ON mall_order
WHEN NEW.seckill_id > 0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM seckill_campaign
    WHERE campaign_id = NEW.seckill_id
      AND goods_id = NEW.goods_id
      AND status = 1
      AND (starts_at = 0 OR starts_at <= NEW.created_at)
      AND (ends_at = 0 OR ends_at >= NEW.created_at)
  ) THEN RAISE(ABORT, '秒杀活动未开始、已结束或已停用') END;
END;

CREATE TRIGGER IF NOT EXISTS mall_order_seckill_cancel_restore
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 0 AND NEW.status = 3 AND NEW.seckill_id > 0
BEGIN
  UPDATE seckill_campaign SET inventory = inventory + NEW.quantity WHERE campaign_id = NEW.seckill_id;
END;
