-- Claim payment side effects once, independently of the order type branch.
ALTER TABLE payment_intent ADD COLUMN settled_at INTEGER NOT NULL DEFAULT 0;
