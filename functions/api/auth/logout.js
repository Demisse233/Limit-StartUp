// POST /api/auth/logout
import { getAuthUser, json, err } from '../../_lib/db.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);
  if (user.jti) {
    // 把 jti 加吊销表, 过期时间 = JWT 过期时间
    const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
    await env.DB.prepare('INSERT OR IGNORE INTO jwt_revocations (jti, expires_at) VALUES (?, ?)').bind(user.jti, exp).run();
  }
  return json({ ok: true }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
