import time
from flask import Flask, request, jsonify, send_from_directory, redirect
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import json
import sqlite3
import os
import re
import shutil
import hashlib
import mimetypes
from pathlib import Path
from datetime import datetime

from database import initialize_database, ensure_postgres_admin
from postgres_migrations import apply_postgres_migrations
from db_connection import get_connection
import secrets



# Cloudflare R2 storage for result PDFs.
def _r2_configured():
    names = (
        "MSA_R2_ACCOUNT_ID",
        "MSA_R2_ACCESS_KEY_ID",
        "MSA_R2_SECRET_ACCESS_KEY",
        "MSA_R2_BUCKET",
    )
    return all(os.environ.get(name) for name in names)


def _r2_client():
    import boto3

    account_id = os.environ["MSA_R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["MSA_R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["MSA_R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _is_render():
    return bool(
        os.environ.get("RENDER_EXTERNAL_URL")
        or os.environ.get("RENDER_SERVICE_ID")
        or os.environ.get("RENDER") == "true"
    )


def store_result_pdf(filename, pdf_bytes):
    if _r2_configured():
        bucket = os.environ["MSA_R2_BUCKET"]
        key = "results/" + filename
        _r2_client().put_object(
            Bucket=bucket,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
        )
        return "r2://" + bucket + "/" + key

    if _is_render():
        raise RuntimeError("Cloudflare R2 storage is not configured.")

    local_path = os.path.join(RESULTS_DIR, filename)
    with open(local_path, "wb") as output:
        output.write(pdf_bytes)
    return local_path


def read_result_pdf(file_path):
    if file_path and file_path.startswith("r2://"):
        remainder = file_path[5:]
        bucket, separator, key = remainder.partition("/")
        if not separator or not bucket or not key:
            raise FileNotFoundError("Invalid result storage reference.")

        response = _r2_client().get_object(Bucket=bucket, Key=key)
        try:
            return response["Body"].read()
        finally:
            response["Body"].close()

    if not file_path or not os.path.isfile(file_path):
        raise FileNotFoundError("Result PDF is missing.")

    with open(file_path, "rb") as source:
        return source.read()


def delete_stored_result_pdf(file_path):
    if not file_path:
        return

    if file_path.startswith("r2://"):
        remainder = file_path[5:]
        bucket, separator, key = remainder.partition("/")
        if not separator or not bucket or not key:
            raise ValueError("Invalid result storage reference.")
        _r2_client().delete_object(Bucket=bucket, Key=key)
        return

    root = Path(RESULTS_DIR).resolve()
    candidate = Path(file_path).resolve()
    if root in candidate.parents and candidate.is_file():
        candidate.unlink()


app = Flask(__name__)

DB_PATH = str(Path(__file__).resolve().parent / 'msa_portal.db')


HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8081"))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)
RESULTS_DIR = os.environ.get("MSA_RESULTS_DIR", os.path.join(BASE_DIR, "results"))

os.makedirs(RESULTS_DIR, exist_ok=True)




def send_json(handler, data, status=200):

    body = json.dumps(data).encode("utf-8")

    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()

    handler.wfile.write(body)


def serve_static(handler, relative_path):

    relative_path = relative_path.lstrip("/")

    if relative_path == "":
        relative_path = "app/index.html"

    if relative_path == "app":
        relative_path = "app/index.html"

    if relative_path == "admin":
        relative_path = "admin/index.html"

    file_path = os.path.abspath(
        os.path.join(PROJECT_DIR, relative_path)
    )

    project_root = os.path.abspath(PROJECT_DIR)

    # Prevent access outside the MSA PORTAL folder
    if not file_path.startswith(project_root + os.sep):
        handler.send_error(403, "Forbidden")
        return True

    # Directory URLs
    if os.path.isdir(file_path):

        if relative_path == "app":
            file_path = os.path.join(file_path, "index.html")

        elif relative_path == "admin":
            file_path = os.path.join(file_path, "index.html")

        else:
            handler.send_error(404, "Not Found")
            return True

    if not os.path.isfile(file_path):
        return False

    try:
        with open(file_path, "rb") as f:
            body = f.read()

        content_type = mimetypes.guess_type(file_path)[0]
        if not content_type:
            content_type = "application/octet-stream"

        handler.send_response(200)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Cache-Control", "no-cache")
        handler.end_headers()
        handler.wfile.write(body)

        return True

    except OSError:
        handler.send_error(500, "Could not read file")
        return True



ADMIN_SECRET_FILE = os.path.join(BASE_DIR, "admin_secret.txt")

if not os.path.exists(ADMIN_SECRET_FILE):
    with open(ADMIN_SECRET_FILE, "w") as f:
        f.write(secrets.token_urlsafe(12))

with open(ADMIN_SECRET_FILE, "r") as f:
    ADMIN_PASSWORD = f.read().strip()

# --------------------------------------------------
# MULTI-ADMIN AUTHENTICATION
# --------------------------------------------------

ADMIN_SESSIONS = {}
ADMIN_SESSION_SECONDS = 60 * 60


def verify_admin_password(password, stored_hash):
    try:
        parts = stored_hash.split("$")

        if len(parts) != 4:
            return False

        algorithm, iterations_text, salt_hex, digest_hex = parts

        if algorithm != "pbkdf2_sha256":
            return False

        iterations = int(iterations_text)

        salt = bytes.fromhex(salt_hex)

        expected = bytes.fromhex(digest_hex)

        actual = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            iterations
        )

        return secrets.compare_digest(actual, expected)

    except Exception:
        return False


def get_admin_token(handler):
    header = handler.headers.get("Authorization", "")

    if not header.startswith("Bearer "):
        return None

    return header[7:].strip()


def get_admin_session(handler):
    token = get_admin_token(handler)

    if not token:
        return None

    session = ADMIN_SESSIONS.get(token)

    if session is None:
        return None

    created = session.get("created_at", 0)

    if time.time() - created > ADMIN_SESSION_SECONDS:
        ADMIN_SESSIONS.pop(token, None)
        return None

    return session


def admin_authenticated(handler):
    return get_admin_session(handler) is not None


def current_admin(handler):
    return get_admin_session(handler)


def require_main_admin(handler):
    session = get_admin_session(handler)

    if session and session.get("role") == "main_admin":
        return True

    send_json(handler, {
        "ok": False,
        "message": "Main Administrator access required."
    }, 403)

    return False


def require_admin(handler):
    if admin_authenticated(handler):
        return True

    send_json(handler, {
        "ok": False,
        "message": "Administrator authentication required."
    }, 401)

    return False


class MSAHandler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        self.wfile.write(body)



    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


    def do_OPTIONS(self):

        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, PUT, DELETE, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.end_headers()


    def do_GET(self):

        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # ---------------------------------------------
        # WEBSITE / STATIC FILES
        # ---------------------------------------------

        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/app/")
            self.end_headers()
            return

        if path == "/app" or path == "/app/":
            serve_static(self, "app/index.html")
            return

        if path == "/admin" or path == "/admin/":
            serve_static(self, "admin/index.html")
            return

        if path.startswith("/assets/"):
            if serve_static(self, path):
                return

        if path.startswith("/app/"):
            if serve_static(self, path):
                return

        if path.startswith("/admin/"):
            if serve_static(self, path):
                return

        # ---------------------------------------------
        # HEALTH
        # ---------------------------------------------

        if path == "/api/health":

            health_conn = None
            try:
                health_conn = get_connection()
                health_conn.execute("SELECT 1").fetchone()
                health_conn.close()
                health_conn = None

                send_json(self, {
                    "ok": True,
                    "app": "MSA PORTAL",
                    "database": "connected"
                })
            except Exception:
                if health_conn is not None:
                    try:
                        health_conn.close()
                    except Exception:
                        pass

                send_json(self, {
                    "ok": False,
                    "app": "MSA PORTAL",
                    "database": "unavailable"
                }, 503)

            return


        # ---------------------------------------------

        # SCHOOL ANNOUNCEMENTS
        if path == "/api/announcements":
            conn = get_connection()
            try:
                rows = conn.execute("""
                    SELECT id, announcement_type, title, message,
                           active, CAST(created_at AS TEXT) AS created_at,
                           CAST(updated_at AS TEXT) AS updated_at
                    FROM announcements
                    WHERE active = 1
                    ORDER BY created_at DESC, id DESC
                """).fetchall()
                send_json(self, {
                    "ok": True,
                    "announcements": [dict(row) for row in rows]
                })
            except Exception as error:
                print("PUBLIC ANNOUNCEMENTS ERROR:", error)
                send_json(self, {
                    "ok": False,
                    "message": "Announcements are temporarily unavailable."
                }, 500)
            finally:
                conn.close()
            return

        if path == "/api/admin/announcements":
            if not require_admin(self):
                return
            conn = get_connection()
            try:
                rows = conn.execute("""
                    SELECT id, announcement_type, title, message, active,
                           created_by,
                           CAST(created_at AS TEXT) AS created_at,
                           CAST(updated_at AS TEXT) AS updated_at
                    FROM announcements
                    ORDER BY created_at DESC, id DESC
                """).fetchall()
                send_json(self, {
                    "ok": True,
                    "announcements": [dict(row) for row in rows]
                })
            except Exception as error:
                print("ADMIN ANNOUNCEMENTS ERROR:", error)
                send_json(self, {
                    "ok": False,
                    "message": "Could not load announcements."
                }, 500)
            finally:
                conn.close()
            return

        # STUDENTS
        # ---------------------------------------------


        # ---------------------------------------------
        # RESET STUDENT PASSWORD / PIN
        # ---------------------------------------------

        # ---------------------------------------------
        # ENABLE / DISABLE STUDENT
        # ---------------------------------------------

        # ---------------------------------------------
        # DELETE STUDENT
        # Permanently removes transferred student
        # ---------------------------------------------

        if path == "/api/students":

            if not require_admin(self):
                return

            conn = get_connection()

            students = conn.execute("""
                SELECT
                    id,
                    name,
                    form,
                    class_name,
                    status,
                    student_id_code,
                    created_at
                FROM students
                ORDER BY name COLLATE NOCASE
            """).fetchall()

            conn.close()

            send_json(self, {
                "ok": True,
                "students": [dict(student) for student in students]
            })

            return


        # ---------------------------------------------
        # STUDENT RESULT SEARCH
        #
        # Form + student name
        # ---------------------------------------------

        if path == "/api/student-name-search":

            form = query.get("form", [""])[0].strip()
            search = query.get("search", [""])[0].strip()

            if not form or not search:
                send_json(self, {
                    "ok": True,
                    "students": []
                })
                return

            conn = get_connection()

            students = conn.execute("""
                SELECT
                    id,
                    name,
                    form,
                    class_name
                FROM students
                WHERE form = ?
                AND LOWER(name) LIKE LOWER(?)
                ORDER BY name COLLATE NOCASE
            """, (
                form,
                "%" + search + "%"
            )).fetchall()

            conn.close()

            send_json(self, {
                "ok": True,
                "students": [dict(student) for student in students]
            })

            return

        # -------------------------------------------------
        # STUDENT LOGIN SECURITY TABLE
        # -------------------------------------------------
        if path == "/api/student-results":

            conn = get_connection()

            conn.execute("""
                CREATE TABLE IF NOT EXISTS student_login_security (
                    student_id INTEGER PRIMARY KEY,
                    failed_attempts INTEGER NOT NULL DEFAULT 0,
                    blocked INTEGER NOT NULL DEFAULT 0,
                    blocked_at TEXT,
                    last_failed_at TEXT,
                    FOREIGN KEY (student_id) REFERENCES students(id)
                )
            """)

            conn.commit()



            form = query.get("form", [""])[0]
            name = query.get("name", [""])[0]
            password = query.get("password", [""])[0]

            if not form or not name:

                send_json(self, {
                    "ok": False,
                    "message": "Form and student name are required."
                }, 400)

                return


            conn = get_connection()

            # Check whether the requested student exists but is disabled.
            # This is kept separate from the existing login query.
            disabled_student = conn.execute("""
                SELECT id, status
                FROM students
                WHERE form = ?
                AND name = ? COLLATE NOCASE
                LIMIT 1
            """, (form, name)).fetchone()

            if disabled_student:
                disabled_status = str(
                    disabled_student["status"] or ""
                ).strip().lower()

                if disabled_status != "active":
                    conn.close()

                    send_json(self, {
                        "ok": False,
                        "message": "Account disabled. Please contact school administration."
                    }, 403)

                    return

            if password:

                # Find the active student first.
                # Password is checked below so failed attempts
                # can be counted and blocked.

                student = conn.execute("""
                    SELECT *
                    FROM students
                    WHERE form = ?
                    AND name = ? COLLATE NOCASE
                    AND status = 'Active'
                    LIMIT 1
                """, (form, name)).fetchone()

                if student:

                    security = conn.execute("""
                        SELECT
                            failed_attempts,
                            blocked
                        FROM student_login_security
                        WHERE student_id = ?
                    """, (student["id"],)).fetchone()

                    if security:

                        failed_attempts = int(
                            security["failed_attempts"] or 0
                        )

                        blocked = int(
                            security["blocked"] or 0
                        )

                    else:

                        failed_attempts = 0
                        blocked = 0

                        conn.execute("""
                            INSERT INTO student_login_security (
                                student_id,
                                failed_attempts,
                                blocked
                            )
                            VALUES (?, 0, 0)
                        """, (student["id"],))

                        conn.commit()

                    # -----------------------------------------
                    # ACCOUNT ALREADY BLOCKED
                    # -----------------------------------------

                    if blocked:

                        conn.close()

                        send_json(self, {
                            "ok": False,
                            "blocked": True,
                            "show_forgot_password": True,
                            "attempts_remaining": 0,
                            "message":
                                "PASSWORD/PIN BLOCKED. "
                                "You have reached the maximum "
                                "of 5 failed attempts. "
                                "Please use Forgot Password / PIN."
                        }, 403)

                        return

                    # -----------------------------------------
                    # CORRECT PASSWORD
                    # -----------------------------------------

                    if str(student["password"]) == str(password):

                        conn.execute("""
                            UPDATE student_login_security
                            SET
                                failed_attempts = 0,
                                blocked = 0,
                                blocked_at = NULL,
                                last_failed_at = NULL
                            WHERE student_id = ?
                        """, (student["id"],))

                        conn.commit()

                    # -----------------------------------------
                    # WRONG PASSWORD
                    # -----------------------------------------

                    else:

                        failed_attempts += 1

                        # -------------------------------------
                        # FIFTH FAILED ATTEMPT
                        # -------------------------------------

                        if failed_attempts >= 5:

                            conn.execute("""
                                UPDATE student_login_security
                                SET
                                    failed_attempts = 5,
                                    blocked = 1,
                                    blocked_at = CAST(CURRENT_TIMESTAMP AS TEXT),
                                    last_failed_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                                WHERE student_id = ?
                            """, (student["id"],))

                            conn.commit()
                            conn.close()

                            send_json(self, {
                                "ok": False,
                                "blocked": True,
                                "show_forgot_password": True,
                                "attempts_remaining": 0,
                                "message":
                                    "PASSWORD/PIN BLOCKED. "
                                    "You have reached the maximum "
                                    "of 5 failed attempts. "
                                    "Please use Forgot Password / PIN."
                            }, 403)

                            return

                        # -------------------------------------
                        # FIRST TO FOURTH FAILED ATTEMPT
                        # -------------------------------------

                        conn.execute("""
                            UPDATE student_login_security
                            SET
                                failed_attempts = ?,
                                last_failed_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                            WHERE student_id = ?
                        """, (
                            failed_attempts,
                            student["id"]
                        ))

                        conn.commit()
                        conn.close()

                        remaining = 5 - failed_attempts

                        send_json(self, {
                            "ok": False,
                            "blocked": False,
                            "show_forgot_password": False,
                            "attempts_remaining": remaining,
                            "message":
                                "Incorrect password. "
                                + str(remaining)
                                + " attempt"
                                + ("" if remaining == 1 else "s")
                                + " remaining."
                        }, 401)

                        return

                else:

                    conn.close()

                    send_json(self, {
                        "ok": False,
                        "message":
                            "Student not found or password is incorrect."
                    }, 404)

                    return

            else:

                student = conn.execute("""
                    SELECT
            id,
            name,
            form,
            class_name,
            status,
            student_id_code
                    FROM students
                    WHERE form = ?
                    AND name = ? COLLATE NOCASE
                    AND status = 'Active'
                    LIMIT 1
                """, (form, name)).fetchone()


            if not student:

                conn.close()

                send_json(self, {
                    "ok": False,
                    "message": "Student not found or password is incorrect."
                }, 404)

                return


            if password:

                results = conn.execute("""
                    SELECT
                        id,
                        student_id,
                        academic_year,
                        term,
                        file_name,
                        file_path,
                        published,
                        created_at,
                        updated_at
                    FROM results
                    WHERE student_id = ?
                    AND published = 1
                    ORDER BY academic_year DESC, term DESC
                """, (student["id"],)).fetchall()

            else:

                results = []


            conn.close()


            send_json(self, {
                "ok": True,
                "student": dict(student),
                "results": [dict(result) for result in results]
            })

            return


        # ---------------------------------------------
        # ALL RESULTS
        # ADMIN
        # ---------------------------------------------

        if path == "/api/results":

            if not require_admin(self):
                return

            conn = get_connection()

            results = conn.execute("""
                SELECT
                    results.id,
                    results.student_id,
                    students.name AS student_name,
                    students.form,
                    students.class_name,
                    results.academic_year,
                    results.term,
                    results.file_name,
                    results.file_path,
                    results.published,
                    results.created_at,
                    results.updated_at
                FROM results
                INNER JOIN students
                    ON students.id = results.student_id
                ORDER BY
                    results.academic_year DESC,
                    results.term DESC,
                    students.name COLLATE NOCASE
            """).fetchall()

            conn.close()

            send_json(self, {
                "ok": True,
                "results": [dict(result) for result in results]
            })

            return


        # ---------------------------------------------
        # RESULT FILE
        # ---------------------------------------------

        if path.startswith("/api/results/"):

            result_id = path.split("/")[-1]

            try:
                result_id = int(result_id)
            except ValueError:

                send_json(self, {
                    "ok": False,
                    "message": "Invalid result ID."
                }, 400)

                return


            conn = get_connection()

            result = conn.execute("""
                SELECT *
                FROM results
                WHERE id = ?
                AND published = 1
            """, (result_id,)).fetchone()

            conn.close()


            if not result:

                send_json(self, {
                    "ok": False,
                    "message": "Published result not found."
                }, 404)

                return


            file_path = result["file_path"]

            try:
                data = read_result_pdf(file_path)
            except FileNotFoundError:
                send_json(self, {
                    "ok": False,
                    "message": "Result file not found."
                }, 404)
                return
            except Exception:
                print("RESULT PDF READ ERROR: storage read failed")
                send_json(self, {
                    "ok": False,
                    "message": "Could not retrieve the result PDF."
                }, 503)
                return


            self.send_response(200)

            self.send_header(
                "Content-Type",
                "application/pdf"
            )

            self.send_header(
                "Content-Length",
                str(len(data))
            )

            self.send_header(
                "Content-Disposition",
                'inline; filename="%s"' %
                result["file_name"]
            )

            self.send_header(
                "Access-Control-Allow-Origin",
                "*"
            )

            self.end_headers()

            self.wfile.write(data)

            return


        # ---------------------------------------------

        # ---------------------------------------------
        # ADMIN PASSWORD RESET REQUESTS
        # ---------------------------------------------

        # ---------------------------------------------
        # ADMIN LOGIN USERNAME SUGGESTIONS
        # ---------------------------------------------
        # Returns active administrator usernames only.
        # Passwords and password hashes are NEVER returned.
        # This endpoint is intentionally available before
        # login so the login page can provide username search.
        # ---------------------------------------------

        if path == "/api/admin/login-users":

            conn = get_connection()

            try:
                rows = conn.execute("""
                    SELECT
                        username,
                        display_name
                    FROM admin_users
                    WHERE active = 1
                    ORDER BY display_name COLLATE NOCASE ASC
                """).fetchall()

                send_json(self, {
                    "ok": True,
                    "users": [
                        {
                            "username": row["username"],
                            "display_name": row["display_name"]
                        }
                        for row in rows
                    ]
                })

                return

            finally:
                conn.close()

        # ---------------------------------------------
        # CURRENT ADMINISTRATOR PROFILE
        # ---------------------------------------------
        # Returns only the currently logged-in administrator.
        # Admin 1-5 cannot use this to view other administrators.
        # Main Administrator can also use it safely.
        # ---------------------------------------------

        if path == "/api/admin/current":
            session = get_admin_session(self)

            if not session:
                send_json(self, {
                    "ok": False,
                    "message": "Administrator login required."
                }, 401)
                return

            conn = get_connection()

            try:
                admin = conn.execute("""
                    SELECT
                        id,
                        username,
                        display_name,
                        role,
                        active,
                        created_at,
                        updated_at,
                        last_login_at
                    FROM admin_users
                    WHERE id = ?
                    LIMIT 1
                """, (session.get("admin_id"),)).fetchone()

                if admin is None:
                    send_json(self, {
                        "ok": False,
                        "message": "Administrator account not found."
                    }, 404)
                    return

                if not int(admin["active"]):
                    token = get_admin_token(self)

                    if token:
                        ADMIN_SESSIONS.pop(token, None)

                    send_json(self, {
                        "ok": False,
                        "message": "Your administrator account has been disabled."
                    }, 403)
                    return

                send_json(self, {
                    "ok": True,
                    "admin": dict(admin)
                })
                return

            finally:
                conn.close()


        # ---------------------------------------------
        # CURRENT ADMINISTRATOR PROFILE
        # ---------------------------------------------
        # Returns only the currently logged-in administrator.
        # Admin 1-5 cannot use this to view other administrators.
        # Main Administrator can also use it safely.
        # ---------------------------------------------

        if path == "/api/admin/users":
            if not require_main_admin(self):
                return

            conn = get_connection()
            try:
                admins = conn.execute("""
                    SELECT
                        id,
                        username,
                        display_name,
                        role,
                        active,
                        created_at,
                        updated_at,
                        last_login_at
                    FROM admin_users
                    ORDER BY
                        CASE WHEN role = 'main_admin' THEN 0 ELSE 1 END,
                        id ASC
                """).fetchall()

                send_json(self, {
                    "ok": True,
                    "admins": [dict(row) for row in admins]
                })
                return
            finally:
                conn.close()


        if path.startswith("/api/admin/users/"):
            if not require_main_admin(self):
                return

            parts = path.strip("/").split("/")

            if len(parts) < 4:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid administrator request."
                }, 400)
                return

            try:
                admin_id = int(parts[3])
            except ValueError:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid administrator ID."
                }, 400)
                return

            conn = get_connection()

            try:
                admin = conn.execute("""
                    SELECT
                        id,
                        username,
                        display_name,
                        role,
                        active
                    FROM admin_users
                    WHERE id = ?
                    LIMIT 1
                """, (admin_id,)).fetchone()

                if admin is None:
                    send_json(self, {
                        "ok": False,
                        "message": "Administrator not found."
                    }, 404)
                    return

                current_session = get_admin_session(self)
                is_self = (
                    current_session is not None
                    and int(current_session.get("admin_id", -1)) == admin_id
                )
                is_main = admin["role"] == "main_admin"

                # -------------------------------------------------
                # ENABLE / DISABLE
                # -------------------------------------------------
                if len(parts) == 5 and parts[4] in ("enable", "disable"):
                    enable = parts[4] == "enable"

                    # Main Administrator may NOT disable himself.
                    if is_main and is_self:
                        send_json(self, {
                            "ok": False,
                            "message": "The Main Administrator cannot disable his own account."
                        }, 403)
                        return

                    # Main Administrator account can never be disabled.
                    if is_main:
                        send_json(self, {
                            "ok": False,
                            "message": "The Main Administrator account cannot be disabled."
                        }, 403)
                        return

                    conn.execute("""
                        UPDATE admin_users
                        SET
                            active = ?,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (1 if enable else 0, admin_id))

                    conn.commit()

                    # Invalidate all sessions belonging to the affected administrator.
                    for token, session in list(ADMIN_SESSIONS.items()):
                        if session.get("admin_id") == admin_id:
                            ADMIN_SESSIONS.pop(token, None)

                    send_json(self, {
                        "ok": True,
                        "message":
                            "Administrator enabled successfully."
                            if enable
                            else
                            "Administrator disabled successfully."
                    })
                    return

                # -------------------------------------------------
                # CHANGE PASSWORD
                # -------------------------------------------------
                if len(parts) == 5 and parts[4] == "password":
                    password = str(data.get("password", ""))

                    if len(password) < 8:
                        send_json(self, {
                            "ok": False,
                            "message": "Password must contain at least 8 characters."
                        }, 400)
                        return

                    import secrets as _admin_secrets

                    salt = _admin_secrets.token_bytes(16)

                    digest = hashlib.pbkdf2_hmac(
                        "sha256",
                        password.encode("utf-8"),
                        salt,
                        200000
                    )

                    password_hash = (
                        "pbkdf2_sha256$200000$"
                        + salt.hex()
                        + "$"
                        + digest.hex()
                    )

                    conn.execute("""
                        UPDATE admin_users
                        SET
                            password_hash = ?,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (password_hash, admin_id))

                    conn.commit()

                    # If Main Administrator changes his own password,
                    # keep his current session active.
                    if not is_self:
                        for token, session in list(ADMIN_SESSIONS.items()):
                            if session.get("admin_id") == admin_id:
                                ADMIN_SESSIONS.pop(token, None)

                    send_json(self, {
                        "ok": True,
                        "message": "Administrator password changed successfully."
                    })
                    return

                # -------------------------------------------------
                # EDIT USERNAME + DISPLAY NAME
                # -------------------------------------------------
                if len(parts) == 4:
                    display_name = str(
                        data.get("display_name", "")
                    ).strip()

                    username = str(
                        data.get("username", "")
                    ).strip()

                    if not display_name or not username:
                        send_json(self, {
                            "ok": False,
                            "message": "Display name and username are required."
                        }, 400)
                        return

                    existing = conn.execute("""
                        SELECT id
                        FROM admin_users
                        WHERE username = ?
                          AND id != ?
                        LIMIT 1
                    """, (username, admin_id)).fetchone()

                    if existing is not None:
                        send_json(self, {
                            "ok": False,
                            "message": "That username is already in use."
                        }, 409)
                        return

                    conn.execute("""
                        UPDATE admin_users
                        SET
                            username = ?,
                            display_name = ?,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (
                        username,
                        display_name,
                        admin_id
                    ))

                    conn.commit()

                    # Keep the Main Administrator's current session
                    # valid and update its displayed account details.
                    if is_self and current_session is not None:
                        current_session["username"] = username
                        current_session["display_name"] = display_name

                    send_json(self, {
                        "ok": True,
                        "message": "Administrator details updated successfully."
                    })
                    return

                send_json(self, {
                    "ok": False,
                    "message": "Unsupported administrator action."
                }, 400)
                return

            finally:
                conn.close()


        if path.startswith("/api/admin/password-reset-requests/") and path.endswith("/approve"):

            if not require_admin(self):
                return

            parts = path.strip("/").split("/")

            try:
                request_id = int(parts[-2])
            except (ValueError, IndexError):
                send_json(self, {
                    "ok": False,
                    "error": "Invalid request ID."
                }, 400)
                return

            import secrets
            from datetime import datetime, timedelta

            reset_pin = f"{1000 + secrets.randbelow(9000):04d}"

            approved_at = datetime.utcnow()
            expires_at = approved_at + timedelta(minutes=2)

            conn = get_connection()

            row = conn.execute("""
                SELECT id, status
                FROM password_reset_requests
                WHERE id = ?
                LIMIT 1
            """, (request_id,)).fetchone()

            if not row:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Reset request not found."
                }, 404)
                return

            if row["status"] != "pending":
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "This request is already processed."
                }, 400)
                return

            conn.execute("""
                UPDATE password_reset_requests
                SET
                    status = 'approved',
                    reset_pin = ?,
                    approved_at = ?,
                    expires_at = ?
                WHERE id = ?
            """, (
                reset_pin,
                approved_at.strftime("%Y-%m-%d %H:%M:%S"),
                expires_at.strftime("%Y-%m-%d %H:%M:%S"),
                request_id
            ))

            conn.commit()
            conn.close()

            send_json(self, {
                "ok": True,
                "message": "Password reset approved.",
                "request_id": request_id,
                "reset_pin": reset_pin,
                "expires_at": expires_at.strftime("%Y-%m-%d %H:%M:%S")
            })
            return

        # ADMIN REJECTS RESET
        if path.startswith("/api/admin/password-reset-requests/") and path.endswith("/reject"):

            if not require_admin(self):
                return

            parts = path.strip("/").split("/")

            try:
                request_id = int(parts[-2])
            except (ValueError, IndexError):
                send_json(self, {
                    "ok": False,
                    "error": "Invalid request ID."
                }, 400)
                return

            conn = get_connection()

            cursor = conn.execute("""
                UPDATE password_reset_requests
                SET status = 'rejected'
                WHERE id = ?
                  AND status = 'pending'
            """, (request_id,))

            conn.commit()
            changed = cursor.rowcount
            conn.close()

            if not changed:
                send_json(self, {
                    "ok": False,
                    "error": "Request not found or already processed."
                }, 400)
                return

            send_json(self, {
                "ok": True,
                "message": "Password reset request rejected."
            })
            return

        # STUDENT USES TEMPORARY PIN AND CREATES NEW CREDENTIAL
        if path == "/api/password-reset/redeem":

            try:
                data = data if isinstance(data, dict) else {}
            except Exception:
                data = {}

            try:
                request_id = int(data.get("request_id", 0))
            except (TypeError, ValueError):
                request_id = 0

            temporary_pin = str(
                data.get("temporary_pin", "")
            ).strip()

            new_credential = str(
                data.get("new_credential", "")
            ).strip()

            if not request_id:
                send_json(self, {
                    "ok": False,
                    "error": "Request ID is required."
                }, 400)
                return

            if len(temporary_pin) != 4 or not temporary_pin.isdigit():
                send_json(self, {
                    "ok": False,
                    "error": "Temporary PIN must be 4 digits."
                }, 400)
                return

            if not (
                (len(new_credential) == 4 and new_credential.isdigit())
                or len(new_credential) == 8
            ):
                send_json(self, {
                    "ok": False,
                    "error": "New PIN must be 4 digits or password must be 8 characters."
                }, 400)
                return

            conn = get_connection()

            row = conn.execute("""
                SELECT
                    id,
                    student_id,
                    status,
                    reset_pin,
                    expires_at,
                    used_at
                FROM password_reset_requests
                WHERE id = ?
                LIMIT 1
            """, (request_id,)).fetchone()

            if not row:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Reset request not found."
                }, 404)
                return

            if row["status"] != "approved":
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Reset request is not approved."
                }, 400)
                return

            if row["used_at"]:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Temporary PIN has already been used."
                }, 400)
                return

            if row["reset_pin"] != temporary_pin:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Incorrect temporary PIN."
                }, 400)
                return

            from datetime import datetime

            try:
                expires = datetime.strptime(
                    row["expires_at"],
                    "%Y-%m-%d %H:%M:%S"
                )

                if datetime.utcnow() >= expires:

                    conn.execute("""
                        UPDATE password_reset_requests
                        SET status = 'expired'
                        WHERE id = ?
                    """, (request_id,))

                    conn.commit()
                    conn.close()

                    send_json(self, {
                        "ok": False,
                        "error": "Temporary PIN has expired."
                    }, 400)
                    return

            except Exception:
                conn.close()

                send_json(self, {
                    "ok": False,
                    "error": "Invalid expiry information."
                }, 400)
                return

            conn.execute("""
                UPDATE students
                SET password = ?
                WHERE id = ?
            """, (
                new_credential,
                row["student_id"]
            ))

            # -----------------------------------------
            # CLEAR LOGIN BLOCK AFTER SUCCESSFUL RESET
            # -----------------------------------------
            conn.execute("""
                UPDATE student_login_security
                SET
                    failed_attempts = 0,
                    blocked = 0,
                    blocked_at = NULL,
                    last_failed_at = NULL
                WHERE student_id = ?
            """, (row["student_id"],))

            conn.execute("""
                UPDATE password_reset_requests
                SET
                    status = 'used',
                    used_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                WHERE id = ?
            """, (request_id,))

            conn.commit()
            conn.close()

            send_json(self, {
                "ok": True,
                "message": "New credential created successfully."
            })
            return

        # ADMIN LISTS RESET REQUESTS
        # Mark one reset request as viewed by the administrator.
        seen_path_match = re.fullmatch(
            r"/api/admin/password-reset-requests/(\d+)/seen",
            path
        )

        if seen_path_match:
            if not require_admin(self):
                return

            request_id = int(seen_path_match.group(1))

            conn = get_connection()

            conn.execute("""
                UPDATE password_reset_requests
                SET is_new = 0
                WHERE id = ?
            """, (request_id,))

            conn.commit()
            conn.close()

            send_json(self, {
                "ok": True,
                "message": "Reset request marked as viewed."
            })
            return

        if path == "/api/admin/password-reset-requests":
            if not require_admin(self):
                return

            conn = get_connection()

            try:
                rows = conn.execute("""
                    SELECT
                        r.id,
                        r.student_id,
                        r.status,
                        r.reset_pin,
                        r.created_at,
                        r.approved_at,
                        r.expires_at,
                        r.used_at,
                        r.is_new,
                        s.name,
                        s.form,
                        s.class_name,
                        s.student_id_code
                    FROM password_reset_requests r
                    JOIN students s
                        ON s.id = r.student_id
                    ORDER BY
                        CASE
                            WHEN r.status = 'pending' THEN 1
                            WHEN r.status = 'approved' THEN 2
                            ELSE 3
                        END,
                        r.id DESC
                """).fetchall()

                attempts = conn.execute("""
                    SELECT
                        a.id,
                        a.student_id,
                        a.student_name,
                        a.student_id_code,
                        a.form,
                        a.entered_student_id,
                        a.result,
                        a.reason,
                        a.request_id,
                        a.created_at
                    FROM password_reset_attempts a
                    ORDER BY a.id DESC
                """).fetchall()

                request_data = []

                for row in rows:
                    stats = conn.execute("""
                        SELECT
                            COUNT(*) AS attempt_count,
                            MAX(created_at) AS last_attempt
                        FROM password_reset_attempts
                        WHERE student_id = ?
                    """, (row["student_id"],)).fetchone()

                    request_data.append({
                        "id": row["id"],
                        "student_id": row["student_id"],
                        "student_name": row["name"],
                        "name": row["name"],
                        "student_id_code": row["student_id_code"],
                        "form": row["form"],
                        "student_form": row["form"],
                        "class_name": row["class_name"],
                        "student_class_name": row["class_name"],
                        "status": row["status"],
                        "reset_pin": row["reset_pin"],
                        "created_at": row["created_at"],
                        "approved_at": row["approved_at"],
                        "expires_at": row["expires_at"],
                        "used_at": row["used_at"],
                        "is_new": int(row["is_new"] or 0),
                        "attempt_count": int(
                            stats["attempt_count"] or 0
                        ),
                        "last_attempt": stats["last_attempt"]
                    })

                new_count = sum(
                    1
                    for request in request_data
                    if request["is_new"] == 1
                )

                failed_attempts = [
                    {
                        "id": row["id"],
                        "student_id": row["student_id"],
                        "student_name": row["student_name"],
                        "student_id_code": row["student_id_code"],
                        "form": row["form"],
                        "entered_student_id": row["entered_student_id"],
                        "result": row["result"],
                        "reason": row["reason"],
                        "request_id": row["request_id"],
                        "created_at": row["created_at"]
                    }
                    for row in attempts
                    if str(row["result"] or "").lower()
                    not in ("success", "approved")
                ]

                send_json(self, {
                    "ok": True,
                    "requests": request_data,
                    "new_count": new_count,
                    "failed_attempts": failed_attempts
                })

            finally:
                conn.close()

            return

        # UNKNOWN POST
        # ---------------------------------------------

        send_json(self, {
            "ok": False,
            "message": "API endpoint not found."
        }, 404)


    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ---------------------------------------------
        # READ JSON
        # ---------------------------------------------
        try:
            length = int(
                self.headers.get("Content-Length", 0)
            )

            raw = self.rfile.read(length)

            if not raw.strip():
                data = {}
            else:
                data = json.loads(
                    raw.decode("utf-8")
                )

        except Exception:
            send_json(self, {
                "ok": False,
                "message": "Invalid JSON."
            }, 400)
            return

        # ---------------------------------------------
        # MAIN ADMINISTRATOR EDIT
        # ---------------------------------------------
        if path.startswith("/api/admin/users/"):
            if not require_main_admin(self):
                return

            parts = path.strip("/").split("/")

            if len(parts) != 4:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid administrator request."
                }, 400)
                return

            try:
                admin_id = int(parts[3])
            except ValueError:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid administrator ID."
                }, 400)
                return

            display_name = str(
                data.get("display_name", "")
            ).strip()

            username = str(
                data.get("username", "")
            ).strip()

            if not display_name or not username:
                send_json(self, {
                    "ok": False,
                    "message":
                        "Display name and username are required."
                }, 400)
                return

            conn = get_connection()

            try:
                admin = conn.execute("""
                    SELECT
                        id,
                        role
                    FROM admin_users
                    WHERE id = ?
                    LIMIT 1
                """, (admin_id,)).fetchone()

                if admin is None:
                    send_json(self, {
                        "ok": False,
                        "message": "Administrator not found."
                    }, 404)
                    return

                existing = conn.execute("""
                    SELECT id
                    FROM admin_users
                    WHERE username = ?
                      AND id != ?
                    LIMIT 1
                """, (
                    username,
                    admin_id
                )).fetchone()

                if existing is not None:
                    send_json(self, {
                        "ok": False,
                        "message":
                            "That username is already in use."
                    }, 409)
                    return

                conn.execute("""
                    UPDATE admin_users
                    SET
                        username = ?,
                        display_name = ?,
                        updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                    WHERE id = ?
                """, (
                    username,
                    display_name,
                    admin_id
                ))

                conn.commit()

                current_session = get_admin_session(self)

                if (
                    current_session is not None
                    and int(current_session.get("admin_id", -1))
                    == admin_id
                ):
                    current_session["username"] = username
                    current_session["display_name"] = display_name

                send_json(self, {
                    "ok": True,
                    "message":
                        "Administrator details updated successfully."
                })
                return

            finally:
                conn.close()

        # UNKNOWN PUT
        send_json(self, {
            "ok": False,
            "message": "API endpoint not found."
        }, 404)


    def do_POST(self):

        parsed = urlparse(self.path)
        path = parsed.path


        # ---------------------------------------------
        # READ JSON
        # ---------------------------------------------

        try:

            length = int(
                self.headers.get("Content-Length", 0)
            )

            raw = self.rfile.read(length)

            if not raw.strip():
                data = {}
            else:
                data = json.loads(
                    raw.decode("utf-8")
                )

        except Exception:

            send_json(self, {
                "ok": False,
                "message": "Invalid JSON."
            }, 400)

            return


        # ---------------------------------------------
        # ---------------------------------------------
        # CLEAR PASSWORD RESET CENTRE RECORDS ONLY
        if path == "/api/admin/password-reset-requests/clear-all":
            if not require_admin(self):
                return

            conn = get_connection()
            try:
                conn.execute("BEGIN")

                attempts_deleted = conn.execute(
                    "DELETE FROM password_reset_attempts"
                ).rowcount

                requests_deleted = conn.execute(
                    "DELETE FROM password_reset_requests"
                ).rowcount

                conn.commit()

                send_json(self, {
                    "ok": True,
                    "message": "Password-reset records cleared.",
                    "requests_deleted": requests_deleted,
                    "attempts_deleted": attempts_deleted
                })

            except Exception as error:
                conn.rollback()
                print("CLEAR PASSWORD RESET RECORDS ERROR:", error)
                send_json(self, {
                    "ok": False,
                    "message": "Unable to clear password-reset records."
                }, 500)

            finally:
                conn.close()

            return

        # MAIN ADMINISTRATOR MANAGEMENT - POST
        # ---------------------------------------------
        if path.startswith("/api/admin/users/"):
            if not require_main_admin(self):
                return

            parts = path.strip("/").split("/")

            if len(parts) != 5:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid administrator request."
                }, 400)
                return

            try:
                admin_id = int(parts[3])
            except ValueError:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid administrator ID."
                }, 400)
                return

            action = parts[4]

            conn = get_connection()

            try:
                admin = conn.execute("""
                    SELECT
                        id,
                        username,
                        display_name,
                        role,
                        active
                    FROM admin_users
                    WHERE id = ?
                    LIMIT 1
                """, (admin_id,)).fetchone()

                if admin is None:
                    send_json(self, {
                        "ok": False,
                        "message": "Administrator not found."
                    }, 404)
                    return

                current_session = get_admin_session(self)

                is_self = (
                    current_session is not None
                    and int(current_session.get("admin_id", -1)) == admin_id
                )

                is_main = admin["role"] == "main_admin"

                # -------------------------------------------------
                # ENABLE / DISABLE
                # -------------------------------------------------
                if action in ("enable", "disable"):
                    enable = action == "enable"

                    # Main Administrator cannot disable himself.
                    if is_main and is_self and not enable:
                        send_json(self, {
                            "ok": False,
                            "message":
                                "The Main Administrator cannot disable his own account."
                        }, 403)
                        return

                    # Main Administrator account can never be disabled.
                    if is_main and not enable:
                        send_json(self, {
                            "ok": False,
                            "message":
                                "The Main Administrator account cannot be disabled."
                        }, 403)
                        return

                    conn.execute("""
                        UPDATE admin_users
                        SET
                            active = ?,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (1 if enable else 0, admin_id))

                    conn.commit()

                    # Invalidate sessions for the affected administrator.
                    # This does not affect the Main Administrator when
                    # he enables/disables another account.
                    for token, session in list(ADMIN_SESSIONS.items()):
                        if session.get("admin_id") == admin_id:
                            ADMIN_SESSIONS.pop(token, None)

                    send_json(self, {
                        "ok": True,
                        "message":
                            "Administrator enabled successfully."
                            if enable
                            else
                            "Administrator disabled successfully."
                    })
                    return

                # -------------------------------------------------
                # CHANGE PASSWORD
                # -------------------------------------------------
                if action == "password":
                    password = str(data.get("password", ""))

                    if len(password) < 8:
                        send_json(self, {
                            "ok": False,
                            "message":
                                "Password must contain at least 8 characters."
                        }, 400)
                        return

                    salt = __import__('secrets').token_bytes(16)

                    digest = hashlib.pbkdf2_hmac(
                        "sha256",
                        password.encode("utf-8"),
                        salt,
                        200000
                    )

                    password_hash = (
                        "pbkdf2_sha256$200000$"
                        + salt.hex()
                        + "$"
                        + digest.hex()
                    )

                    conn.execute("""
                        UPDATE admin_users
                        SET
                            password_hash = ?,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (password_hash, admin_id))

                    conn.commit()

                    # Keep the current Main Administrator session active
                    # when changing his own password.
                    if not is_self:
                        for token, session in list(ADMIN_SESSIONS.items()):
                            if session.get("admin_id") == admin_id:
                                ADMIN_SESSIONS.pop(token, None)

                    send_json(self, {
                        "ok": True,
                        "message":
                            "Administrator password changed successfully."
                    })
                    return

                send_json(self, {
                    "ok": False,
                    "message": "Unsupported administrator action."
                }, 400)
                return

            finally:
                conn.close()

        # ---------------------------------------------
        # ADMIN LOGIN
        # ---------------------------------------------

        if path == "/api/admin/login":

            username = str(data.get("username", "")).strip()
            password = str(data.get("password", ""))

            if not username or not password:
                send_json(self, {
                    "ok": False,
                    "message": "Enter username and password."
                }, 400)
                return

            conn = get_connection()

            try:
                admin = conn.execute("""
                    SELECT
                        id,
                        username,
                        display_name,
                        role,
                        password_hash,
                        active
                    FROM admin_users
                    WHERE username = ?
                    LIMIT 1
                """, (username,)).fetchone()

                if admin is None:
                    send_json(self, {
                        "ok": False,
                        "message": "Incorrect username or password."
                    }, 401)
                    return

                if int(admin["active"]) != 1:
                    send_json(self, {
                        "ok": False,
                        "message": "This administrator account is disabled."
                    }, 403)
                    return

                if not verify_admin_password(
                    password,
                    admin["password_hash"]
                ):
                    send_json(self, {
                        "ok": False,
                        "message": "Incorrect username or password."
                    }, 401)
                    return

                now = __import__("datetime").datetime.now().strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

                conn.execute("""
                    UPDATE admin_users
                    SET last_login_at = ?,
                        updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                    WHERE id = ?
                """, (now, admin["id"]))

                conn.commit()

                token = __import__("secrets").token_urlsafe(32)

                ADMIN_SESSIONS[token] = {
                    "admin_id": int(admin["id"]),
                    "username": admin["username"],
                    "display_name": admin["display_name"],
                    "role": admin["role"],
                    "created_at": __import__("time").time()
                }

                send_json(self, {
                    "ok": True,
                    "message": "Login successful.",
                    "token": token,
                    "admin": {
                        "id": int(admin["id"]),
                        "username": admin["username"],
                        "display_name": admin["display_name"],
                        "role": admin["role"]
                    }
                })

                return

            finally:
                conn.close()


        # ADD STUDENT
        # ---------------------------------------------

        if path == "/api/students":

            if not require_admin(self):
                return

            required = [
                "name",
                "form",
                "class_name",
                "password"
            ]

            for field in required:

                if not str(data.get(field, "")).strip():

                    send_json(self, {
                        "ok": False,
                        "message":
                            f"{field} is required."
                    }, 400)

                    return


            try:

                conn = get_connection()

                # Generate the next permanent MSA Student ID.
                max_row = conn.execute("""
                    SELECT MAX(
                        CASE
                            WHEN SUBSTR(student_id_code, 1, 4) = 'MSA-'
                            THEN CAST(SUBSTR(student_id_code, 5) AS INTEGER)
                            ELSE 0
                        END
                    )
                    FROM students
                """).fetchone()

                next_number = int(max_row[0] or 0) + 1
                student_id_code = f"MSA-{next_number:02d}"

                while conn.execute("""
                    SELECT 1
                    FROM students
                    WHERE student_id_code = ?
                    LIMIT 1
                """, (student_id_code,)).fetchone():
                    next_number += 1
                    student_id_code = f"MSA-{next_number:02d}"

                cursor = conn.execute("""
                    INSERT INTO students
                    (
                        name,
                        form,
                        class_name,
                        password,
                        status,
                        student_id_code
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    data["name"].strip(),
                    int(data["form"]),
                    data["class_name"].strip(),
                    data["password"].strip(),
                    data.get("status", "Active"),
                    student_id_code
                ))

                conn.commit()

                student_id = cursor.lastrowid

                conn.close()


                send_json(self, {
                    "ok": True,
                    "message":
                        "Student saved successfully.",
                    "student_id": student_id,
                    "student_id_code": student_id_code
                }, 201)

            except Exception as error:

                send_json(self, {
                    "ok": False,
                    "message": str(error)
                }, 500)

            return


        # ---------------------------------------------

        # SCHOOL ANNOUNCEMENT MANAGEMENT
        if path == "/api/admin/announcements":
            if not require_admin(self):
                return

            action = str(data.get("action", "create")).strip().lower()
            conn = get_connection()
            try:
                if action == "activate":
                    try:
                        announcement_id = int(data.get("id"))
                    except (TypeError, ValueError):
                        send_json(self, {"ok": False,
                            "message": "Invalid announcement ID."}, 400)
                        return

                    cursor = conn.execute("""
                        UPDATE announcements
                        SET active = 1,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (announcement_id,))

                    if cursor.rowcount == 0:
                        send_json(self, {"ok": False,
                            "message": "Announcement not found."}, 404)
                        return

                    conn.commit()
                    send_json(self, {"ok": True,
                        "message": "Announcement activated."})
                    return

                if action == "disable":
                    try:
                        announcement_id = int(data.get("id"))
                    except (TypeError, ValueError):
                        send_json(self, {"ok": False,
                            "message": "Invalid announcement ID."}, 400)
                        return

                    cursor = conn.execute("""
                        UPDATE announcements
                        SET active = 0, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (announcement_id,))
                    if cursor.rowcount == 0:
                        send_json(self, {"ok": False,
                            "message": "Announcement not found."}, 404)
                        return
                    conn.commit()
                    send_json(self, {"ok": True,
                        "message": "Announcement disabled."})
                    return

                announcement_type = str(
                    data.get("announcement_type", "")
                ).strip()
                title = str(data.get("title", "")).strip()
                message = str(data.get("message", "")).strip()

                if announcement_type not in (
                    "results_coming_soon", "results_are_out"
                ):
                    send_json(self, {"ok": False,
                        "message": "Choose a valid announcement type."}, 400)
                    return
                if not title or len(title) > 120:
                    send_json(self, {"ok": False,
                        "message": "Title is required and must be 120 characters or fewer."}, 400)
                    return
                if not message or len(message) > 2000:
                    send_json(self, {"ok": False,
                        "message": "Message is required and must be 2000 characters or fewer."}, 400)
                    return

                if action == "edit":
                    try:
                        announcement_id = int(data.get("id"))
                    except (TypeError, ValueError):
                        send_json(self, {"ok": False,
                            "message": "Invalid announcement ID."}, 400)
                        return

                    cursor = conn.execute("""
                        UPDATE announcements
                        SET announcement_type = ?, title = ?, message = ?,
                            updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (announcement_type, title, message, announcement_id))
                    if cursor.rowcount == 0:
                        send_json(self, {"ok": False,
                            "message": "Announcement not found."}, 404)
                        return
                    conn.commit()
                    send_json(self, {"ok": True,
                        "message": "Announcement updated successfully.",
                        "id": announcement_id})
                    return

                if action != "create":
                    send_json(self, {"ok": False,
                        "message": "Unsupported announcement action."}, 400)
                    return

                session = get_admin_session(self) or {}
                created_by = str(session.get("username", "admin"))
                cursor = conn.execute("""
                    INSERT INTO announcements
                        (announcement_type, title, message, active, created_by)
                    VALUES (?, ?, ?, 1, ?)
                """, (announcement_type, title, message, created_by))
                announcement_id = cursor.lastrowid
                conn.commit()
                send_json(self, {
                    "ok": True,
                    "message": "Announcement saved successfully.",
                    "id": announcement_id
                }, 201)
            except Exception as error:
                conn.rollback()
                print("SAVE ANNOUNCEMENT ERROR:", error)
                send_json(self, {"ok": False,
                    "message": "Could not save the announcement."}, 500)
            finally:
                conn.close()
            return

        # RESULT UNPUBLISH / DELETE MANAGEMENT
        if path == "/api/results/unpublish-all":
            if not require_main_admin(self):
                return
            conn = get_connection()
            try:
                cursor = conn.execute("""
                    UPDATE results
                    SET published = 0, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                    WHERE published = 1
                """)
                count = cursor.rowcount
                conn.commit()
                send_json(self, {"ok": True,
                    "message": f"{count} result(s) unpublished.",
                    "count": count})
            except Exception as error:
                conn.rollback()
                print("UNPUBLISH ALL RESULTS ERROR:", error)
                send_json(self, {"ok": False,
                    "message": "Could not unpublish results."}, 500)
            finally:
                conn.close()
            return

        result_action = re.fullmatch(
            r"/api/results/([0-9]+)/(unpublish|delete)", path
        )
        if result_action:
            if not require_main_admin(self):
                return

            result_id = int(result_action.group(1))
            action = result_action.group(2)
            conn = get_connection()
            file_path = None
            try:
                row = conn.execute("""
                    SELECT id, file_path FROM results WHERE id = ?
                """, (result_id,)).fetchone()

                if row is None:
                    send_json(self, {"ok": False,
                        "message": "Result not found."}, 404)
                    return

                if action == "unpublish":
                    conn.execute("""
                        UPDATE results
                        SET published = 0, updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                        WHERE id = ?
                    """, (result_id,))
                    conn.commit()
                    send_json(self, {"ok": True,
                        "message": "Result unpublished.",
                        "result_id": result_id, "published": False})
                    return

                file_path = row["file_path"]
                conn.execute("DELETE FROM results WHERE id = ?", (result_id,))
                conn.commit()

                # Remove the stored PDF only after database deletion commits.
                if file_path:
                    try:
                        delete_stored_result_pdf(file_path)
                    except Exception:
                        print("RESULT PDF CLEANUP WARNING: storage cleanup failed")

                send_json(self, {"ok": True,
                    "message": "Result record deleted.",
                    "result_id": result_id})
            except Exception as error:
                conn.rollback()
                print("RESULT MANAGEMENT ERROR:", error)
                send_json(self, {"ok": False,
                    "message": "Could not update the result."}, 500)
            finally:
                conn.close()
            return

        # CREATE RESULT RECORD
        # ---------------------------------------------

        if path == "/api/results":

            if not require_admin(self):
                return

            required = [
                "student_id",
                "academic_year",
                "term",
                "file_name",
                "file_data"
            ]

            for field in required:

                if data.get(field) in [
                    None,
                    ""
                ]:

                    send_json(self, {
                        "ok": False,
                        "message":
                            f"{field} is required."
                    }, 400)

                    return


            try:

                student_id = int(
                    data["student_id"]
                )

                academic_year = int(
                    data["academic_year"]
                )

                term = str(
                    data["term"]
                )

                file_name = os.path.basename(
                    str(data["file_name"]).strip()
                )
                file_name = re.sub(
                    r"[^A-Za-z0-9._ -]", "_", file_name
                ).strip(" .")

                if (
                    not file_name
                    or not file_name.lower().endswith(".pdf")
                ):
                    send_json(self, {
                        "ok": False,
                        "message": "Please upload a PDF file."
                    }, 400)
                    return

                file_data = data["file_data"]

                if not isinstance(file_data, str) or not file_data:
                    send_json(self, {
                        "ok": False,
                        "message": "Invalid PDF data."
                    }, 400)
                    return

                if len(file_data) > 14_000_000:
                    send_json(self, {
                        "ok": False,
                        "message": "PDF exceeds the 10 MiB limit."
                    }, 413)
                    return


                import base64
                import binascii

                try:
                    file_bytes = base64.b64decode(
                        file_data, validate=True
                    )
                except (binascii.Error, ValueError):
                    send_json(self, {
                        "ok": False,
                        "message": "Invalid PDF encoding."
                    }, 400)
                    return

                if len(file_bytes) > 10 * 1024 * 1024:
                    send_json(self, {
                        "ok": False,
                        "message": "PDF exceeds the 10 MiB limit."
                    }, 413)
                    return

                if not file_bytes.startswith(b"%PDF-"):
                    send_json(self, {
                        "ok": False,
                        "message": "The uploaded file is not a valid PDF."
                    }, 400)
                    return

                # -------------------------------------

                conn = get_connection()

                student = conn.execute("""
                    SELECT id
                    FROM students
                    WHERE id = ?
                """, (student_id,)).fetchone()


                if not student:

                    conn.close()

                    send_json(self, {
                        "ok": False,
                        "message":
                            "Student does not exist."
                    }, 404)

                    return


                # -------------------------------------
                # SAVE FILE
                # -------------------------------------

                # KEEP PREVIOUS RESULTS IN HISTORY
                # -------------------------------------
                # Never replace an existing result.
                # Every upload gets its own database record.

                import time

                safe_name = (
                    f"{student_id}_"
                    f"{academic_year}_"
                    f"{term.replace(' ', '_')}_"
                    f"{int(time.time())}_"
                    f"{file_name}"
                )

                try:
                    file_path = store_result_pdf(safe_name, file_bytes)
                except Exception:
                    print("RESULT PDF UPLOAD ERROR: storage write failed")
                    conn.close()
                    send_json(self, {
                        "ok": False,
                        "message": "Could not store the result PDF. Check storage configuration."
                    }, 503)
                    return

                try:
                    cursor = conn.execute("""
                        INSERT INTO results
                        (
                            student_id,
                            academic_year,
                            term,
                            file_name,
                            file_path,
                            published
                        )
                        VALUES (?, ?, ?, ?, ?, 0)
                    """, (
                        student_id,
                        academic_year,
                        term,
                        file_name,
                        file_path
                    ))

                    result_id = cursor.lastrowid
                    conn.commit()

                except Exception:
                    try:
                        conn.rollback()
                    except Exception:
                        pass

                    try:
                        delete_stored_result_pdf(file_path)
                    except Exception:
                        print(
                            "RESULT PDF CLEANUP WARNING: "
                            "failed upload cleanup"
                        )

                    try:
                        conn.close()
                    except Exception:
                        pass

                    send_json(self, {
                        "ok": False,
                        "message": (
                            "Could not save the result record. "
                            "Please try again."
                        )
                    }, 500)
                    return

                conn.close()


                send_json(self, {
                    "ok": True,
                    "message":
                        "Result uploaded successfully.",
                    "result_id": result_id,
                    "published": False
                }, 201)

            except Exception as error:

                send_json(self, {
                    "ok": False,
                    "message": str(error)
                }, 500)

            return


        # ---------------------------------------------
        # PUBLISH RESULT
        # ---------------------------------------------

        if path.startswith("/api/results/") and path.endswith("/publish"):

            if not require_admin(self):
                return

            parts = path.strip("/").split("/")

            try:
                result_id = int(parts[-2])
            except Exception:

                send_json(self, {
                    "ok": False,
                    "message": "Invalid result ID."
                }, 400)

                return


            conn = get_connection()

            result = conn.execute("""
                SELECT id
                FROM results
                WHERE id = ?
            """, (result_id,)).fetchone()


            if not result:

                conn.close()

                send_json(self, {
                    "ok": False,
                    "message": "Result not found."
                }, 404)

                return


            conn.execute("""
                UPDATE results
                SET
                    published = 1,
                    updated_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                WHERE id = ?
            """, (result_id,))

            conn.commit()
            conn.close()


            send_json(self, {
                "ok": True,
                "message":
                    "Result published successfully.",
                "result_id": result_id,
                "published": True
            })

            return


        # ---------------------------------------------

        # ============================================================
        # MSA STUDENT MANAGEMENT POST ROUTES - POST
        # ============================================================

        # ------------------------------------------------------------
        # EDIT STUDENT
        # ------------------------------------------------------------
        if path == "/api/students/update":

            if not require_admin(self):
                return

            conn = get_connection()

            try:
                student_id = int(data.get("student_id"))
                name = str(data.get("name", "")).strip()
                form = int(data.get("form"))
                class_name = str(
                    data.get("class_name", "")
                ).strip()

                if not name:
                    send_json(self, {
                        "ok": False,
                        "message": "Student name is required."
                    }, 400)
                    return

                if form < 1 or form > 6:
                    send_json(self, {
                        "ok": False,
                        "message": "Form must be between 1 and 6."
                    }, 400)
                    return

                if not class_name:
                    send_json(self, {
                        "ok": False,
                        "message": "Class is required."
                    }, 400)
                    return

                student = conn.execute("""
                    SELECT id
                    FROM students
                    WHERE id = ?
                """, (student_id,)).fetchone()

                if not student:
                    send_json(self, {
                        "ok": False,
                        "message": "Student not found."
                    }, 404)
                    return

                conn.execute("""
                    UPDATE students
                    SET
                        name = ?,
                        form = ?,
                        class_name = ?
                    WHERE id = ?
                """, (
                    name,
                    form,
                    class_name,
                    student_id
                ))

                conn.commit()

                send_json(self, {
                    "ok": True,
                    "message": "Student updated successfully.",
                    "student_id": student_id
                })
                return

            except (ValueError, TypeError):
                send_json(self, {
                    "ok": False,
                    "message": "Invalid student information."
                }, 400)
                return

            except Exception as error:
                try:
                    conn.rollback()
                except Exception:
                    pass

                send_json(self, {
                    "ok": False,
                    "message": str(error)
                }, 500)
                return

            finally:
                conn.close()


        # ------------------------------------------------------------
        # RESET STUDENT PASSWORD / PIN
        # ------------------------------------------------------------
        if path == "/api/students/reset-password":

            if not require_admin(self):
                return

            import secrets

            conn = get_connection()

            try:
                student_id = int(data.get("student_id"))

                student = conn.execute("""
                    SELECT id, name
                    FROM students
                    WHERE id = ?
                """, (student_id,)).fetchone()

                if not student:
                    send_json(self, {
                        "ok": False,
                        "message": "Student not found."
                    }, 404)
                    return

                temporary_pin = str(
                    secrets.randbelow(9000) + 1000
                )

                conn.execute("""
                    UPDATE students
                    SET password = ?
                    WHERE id = ?
                """, (
                    temporary_pin,
                    student_id
                ))

                conn.commit()

                send_json(self, {
                    "ok": True,
                    "message": "Password/PIN reset successfully.",
                    "student_id": student_id,
                    "temporary_pin": temporary_pin
                })
                return

            except (ValueError, TypeError):
                send_json(self, {
                    "ok": False,
                    "message": "Invalid student ID."
                }, 400)
                return

            except Exception as error:
                try:
                    conn.rollback()
                except Exception:
                    pass

                send_json(self, {
                    "ok": False,
                    "message": str(error)
                }, 500)
                return

            finally:
                conn.close()


        # ------------------------------------------------------------
        # ACTIVE / DISABLE STUDENT
        # ------------------------------------------------------------
        if path == "/api/students/toggle-status":

            if not require_admin(self):
                return
            try:
                student_id = int(data.get("student_id", 0))

                conn = get_connection()

                student = conn.execute(
                    """
                    SELECT id, name, status
                    FROM students
                    WHERE id = ?
                    """,
                    (student_id,)
                ).fetchone()

                if not student:
                    conn.close()
                    self.send_json(
                        {
                            "ok": False,
                            "message": "Student not found."
                        },
                        404
                    )
                    return

                current_status = str(
                    student["status"] or "Active"
                ).strip().lower()

                if current_status == "active":
                    new_status = "Disabled"
                    message = (
                        "Student account disabled successfully."
                    )
                else:
                    new_status = "Active"
                    message = (
                        "Student account activated successfully."
                    )

                conn.execute(
                    """
                    UPDATE students
                    SET status = ?
                    WHERE id = ?
                    """,
                    (
                        new_status,
                        student_id
                    )
                )

                conn.commit()
                conn.close()

                self.send_json(
                    {
                        "ok": True,
                        "message": message,
                        "student_id": student_id,
                        "status": new_status
                    }
                )
                return

            except Exception as error:
                print(
                    "STUDENT STATUS ERROR:",
                    error
                )

                self.send_json(
                    {
                        "ok": False,
                        "message": (
                            "Unable to change student "
                            "account status."
                        )
                    },
                    500
                )
                return

        if path == "/api/students/delete":

            if not require_main_admin(self):
                return

            conn = get_connection()

            try:
                student_id = int(data.get("student_id"))

                student = conn.execute("""
                    SELECT id, name
                    FROM students
                    WHERE id = ?
                """, (student_id,)).fetchone()

                if not student:
                    send_json(self, {
                        "ok": False,
                        "message": "Student not found."
                    }, 404)
                    return

                result_rows = conn.execute("""
                    SELECT file_path
                    FROM results
                    WHERE student_id = ?
                """, (student_id,)).fetchall()

                result_files = [
                    row["file_path"]
                    for row in result_rows
                    if row["file_path"]
                ]

                conn.execute("""
                    DELETE FROM password_reset_requests
                    WHERE student_id = ?
                """, (student_id,))

                conn.execute("""
                    DELETE FROM results
                    WHERE student_id = ?
                """, (student_id,))

                conn.execute("""
                    DELETE FROM students
                    WHERE id = ?
                """, (student_id,))

                conn.commit()

                results_root = Path(RESULTS_DIR).resolve()
                for file_path in result_files:
                    try:
                        candidate = Path(file_path).resolve()
                        if (
                            results_root in candidate.parents
                            and candidate.is_file()
                        ):
                            candidate.unlink()
                    except OSError as error:
                        print("STUDENT PDF CLEANUP WARNING:", error)

                send_json(self, {
                    "ok": True,
                    "message": "Student permanently deleted.",
                    "student_id": student_id
                })
                return

            except (ValueError, TypeError):
                send_json(self, {
                    "ok": False,
                    "message": "Invalid student ID."
                }, 400)
                return

            except Exception as error:
                try:
                    conn.rollback()
                except Exception:
                    pass

                send_json(self, {
                    "ok": False,
                    "message": str(error)
                }, 500)
                return

            finally:
                conn.close()



        # ============================================================
        # PASSWORD / PIN RESET
        # ============================================================

        # STUDENT REQUESTS RESET
        if path == "/api/password-reset/request":

            try:
                data = data if isinstance(data, dict) else {}
            except Exception:
                data = {}

            name = str(data.get("name", "")).strip()
            form_value = str(data.get("form", "")).strip()

            # Student enters only the numeric portion.
            entered_number = str(
                data.get("student_id_number", "")
            ).strip()

            if not name or not form_value or not entered_number:
                send_json(self, {
                    "ok": False,
                    "message":
                        "Student name, form and Student ID are required."
                }, 400)
                return

            # Numeric-only Student ID input.
            if not entered_number.isdigit():
                send_json(self, {
                    "ok": False,
                    "message":
                        "Student ID must contain numbers only."
                }, 400)
                return

            try:
                form_number = int(form_value)
            except ValueError:
                send_json(self, {
                    "ok": False,
                    "message": "Invalid form."
                }, 400)
                return

            conn = get_connection()

            student = conn.execute("""
                SELECT
                    id,
                    name,
                    form,
                    status,
                    student_id_code,
                    class_name
                FROM students
                WHERE lower(name) = lower(?)
                  AND form = ?
                LIMIT 1
            """, (name, form_number)).fetchone()

            if not student:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "message": "Student not found."
                }, 404)
                return

            # Automatically compose MSA- + the numeric value.
            # Example: 24 becomes MSA-24.
            expected_student_id = str(
                student["student_id_code"] or ""
            ).strip()

            entered_student_id = "MSA-" + entered_number

            if entered_student_id.upper() != expected_student_id.upper():

                # Record every incorrect Student ID attempt.
                conn.execute("""
                    INSERT INTO password_reset_attempts
                    (
                        student_id,
                        student_name,
                        student_id_code,
                        form,
                        entered_student_id,
                        result,
                        reason,
                        request_id
                    )
                    VALUES (?, ?, ?, ?, ?, 'not_approved', ?, NULL)
                """, (
                    student["id"],
                    student["name"],
                    student["student_id_code"],
                    student["form"],
                    entered_student_id,
                    "Student ID does not match this account."
                ))

                conn.commit()
                conn.close()

                send_json(self, {
                    "ok": False,
                    "message":
                        "Student ID does not match this account."
                }, 403)
                return

            if str(student["status"]).lower() != "active":

                # Record attempts against disabled/inactive accounts.
                conn.execute("""
                    INSERT INTO password_reset_attempts
                    (
                        student_id,
                        student_name,
                        student_id_code,
                        form,
                        entered_student_id,
                        result,
                        reason,
                        request_id
                    )
                    VALUES (?, ?, ?, ?, ?, 'not_approved', ?, NULL)
                """, (
                    student["id"],
                    student["name"],
                    student["student_id_code"],
                    student["form"],
                    entered_student_id,
                    "This student account is inactive."
                ))

                conn.commit()
                conn.close()

                send_json(self, {
                    "ok": False,
                    "message": "This student account is inactive."
                }, 403)
                return

            existing = conn.execute("""
                SELECT id
                FROM password_reset_requests
                WHERE student_id = ?
                  AND (
                      status = 'pending'
                      OR (
                          status = 'approved'
                          AND expires_at IS NOT NULL
                          AND NULLIF(expires_at, '') > ?
                      )
                  )
                ORDER BY id DESC
                LIMIT 1
            """, (
                student["id"],
                __import__("datetime").datetime.utcnow().strftime(
                    "%Y-%m-%d %H:%M:%S"
                ),
            )).fetchone()

            if existing:
                conn.close()
                send_json(self, {
                    "ok": True,
                    "message": "A password reset request is already pending.",
                    "request_id": existing["id"]
                })
                return

            # ------------------------------------------------------
            # AUTOMATIC PASSWORD RESET APPROVAL
            # Student ID has already been verified above.
            # The request is approved immediately, while the complete
            # request record remains stored in password_reset_requests.
            # ------------------------------------------------------

            reset_pin = f"{1000 + __import__('secrets').randbelow(9000):04d}"

            approved_at = __import__('datetime').datetime.utcnow()
            expires_at = approved_at + __import__('datetime').timedelta(minutes=2)

            cursor = conn.execute("""
                INSERT INTO password_reset_requests
                (
                    student_id,
                    status,
                    reset_pin,
                    approved_at,
                    expires_at,
                    student_name,
                    student_id_code,
                    student_form,
                    student_class_name,
                    is_new
                )
                VALUES (?, 'approved', ?, ?, ?, ?, ?, ?, ?, 1)
            """, (
                student["id"],
                reset_pin,
                approved_at.strftime("%Y-%m-%d %H:%M:%S"),
                expires_at.strftime("%Y-%m-%d %H:%M:%S"),
                student["name"],
                student["student_id_code"],
                student["form"],
                student["class_name"]
            ))

            request_id = cursor.lastrowid

            # Record the successful verified attempt.
            conn.execute("""
                INSERT INTO password_reset_attempts
                (
                    student_id,
                    student_name,
                    student_id_code,
                    form,
                    entered_student_id,
                    result,
                    reason,
                    request_id
                )
                VALUES (?, ?, ?, ?, ?, 'approved', ?, ?)
            """, (
                student["id"],
                student["name"],
                student["student_id_code"],
                student["form"],
                entered_student_id,
                "Student ID verified. Password reset approved automatically.",
                request_id
            ))

            conn.commit()
            conn.close()

            send_json(self, {
                "ok": True,
                "message": "Student ID verified. Password reset approved automatically.",
                "request_id": request_id,
                "student_id_verified": True,
                "approved": True,
                "reset_pin": reset_pin,
                "expires_at": expires_at.strftime("%Y-%m-%d %H:%M:%S")
            })

            return

        # STUDENT CHECKS RESET STATUS
        if path == "/api/password-reset/status":

            request_id = query.get("request_id", [""])[0].strip()

            if not request_id:
                send_json(self, {
                    "ok": False,
                    "error": "Request ID is required."
                }, 400)
                return

            conn = get_connection()

            row = conn.execute("""
                SELECT
                    r.id,
                    r.student_id,
                    r.status,
                    r.reset_pin,
                    r.created_at,
                    r.approved_at,
                    r.expires_at,
                    r.used_at,
                    s.name,
                    s.form
                FROM password_reset_requests r
                JOIN students s
                  ON s.id = r.student_id
                WHERE r.id = ?
                LIMIT 1
            """, (request_id,)).fetchone()

            conn.close()

            if not row:
                send_json(self, {
                    "ok": False,
                    "error": "Reset request not found."
                }, 404)
                return

            send_json(self, {
                "ok": True,
                "request": {
                    "id": row["id"],
                    "student_id": row["student_id"],
                    "student_name": row["name"],
                    "form": row["form"],
                    "status": row["status"],
                    "reset_pin": row["reset_pin"],
                    "created_at": row["created_at"],
                    "approved_at": row["approved_at"],
                    "expires_at": row["expires_at"],
                    "used_at": row["used_at"]
                }
            })
            return

        # ADMIN APPROVES RESET
        if path.startswith("/api/admin/password-reset-requests/") and path.endswith("/approve"):

            if not require_admin(self):
                return

            parts = path.strip("/").split("/")

            try:
                request_id = int(parts[-2])
            except (ValueError, IndexError):
                send_json(self, {
                    "ok": False,
                    "error": "Invalid request ID."
                }, 400)
                return

            import secrets
            from datetime import datetime, timedelta

            reset_pin = f"{1000 + secrets.randbelow(9000):04d}"

            approved_at = datetime.utcnow()
            expires_at = approved_at + timedelta(minutes=2)

            conn = get_connection()

            row = conn.execute("""
                SELECT id, status
                FROM password_reset_requests
                WHERE id = ?
                LIMIT 1
            """, (request_id,)).fetchone()

            if not row:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Reset request not found."
                }, 404)
                return

            if row["status"] != "pending":
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "This request is already processed."
                }, 400)
                return

            conn.execute("""
                UPDATE password_reset_requests
                SET
                    status = 'approved',
                    reset_pin = ?,
                    approved_at = ?,
                    expires_at = ?
                WHERE id = ?
            """, (
                reset_pin,
                approved_at.strftime("%Y-%m-%d %H:%M:%S"),
                expires_at.strftime("%Y-%m-%d %H:%M:%S"),
                request_id
            ))

            conn.commit()
            conn.close()

            send_json(self, {
                "ok": True,
                "message": "Password reset approved.",
                "request_id": request_id,
                "reset_pin": reset_pin,
                "expires_at": expires_at.strftime("%Y-%m-%d %H:%M:%S")
            })
            return

        # ADMIN REJECTS RESET
        if path.startswith("/api/admin/password-reset-requests/") and path.endswith("/reject"):

            if not require_admin(self):
                return

            parts = path.strip("/").split("/")

            try:
                request_id = int(parts[-2])
            except (ValueError, IndexError):
                send_json(self, {
                    "ok": False,
                    "error": "Invalid request ID."
                }, 400)
                return

            conn = get_connection()

            cursor = conn.execute("""
                UPDATE password_reset_requests
                SET status = 'rejected'
                WHERE id = ?
                  AND status = 'pending'
            """, (request_id,))

            conn.commit()
            changed = cursor.rowcount
            conn.close()

            if not changed:
                send_json(self, {
                    "ok": False,
                    "error": "Request not found or already processed."
                }, 400)
                return

            send_json(self, {
                "ok": True,
                "message": "Password reset request rejected."
            })
            return

        # STUDENT USES TEMPORARY PIN AND CREATES NEW CREDENTIAL
        if path == "/api/password-reset/redeem":

            try:
                data = data if isinstance(data, dict) else {}
            except Exception:
                data = {}

            try:
                request_id = int(data.get("request_id", 0))
            except (TypeError, ValueError):
                request_id = 0

            temporary_pin = str(
                data.get("temporary_pin", "")
            ).strip()

            new_credential = str(
                data.get("new_credential", "")
            ).strip()

            if not request_id:
                send_json(self, {
                    "ok": False,
                    "error": "Request ID is required."
                }, 400)
                return

            if len(temporary_pin) != 4 or not temporary_pin.isdigit():
                send_json(self, {
                    "ok": False,
                    "error": "Temporary PIN must be 4 digits."
                }, 400)
                return

            if not (
                (len(new_credential) == 4 and new_credential.isdigit())
                or len(new_credential) == 8
            ):
                send_json(self, {
                    "ok": False,
                    "error": "New PIN must be 4 digits or password must be 8 characters."
                }, 400)
                return

            conn = get_connection()

            row = conn.execute("""
                SELECT
                    id,
                    student_id,
                    status,
                    reset_pin,
                    expires_at,
                    used_at
                FROM password_reset_requests
                WHERE id = ?
                LIMIT 1
            """, (request_id,)).fetchone()

            if not row:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Reset request not found."
                }, 404)
                return

            if row["status"] != "approved":
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Reset request is not approved."
                }, 400)
                return

            if row["used_at"]:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Temporary PIN has already been used."
                }, 400)
                return

            if row["reset_pin"] != temporary_pin:
                conn.close()
                send_json(self, {
                    "ok": False,
                    "error": "Incorrect temporary PIN."
                }, 400)
                return

            from datetime import datetime

            try:
                expires = datetime.strptime(
                    row["expires_at"],
                    "%Y-%m-%d %H:%M:%S"
                )

                if datetime.utcnow() >= expires:

                    conn.execute("""
                        UPDATE password_reset_requests
                        SET status = 'expired'
                        WHERE id = ?
                    """, (request_id,))

                    conn.commit()
                    conn.close()

                    send_json(self, {
                        "ok": False,
                        "error": "Temporary PIN has expired."
                    }, 400)
                    return

            except Exception:
                conn.close()

                send_json(self, {
                    "ok": False,
                    "error": "Invalid expiry information."
                }, 400)
                return

            conn.execute("""
                UPDATE students
                SET password = ?
                WHERE id = ?
            """, (
                new_credential,
                row["student_id"]
            ))

            # -----------------------------------------
            # CLEAR LOGIN BLOCK AFTER SUCCESSFUL RESET
            # -----------------------------------------
            conn.execute("""
                UPDATE student_login_security
                SET
                    failed_attempts = 0,
                    blocked = 0,
                    blocked_at = NULL,
                    last_failed_at = NULL
                WHERE student_id = ?
            """, (row["student_id"],))

            conn.execute("""
                UPDATE password_reset_requests
                SET
                    status = 'used',
                    used_at = CAST(CURRENT_TIMESTAMP AS TEXT)
                WHERE id = ?
            """, (request_id,))

            conn.commit()
            conn.close()

            send_json(self, {
                "ok": True,
                "message": "New credential created successfully."
            })
            return

        # UNKNOWN POST
        # ---------------------------------------------

        send_json(self, {
            "ok": False,
            "message": "API endpoint not found."
        }, 404)


def main():
    database_url = os.environ.get("DATABASE_URL", "").strip()

    if not database_url:
        initialize_database()
    else:
        print("PostgreSQL selected; SQLite initialization skipped.")

        # Explicitly restricted to the test environment.
        if os.environ.get("MSA_RUN_POSTGRES_MIGRATIONS") == "1":
            if os.environ.get("MSA_DATABASE_ENV", "").strip().lower() != "test":
                raise RuntimeError(
                    "Refusing migrations: MSA_DATABASE_ENV must be test."
                )
            apply_postgres_migrations()

        if os.environ.get("MSA_DATABASE_ENV", "").strip().lower() == "test":
            ensure_postgres_admin()
        else:
            print("Administrator bootstrap skipped outside the test environment.")
    server = HTTPServer(
        (HOST, PORT),
        MSAHandler
    )

    print("")
    print("================================")
    print("       MSA PORTAL BACKEND")
    print("================================")
    print(f"Server: http://{HOST}:{PORT}")
    print("Database: CONNECTED")
    print("Results storage: CONNECTED")
    print("Press CTRL+C to stop.")
    print("")

    server.serve_forever()



if __name__ == "__main__":
    main()
