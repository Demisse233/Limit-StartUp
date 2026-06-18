// GET / PUT /api/prefs
import { getAuthUser, readJson, json, err, sanitizePrefs } from '../../_lib/db.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);

  const row = await env.DB.prepare('SELECT prefs_json, updated_at FROM users WHERE id = ?').bind(user.id).first();
  if (!row) return err('user_not_found', '用户不存在', 404, env);

  let prefs = {};
  try { prefs = JSON.parse(row.prefs_json); } catch (e) {}

  return json({ prefs, updatedAt: row.updated_at }, 200, env);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });
  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);

  const body = await readJson(request);
  if (!body || typeof body.prefs !== 'object') return err('invalid_body', '需要 prefs 对象', 400, env);
  const prefs = sanitizePrefs(body.prefs);
  const json2 = JSON.stringify(prefs);
  if (json2.length > 64 * 1024) return err('prefs_too_large', 'prefs 过大', 413, env);

  const now = Date.now();
  await env.DB.prepare('UPDATE users SET prefs_json = ?, updated_at = ? WHERE id = ?').bind(json2, now, user.id).run();
  return json({ ok: true, updatedAt: now, count: Object.keys(prefs).length }, 200, env);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}
