CREATE TABLE IF NOT EXISTS plaza_feed_stats (
 feed_id TEXT PRIMARY KEY,
 language TEXT,
 copy_count INTEGER NOT NULL DEFAULT 0 CHECK(copy_count >= 0),
 import_count INTEGER NOT NULL DEFAULT 0 CHECK(import_count >= 0)
);
