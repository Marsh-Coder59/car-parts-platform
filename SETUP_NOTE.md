# Before you open this in an editor

This zip does **not** include `frontend/node_modules/` or `backend/venv/`.
That's normal and intentional — those are regenerated dependency folders
(160MB+ and 66MB respectively) that every JS/Python project excludes from
anything you zip or commit. If you open the project before installing them,
your editor will show "Cannot find module 'react'" (and similar) errors on
**every single `.tsx` file** — that's not a bug in the code, it's just that
the dependencies aren't there yet.

Fix (run once):

```powershell
cd "C:\car 2\frontend"
npm install

cd "C:\car 2\backend"
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

After that, `frontend/node_modules` will exist and the errors disappear —
confirmed on this exact codebase: `npx tsc --noEmit` and `npm run build`
both come back completely clean once dependencies are installed.

One real dependency fix is already in `requirements.txt`: `bcrypt` is now
pinned to `==4.0.1` (not `>=4.1.3`) because newer bcrypt breaks `passlib`
and makes every login fail. If your existing `venv` already has a working
`bcrypt`, you don't need to reinstall anything — just know not to upgrade
it.

## New since the last package: dark mode + dashboard redesign

- `database/migration_004_theme_preference.sql` — run this against your
  real database (safe/additive, adds one column with a default):
  ```powershell
  psql -U your_db_user -d your_db_name -f migration_004_theme_preference.sql
  ```
- `frontend/package.json` now includes `recharts` (used for the dashboard's
  sales trend chart) — `npm install` picks it up automatically.

## Fixing the CORS / "net::ERR_FAILED" errors on your deployed site

What you're seeing (`blocked by CORS policy`, requests going to
`http://localhost:8000` from `https://car-parts-platform-xivy.onrender.com`)
isn't really a CORS bug — it's that your **deployed frontend has no backend
to actually talk to yet**. Vite bakes `VITE_API_BASE_URL` into the bundle at
*build* time; when it wasn't set, it fell back to the local-dev default
(`http://localhost:8000`), which obviously doesn't exist from a visitor's
browser. I did fix two real bugs alongside this (below), but the main fix
here is deployment configuration, not code.

**1. Deploy the backend as its own Render service.**
I added `render.yaml` at the project root — a one-click Blueprint that spins
up a managed Postgres database and the FastAPI backend together, and runs
every migration automatically during the build (`backend/run_migrations.py`
— new, idempotent, tested against a fresh empty database end-to-end).
In the Render dashboard: **New + → Blueprint**, point it at this repo. After
it deploys you'll have a URL like `https://partora-backend.onrender.com`.

Once it's up, run `backend/admin_credentials.sql` against it once (Render's
dashboard → your Postgres → Connect, or `psql` from your machine) to create
the admin login — it isn't run automatically, since re-running it would
silently reset the admin password on every deploy.

**2. Tell the backend which frontend origin to trust.**
`render.yaml` already sets `ALLOWED_ORIGINS` and `FRONTEND_URL` to
`https://car-parts-platform-xivy.onrender.com` (the origin from your error
log) — if that's not your actual frontend URL, update it in the backend
service's Environment tab on Render and redeploy.

**3. Tell the frontend where the backend actually is.**
I committed `frontend/.env.production` with a best-guess URL
(`https://partora-backend.onrender.com`, matching the service name in
`render.yaml`) — if Render had to rename it (the name was taken), update
that file (or add `VITE_API_BASE_URL` directly in the frontend service's
Environment tab on Render, which takes priority) to the real URL, **then
trigger a manual redeploy of the frontend** — env var changes alone do
nothing until the bundle is rebuilt.

**4. A real bug I found and fixed while tracing this**: even once CORS was
correctly configured, login would still have looked like it "worked" but
every request after it would 401 — because the session cookie was being set
with `SameSite=Lax`, which browsers silently refuse to send on cross-site
AJAX requests (frontend and backend are different hostnames even though
both end in `.onrender.com`). Fixed to use `SameSite=None; Secure` in
production (and left as `Lax` for local dev, where frontend+backend share
an origin via the Vite proxy) — in `main.py`'s login and logout cookie
handling.

**One more thing worth knowing**: Render's free tier has an *ephemeral*
filesystem — anything saved to `backend/static` (uploaded product images,
logos, avatars) is wiped on every redeploy and after the service spins down
from inactivity. That's outside what a CORS/cookie fix can address; when
you're ready, the options are a Render persistent disk (paid) or moving
uploads to object storage (S3, Cloudflare R2, etc.) — a bigger change than
this round, happy to do it if you want it next.
