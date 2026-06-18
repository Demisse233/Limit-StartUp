// D1 数据库初始化
// 在 wrangler 部署后, 通过 `wrangler d1 execute limit-startup-db --file=schema.sql` 执行

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  prefs_json TEXT NOT NULL DEFAULT '{}',
  avatar_b64 TEXT,
  avatar_content_type TEXT,
  avatar_size INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS jwt_revocations (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jwt_revocations_expires ON jwt_revocations(expires_at);
`;

// 同步获取 JWT payload (从 request)
export async function getAuthUser(request, env) {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const { verifyJwt } = await import('./crypto.js');
  const payload = await verifyJwt(token, env.JWT_SECRET);
  if (!payload) return null;
  // 检查吊销
  if (payload.jti) {
    const bl = await env.DB.prepare('SELECT 1 FROM jwt_revocations WHERE jti = ?').bind(payload.jti).first();
    if (bl) return null;
  }
  return { id: payload.sub, email: payload.email, jti: payload.jti };
}

// 解析 JSON body
export async function readJson(request) {
  try {
    return await request.json();
  } catch (e) {
    return null;
  }
}

// CORS 头
export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

// 统一 JSON 响应
export function json(data, status = 200, env = null) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (env) Object.assign(headers, corsHeaders(env));
  return new Response(JSON.stringify(data), { status, headers });
}

// 错误响应
export function err(code, message, status = 400, env = null) {
  return json({ error: code, message }, status, env);
}

// 允许同步的偏好字段白名单
export const ALLOWED_PREF_KEYS = new Set([
  'greeting',
  'defaultSearchEngine',
  'cfg_time24h',
  'cfg_timeShowSeconds',
  'cfg_timeBlinkColon',
  'cfg_timeFontSize',
  'cfg_timeFontWeight',
  'cfg_dateShowYear',
  'cfg_dateFormat',
  'cfg_dateShowWeekday',
  'cfg_dateWeekdayLang',
  'cfg_autofocusSearch',
  'footer_icp_show'
]);

export function sanitizePrefs(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out = {};
  for (const k of Object.keys(input)) {
    if (ALLOWED_PREF_KEYS.has(k)) {
      const v = input[k];
      if (typeof v === 'string' && v.length > 1024) continue;
      out[k] = v;
    }
  }
  return out;
}
