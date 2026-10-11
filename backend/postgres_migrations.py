import os
import re
from pathlib import Path

import psycopg

BASE_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = BASE_DIR / "migrations"

REQUIRED_TABLES = {
    "students",
    "academic_years",
    "admin_users",
    "results",
    "password_reset_requests",
    "student_login_security",
    "password_reset_attempts",
    "announcements",
}


def apply_postgres_migrations():
    """Run reviewed schema SQL only when explicitly enabled for testing."""
    if os.environ.get("MSA_DATABASE_ENV", "").strip().lower() != "test":
        raise RuntimeError("PostgreSQL migrations are restricted to test.")

    if os.environ.get("MSA_RUN_POSTGRES_MIGRATIONS") != "1":
        raise RuntimeError("PostgreSQL migrations are not enabled.")

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing.")

    files = [
        MIGRATIONS_DIR / "001_create_announcements.sql",
        MIGRATIONS_DIR / "002_create_core_schema.sql",
        MIGRATIONS_DIR / "003_add_result_pdf_data.sql",
    ]

    for path in files:
        if not path.is_file():
            raise RuntimeError(f"Required migration file is missing: {path.name}")

    print("Applying PostgreSQL migrations to the TEST database.")

    # Direct psycopg connection: do not use the SQLite compatibility adapter.
    with psycopg.connect(database_url) as conn:
        for path in files:
            sql = path.read_text(encoding="utf-8")
            sql = re.sub(
                r"(?im)^\s*(BEGIN|COMMIT)\s*;\s*$",
                "",
                sql,
            )

            with conn.transaction():
                conn.execute(sql, prepare=False)

            print(f"Migration applied: {path.name}")

        with conn.cursor() as cur:
            cur.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = current_schema()
                  AND table_type = 'BASE TABLE'
            """)
            actual_tables = {row[0] for row in cur.fetchall()}

        missing = REQUIRED_TABLES - actual_tables
        if missing:
            raise RuntimeError(
                "Schema verification failed. Missing tables: "
                + ", ".join(sorted(missing))
            )

    print("PostgreSQL schema table check passed.")
