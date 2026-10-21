-- 易支付 V1 checkout and paid mall order linkage.
ALTER TABLE payment_intent ADD COLUMN mall_order_id INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_payment_intent_mall_order ON payment_intent(mall_order_id,status);

INSERT OR IGNORE INTO config(key,value)
  SELECT 'payment_provider',CASE WHEN EXISTS(SELECT 1 FROM config WHERE key='payment_checkout_url' AND value<>'')
      AND EXISTS(SELECT 1 FROM config WHERE key='payment_secret' AND value<>'') THEN 'generic' ELSE 'epay' END;
INSERT OR IGNORE INTO config(key,value) VALUES
  ('payment_epay_type',''),
  ('ai_semantic_search','0'),
  ('security_turnstile_enabled','0'),
  ('turnstile_site_key','');

-- A paid but unfulfilled mall order can be refunded by Epay. Restore inventory,
-- points and an unused coupon just like cancellation of an unpaid order.
CREATE TRIGGER IF NOT EXISTS mall_order_paid_refund_restore
AFTER UPDATE OF status ON mall_order
WHEN OLD.status = 1 AND NEW.status = 3
BEGIN
  UPDATE mall_goods SET inventory = inventory + NEW.quantity WHERE goods_id = NEW.goods_id;
  UPDATE seckill_campaign SET inventory = inventory + NEW.quantity WHERE campaign_id = NEW.seckill_id AND NEW.seckill_id > 0;
  UPDATE user SET user_points = user_points + NEW.total_points WHERE user_id = NEW.user_id;
  UPDATE user_coupon SET order_id = 0, used_at = 0
    WHERE user_coupon_id = NEW.user_coupon_id AND order_id = NEW.mall_order_id;
  INSERT INTO cash_log (user_id,cash_type,amount,points,status,note,operator,created_at)
    SELECT NEW.user_id,'mall_refund',0,NEW.total_points,1,NEW.order_code,'epay-refund',NEW.updated_at
    WHERE NEW.total_points > 0;
END;
