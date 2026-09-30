# Partora — System Overview

**Automotive Parts Marketplace**

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PARTORA SYSTEM                       │
│                                                         │
│  ┌──────────────┐    HTTP/JSON    ┌──────────────────┐  │
│  │   Frontend   │ ◄────────────► │    Backend       │  │
│  │  React + Vite│                │  FastAPI (Python) │  │
│  │  TypeScript  │                │  Port 8000        │  │
│  │  Port 3000   │                └────────┬─────────┘  │
│  └──────────────┘                         │             │
│                                    psycopg2│             │
│                                           ▼             │
│                               ┌──────────────────────┐  │
│                               │     PostgreSQL       │  │
│                               │     Database         │  │
│                               │     Port 5432        │  │
│                               └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Database — PostgreSQL
- 28 tables, full relational schema
- Indexes on all foreign keys and frequently-queried columns
- Row-level locking for inventory and payment concurrency
- JSONB columns for audit log values

### 2. Backend — FastAPI (Python)
- 117 API routes under `/api/`
- DB-session-based authentication (no stale JWT role trust)
- Role-based access control: CUSTOMER / STAFF / ADMIN
- Decimal arithmetic for all monetary values
- 75% deposit / 25% balance payment workflow
- Transactional checkout with `SELECT FOR UPDATE`
- Full audit logging
- In-app notifications
- SMTP email service (stdlib, no external dep)
- Rate limiting on auth endpoints
- Security headers middleware

### 3. Frontend — React + Vite
- 36 pages across public / customer / admin
- Centralized Axios API client
- HTTP-only cookie + Bearer token auth
- Global loading overlay (logo + bouncing dots)
- Skeleton loaders for content
- Role-protected routes
- Fully responsive (mobile + desktop)
- Zero mock data — all content from live API

---

## Payment Method

**Bank Transfer only.**

M-Pesa, PayPal, Stripe, and card gateways are deliberately excluded.

Flow:
1. Customer places order
2. Backend calculates 75% deposit required
3. Frontend displays bank details from site settings (configured by admin)
4. Customer makes bank transfer externally
5. Customer submits transaction reference number
6. Staff/Admin reviews and verifies/rejects in admin panel
7. Backend updates order status and notifies customer
8. After delivery, 25% balance is due via same flow

---

## Roles

| Role | Access |
|---|---|
| CUSTOMER | Shop, cart, orders, payments, wishlist, profile, notifications |
| STAFF | Full admin panel except staff management and settings |
| ADMIN | Full system access including staff creation and settings |

---

## Directory Structure

```
partora-complete/
├── backend/
│   ├── main.py              # Complete FastAPI application (5,891 lines)
│   ├── database.py          # PostgreSQL connection
│   ├── requirements.txt     # Python dependencies
│   ├── tests.py             # 89 unit tests
│   └── .env.example         # Environment variable template
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Router (39 routes)
│   │   ├── components/      # UI components
│   │   ├── context/         # Auth, Cart, Loading contexts
│   │   ├── pages/           # 36 pages (public/customer/admin)
│   │   ├── services/        # API service layer
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Formatting utilities
│   ├── package.json
│   ├── vite.config.ts
│   └── .env.example
│
├── database/
│   ├── migration_001_initial_schema.sql   # Complete schema
│   └── README_DATABASE.md
│
└── docs/
    ├── SYSTEM_OVERVIEW.md   # This file
    └── SETUP.md             # Full setup guide
```
