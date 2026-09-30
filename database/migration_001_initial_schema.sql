-- ============================================================
-- CarParts E-Commerce Platform — Database Schema
-- Migration 001: Complete Initial Schema
-- Compatible with the main.py backend contract
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                          SERIAL PRIMARY KEY,
    first_name                  VARCHAR(100) NOT NULL,
    last_name                   VARCHAR(100) NOT NULL,
    email                       VARCHAR(255) NOT NULL UNIQUE,
    phone                       VARCHAR(30),
    password_hash               TEXT NOT NULL,
    role                        VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
                                    CHECK (role IN ('CUSTOMER','STAFF','ADMIN')),
    status                      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                                    CHECK (status IN ('ACTIVE','SUSPENDED','DEACTIVATED')),
    email_verified              BOOLEAN NOT NULL DEFAULT FALSE,
    phone_verified              BOOLEAN NOT NULL DEFAULT FALSE,
    -- password reset fallback columns (used if password_reset_tokens table unavailable)
    password_reset_token        TEXT,
    password_reset_expires      TIMESTAMP,
    -- email verification fallback columns
    email_verification_token    TEXT,
    email_verification_expires  TIMESTAMP,
    created_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at               TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status  ON users(status);

-- ============================================================
-- USER SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token_hash  TEXT NOT NULL UNIQUE,
    expires_at          TIMESTAMP NOT NULL,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMP,
    ip_address          VARCHAR(45),
    user_agent          VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_sessions_token    ON user_sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user     ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires  ON user_sessions(expires_at);

-- ============================================================
-- PASSWORD RESET TOKENS (dedicated table)
-- ============================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_token   ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_prt_user    ON password_reset_tokens(user_id);

-- ============================================================
-- EMAIL VERIFICATION TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMP NOT NULL,
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_token  ON email_verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_evt_user   ON email_verification_tokens(user_id);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(150) UNIQUE,
    description TEXT,
    image_url   TEXT,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent   ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_active   ON categories(is_active);

