-- Complete the member marketplace checkout lifecycle with coupon reservation,
-- point ledger entries, fulfilment, and safe cancellation/refunds.
ALTER TABLE mall_order ADD COLUMN user_coupon_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mall_order ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_mall_order_user ON mall_order(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mall_order_coupon ON mall_order(user_coupon_id, status);

CREATE TRIGGER IF NOT EXISTS mall_order_coupon_validate_before_insert
BEFORE INSERT ON mall_order
WHEN NEW.user_coupon_id > 0
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM user_coupon uc JOIN coupon c ON c.coupon_id = uc.coupon_id
    WHERE uc.user_coupon_id = NEW.user_coupon_id
      AND uc.user_id = NEW.user_id
      AND uc.used_at = 0
      AND uc.order_id = 0
      AND c.status = 1
      AND (c.starts_at = 0 OR c.starts_at <= NEW.created_at)
      AND (c.ends_at = 0 OR c.ends_at >= NEW.created_at)
  ) THEN RAISE(ABORT, '优惠券已使用或正在其他订单中') END;
END;

CREATE TRIGGER IF NOT EXISTS mall_order_coupon_reserve_after_insert
AFTER INSERT ON mall_order
WHEN NEW.user_coupon_id > 0
BEGIN
  UPDATE user_coupon SET order_id = NEW.mall_order_id,
    used_at = CASE WHEN NEW.status = 1 THEN NEW.created_at ELSE used_at END
  WHERE user_coupon_id = NEW.user_coupon_id AND user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS mall_order_points_ledger_after_insert
AFTER INSERT ON mall_order
WHEN NEW.total_points > 0
BEGIN
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
  VALUES (NEW.user_id,'mall_purchase',0,-NEW.total_points,1,NEW.order_code,'system',NEW.created_at);
END;

CREATE TRIGGER IF NOT EXISTS mall_order_coupon_paid_after_update
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 0 AND NEW.status = 1 AND NEW.user_coupon_id > 0
BEGIN
  UPDATE user_coupon SET used_at = NEW.updated_at
  WHERE user_coupon_id = NEW.user_coupon_id AND order_id = NEW.mall_order_id AND used_at = 0;
END;

CREATE TRIGGER IF NOT EXISTS mall_order_cancel_refund_after_update
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 0 AND NEW.status = 3
BEGIN
  UPDATE mall_goods SET inventory = inventory + NEW.quantity WHERE goods_id = NEW.goods_id;
  UPDATE user SET user_points = user_points + NEW.total_points WHERE user_id = NEW.user_id;
  UPDATE user_coupon SET order_id = 0
  WHERE user_coupon_id = NEW.user_coupon_id AND order_id = NEW.mall_order_id AND used_at = 0;
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
  SELECT NEW.user_id,'mall_refund',0,NEW.total_points,1,NEW.order_code,'system',NEW.updated_at
  WHERE NEW.total_points > 0;
END;
