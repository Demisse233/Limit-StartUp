// POST /api/auth/register
import { hashPassword, genSalt, normalizeEmail, isValidEmail, isValidPassword, genUuid, signJwt } from '../../_lib/crypto.js';

function isValidNickname(n) {
  if (typeof n !== 'string') return false;
  const t = n.trim();
  if (t.length < 1 || t.length > 24) return false;
  return t.length > 0;
}
import { readJson, json, err } from '../../_lib/db.js';
import { verifyTurnstile, rateLimit, getClientIp } from '../../_lib/turnstile.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const ip = getClientIp(request);

  // 1) 限流: 同 IP 每小时最多 5 次注册
  const rl = await rateLimit(env, 'register:' + ip, 5, 3600);
  if (!rl.ok) return err('rate_limited', '请求过于频繁, 请稍后再试', 429, env);

  const body = await readJson(request);
  if (!body) return err('invalid_body', '请求体必须是 JSON', 400, env);
  const email = normalizeEmail(body.email);
  const password = body.password;
  const nickname = String(body.nickname || '').trim();
  const turnstileToken = body.turnstileToken || '';
  if (!isValidEmail(email)) return err('invalid_email', '邮箱格式不正确', 400, env);
  if (!isValidPassword(password)) return err('weak_password', '密码需 8-128 位, 含字母和数字', 400, env);
  if (!isValidNickname(nickname)) return err('invalid_nickname', '昵称需 1-24 位, 不能全空白', 400, env);

  // 2) Turnstile 验证
  if (!await verifyTurnstile(turnstileToken, env, ip)) {
    return err('captcha_required', '人机验证失败, 请刷新页面重试', 403, env);
  }

  // 检查邮箱是否已注册
  const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (exists) return err('email_already_used', '该邮箱已注册', 400, env);

  const id = genUuid();
  const salt = genSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = Date.now();

  try {
    await env.DB.prepare(
      'INSERT INTO users (id, email, password_salt, password_hash, nickname, prefs_json, created_at, updated_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, email, salt, passwordHash, nickname, '{}', now, now, now).run();
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return err('email_already_used', '该邮箱已注册', 400, env);
    throw e;
  }

  // 取用户当前 token_version (V4.0.5+ 用于改密 / 登出吊销旧 token)
  const userRow = await env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(id).first();
  const tv = (userRow && userRow.token_version) || 1;
  const token = await signJwt({ sub: id, email, tv }, env.JWT_SECRET);
  return json({ ok: true, token, user: { id, email, nickname, avatarUrl: null } }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
