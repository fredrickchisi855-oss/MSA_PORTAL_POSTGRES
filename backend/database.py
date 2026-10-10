import os
import hashlib
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
from db_connection import get_connection, SQLITE_FILE
DB_FILE = SQLITE_FILE


def initialize_database():
    conn = get_connection()
    cursor = conn.cursor()

    # Admin accounts used by the MSA PORTAL admin login.
    # Create only if missing; never overwrite existing admin accounts.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            password_hash TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            form INTEGER NOT NULL CHECK(form BETWEEN 1 AND 6),
            class_name TEXT NOT NULL,
            password TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            student_id_code TEXT
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS academic_years (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            year INTEGER NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 0
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            academic_year INTEGER NOT NULL,
            term TEXT NOT NULL,
            file_name TEXT,
            file_path TEXT,
            published INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    """)

    # Create initial academic years from 2026 onward.
    for year in range(2026, 2031):
        cursor.execute(
            "INSERT OR IGNORE INTO academic_years (year, active) VALUES (?, ?)",
            (year, 1 if year == 2026 else 0)
        )



    # --------------------------------------------------
    # PERMANENT MSA STUDENT ID MIGRATION
    # --------------------------------------------------
    student_columns = [
        row[1]
        for row in conn.execute("PRAGMA table_info(students)").fetchall()
    ]

    if "student_id_code" not in student_columns:
        conn.execute(
            "ALTER TABLE students ADD COLUMN student_id_code TEXT"
        )

    # Give existing students permanent MSA IDs.
    existing_students = conn.execute("""
        SELECT id
        FROM students
        WHERE student_id_code IS NULL
           OR TRIM(student_id_code) = ''
        ORDER BY id
    """).fetchall()

    for student in existing_students:
        max_row = conn.execute("""
            SELECT MAX(
                CASE
                    WHEN student_id_code LIKE 'MSA-%'
                    THEN CAST(SUBSTR(student_id_code, 5) AS INTEGER)
                    ELSE 0
                END
            )
            FROM students
        """).fetchone()

        next_number = int(max_row[0] or 0) + 1
        student_code = f"MSA-{next_number:02d}"

        while conn.execute("""
            SELECT 1
            FROM students
            WHERE student_id_code = ?
            LIMIT 1
        """, (student_code,)).fetchone():
            next_number += 1
            student_code = f"MSA-{next_number:02d}"

        conn.execute("""
            UPDATE students
            SET student_id_code = ?
            WHERE id = ?
        """, (student_code, student["id"]))

    conn.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_students_student_id_code
        ON students(student_id_code)
    """)

    conn.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            reset_pin TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            approved_at TEXT,
            expires_at TEXT,
            used_at TEXT,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    """)


    # Ensure older databases contain all password-reset request fields.
    reset_columns = {
        row[1]
        for row in conn.execute(
            "PRAGMA table_info(password_reset_requests)"
        ).fetchall()
    }

    reset_additions = {
        "student_name": "TEXT",
        "student_id_code": "TEXT",
        "student_form": "INTEGER",
        "student_class_name": "TEXT",
        "is_new": "INTEGER NOT NULL DEFAULT 1",
    }

    for column, definition in reset_additions.items():
        if column not in reset_columns:
            conn.execute(
                f"ALTER TABLE password_reset_requests "
                f"ADD COLUMN {column} {definition}"
            )

    # Student login protection.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS student_login_security (
            student_id INTEGER PRIMARY KEY,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            blocked INTEGER NOT NULL DEFAULT 0,
            blocked_at TEXT,
            last_failed_at TEXT,
            FOREIGN KEY (student_id) REFERENCES students(id)
        )
    """)

    # Password-reset verification audit records.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            student_name TEXT,
            student_id_code TEXT,
            form INTEGER,
            entered_student_id TEXT,
            result TEXT NOT NULL,
            reason TEXT,
            request_id INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    """)


    # Secure first-administrator setup.
    # Configure these variables privately on Render.
    admin_username = os.environ.get("MSA_ADMIN_USERNAME", "").strip()
    admin_password = os.environ.get("MSA_ADMIN_PASSWORD", "")

    admin_count = conn.execute(
        "SELECT COUNT(*) FROM admin_users"
    ).fetchone()[0]

    if admin_count == 0 and admin_username and admin_password:
        if len(admin_password) < 12:
            conn.close()
            raise ValueError(
                "MSA_ADMIN_PASSWORD must be at least 12 characters."
            )

        salt = secrets.token_bytes(16)
        iterations = 200000
        digest = hashlib.pbkdf2_hmac(
            "sha256", admin_password.encode("utf-8"), salt, iterations
        )
        password_hash = (
            f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"
        )

        conn.execute("""
            INSERT INTO admin_users
                (username, display_name, role, password_hash, active)
            VALUES (?, ?, 'admin', ?, 1)
        """, (admin_username, admin_username, password_hash))

        print("✓ Initial administrator account created from environment.")

    conn.commit()
    conn.close()

    print("✓ MSA PORTAL database initialized.")
    print(f"✓ Database: {DB_FILE}")


if __name__ == "__main__":
    initialize_database()
