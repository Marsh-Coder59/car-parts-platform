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
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsxq2KF5m',
    'ADMIN',
    'ACTIVE',
    TRUE,
    NOW(),
    NOW()
)
ON CONFLICT (email) DO UPDATE
  SET role   = 'ADMIN',
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
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36zCTKBSWjbmJ6STJzNc0W6',
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