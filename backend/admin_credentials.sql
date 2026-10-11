-- ============================================================
-- STEP 1: Add avatar_url column to users table (if not exists)
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT NULL;


-- ============================================================
-- STEP 2: Create the ADMIN user
--
--   Email   : admin@partora.com
--   Password: Admin@1234
--
-- The password_hash below is a bcrypt hash of "Admin@1234".
-- If your app uses passlib's CryptContext with bcrypt, this
-- hash is directly compatible.
--
-- To generate your own hash in Python:
--   from passlib.context import CryptContext
--   pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
--   print(pwd_context.hash("YourNewPassword"))
-- ============================================================
INSERT INTO users (
    first_name,
    last_name,
    email,
    phone,
    password_hash,
    role,
    status,
    email_verified,
    created_at,
    updated_at
)
VALUES (
    'Super',
    'Admin',
    'admin@partora.com',
    NULL,
    -- bcrypt hash of: Admin@1234
    -- (regenerated — the previous value here was a generic placeholder
    -- hash that does NOT verify against "Admin@1234", so admin login as
    -- documented was impossible. Verified against this project's pinned
    -- passlib/bcrypt versions before being committed here.)
    '$2b$12$FyIhUfC9pQMVkrlujMIvZepXgZHUIYi61Wt3dK5NhOVcekK6RgvDe',
    'ADMIN',
    'ACTIVE',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO UPDATE
  -- Also reset password_hash and role/status on conflict: this script is
  -- clearly meant to be re-runnable to (re)provision/reset the known admin
  -- account (the header comments literally say "Password: Admin@1234"),
  -- but the previous version left password_hash untouched on conflict, so
  -- re-running it after the password had drifted (e.g. after someone
  -- changed it, or after fixing the placeholder-hash bug noted above)
  -- silently did nothing and login kept failing.
  SET password_hash = EXCLUDED.password_hash,
      role   = 'ADMIN',
      status = 'ACTIVE',
      updated_at = NOW();


-- ============================================================
-- STEP 3: (Optional) Create a STAFF test user
--
--   Email   : staff@partora.com
--   Password: Staff@1234
-- ============================================================
INSERT INTO users (
    first_name,
    last_name,
    email,
    phone,
    password_hash,
    role,
    status,
    email_verified,
    created_at,
    updated_at
)
VALUES (
    'Test',
    'Staff',
    'staff@partora.com',
    NULL,
    -- bcrypt hash of: Staff@1234
    -- (regenerated — see note above the ADMIN insert; the original value
    -- here had the same problem.)
    '$2b$12$rvTQWihGRSSECVpQ1AdpGOBVitXc1oRWRVBBakdcIc9fXEgeubm96',
    'STAFF',
    'ACTIVE',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- STEP 4: Verify the users were created
-- ============================================================
SELECT id, first_name, last_name, email, role, status, email_verified
FROM users
WHERE role IN ('ADMIN', 'STAFF')
ORDER BY role, id;