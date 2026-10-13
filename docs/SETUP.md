# Partora — Complete Setup Guide

This guide takes you from zero to a fully running Partora system.

---

## Prerequisites

| Requirement | Version | Check |
|---|---|---|
| Python | 3.11+ | `python --version` |
| PostgreSQL | 14+ | `psql --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

---

## Step 1 — Set Up PostgreSQL

### 1.1 Create the database user and database

```bash
# Login as postgres superuser
psql -U postgres
```

```sql
CREATE USER partora_user WITH PASSWORD 'choose_a_strong_password';
CREATE DATABASE partora_db OWNER partora_user;
GRANT ALL PRIVILEGES ON DATABASE partora_db TO partora_user;
\q
```

### 1.2 Run the database migration

```bash
psql -U partora_user -d partora_db -f database/migration_001_initial_schema.sql
```

Verify tables were created:

```bash
psql -U partora_user -d partora_db -c "\dt"
```

You should see 28 tables listed.

---

## Step 2 — Set Up the Backend

### 2.1 Navigate to the backend directory

```bash
cd backend/
```

### 2.2 Create and activate a virtual environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 2.3 Install dependencies

```bash
pip install -r requirements.txt
```

### 2.4 Create your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in:

```env
DATABASE_URL=postgresql://partora_user:your_password@localhost:5432/partora_db
SECRET_KEY=generate-a-long-random-string-here
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
```

To generate a secure SECRET_KEY:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 2.5 Validate the backend

```bash
# Check syntax
python -m py_compile main.py && echo "OK"

# Run tests
python tests.py
```

Expected output: `Ran 89 tests ... OK`

### 2.6 Start the backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

You should see:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Visit `http://localhost:8000/health` — you should see:

```json
{"status": "ok", "database": "ok"}
```

And `http://localhost:8000/docs` for the interactive API docs.

---

## Step 3 — Set Up the Frontend

### 3.1 Navigate to the frontend directory

```bash
cd frontend/
```

### 3.2 Install dependencies

```bash
npm install
```

### 3.3 Create your .env file

```bash
cp .env.example .env
```

Contents:

```env
VITE_API_BASE_URL=http://localhost:8000
```

### 3.4 Start the frontend

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## Step 4 — First-Time Configuration

### 4.1 Create the first Admin account

Call the register endpoint directly (first account only):

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Admin",
    "last_name": "User",
    "email": "admin@yourstore.com",
    "password": "your_secure_password"
  }'
```

Then promote to ADMIN directly in PostgreSQL:

```bash
psql -U partora_user -d partora_db -c \
  "UPDATE users SET role = 'ADMIN' WHERE email = 'admin@yourstore.com';"
```

### 4.2 Configure bank details

1. Sign in at `http://localhost:3000/login`
2. Go to `http://localhost:3000/admin/settings`
3. Fill in your bank details under **Bank Details**
4. Save — customers will now see these details when they place orders

### 4.3 Configure business information

In the same Settings page, fill in:
- Business name, email, phone
- WhatsApp number
- Social media URLs
- Default delivery fee

---

## Step 5 — Add your first products

1. Go to Admin → Categories → Add Category
2. Go to Admin → Brands → Add Brand
3. Go to Admin → Products → Add Product
4. Go to Admin → Inventory → Stock In (add initial stock)

---

## Production Deployment

### Backend

```bash
# Install with production server
pip install gunicorn

# Run with multiple workers
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000

# Or with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

Set in `.env`:
```env
ENVIRONMENT=production
ALLOWED_ORIGINS=https://yourdomain.com
FRONTEND_URL=https://yourdomain.com
```

### Frontend

```bash
npm run build
```

Serves the `dist/` directory with nginx, Apache, or any static host.

Example nginx config:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/frontend/dist;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### PostgreSQL — production checklist

```bash
# Backup
pg_dump partora_db > backup_$(date +%Y%m%d).sql

# Restore
psql partora_db < backup_20250101.sql
```

SSL connection string:
```
postgresql://partora_user:password@localhost:5432/partora_db?sslmode=require
```

---

## Environment Variable Reference

### Backend (.env)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SECRET_KEY` | ✅ | Session signing key (min 32 chars) |
| `ENVIRONMENT` | No | `development` or `production` |
| `SESSION_EXPIRE_HOURS` | No | Session lifetime (default: 24) |
| `ALLOWED_ORIGINS` | No | CORS origins (comma-separated) |
| `FRONTEND_URL` | No | Frontend URL for email links |
| `MAILJET_API_KEY` | No | Mailjet API key — email sending (Mailjet HTTPS API, not SMTP) |
| `MAILJET_SECRET_KEY` | No | Mailjet secret key |
| `SMTP_FROM` | No | Sender email address (must be verified in Mailjet) |
| `SMTP_FROM_NAME` | No | Sender display name |

### Frontend (.env)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | ✅ | Backend URL |

---

## Replacing the Logo

1. Put your logo image at `frontend/src/assets/logo.png`
2. Open `frontend/src/components/shared/Logo.tsx`
3. Uncomment this line at the top:
   ```ts
   import logoImage from '../../assets/logo.png';
   ```
4. Change the `null` assignment to use the import:
   ```ts
   const logoImage_src: string | null = logoImage;
   ```
   And update the reference in the JSX to use `logoImage_src`.

All instances across the entire app update automatically — nav, admin sidebar, loading overlay, auth pages.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `DATABASE_URL is not configured` | Check your `.env` file exists and has the variable |
| `SECRET_KEY is not set` | Add SECRET_KEY to your `.env` |
| `CORS error in browser` | Add your frontend URL to `ALLOWED_ORIGINS` in backend `.env` |
| `relation "users" does not exist` | Run the database migration |
| `Cannot connect to database` | Check PostgreSQL is running and credentials are correct |
| `npm install fails` | Ensure Node.js 18+ is installed |
| Session expires immediately | Check `SESSION_EXPIRE_HOURS` in `.env` |
| Emails not sending | Add `MAILJET_API_KEY` / `MAILJET_SECRET_KEY` to backend `.env` (logs the email instead if unset) |
| Bank details not showing | Configure them in Admin → Settings |
