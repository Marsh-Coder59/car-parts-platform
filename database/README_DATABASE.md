# Partora — Database Setup

## Requirements

- PostgreSQL 14 or higher

## Step 1 — Create the database and user

Connect to PostgreSQL as a superuser (e.g. `postgres`):

```sql
CREATE USER partora_user WITH PASSWORD 'your_strong_password';
CREATE DATABASE partora_db OWNER partora_user;
GRANT ALL PRIVILEGES ON DATABASE partora_db TO partora_user;
```

## Step 2 — Run the migration

```bash
psql -U partora_user -d partora_db -f migration_001_initial_schema.sql
```

Or using the connection string:

```bash
psql postgresql://partora_user:your_strong_password@localhost:5432/partora_db \
     -f migration_001_initial_schema.sql
```

## Step 3 — Verify

```sql
\c partora_db
\dt
```

You should see all 25 tables:

```
 audit_logs
 brands
 cart_items
 carts
 categories
 coupons
 deliveries
 email_verification_tokens
 inventory
 inventory_transactions
 notifications
 order_events
 order_items
 orders
 password_reset_tokens
 payments
 product_compatibility
 product_images
 products
 refunds
 returns
 reviews
 site_settings
 user_sessions
 users
 vehicles
 wishlist_items
 wishlists
```

A single default row is automatically inserted into `site_settings`.
Configure bank details and business info via the Admin → Settings panel after first login.

## Connection string format

```
postgresql://USER:PASSWORD@HOST:PORT/DBNAME
```

Example:
```
postgresql://partora_user:secret@localhost:5432/partora_db
```

## Production notes

- Use a strong, randomly-generated password
- Enable SSL: append `?sslmode=require` to the connection string
- Consider connection pooling (PgBouncer) for production load
- Take regular backups with `pg_dump`

## Tables overview

| Table | Purpose |
|---|---|
| `users` | All users (CUSTOMER, STAFF, ADMIN) |
| `user_sessions` | HTTP-only session tokens (hashed) |
| `password_reset_tokens` | Secure password reset tokens |
| `email_verification_tokens` | Email verification tokens |
| `categories` | Product categories |
| `brands` | Product brands |
| `products` | Product catalog |
| `product_images` | Product image URLs |
| `vehicles` | Vehicle make/model/year records |
| `product_compatibility` | Product ↔ vehicle many-to-many |
| `inventory` | Stock levels per product |
| `inventory_transactions` | Full audit trail of stock changes |
| `addresses` | Customer delivery addresses |
| `carts` | Shopping carts |
| `cart_items` | Items in each cart |
| `coupons` | Discount coupons |
| `orders` | Orders with 75/25 deposit/balance |
| `order_items` | Snapshotted line items (price preserved) |
| `order_events` | State machine audit trail |
| `payments` | Bank transfer payment records |
| `deliveries` | Delivery tracking per order |
| `reviews` | Customer reviews (post-purchase only) |
| `wishlists` | One wishlist per customer |
| `wishlist_items` | Products in each wishlist |
| `notifications` | In-app notifications |
| `returns` | Return requests |
| `refunds` | Refund records |
| `audit_logs` | Full security and admin audit log |
| `site_settings` | Single-row configuration table |
