// POST /api/auth/login
import { verifyPassword, normalizeEmail, isValidEmail, signJwt } from '../../_lib/crypto.js';
import { readJson, json, err } from '../../_lib/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const body = await readJson(request);
  if (!body) return err('invalid_body', '请求体必须是 JSON', 400, env);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!isValidEmail(email) || !password) return err('invalid_credentials', '邮箱或密码错误', 401, env);

  const user = await env.DB.prepare('SELECT id, email, password_salt, password_hash FROM users WHERE email = ?').bind(email).first();
  if (!user) return err('invalid_credentials', '邮箱或密码错误', 401, env);

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return err('invalid_credentials', '邮箱或密码错误', 401, env);

  const now = Date.now();
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, user.id).run();

  // 取头像状态, 登录响应里直接带上 avatarUrl, 避免前端多一次 /me 调用
  const avatarRow = await env.DB.prepare('SELECT avatar_b64 FROM users WHERE id = ?').bind(user.id).first();
  const token = await signJwt({ sub: user.id, email: user.email }, env.JWT_SECRET);
  return json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      avatarUrl: avatarRow && avatarRow.avatar_b64 ? '/api/avatar' : null
    }
  }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
