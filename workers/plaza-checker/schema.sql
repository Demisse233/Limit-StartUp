
CREATE TABLE IF NOT EXISTS plaza_feeds (
 id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, icon TEXT,
 category TEXT NOT NULL DEFAULT 'other', status TEXT NOT NULL DEFAULT 'pending',
 published INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
 checked_at INTEGER, next_check INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, reason TEXT, latency INTEGER,
 reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS plaza_due ON plaza_feeds(next_check);
CREATE INDEX IF NOT EXISTS plaza_public ON plaza_feeds(published,category,status);
CREATE TABLE IF NOT EXISTS plaza_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS plaza_feed_stats (
 feed_id TEXT PRIMARY KEY,
 language TEXT,
 copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0),
 import_count INTEGER NOT NULL DEFAULT 0 CHECK(import_count >= 0)
);

CREATE TABLE IF NOT EXISTS plaza_classification (
 feed_id TEXT PRIMARY KEY,
 override_category TEXT CHECK(override_category IN ('technology','development','news','gaming','culture','life','other')),
 version INTEGER NOT NULL DEFAULT 0,
 source TEXT,
 updated_at INTEGER
);

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
