// PUT /api/auth/nickname
// 已登录用户修改昵称 (1-24 位, 自动 trim)
import { getAuthUser, readJson, json, err, corsHeaders } from '../../_lib/db.js';

function isValidNickname(n) {
  if (typeof n !== 'string') return false;
  const t = n.trim();
  return t.length >= 1 && t.length <= 24;
}

export async function onRequestPut(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env) });

  const user = await getAuthUser(request, env);
  if (!user) return err('unauthorized', '未登录', 401, env);

  const body = await readJson(request);
  if (!body) return err('invalid_body', '请求体必须是 JSON', 400, env);
  const nickname = String(body.nickname || '').trim();
  if (!isValidNickname(nickname)) return err('invalid_nickname', '昵称需 1-24 位, 不能全空白', 400, env);

  await env.DB.prepare('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?').bind(nickname, Date.now(), user.id).run();
  return json({ ok: true, nickname }, 200, env);
}
