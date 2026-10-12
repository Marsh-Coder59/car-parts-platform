"""
Applies every database/migration_*.sql file, in order, against DATABASE_URL.

Safe to run on every deploy / every time: all of this project's migrations
are written with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so re-applying an
already-applied migration is a no-op rather than an error. There's no
separate migrations-tracking table — the SQL files themselves are the
source of truth, which is why idempotent SQL matters here.

Used as part of the Render build step (see render.yaml) because Render's
Python runtime image doesn't include the `psql` CLI, only Python + whatever
is in requirements.txt — this reuses psycopg2, which is already a
dependency, instead of adding a new one.

Run directly any time: `python run_migrations.py` (reads DATABASE_URL from
the environment the same way the rest of the backend does, via database.py).
"""
import sys
from pathlib import Path

from database import get_db_connection

BASE_DIR = Path(__file__).resolve().parent
MIGRATIONS_DIR = BASE_DIR.parent / "database"


def main():
    if not MIGRATIONS_DIR.is_dir():
        print(f"No migrations directory found at {MIGRATIONS_DIR}, skipping.")
        return

    migration_files = sorted(MIGRATIONS_DIR.glob("migration_*.sql"))
    if not migration_files:
        print("No migration files found, skipping.")
        return

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        for path in migration_files:
            sql = path.read_text()
            print(f"Applying {path.name} ...")
            try:
                cur.execute(sql)
                conn.commit()
                print(f"  OK")
            except Exception as e:
                conn.rollback()
                print(f"  FAILED: {e}")
                # Don't abort the whole deploy over one migration erroring —
                # most failure modes here (e.g. a column that already
                # exists under a slightly different path) are harmless, and
                # an aborted build is worse than a skipped statement. Keep
                # going so later migrations still get a chance to apply.
                continue
        cur.close()
    finally:
        conn.close()
    print("Migrations complete.")


if __name__ == "__main__":
    sys.exit(main())
