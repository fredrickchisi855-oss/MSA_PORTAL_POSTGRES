-- Store result PDF bytes directly in Neon PostgreSQL.
-- Safe for existing test databases: existing rows remain unchanged.
ALTER TABLE results
ADD COLUMN IF NOT EXISTS pdf_data BYTEA;
