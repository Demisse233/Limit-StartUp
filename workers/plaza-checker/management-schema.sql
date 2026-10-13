CREATE TABLE IF NOT EXISTS plaza_feed_controls (
 feed_id TEXT PRIMARY KEY,
 hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
 deleted_at INTEGER,
 language_locked INTEGER NOT NULL DEFAULT 0 CHECK(language_locked IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,
 last_operation TEXT,
 updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS plaza_admin_audit (
 id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 action TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plaza_audit_time ON plaza_admin_audit(created_at);
