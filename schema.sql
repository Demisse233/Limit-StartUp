-- D1 数据库初始化
-- 部署后执行: wrangler d1 execute limit-startup-db --file=schema.sql

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT,              -- 用户昵称, 问候语里用这个 (1-24 位任意字符)
  prefs_json TEXT NOT NULL DEFAULT '{}',
  avatar_b64 TEXT,            -- 256x256 压缩后的 jpeg/png/webp, base64 编码
  avatar_content_type TEXT,   -- 'image/jpeg' / 'image/png' / 'image/webp'
  avatar_size INTEGER,        -- 原始字节数 (前端压缩后通常 < 30KB)
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 旧版本迁移时按需补充 token_version / nickname 字段
-- ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE users ADD COLUMN nickname TEXT;
-- UPDATE users SET nickname = SUBSTR(email, 1, INSTR(email, '@') - 1) WHERE nickname IS NULL;

CREATE TABLE IF NOT EXISTS jwt_revocations (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jwt_revocations_expires ON jwt_revocations(expires_at);

CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