-- ============================================================
-- BRANDS
-- ============================================================
CREATE TABLE IF NOT EXISTS brands (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(150) UNIQUE,
    description TEXT,
    logo_url    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id               SERIAL PRIMARY KEY,
    category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    brand_id         INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    name             VARCHAR(255) NOT NULL,
    slug             VARCHAR(255) UNIQUE,
    sku              VARCHAR(100) UNIQUE,
    part_number      VARCHAR(100),
    description      TEXT,
    price            NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    compare_at_price NUMERIC(12,2) CHECK (compare_at_price >= 0),
    condition        VARCHAR(20) NOT NULL DEFAULT 'NEW'
                         CHECK (condition IN ('NEW','USED','REFURBISHED')),
    status           VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                         CHECK (status IN ('DRAFT','ACTIVE','OUT_OF_STOCK','ARCHIVED')),
    weight           NUMERIC(10,3),
    is_featured      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_status      ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand       ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_featured    ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_name_trgm   ON products USING gin(to_tsvector('english', name));

-- ============================================================
-- PRODUCT IMAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url   TEXT NOT NULL,
    alt_text    VARCHAR(255),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product    ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_primary    ON product_images(product_id, is_primary);

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
    id            SERIAL PRIMARY KEY,
    make          VARCHAR(100) NOT NULL,
    model         VARCHAR(100) NOT NULL,
    generation    VARCHAR(100),
    year_from     INTEGER,
    year_to       INTEGER,
    engine        VARCHAR(100),
    fuel_type     VARCHAR(50),
    transmission  VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_make_model  ON vehicles(make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_years       ON vehicles(year_from, year_to);

-- ============================================================
-- PRODUCT COMPATIBILITY
-- ============================================================
CREATE TABLE IF NOT EXISTS product_compatibility (
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    notes       TEXT,
    PRIMARY KEY (product_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_compat_vehicle   ON product_compatibility(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_compat_product   ON product_compatibility(product_id);

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
    id                 SERIAL PRIMARY KEY,
    product_id         INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    quantity           INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    reorder_level      INTEGER NOT NULL DEFAULT 5,
    updated_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT inv_reserved_le_qty CHECK (reserved_quantity <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_inventory_product  ON inventory(product_id);

-- ============================================================
-- INVENTORY TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
    id              SERIAL PRIMARY KEY,
    product_id      INTEGER NOT NULL REFERENCES products(id),
    type            VARCHAR(30) NOT NULL
                        CHECK (type IN ('STOCK_IN','STOCK_OUT','RESERVATION','RELEASE','ADJUSTMENT','RETURN')),
    quantity        INTEGER NOT NULL,
    reference_type  VARCHAR(50),
    reference_id    VARCHAR(100),
    notes           TEXT,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_txn_product  ON inventory_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_txn_type     ON inventory_transactions(type);
CREATE INDEX IF NOT EXISTS idx_inv_txn_created  ON inventory_transactions(created_at);

-- ============================================================
-- ADDRESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS addresses (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label          VARCHAR(100),
    full_name      VARCHAR(200) NOT NULL,
    phone          VARCHAR(30),
    address_line1  VARCHAR(255) NOT NULL,
    address_line2  VARCHAR(255),
    city           VARCHAR(100) NOT NULL,
    county         VARCHAR(100),
    country        VARCHAR(100) NOT NULL DEFAULT 'Kenya',
    postal_code    VARCHAR(20),
    is_default     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user  ON addresses(user_id);

-- ============================================================
-- CARTS
-- ============================================================
CREATE TABLE IF NOT EXISTS carts (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE','CONVERTED','ABANDONED')),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carts_user_status  ON carts(user_id, status);

-- ============================================================
-- CART ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_items (
    id          SERIAL PRIMARY KEY,
    cart_id     INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart  ON cart_items(cart_id);

-- ============================================================
-- COUPONS
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
    id                SERIAL PRIMARY KEY,
    code              VARCHAR(50) NOT NULL UNIQUE,
    discount_type     VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE','FIXED')),
    discount_value    NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
    min_order_amount  NUMERIC(12,2),
    max_uses          INTEGER,
    times_used        INTEGER NOT NULL DEFAULT 0,
    expires_at        DATE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code  ON coupons(code);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id                   SERIAL PRIMARY KEY,
    order_number         VARCHAR(50) NOT NULL UNIQUE,
    user_id              INTEGER NOT NULL REFERENCES users(id),
    subtotal             NUMERIC(12,2) NOT NULL,
    delivery_fee         NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount         NUMERIC(12,2) NOT NULL,
    deposit_percentage   NUMERIC(5,2) NOT NULL DEFAULT 75,
    deposit_amount       NUMERIC(12,2) NOT NULL,
    deposit_paid         BOOLEAN NOT NULL DEFAULT FALSE,
    balance_percentage   NUMERIC(5,2) NOT NULL DEFAULT 25,
    balance_amount       NUMERIC(12,2) NOT NULL,
    balance_paid         BOOLEAN NOT NULL DEFAULT FALSE,
    payment_status       VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    order_status         VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                             CHECK (order_status IN (
                                 'PENDING','AWAITING_DEPOSIT','DEPOSIT_VERIFICATION',
                                 'PROCESSING','READY_FOR_DISPATCH','DISPATCHED',
                                 'OUT_FOR_DELIVERY','DELIVERED','AWAITING_BALANCE',
                                 'COMPLETED','CANCELLED','RETURN_REQUESTED',
                                 'RETURNED','REFUNDED'
                             )),
    shipping_address_id  INTEGER REFERENCES addresses(id),
    notes                TEXT,
    created_at           TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user     ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_number   ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created  ON orders(created_at);

-- ============================================================
-- ORDER ITEMS (price snapshot)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name  VARCHAR(255) NOT NULL,
    sku           VARCHAR(100),
    part_number   VARCHAR(100),
    quantity      INTEGER NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(12,2) NOT NULL,
    subtotal      NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order    ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product  ON order_items(product_id);

-- ============================================================
-- ORDER EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_events (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event_type   VARCHAR(50) NOT NULL,
    description  TEXT,
    old_status   VARCHAR(30),
    new_status   VARCHAR(30),
    created_by   INTEGER REFERENCES users(id),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order  ON order_events(order_id);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    type          VARCHAR(20) NOT NULL CHECK (type IN ('DEPOSIT','BALANCE','REFUND')),
    method        VARCHAR(30) NOT NULL DEFAULT 'BANK_TRANSFER',
    amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    currency      VARCHAR(10) NOT NULL DEFAULT 'KES',
    reference     VARCHAR(255),
    status        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','VERIFIED','REJECTED','FAILED')),
    submitted_at  TIMESTAMP,
    verified_at   TIMESTAMP,
    verified_by   INTEGER REFERENCES users(id),
    notes         TEXT,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order     ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_user      ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_type      ON payments(type);

-- ============================================================
-- DELIVERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
    id               SERIAL PRIMARY KEY,
    order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method           VARCHAR(100),
    courier          VARCHAR(100),
    tracking_number  VARCHAR(200),
    status           VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                         CHECK (status IN (
                             'PENDING','READY','DISPATCHED','IN_TRANSIT',
                             'OUT_FOR_DELIVERY','DELIVERED','FAILED','RETURNED'
                         )),
    estimated_date   DATE,
    dispatched_at    TIMESTAMP,
    delivered_at     TIMESTAMP,
    notes            TEXT,
    created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_order   ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status  ON deliveries(status);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
    id             SERIAL PRIMARY KEY,
    product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    order_item_id  INTEGER REFERENCES order_items(id),
    rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title          VARCHAR(255),
    comment        TEXT,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (order_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_product  ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user     ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status   ON reviews(status);

-- ============================================================
-- WISHLISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlists (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
    id           SERIAL PRIMARY KEY,
    wishlist_id  INTEGER NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
    product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (wishlist_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_wishlist  ON wishlist_items(wishlist_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        VARCHAR(60) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    message     TEXT NOT NULL,
    channel     VARCHAR(20) NOT NULL DEFAULT 'IN_APP'
                    CHECK (channel IN ('IN_APP','EMAIL','SMS','WHATSAPP')),
    status      VARCHAR(20) NOT NULL DEFAULT 'UNREAD'
                    CHECK (status IN ('UNREAD','READ')),
    read_at     TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status  ON notifications(user_id, status);

-- ============================================================
-- RETURNS
-- ============================================================
CREATE TABLE IF NOT EXISTS returns (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    user_id     INTEGER NOT NULL REFERENCES users(id),
    reason      TEXT NOT NULL,
    notes       TEXT,
    status      VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','APPROVED','REJECTED','RETURNED','REFUNDED')),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_returns_order   ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_user    ON returns(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_status  ON returns(status);

-- ============================================================
-- REFUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS refunds (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders(id),
    return_id   INTEGER REFERENCES returns(id),
    amount      NUMERIC(12,2),
    reason      TEXT,
    notes       TEXT,
    status      VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','APPROVED','COMPLETED','REJECTED')),
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order  ON refunds(order_id);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action       VARCHAR(100) NOT NULL,
    entity_type  VARCHAR(60),
    entity_id    VARCHAR(100),
    old_values   JSONB,
    new_values   JSONB,
    ip_address   VARCHAR(45),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user     ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action   ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_entity   ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_logs(created_at);

-- ============================================================
-- SITE SETTINGS (single-row config table)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_settings (
    id                          SERIAL PRIMARY KEY,
    business_name               VARCHAR(200),
    business_email              VARCHAR(255),
    business_phone              VARCHAR(30),
    whatsapp_number             VARCHAR(30),
    facebook_url                TEXT,
    instagram_url               TEXT,
    tiktok_url                  TEXT,
    x_url                       TEXT,
    -- BANK DETAILS (sensitive — not returned by public endpoint)
    bank_name                   VARCHAR(200),
    bank_account_name           VARCHAR(200),
    bank_account_number         VARCHAR(100),
    bank_branch                 VARCHAR(200),
    -- PAYMENT DEFAULTS
    default_deposit_percentage  INTEGER NOT NULL DEFAULT 75,
    default_balance_percentage  INTEGER NOT NULL DEFAULT 25,
    -- DELIVERY
    default_delivery_fee        NUMERIC(12,2) NOT NULL DEFAULT 0,
    free_delivery_threshold     NUMERIC(12,2),
    -- METADATA
    updated_at                  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed a single settings row if none exists
INSERT INTO site_settings (business_name, default_deposit_percentage, default_balance_percentage, default_delivery_fee)
SELECT 'CarParts', 75, 25, 0
WHERE NOT EXISTS (SELECT 1 FROM site_settings);

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Available inventory view
CREATE OR REPLACE VIEW v_inventory_available AS
SELECT
    i.product_id,
    p.name AS product_name,
    p.sku,
    p.status AS product_status,
    i.quantity,
    i.reserved_quantity,
    i.quantity - i.reserved_quantity AS available_quantity,
    i.reorder_level,
    CASE WHEN i.quantity - i.reserved_quantity <= i.reorder_level THEN TRUE ELSE FALSE END AS low_stock
FROM inventory i
JOIN products p ON p.id = i.product_id;

-- Order payment summary view
CREATE OR REPLACE VIEW v_order_payment_summary AS
SELECT
    o.id AS order_id,
    o.order_number,
    o.total_amount,
    o.deposit_amount,
    o.balance_amount,
    o.deposit_paid,
    o.balance_paid,
    COALESCE(SUM(CASE WHEN p.type='DEPOSIT' AND p.status='VERIFIED' THEN p.amount ELSE 0 END), 0) AS verified_deposit,
    COALESCE(SUM(CASE WHEN p.type='BALANCE' AND p.status='VERIFIED' THEN p.amount ELSE 0 END), 0) AS verified_balance
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
GROUP BY o.id, o.order_number, o.total_amount, o.deposit_amount, o.balance_amount, o.deposit_paid, o.balance_paid;

