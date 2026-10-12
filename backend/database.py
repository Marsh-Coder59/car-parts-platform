
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
import psycopg2

logger = logging.getLogger("carparts.database")

BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"

load_dotenv(ENV_FILE)

DATABASE_URL = os.getenv("DATABASE_URL")


def get_db_connection():
    if not DATABASE_URL:
        logger.error("DATABASE_URL is missing from the backend environment")
        raise ValueError("DATABASE_URL is not configured")

    try:
        conn = psycopg2.connect(
            DATABASE_URL,
            connect_timeout=10,
        )
        logger.info("PostgreSQL connection established successfully")
        return conn

    except Exception:
        logger.exception("PostgreSQL connection failed")
        raise
