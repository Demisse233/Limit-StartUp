// GET /api/auth/me
import { getAuthUser, json, err } from '../../_lib/db.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);

  const row = await env.DB.prepare('SELECT id, email, prefs_json, avatar_b64, created_at, last_login_at FROM users WHERE id = ?').bind(user.id).first();
  if (!row) return err('user_not_found', '用户不存在', 404, env);

  let prefs = {};
  try { prefs = JSON.parse(row.prefs_json); } catch (e) {}

  return json({
    user: {
      id: row.id,
      email: row.email,
      avatarUrl: row.avatar_b64 ? '/api/avatar' : null,
      prefs,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at
    }
  }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
