from pathlib import Path
import re
import shutil
from datetime import datetime

path = Path("backend/server.py")
source = path.read_text()

start_marker = "                # All self-registrations require administrator review"
end_marker = "\n                return\n\n            except Exception:"

start = source.find(start_marker)
if start == -1:
    raise SystemExit("STOP: Registration block not found. No changes made.")

end = source.find(end_marker, start)
if end == -1:
    raise SystemExit("STOP: Registration block ending not found. No changes made.")

end += len("\n                return")

replacement = '''                # Automatically approve valid registrations when no
                # possible duplicate was found above.
                existing_codes = conn.execute("""
                    SELECT student_id_code
                    FROM students
                    WHERE student_id_code IS NOT NULL
                """).fetchall()

                highest_number = 0
                for existing_code_row in existing_codes:
                    existing_code = str(
                        existing_code_row["student_id_code"] or ""
                    )
                    match = re.search(r"(\\d+)$", existing_code)
                    if match:
                        highest_number = max(
                            highest_number, int(match.group(1))
                        )

                next_number = highest_number + 1
                student_code = f"MSA-{next_number:03d}"

                while conn.execute("""
                    SELECT 1 FROM students
                    WHERE student_id_code = ?
                    LIMIT 1
                """, (student_code,)).fetchone():
                    next_number += 1
                    student_code = f"MSA-{next_number:03d}"

                conn.execute("""
                    INSERT INTO students
                        (name, form, class_name, password, status,
                         student_id_code)
                    VALUES (?, ?, ?, ?, 'Active', ?)
                """, (
                    full_name, form_number, class_name,
                    password_hash, student_code
                ))

                new_student = conn.execute("""
                    SELECT id FROM students
                    WHERE student_id_code = ?
                    LIMIT 1
                """, (student_code,)).fetchone()

                if not new_student:
                    raise RuntimeError(
                        "Could not confirm the newly registered student."
                    )

                new_student_id = int(new_student["id"])

                conn.execute("""
                    INSERT INTO student_registrations
                        (full_name, normalized_name, form, class_name,
                         password_hash, status, approved_student_id,
                         reviewed_by, reviewed_at)
                    VALUES (?, ?, ?, ?, ?, 'approved', ?, 'system',
                            CURRENT_TIMESTAMP)
                """, (
                    full_name, normalized_name, form_number, class_name,
                    password_hash, new_student_id
                ))

                conn.commit()

                send_json(self, {
                    "ok": True,
                    "status": "approved",
                    "message": "Registration successful. Your student ID is "
                               + student_code + ". You can now sign in.",
                    "student_id": student_code
                }, 201)
                return'''

backup = path.with_name(
    "server.py.backup_" + datetime.now().strftime("%Y%m%d_%H%M%S")
)
shutil.copy2(path, backup)

path.write_text(source[:start] + replacement + source[end:])
print("Patch applied.")
print("Backup:", backup)
