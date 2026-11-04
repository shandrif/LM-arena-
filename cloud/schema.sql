-- Weekly Department Dashboard: one table holds every record (uploaded reports, learned formats, notes).
-- store = datasets | templates | history ; week = the Saturday that ends the Sunday-Saturday week the record belongs to (templates have none).
-- data = the whole record, JSON, gzip-compressed and base64 encoded by the browser ("z..." or plain "j...").
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY, store TEXT NOT NULL, key TEXT NOT NULL, dept TEXT, type TEXT, week TEXT, start TEXT, end TEXT,
  file_name TEXT, uploaded_at TEXT, size INTEGER, data TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_records_week ON records(store, week);
CREATE INDEX IF NOT EXISTS idx_records_dept ON records(store, dept, type, week);
CREATE INDEX IF NOT EXISTS idx_records_updated ON records(updated_at);
CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL); -- wrong sign-in attempts (lock-out after 8 in 15 minutes)
