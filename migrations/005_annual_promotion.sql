-- MSA PORTAL annual promotion schema.
-- Additive and safe to re-run on the TEST database.

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS graduated_at TEXT;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS archived_at TEXT;

CREATE TABLE IF NOT EXISTS msa_annual_promotion_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL DEFAULT '0'
);

CREATE TABLE IF NOT EXISTS msa_annual_promotion_runs (
    academic_year INTEGER PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}'
);
