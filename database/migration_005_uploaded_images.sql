-- ============================================================
-- Migration 005: Persistent image storage (DB-backed)
-- Safe/additive: only creates a new table, touches nothing existing.
--
-- WHY: Render's free-tier web service filesystem is EPHEMERAL — anything
-- written to backend/static (logo, favicon, banner, category images,
-- product images, avatars) is wiped on every redeploy and after the
-- service spins down from inactivity. That's what caused uploaded
-- images to go blank in production while the code "worked" locally.
-- Postgres on Render (even the free managed plan) persists normally,
-- so storing the image bytes here instead of on local disk survives
-- redeploys and restarts.
-- ============================================================

CREATE TABLE IF NOT EXISTS uploaded_images (
    id           SERIAL PRIMARY KEY,
    filename     TEXT NOT NULL,
    content_type TEXT NOT NULL,
    data         BYTEA NOT NULL,
    size_bytes   INTEGER NOT NULL,
    uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
