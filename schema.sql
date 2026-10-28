CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT DEFAULT '',
  area_manager TEXT DEFAULT '',
  rom TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','rom','am','store')),
  store_id INTEGER REFERENCES stores(id),
  scope TEXT DEFAULT '',
  pass_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  emp_no TEXT DEFAULT '',
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  role TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'self' (store) | 'coaching' (HQ / AM / ROM visit)
  visit_date TEXT NOT NULL,
  assessor TEXT NOT NULL,
  items INTEGER NOT NULL,
  trained INTEGER NOT NULL,
  performed INTEGER NOT NULL,
  train_pct REAL NOT NULL,
  comp_pct REAL NOT NULL,
  pass INTEGER NOT NULL,
  answers TEXT NOT NULL,             -- JSON {"s.t":[trained,performed]}
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_ass_store ON assessments(store_id, visit_date);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id),
  store_id INTEGER NOT NULL REFERENCES stores(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  role TEXT NOT NULL,
  section TEXT NOT NULL,
  task TEXT NOT NULL,
  category TEXT NOT NULL,            -- training_gap | execution_gap | untrained_practice
  owner TEXT NOT NULL,               -- 'Training' | 'Operations'
  recommendation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | in_progress | done | verified
  due_date TEXT NOT NULL,
  comment TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_act_store ON actions(store_id, status);
CREATE TABLE IF NOT EXISTS login_log (
  username TEXT NOT NULL,
  ok INTEGER NOT NULL,
  at INTEGER NOT NULL
);
