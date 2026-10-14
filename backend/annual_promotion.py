"""Annual form promotion for MSA PORTAL.

Runs only on 1 January when enabled. Each year has a unique run record.
Student and result rows are retained; Form 6 students are archived in place.
"""
import json
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from db_connection import get_connection

SETTING_KEY = "enabled"
_lock = threading.Lock()


def _now():
    # Zimbabwe uses UTC+02:00 year-round.
    from datetime import timezone, timedelta
    zimbabwe_time = timezone(timedelta(hours=2))
    return datetime.now(zimbabwe_time)


def _ensure_schema(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS msa_annual_promotion_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS msa_annual_promotion_runs (
            academic_year INTEGER PRIMARY KEY,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            status TEXT NOT NULL,
            details TEXT
        )
    """)
    conn.commit()

    columns = {row["name"] for row in conn.execute(
        "PRAGMA table_info(students)"
    ).fetchall()}

    if "graduated_at" not in columns:
        conn.execute("ALTER TABLE students ADD COLUMN graduated_at TEXT")
    if "archived_at" not in columns:
        conn.execute("ALTER TABLE students ADD COLUMN archived_at TEXT")
    conn.commit()


def _enabled(conn):
    row = conn.execute(
        "SELECT setting_value FROM msa_annual_promotion_settings "
        "WHERE setting_key = ?",
        (SETTING_KEY,)
    ).fetchone()
    return bool(row and str(row[0]).lower() in ("1", "true", "on", "yes"))


def set_annual_promotion_enabled(enabled):
    if not isinstance(enabled, bool):
        raise ValueError("enabled must be true or false")

    with get_connection() as conn:
        _ensure_schema(conn)
        conn.execute("""
            INSERT INTO msa_annual_promotion_settings
                (setting_key, setting_value)
            VALUES (?, ?)
            ON CONFLICT (setting_key)
            DO UPDATE SET setting_value = excluded.setting_value
        """, (SETTING_KEY, "1" if enabled else "0"))
        conn.commit()

    # Deliberately does not run a promotion when the switch is enabled.


def annual_promotion_status():
    with get_connection() as conn:
        _ensure_schema(conn)
        enabled = _enabled(conn)
        row = conn.execute("""
            SELECT academic_year, started_at, completed_at, status, details
            FROM msa_annual_promotion_runs
            ORDER BY academic_year DESC LIMIT 1
        """).fetchone()

        last_run = None
        if row:
            try:
                details = json.loads(row[4] or "{}")
            except (ValueError, TypeError):
                details = {}
            last_run = {
                "academic_year": row[0],
                "started_at": row[1],
                "completed_at": row[2],
                "status": row[3],
                "details": details,
            }

        return {"ok": True, "enabled": enabled, "last_run": last_run}


def run_annual_promotion(today=None):
    """Run once on 1 January; return a result explaining why it did not run."""
    today = today or _now().date()
    if (today.month, today.day) != (1, 1):
        return {"ok": True, "ran": False, "reason": "Not January 1."}

    with _lock:
        year = today.year
        cutoff = f"{year:04d}-01-01"
        timestamp = _now().isoformat(timespec="seconds")

        with get_connection() as conn:
            _ensure_schema(conn)
            if not _enabled(conn):
                return {"ok": True, "ran": False, "reason": "Feature is OFF."}

            # A unique year record prevents duplicate successful runs.
            prior = conn.execute(
                "SELECT status FROM msa_annual_promotion_runs "
                "WHERE academic_year = ?", (year,)
            ).fetchone()
            if prior:
                return {
                    "ok": True, "ran": False,
                    "reason": "This year's run is already recorded."
                }

            try:
                conn.execute("BEGIN")
                conn.execute("""
                    INSERT INTO msa_annual_promotion_runs
                        (academic_year, started_at, status, details)
                    VALUES (?, ?, 'processing', '{}')
                """, (year, timestamp))

                # Only students registered before this calendar year.
                # Form 4 stays in Form 4. Forms 1, 2, 3 and 5 advance.
                promoted = conn.execute("""
                    UPDATE students
                    SET form = form + 1
                    WHERE form IN (1, 2, 3)
                      AND created_at < ?
                      AND (status IS NULL OR status NOT IN
                           ('Graduated', 'Archived'))
                """, (cutoff,)).rowcount

                # Form 6 students remain in the database and keep form = 6.
                graduated = conn.execute("""
                    UPDATE students
                    SET status = 'Graduated',
                        graduated_at = COALESCE(graduated_at, ?),
                        archived_at = COALESCE(archived_at, ?)
                    WHERE form = 6
                      AND created_at < ?
                      AND (status IS NULL OR status NOT IN
                           ('Graduated', 'Archived'))
                """, (timestamp, timestamp, cutoff)).rowcount

                # Promote Form 5 only after graduating students who were
                # already in Form 6 at the start of this promotion cycle.
                promoted += conn.execute("""
                    UPDATE students
                    SET form = 6
                    WHERE form = 5
                      AND created_at < ?
                      AND (status IS NULL OR status NOT IN
                           ('Graduated', 'Archived'))
                """, (cutoff,)).rowcount

                details = {
                    "promoted": max(promoted, 0),
                    "graduated_archived": max(graduated, 0),
                    "form4_unchanged": True,
                    "results_deleted": 0,
                }
                conn.execute("""
                    UPDATE msa_annual_promotion_runs
                    SET completed_at = ?, status = 'completed', details = ?
                    WHERE academic_year = ?
                """, (timestamp, json.dumps(details), year))
                conn.commit()
                return {"ok": True, "ran": True, "details": details}
            except Exception:
                conn.rollback()
                raise


def _scheduler_loop():
    while True:
        try:
            run_annual_promotion()
        except Exception as exc:
            # Keep the server alive; retry on the next scheduler check.
            print("MSA annual promotion check failed:", str(exc))
        threading.Event().wait(900)


def start_annual_promotion_scheduler():
    thread = threading.Thread(
        target=_scheduler_loop,
        name="msa-annual-promotion",
        daemon=True,
    )
    thread.start()
