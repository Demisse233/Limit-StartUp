// POST /api/auth/login
import { verifyPassword, normalizeEmail, isValidEmail, signJwt } from '../../_lib/crypto.js';
import { readJson, json, err } from '../../_lib/db.js';
import { verifyTurnstile, rateLimit, getClientIp } from '../../_lib/turnstile.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const ip = getClientIp(request);

  // 1) 限流: 同 IP 每小时最多 10 次登录
  const rl = await rateLimit(env, 'login:' + ip, 10, 3600);
  if (!rl.ok) return err('rate_limited', '请求过于频繁, 请稍后再试', 429, env);

  const body = await readJson(request);
  if (!body) return err('invalid_body', '请求体必须是 JSON', 400, env);
  const email = normalizeEmail(body.email);
  const password = body.password;
  const turnstileToken = body.turnstileToken || '';
  if (!isValidEmail(email) || !password) return err('invalid_credentials', '邮箱或密码错误', 401, env);

  // 2) Turnstile 验证
  if (!await verifyTurnstile(turnstileToken, env, ip)) {
    return err('captcha_required', '人机验证失败, 请刷新页面重试', 403, env);
  }

  const user = await env.DB.prepare('SELECT id, email, password_salt, password_hash FROM users WHERE email = ?').bind(email).first();
  if (!user) return err('invalid_credentials', '邮箱或密码错误', 401, env);

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return err('invalid_credentials', '邮箱或密码错误', 401, env);

  const now = Date.now();
  await env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, user.id).run();

  const userAll = await env.DB.prepare('SELECT nickname, avatar_b64, token_version FROM users WHERE id = ?').bind(user.id).first();
  const tv = (userAll && userAll.token_version) || 1;
  const token = await signJwt({ sub: user.id, email: user.email, tv }, env.JWT_SECRET);
  return json({
    ok: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      nickname: userAll ? userAll.nickname : null,
      avatarUrl: userAll && userAll.avatar_b64 ? '/api/avatar' : null
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
