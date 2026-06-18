// POST /api/auth/register
import { hashPassword, genSalt, normalizeEmail, isValidEmail, isValidPassword, genUuid, signJwt } from '../../_lib/crypto.js';
import { readJson, json, err } from '../../_lib/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const body = await readJson(request);
  if (!body) return err('invalid_body', '请求体必须是 JSON', 400, env);
  const email = normalizeEmail(body.email);
  const password = body.password;
  if (!isValidEmail(email)) return err('invalid_email', '邮箱格式不正确', 400, env);
  if (!isValidPassword(password)) return err('weak_password', '密码需 8-128 位, 含字母和数字', 400, env);

  // 检查邮箱是否已注册
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return err('email_already_used', '该邮箱已注册', 400, env);

  const id = genUuid();
  const salt = genSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = Date.now();

  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_salt, password_hash, prefs_json, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, salt, passwordHash, '{}', now, now, now).run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err('email_already_used', '该邮箱已注册', 400, env);
    throw e;
  }

  const token = await signJwt({ sub: id, email }, env.JWT_SECRET);
  return json({ ok: true, token, user: { id, email, avatarUrl: null } }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
