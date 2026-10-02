-- ============================================================
-- Migration 002: Add image columns to site_settings
--                Add avatar_url to users
-- ============================================================

-- Site branding images
ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS logo_url    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS banner_url  TEXT DEFAULT NULL;

-- User profile pictures
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url  TEXT DEFAULT NULL;

-- ============================================================
-- Admin credentials (run only once; idempotent via ON CONFLICT)
-- ============================================================
INSERT INTO users (
    first_name, last_name, email, password_hash,
    role, status, email_verified, created_at, updated_at
)
VALUES (
    'Super', 'Admin', 'admin@partora.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq2KF5m',
    'ADMIN', 'ACTIVE', TRUE, NOW(), NOW()
)
ON CONFLICT (email) DO UPDATE
  SET role = 'ADMIN', status = 'ACTIVE', updated_at = NOW();

-- Verify
SELECT id, first_name, email, role FROM users WHERE role = 'ADMIN';

-- ============================================================
-- Products: stock quantity column (if not already tracked)
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;

-- ============================================================
-- Reviews table (ensure it exists for admin panel)
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_item_id INTEGER,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       VARCHAR(200),
    comment     TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Verify everything
-- ============================================================
SELECT column_name FROM information_schema.columns
WHERE table_name = 'site_settings'
ORDER BY ordinal_position;
