-- ============================================================
-- Migration 006: Remember which coupon code was applied to an order
-- Safe/additive: only adds a nullable column, no data loss.
--
-- discount_amount was already being calculated and stored correctly on
-- the order, but there was no record of WHICH coupon produced it, so
-- the order confirmation/detail pages had no way to show "Coupon
-- SAVE10 applied" even though the discount itself was real.
-- ============================================================

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
