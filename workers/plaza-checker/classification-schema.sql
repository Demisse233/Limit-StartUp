CREATE TABLE IF NOT EXISTS plaza_classification (
 feed_id TEXT PRIMARY KEY,
 override_category TEXT CHECK(override_category IN ('technology','development','news','gaming','culture','life','other')),
 version INTEGER NOT NULL DEFAULT 0,
 source TEXT,
 updated_at INTEGER
);
