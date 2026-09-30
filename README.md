# Partora — Automotive Parts Marketplace

**Complete Production System**

---

```
PARTORA
Automotive Parts Marketplace
```

---

## What's Included

```
partora-complete/
├── backend/          FastAPI Python backend (117 API routes)
├── frontend/         React + Vite TypeScript frontend (36 pages)
├── database/         PostgreSQL schema (28 tables)
└── docs/             Setup and architecture documentation
```

---

## Quick Start

**1. Database**
```bash
psql -U postgres -c "CREATE USER partora_user WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE partora_db OWNER partora_user;"
psql -U partora_user -d partora_db -f database/migration_001_initial_schema.sql
```

**2. Backend**
```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # Fill in DATABASE_URL and SECRET_KEY
uvicorn main:app --reload --port 8000
```

**3. Frontend**
```bash
cd frontend
npm install
cp .env.example .env        # Set VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Open `http://localhost:3000`

---

## Full Setup Guide

See `docs/SETUP.md` for complete step-by-step instructions including:
- First admin account creation
- Bank details configuration
- Production deployment
- Nginx configuration
- Logo replacement

---

## Payment Method

**Bank Transfer only.** No M-Pesa, PayPal, Stripe, or card gateways.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, psycopg2 |
| Database | PostgreSQL 14+ |
| Auth | HTTP-only sessions (DB-backed) |
| Payments | Manual bank transfer workflow |

---

## Roles

| Role | Description |
|---|---|
| CUSTOMER | Shop, orders, payments |
| STAFF | Operations (orders, inventory, payments) |
| ADMIN | Full access including settings and staff |
