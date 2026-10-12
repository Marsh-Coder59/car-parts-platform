-- ============================================================
-- Migration 004: Per-account theme preference (light/dark)
-- Safe/additive: only adds a column with a default, no data loss.
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'light'
        CHECK (theme_preference IN ('light', 'dark'));
