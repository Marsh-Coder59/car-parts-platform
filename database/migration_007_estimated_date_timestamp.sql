-- ============================================================
-- Migration 007: deliveries.estimated_date — DATE -> TIMESTAMP
-- Safe/additive: widens a column's precision, no data loss. Existing
-- values keep their date and get midnight as a time component (the only
-- reasonable default, since no time was ever recorded for them).
--
-- WHY: the customer-facing delivery progress bar animates linearly from
-- dispatch time to the estimated delivery time. With only a DATE, there
-- is no way to represent "arrives within 24 hours" or any delivery
-- window shorter than a day — every same-day estimate would collapse to
-- midnight, making the progress calculation meaningless for fast
-- deliveries.
-- ============================================================

ALTER TABLE deliveries
    ALTER COLUMN estimated_date TYPE TIMESTAMP USING estimated_date::timestamp;
