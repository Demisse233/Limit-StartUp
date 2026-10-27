-- Run once before deploying the community UI. Existing feeds belong to Demisse
-- by the owner's explicit request. Never attribute future anonymous uploads.
CREATE TABLE IF NOT EXISTS plaza_usage_archive (
 feed_id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
 copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0),
 import_count INTEGER NOT NULL DEFAULT 0 CHECK(import_count >= 0), deleted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plaza_usage_archive_user ON plaza_usage_archive(user_id);

CREATE TABLE IF NOT EXISTS plaza_share_audit (
 id TEXT PRIMARY KEY, feed_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plaza_share_audit_time ON plaza_share_audit(created_at);

CREATE TABLE IF NOT EXISTS plaza_contributions (
 feed_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plaza_contributor ON plaza_contributions(user_id);
INSERT OR IGNORE INTO plaza_contributions (feed_id,user_id,created_at)
SELECT f.id,u.id,f.created_at FROM plaza_feeds f JOIN users u ON lower(u.email)='eric_demisse@163.com'
WHERE f.created_at < 1793030400000;
